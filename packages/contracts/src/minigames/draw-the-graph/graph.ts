import { z } from 'zod';
import { RevealEasingSchema } from '../shared/reveal-easing.js';

export const GRAPH_MAX_READINGS = 50;
const readings = z.array(z.number().min(0).max(100)).min(2).max(GRAPH_MAX_READINGS);
const axisValue = z.number().min(-1e13).max(1e13);
const scale = z.object({ min: axisValue, max: axisValue }).strict()
  .refine(range => range.max > range.min && range.max - range.min >= 1e-9);
const label = z.string().trim().min(1).max(32).optional();
export const GraphViewSchema = z.object({
  visible: readings, startLabel: label, splitLabel: label, endLabel: label, yLabel: label,
  scale: scale.optional(), splitAt: z.number().min(.15).max(.85).optional(),
}).strict();
export const GraphDataSchema = GraphViewSchema.extend({
  hidden: readings, source: z.string().trim().min(1).max(500).optional(),
  sourceNote: z.string().trim().min(1).max(500).optional(),
  sourceUrl: z.url({ protocol: /^https$/ }).max(500).optional(),
}).strict();
export const GrapherImportRequestSchema = z.object({ url: z.string().trim().min(1).max(500) }).strict();
export const GrapherImportMetadataSchema = z.object({
  chart: z.object({ title: z.string().max(300), citation: z.string().optional() }),
  columns: z.record(z.string(), z.object({
    titleShort: z.string().optional(), descriptionShort: z.string().optional(), shortUnit: z.string().optional(), unit: z.string().optional(),
    citationLong: z.string().optional(), citationShort: z.string().optional(),
  })),
});
export const GrapherImportResultSchema = z.object({
  csv: z.string().max(512 * 1024),
  sourceUrl: GraphDataSchema.shape.sourceUrl.unwrap(),
  metadata: GrapherImportMetadataSchema,
});
export type GrapherImportResult = z.infer<typeof GrapherImportResultSchema>;

export const GraphSettingsSchema = z.object({ graph: GraphDataSchema.optional(), revealEasing: RevealEasingSchema.optional() }).strict();
export type GraphView = z.infer<typeof GraphViewSchema>;
export type GraphData = z.infer<typeof GraphDataSchema>;

export const GRAPH_REVEAL_MS = 2000;
export const GraphPlaybackSchema = z.object({
  positionMs: z.number().int().min(0).max(GRAPH_REVEAL_MS),
  playingSince: z.string().datetime().nullable(),
}).strict();
export type GraphPlayback = z.infer<typeof GraphPlaybackSchema>;
export const GraphPlaybackActionSchema = z.enum(['replay', 'pause', 'resume', 'finish']);
export type GraphPlaybackAction = z.infer<typeof GraphPlaybackActionSchema>;

export function graphPlaybackPosition(playback: GraphPlayback, now: number) {
  return Math.min(GRAPH_REVEAL_MS, playback.positionMs + (playback.playingSince ? Math.max(0, now - Date.parse(playback.playingSince)) : 0));
}

export const GRAPH_SAMPLES = 24;
export const GRAPH_LEVEL = 1000;
export const GraphLineSchema = z.array(z.number().int().min(0).max(GRAPH_LEVEL)).length(GRAPH_SAMPLES);
export const GraphHueSchema = z.number().int().min(0).max(359);
export const GraphRoundViewSchema = z.object({ chart: GraphViewSchema, hue: GraphHueSchema.optional() }).strict();
export type GraphRoundView = z.infer<typeof GraphRoundViewSchema>;

export const SAMPLE_GRAPH: GraphView = {
  visible: [8, 12, 11, 17, 22, 31, 46, 55],
  startLabel: '2000', splitLabel: '2010', endLabel: '2020',
  yLabel: 'Books lent (thousands)',
};

export const SAMPLE_GRAPH_QUESTION = 'How many books did the fictional library lend each year?';

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
