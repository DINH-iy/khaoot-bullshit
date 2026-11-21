import type { GrapherImportResult } from '@party/contracts';
import { graphCutoffs, readGraphTable, splitGraphRows, type GraphTable } from './graph-csv.js';

export interface GrapherSeries {
  name: string;
  table: GraphTable;
  title: string;
  entity: string;
  source: string;
  sourceUrl: string;
  sourceNote?: string;
  unit?: string;
}

export function grapherSeries({ csv, metadata, sourceUrl }: GrapherImportResult): GrapherSeries[] {
  const [header, ...rows] = splitGraphRows(csv, ',');
  if (!header) return [];
  const columns = header.map((name, index) => ({ name, index })).filter(({ name }) => Object.hasOwn(metadata.columns, name));
  const entityIndex = header.indexOf('entity');
  const yearIndex = header.findIndex(name => name === 'year' || name === 'day' || name === 'date');
  if (entityIndex < 0 || yearIndex < 0 || !columns.length) return [];
  const entities = new Map<string, string[][]>();
  for (const row of rows) {
    const entity = row[entityIndex];
    if (!entity || !row[yearIndex]) continue;
    if (!entities.has(entity)) entities.set(entity, []);
    entities.get(entity)!.push(row);
  }
  const series: GrapherSeries[] = [];
  for (const [entity, readings] of entities) {
    for (const { name, index } of columns) {
      const column = metadata.columns[name]!;
      const title = column.titleShort || metadata.chart.title;
      const table = readGraphTable([['Period', title], ...readings.flatMap(row => row[index] ? [[row[yearIndex]!, row[index]!]] : [])]);
      if (!table || !graphCutoffs(table.axis).length) continue;
      const unit = (column.shortUnit || column.unit)?.trim().slice(0, 32);
      const credit = column.citationLong || column.citationShort || metadata.chart.citation;
      const source = ('Our World in Data' + (credit ? ` · ${credit}` : '')).slice(0, 500);
      const sourceNote = column.descriptionShort?.trim().slice(0, 500);
      series.push({ name: columns.length === 1 ? entity : `${entity} · ${title}`, table, title, entity, source, sourceUrl, ...(unit ? { unit } : {}), ...(sourceNote ? { sourceNote } : {}) });
    }
  }
  return series;
}
