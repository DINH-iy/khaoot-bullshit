import { z } from 'zod';
import { GameIdSchema } from './game.js';

/**
 * Prefabs: one or more scenes saved from the editor (with the connections
 * between them and their card positions), to insert into any game. Shared by
 * the owner and editors. Only the shape and size are checked here; the stages
 * themselves are checked when the game they are inserted into is saved.
 */
export const MAX_PREFAB_BYTES = 256 * 1024;
export const MAX_PREFAB_SCENES = 40;
const SceneKey = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
const PrefabStage = z.looseObject({ key: z.string().min(1).max(64), kind: z.string().min(1).max(40) });
const PrefabNode = z.object({ key: SceneKey, stages: z.array(PrefabStage).min(1).max(20) }).strict();
const PrefabEdge = z.object({ key: z.string().min(1).max(160), from: SceneKey, to: SceneKey, option: z.string().min(1).max(64).optional() }).strict();
const Point = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();
export const PrefabContentSchema = z.object({
  nodes: z.array(PrefabNode).min(1).max(MAX_PREFAB_SCENES),
  // Only connections between the saved scenes.
  edges: z.array(PrefabEdge).max(MAX_PREFAB_SCENES * 8),
  positions: z.record(SceneKey, Point),
  // The scenes in the order they were selected; the first scene nothing in the prefab leads to is where it starts.
  keys: z.array(SceneKey).min(1).max(MAX_PREFAB_SCENES),
}).strict().superRefine((content, ctx) => {
  const nodes = new Set(content.nodes.map(node => node.key));
  if (nodes.size !== content.nodes.length) ctx.addIssue({ code: 'custom', message: 'Scene names must be unique', path: ['nodes'] });
  if (content.keys.length !== nodes.size || content.keys.some(key => !nodes.has(key))) ctx.addIssue({ code: 'custom', message: 'Keys must list the saved scenes', path: ['keys'] });
  if (content.edges.some(edge => !nodes.has(edge.from) || !nodes.has(edge.to))) ctx.addIssue({ code: 'custom', message: 'Connections must stay inside the prefab', path: ['edges'] });
});
export type PrefabContent = z.infer<typeof PrefabContentSchema>;
export const PrefabNameSchema = z.string().trim().min(1).max(80);
export const SavePrefabSchema = z.object({ prefabId: GameIdSchema, name: PrefabNameSchema, content: PrefabContentSchema }).strict();
export const PrefabSummarySchema = z.object({ id: GameIdSchema, name: z.string(), sceneCount: z.number().int().min(1), createdAt: z.string() }).strict();
export type PrefabSummary = z.infer<typeof PrefabSummarySchema>;
export const PrefabListSchema = z.object({ prefabs: z.array(PrefabSummarySchema) }).strict();
export const PrefabSchema = PrefabSummarySchema.extend({ content: PrefabContentSchema }).strict();
export type Prefab = z.infer<typeof PrefabSchema>;
