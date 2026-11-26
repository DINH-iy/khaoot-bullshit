import { z } from 'zod';
import { GameIdSchema, GameKeySchema, RevisionSchema } from './game.js';
import { ColorSchema } from './presentation.js';
import { GraphDataSchema, StoredGraphSchema } from './minigames/draw-the-graph/graph.js';

export const AuthoredGraphSchema = z.object({
  gameId: GameIdSchema, title: z.string().max(160), nodeKey: GameKeySchema, stageKey: GameKeySchema, inDraw: z.boolean(),
  stored: z.boolean().optional(), dataKey: z.string().max(700), sourceUrl: GraphDataSchema.shape.sourceUrl, sourceSeries: GraphDataSchema.shape.sourceSeries,
  question: z.string().max(500), label: z.string().max(32).optional(), editable: z.boolean(),
}).strict();
export const AuthoredGraphsSchema = z.array(AuthoredGraphSchema);
export type AuthoredGraph = z.infer<typeof AuthoredGraphSchema>;

const graphDraftShape = z.object({ nodes: z.array(z.unknown()), graphLibrary: z.array(z.unknown()).optional() });
const graphSceneShape = z.object({ key: GameKeySchema, stages: z.array(z.unknown()) });
const graphStageShape = z.object({ kind: z.literal('minigame'), key: GameKeySchema, prompt: z.string().optional(), game: z.string(),
  settings: z.unknown().optional(), draw: z.array(z.unknown()).optional() });
const graphDrawShape = z.object({ game: z.literal('draw-the-graph'), settings: z.unknown().optional() });
const graphSettingsShape = z.object({ graph: GraphDataSchema });

/** Explicit charts in a draft, including charts inside a single-scene minigame draw. */
export function authoredGraphs(definition: unknown) {
  const draft = graphDraftShape.safeParse(definition);
  if (!draft.success) return [];
  const scenes = draft.data.nodes.flatMap(value => {
    const node = graphSceneShape.safeParse(value);
    if (!node.success) return [];
    return node.data.stages.flatMap(part => {
      const stage = graphStageShape.safeParse(part);
      if (!stage.success) return [];
      const { key: stageKey, prompt, game, settings, draw } = stage.data;
      const drawn = draw?.map(entry => graphDrawShape.safeParse(entry)).find(entry => entry.success);
      const chart = graphSettingsShape.safeParse(draw ? drawn?.data.settings : game === 'draw-the-graph' ? settings : undefined);
      if (!chart.success) return [];
      return [{ nodeKey: node.data.key, stageKey, inDraw: Boolean(draw), question: prompt?.trim().slice(0, 500) || '', graph: chart.data.graph }];
    });
  });
  const stored = (draft.data.graphLibrary ?? []).flatMap(value => {
    const entry = StoredGraphSchema.safeParse(value);
    if (!entry.success) return [];
    const { key, graph, question } = entry.data;
    return [{ nodeKey: key, stageKey: 'main', inDraw: false, stored: true, graph, question }];
  });
  return [...scenes.map(scene => ({ ...scene, stored: undefined })), ...stored];
}

// Authoring: a game's editable draft and its published, playable versions.
// Only the game's creator receives these; players never see a definition.
// The definition itself is validated on the server; here it is opaque JSON.
export const MAX_DRAFT_BYTES = 256 * 1024;
export const DefinitionIssueSchema = z.object({
  // Plain language for the author; `code` is the validator's exact rule.
  message: z.string().min(1).max(300), code: z.string().max(300),
  // The scene (node) and stage the problem belongs to, when it has one, so the editor can mark that card.
  nodeKey: z.string().max(64).nullable(), stageIndex: z.number().int().min(0).nullable(),
  path: z.string().max(300),
}).strict();
export type DefinitionIssue = z.infer<typeof DefinitionIssueSchema>;
const Published = z.object({ number: z.number().int().min(1), publishedAt: z.string().datetime(), matchesDraft: z.boolean() }).strict().nullable();
export const GameSummarySchema = z.object({
  gameId: GameIdSchema, title: z.string().min(1).max(160), revision: RevisionSchema, updatedAt: z.string().datetime(),
  issueCount: z.number().int().min(0), published: Published,
  // Who made the game: an editor's name (`you`: the one looking), or null when the owner made it. `shared`: shared with the one looking.
  author: z.object({ name: z.string(), you: z.boolean() }).strict().nullable().optional(), shared: z.boolean().optional(),
  // What the one looking may do with this game (contracts/roles.ts game permissions): everything as its maker or the owner.
  can: z.array(z.string()).optional(),
}).strict();
export type GameSummary = z.infer<typeof GameSummarySchema>;
/**
 * Who may see and edit a game: the owner always; an editor when they made it or it is shared with them.
 * The game's author and the owner choose whom to share it with; only the owner changes who made it
 * (for games from before authors were kept, which all count as the owner's).
 */
export const GameSharingSchema = z.object({
  // `shares`: who the game is shared with and in which role; `editors`: the people it can be shared with (those with a role).
  authorPersonId: GameIdSchema.nullable(), shares: z.array(z.object({ personId: GameIdSchema, roleId: GameIdSchema }).strict()),
  editors: z.array(z.object({ personId: GameIdSchema, name: z.string() }).strict()), roles: z.array(z.object({ id: GameIdSchema, name: z.string() }).strict()), canChangeAuthor: z.boolean(),
}).strict();
export type GameSharing = z.infer<typeof GameSharingSchema>;
export const UpdateGameSharingSchema = z.object({ shares: z.array(z.object({ personId: GameIdSchema, roleId: GameIdSchema }).strict()).max(100), authorPersonId: GameIdSchema.nullable().optional() }).strict();
export const DraftSchema = GameSummarySchema.extend({ definition: z.unknown(), issues: z.array(DefinitionIssueSchema),
  // Set when this is the owner's own version of a built-in game: which one (its key and original title).
  builtIn: z.object({ key: z.string(), title: z.string() }).strict().nullable().optional() }).strict();
export type Draft = z.infer<typeof DraftSchema>;
export const CreateGameSchema = z.object({
  gameId: GameIdSchema, title: z.string().trim().min(1).max(160),
  // Start from a built-in game's content, or from a blank game with one welcome scene.
  startFrom: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/).nullable(),
  // Or a copy of one of the author's own games: its current draft, card positions included.
  copyOf: GameIdSchema.nullable().optional(),
}).strict().refine(input => !(input.startFrom && input.copyOf), { message: 'Start from a built-in game or copy one of yours, not both' });
// Where each scene card sits in the Flow editor. Layout only: never part of a published game.
export const FLOW_GROUP_NAME_MAX = 80;
export const FLOW_GROUP_COLOURS = ['red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink'] as const;
const FlowGroupColourSchema = z.union([z.enum(FLOW_GROUP_COLOURS), ColorSchema.length(7)]);
export type FlowGroupColour = z.infer<typeof FlowGroupColourSchema>;
const EditorPositionSchema = z.strictObject({
  x: z.number().finite().min(-100_000).max(100_000),
  y: z.number().finite().min(-100_000).max(100_000),
  groupName: z.string().min(1).max(FLOW_GROUP_NAME_MAX).refine(name => name.trim().length > 0).optional(),
  groupColour: FlowGroupColourSchema.optional(),
});
export const EditorLayoutSchema = z.strictObject({
  positions: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/), EditorPositionSchema),
}).refine(layout => Object.entries(layout.positions).every(([key, position]) =>
  key.startsWith('group--') || (position.groupName === undefined && position.groupColour === undefined)), {
  path: ['positions'], message: 'Group names and colours belong on group positions',
});
export type EditorLayout = z.infer<typeof EditorLayoutSchema>;
// A game pasted as text (JSON, also inside ```json fences): the exact format or the simple one for people and AI.
export const ImportGameSchema = z.object({ gameId: GameIdSchema, text: z.string().min(2).max(MAX_DRAFT_BYTES) }).strict();
export const SaveDraftSchema = z.object({ expectedRevision: RevisionSchema, definition: z.unknown() }).strict();
export const PublishSchema = z.object({ expectedRevision: RevisionSchema }).strict();
// Practise the current draft without publishing it, from the start or from one scene.
/** `only`: play just the start scene (to try one minigame or round), then the game ends. */
export const RehearseSchema = z.object({ expectedRevision: RevisionSchema, startNodeKey: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/).nullable(), only: z.boolean().optional(), sessionId: GameIdSchema, commandId: GameIdSchema }).strict();
