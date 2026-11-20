import { z } from 'zod';

const reading = z.number().int().min(0).max(100);
const readings = z.array(reading).min(2).max(25);
const label = z.string().trim().min(1).max(32).optional();
export const GraphViewSchema = z.object({
  visible: readings, startLabel: label, splitLabel: label, endLabel: label, yLabel: label,
}).strict();
export const GraphDataSchema = GraphViewSchema.extend({ hidden: readings }).strict();
export const GraphSettingsSchema = z.object({ graph: GraphDataSchema.optional() }).strict();
export type GraphView = z.infer<typeof GraphViewSchema>;
export type GraphData = z.infer<typeof GraphDataSchema>;

export const GRAPH_SAMPLES = 24;
export const GRAPH_LEVEL = 1000;
export const GraphLineSchema = z.array(z.number().int().min(0).max(GRAPH_LEVEL)).length(GRAPH_SAMPLES);
export const GraphHueSchema = z.number().int().min(0).max(359);
export const GraphRoundViewSchema = z.object({ chart: GraphViewSchema, hue: GraphHueSchema.optional() }).strict();
export type GraphRoundView = z.infer<typeof GraphRoundViewSchema>;

export const SAMPLE_GRAPH: GraphView = {
  visible: [8, 12, 11, 17, 22, 31, 46, 55],
  startLabel: '2000', splitLabel: '2010', endLabel: '2020',
};

/** Mean absolute vertical error over the hidden half, in hundredths of one percent of the axis. */
export function graphError(graph: GraphData, line: number[]): number {
  const expected = [graph.visible.at(-1)!, ...graph.hidden];
  const distance = line.reduce((total, height, index) => {
    const at = (index + 1) * (expected.length - 1) / GRAPH_SAMPLES;
    const left = Math.floor(at);
    const target = expected[left]! + (at - left) * (expected[Math.min(left + 1, expected.length - 1)]! - expected[left]!);
    return total + Math.abs(height - target * 10);
  }, 0);
  return Math.round(distance * 10 / GRAPH_SAMPLES);
}
