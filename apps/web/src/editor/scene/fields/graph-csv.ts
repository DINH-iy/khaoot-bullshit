import { GRAPH_MAX_READINGS, GraphDataSchema, type GraphData } from '@party/contracts';

export const MAX_GRAPH_CSV_BYTES = 256 * 1024;
const MAX_ROWS = 5000;
const MAX_VALUE = 1e12;
const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

export function splitGraphRows(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const input = text.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n');
  for (let index = 0; index < input.length; index++) {
    const char = input[index]!;
    if (char === '"' && quoted && input[index + 1] === '"') { field += '"'; index++; }
    else if (char === '"' && (quoted || !field.trim())) quoted = !quoted;
    else if (!quoted && (char === separator || char === '\n')) {
      row.push(field.trim());
      field = '';
      if (char === '\n') {
        if (row.some(Boolean)) rows.push(row);
        row = [];
      }
    } else field += char;
  }
  if (quoted) return [];
  if (field || row.length) rows.push([...row, field.trim()]);
  return rows;
}

export interface GraphTable {
  labels: string[];
  columns: { name: string; values: number[] }[];
  axis: number[];
}

const numeric = (value: string) => {
  if (value === '<1') return .5;
  const decimal = value.replace(',', '.');
  const parsed = Number(decimal);
  return numberPattern.test(decimal) && Math.abs(parsed) <= MAX_VALUE ? parsed : NaN;
};

function dateAxis(labels: string[]): number[] | null {
  if (labels.every(label => /^\d{4}-\d{2}$/.test(label))) {
    return labels.map(label => {
      const month = Number(label.slice(5));
      return month >= 1 && month <= 12 ? Number(label.slice(0, 4)) * 12 + month : NaN;
    });
  }
  if (!labels.every(label => /^\d{4}-\d{2}-\d{2}$/.test(label))) return null;
  return labels.map(label => {
    const time = Date.parse(label);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === label ? time : NaN;
  });
}

export function readGraphCsv(text: string): GraphTable | null {
  if (text.length > MAX_GRAPH_CSV_BYTES || new TextEncoder().encode(text).length > MAX_GRAPH_CSV_BYTES) return null;
  return readGraphTable(splitGraphRows(text, '\t')) ?? readGraphTable(splitGraphRows(text, ';')) ?? readGraphTable(splitGraphRows(text, ','));
}

export function readGraphTable(rows: string[][]): GraphTable | null {
  // A Trends export can put a category line before the actual spreadsheet header.
  const headerIndex = rows.findIndex(row => !/^category:/i.test(row[0] ?? '') && !(row.length === 1 && /^.+:\s/.test(row[0]!)));
  if (headerIndex < 0 || rows[headerIndex]!.length < 2) return null;
  const candidates = rows.slice(headerIndex);
  const header = candidates[0]!;
  const hasHeader = /^(year|month|week|date|day|time|period)$/i.test(header[0]!) || !header.slice(1).some(value => Number.isFinite(numeric(value)));
  const readings = hasHeader ? candidates.slice(1) : candidates;
  if (readings.length < 4 || readings.length > MAX_ROWS || readings.some(row => !row[0])) return null;
  const labels = readings.map(row => row[0]!.slice(0, 32));
  const columns = header.slice(1).flatMap((name, index) => {
    const values = readings.map(row => numeric(row[index + 1] ?? ''));
    return values.every(Number.isFinite) ? [{ name: hasHeader ? name.slice(0, 32) : '', values }] : [];
  });
  if (!columns.length) return null;
  const times = labels.every(label => numberPattern.test(label)) ? labels.map(Number) : dateAxis(labels);
  const axis = times ?? labels.map((_, index) => index);
  if (axis.every((position, index) => index === 0 || position < axis[index - 1]!)) {
    axis.reverse();
    labels.reverse();
    for (const column of columns) column.values.reverse();
  }
  if (!axis.every((position, index) => Number.isFinite(position) && (index === 0 || position > axis[index - 1]!))) return null;
  return { labels, columns, axis };
}

export function graphCutoffs(axis: number[]): number[] {
  const length = axis.at(-1)! - axis[0]!;
  return axis.flatMap((point, index) => {
    const split = (point - axis[0]!) / length;
    return index >= 1 && index <= axis.length - 3 && split >= .15 && split <= .85 ? [index] : [];
  });
}

export function graphFromCsv(table: GraphTable, column: number, cutoff: number): GraphData | null {
  const { axis, labels } = table;
  const series = table.columns[column];
  if (!series || !graphCutoffs(axis).includes(cutoff)) return null;
  const low = Math.min(...series.values);
  const high = Math.max(...series.values);
  const span = high === 0 && low === 0 ? 4 : Math.max(high - Math.min(low, 0), 1e-8);
  const roughTick = span / 4;
  const power = 10 ** Math.floor(Math.log10(roughTick));
  const tick = [1, 2, 2.5, 5, 10].map(step => step * power).find(step => step >= roughTick) ?? 10 * power;
  const min = low >= 0 ? 0 : Math.floor(low / tick) * tick;
  const max = Math.max(min + 4 * tick, Math.ceil(high / tick) * tick, 0);
  const normalize = (value: number) => Math.max(0, Math.min(100, (value - min) / (max - min) * 100));
  const sample = (begin: number, end: number, intervals: number) => {
    let index = begin;
    return Array.from({ length: intervals + 1 }, (_, step) => {
      const at = axis[begin]! + (axis[end]! - axis[begin]!) * step / intervals;
      while (index + 1 < end && axis[index + 1]! < at) index++;
      const fraction = (at - axis[index]!) / (axis[index + 1]! - axis[index]!);
      return normalize(series.values[index]! + fraction * (series.values[index + 1]! - series.values[index]!));
    });
  };
  const last = axis.length - 1;
  const result = GraphDataSchema.safeParse({
    visible: sample(0, cutoff, Math.min(cutoff, GRAPH_MAX_READINGS - 1)),
    hidden: sample(cutoff, last, Math.min(last - cutoff, GRAPH_MAX_READINGS)).slice(1),
    startLabel: labels[0], splitLabel: labels[cutoff], endLabel: labels[last], yLabel: series.name || undefined,
    scale: { min, max }, splitAt: (axis[cutoff]! - axis[0]!) / (axis[last]! - axis[0]!),
  });
  return result.success ? result.data : null;
}
