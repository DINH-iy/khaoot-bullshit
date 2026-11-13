import { z } from 'zod';
import { GameKeySchema } from './game.js';

// Editing a game together: who else has this game open, what they have
// selected and where their pointer is. Sent only between people who may edit
// the game; nothing here is saved.
export const EDITOR_NAMESPACE = '/editor';
export const MAX_EDITORS = 8;
export const EditorNameSchema = z.string().trim().min(1).max(40);
export const EditorPresenceSchema = z.object({
  name: EditorNameSchema,
  view: z.enum(['flow', 'scene', 'look']),
  // The scenes this person has selected (in the Scene editor: the one they are on).
  selected: z.array(GameKeySchema).max(50),
}).strict();
export type EditorPresence = z.infer<typeof EditorPresenceSchema>;
export const EditorJoinSchema = z.object({ ticket: z.string().min(20).max(2048), name: EditorNameSchema }).strict();
export const EditorPeerSchema = EditorPresenceSchema.extend({ id: z.string().min(1).max(64), color: z.number().int().min(0).max(MAX_EDITORS - 1) }).strict();
export type EditorPeer = z.infer<typeof EditorPeerSchema>;
export const EditorPeersSchema = z.array(EditorPeerSchema).max(MAX_EDITORS);
// A pointer on the Flow editor's canvas, in canvas units; null when it left the canvas.
export const EditorPointSchema = z.object({ x: z.number().finite().min(-200_000).max(200_000), y: z.number().finite().min(-200_000).max(200_000) }).strict().nullable();
export const EditorCursorSchema = z.object({ id: z.string().min(1).max(64), at: EditorPointSchema }).strict();
export type EditorCursor = z.infer<typeof EditorCursorSchema>;
