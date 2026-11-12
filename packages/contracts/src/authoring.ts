import { z } from 'zod';
import { GameIdSchema, RevisionSchema } from './game.js';

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
}).strict();
export type GameSummary = z.infer<typeof GameSummarySchema>;
export const DraftSchema = GameSummarySchema.extend({ definition: z.unknown(), issues: z.array(DefinitionIssueSchema) }).strict();
export type Draft = z.infer<typeof DraftSchema>;
export const CreateGameSchema = z.object({
  gameId: GameIdSchema, title: z.string().trim().min(1).max(160),
  // Start from a built-in game's content, or from a blank game with one welcome scene.
  startFrom: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/).nullable(),
}).strict();
// Where each scene card sits in the Flow editor. Layout only: never part of a published game.
export const EditorLayoutSchema = z.object({ positions: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/), z.object({ x: z.number().finite().min(-100_000).max(100_000), y: z.number().finite().min(-100_000).max(100_000) }).strict()) }).strict();
export type EditorLayout = z.infer<typeof EditorLayoutSchema>;
// A game pasted as text (JSON, also inside ```json fences): the exact format or the simple one for people and AI.
export const ImportGameSchema = z.object({ gameId: GameIdSchema, text: z.string().min(2).max(MAX_DRAFT_BYTES) }).strict();
export const SaveDraftSchema = z.object({ expectedRevision: RevisionSchema, definition: z.unknown() }).strict();
export const PublishSchema = z.object({ expectedRevision: RevisionSchema }).strict();
// Practise the current draft without publishing it, from the start or from one scene.
export const RehearseSchema = z.object({ expectedRevision: RevisionSchema, startNodeKey: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/).nullable(), sessionId: GameIdSchema, commandId: GameIdSchema }).strict();
