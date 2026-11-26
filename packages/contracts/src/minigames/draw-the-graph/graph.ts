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
  sourceSeries: z.string().min(1).max(250).optional(),
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

/**
 * One chart of the graph library: every Draw the Graph chart authors have put in a game (its "collection"), and the
 * built-in sample. Only what a picker shows; the hidden half never leaves the server.
 */
export const GRAPH_SAMPLE_ID = 'sample';
export const GraphLibraryIdSchema = z.string().regex(/^(sample|[0-9a-f]{24})$/);
export const GraphLibraryEntrySchema = z.object({
  id: GraphLibraryIdSchema, collection: z.string().max(160), question: z.string().max(500),
  startLabel: label, endLabel: label, yLabel: label,
}).strict();
export type GraphLibraryEntry = z.infer<typeof GraphLibraryEntrySchema>;

export const GraphSettingsSchema = z.object({ graph: GraphDataSchema.optional(), revealEasing: RevealEasingSchema.optional() }).strict();
export type GraphView = z.infer<typeof GraphViewSchema>;
export type GraphData = z.infer<typeof GraphDataSchema>;

export const MAX_STORED_GRAPHS = 50;
export const StoredGraphSchema = z.object({
  key: z.string().regex(/^graph-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i), question: z.string().trim().min(1).max(500), graph: GraphDataSchema,
}).strict();
export const StoredGraphsSchema = z.array(StoredGraphSchema).max(MAX_STORED_GRAPHS)
  .refine(entries => new Set(entries.map(entry => entry.key)).size === entries.length, 'Duplicate graph key');
export type StoredGraph = z.infer<typeof StoredGraphSchema>;

export function graphReadingAt(graph: GraphData, position: number) {
  const split = graph.splitAt ?? .5;
  const points = position <= split ? graph.visible : [graph.visible.at(-1)!, ...graph.hidden];
  const progress = position <= split ? position / split : (position - split) / (1 - split);
  const index = Math.max(0, Math.min(points.length - 1, progress * (points.length - 1)));
  const low = Math.floor(index);
  return points[low]! + (points[Math.ceil(index)]! - points[low]!) * (index - low);
}

/** Compact comparison for equivalent chart readings, regardless of the chosen cutoff or axis scale. */
export function graphDataKey(graph: GraphData): string {
  const { min, max } = graph.scale ?? { min: 0, max: 100 };
  const points = Array.from({ length: 17 }, (_, index) => Number((min + (max - min) * graphReadingAt(graph, index / 16) / 100).toPrecision(6)));
  return JSON.stringify([graph.startLabel, graph.endLabel, points]);
}

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
