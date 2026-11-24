import { z } from 'zod';
import { GameIdSchema, RevisionSchema } from './game.js';

/**
 * Save points: copies of a whole game draft (with its card positions) that the
 * owner and editors make on purpose, to go back to later. Kept on the server,
 * per game; going back puts the copy into the draft as an ordinary edit.
 */
export const MAX_SAVE_POINTS = 60;
export const SavePointNameSchema = z.string().trim().min(1).max(80);
/** `expectedRevision`: the draft the person sees, so a save point never holds a version they have not seen. */
export const CreateSavePointSchema = z.object({ savePointId: GameIdSchema, name: SavePointNameSchema, expectedRevision: RevisionSchema,
  // Made by the editor itself just before going back to another save point, so that step can be taken back too.
  automatic: z.boolean().optional() }).strict();
export const SavePointSummarySchema = z.object({ id: GameIdSchema, name: z.string(), automatic: z.boolean(), sceneCount: z.number().int().min(0),
  // Who made it (a person's name), or null for the owner.
  savedBy: z.string().nullable(), createdAt: z.string().datetime() }).strict();
export type SavePointSummary = z.infer<typeof SavePointSummarySchema>;
export const SavePointListSchema = z.object({ savePoints: z.array(SavePointSummarySchema), limit: z.number().int() }).strict();
export const SavePointSchema = SavePointSummarySchema.extend({ definition: z.unknown() }).strict();
export type SavePoint = z.infer<typeof SavePointSchema>;
