import { GRAPH_LEVEL, GRAPH_SAMPLES, type GraphView } from '@party/contracts';
import type { Language } from '../../i18n/language.js';

/** The chart samples equally spaced positions between the cutoff and the end. */
export function graphPeriod(chart: GraphView, step: number, language: Language): string | undefined {
  const start = chart.splitLabel ?? '';
  const end = chart.endLabel ?? '';
  const blend = (a: number, b: number) => Math.round(a + (b - a) * step / GRAPH_SAMPLES);
  if (step === 0) return start || undefined;
  if (step === GRAPH_SAMPLES) return end || undefined;
  if (/^\d{4}$/.test(start) && /^\d{4}$/.test(end)) return String(blend(Number(start), Number(end)));
  const month = /^\d{4}-\d{2}$/;
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (month.test(start) && month.test(end)) {
    const index = (label: string) => Number(label.slice(0, 4)) * 12 + Number(label.slice(5)) - 1;
    const at = blend(index(start), index(end));
    return new Intl.DateTimeFormat(language, { month: 'short', year: 'numeric', timeZone: 'UTC' })
      .format(Date.UTC(Math.floor(at / 12), at % 12));
  }
  if (day.test(start) && day.test(end)) {
    const startDate = Date.parse(start);
    const endDate = Date.parse(end);
    if (Number.isFinite(startDate) && Number.isFinite(endDate)) {
      return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeZone: 'UTC' }).format(blend(startDate, endDate));
    }
  }
  return undefined;
}

export function graphValue(chart: GraphView, height: number, language: Language) {
  const { min, max } = chart.scale ?? { min: 0, max: 100 };
  const value = min + height / GRAPH_LEVEL * (max - min);
  const unit = chart.yLabel;
  if (unit === '%') return new Intl.NumberFormat(language, { style: 'percent', maximumSignificantDigits: 4 }).format(value / 100);
  const number = new Intl.NumberFormat(language, { maximumSignificantDigits: 4 }).format(value);
  return unit ? `${number} ${unit}` : number;
}
