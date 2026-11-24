import { z } from 'zod';

/**
 * Points by closeness instead of by place, for minigames with a target (those with
 * `closeness` in the catalog). A scene without `scoring` gives points by place.
 * `distance` is in the game's own unit, as an author writes it (see Closeness).
 */
export const MINIGAME_SCORING_KINDS = ['within', 'scale'] as const;
const PointsMilli = z.string().regex(/^(0|[1-9][0-9]{0,11})$/);
export const MinigameScoringSchema = z.discriminatedUnion('kind', [
  // Close enough: everyone at most `distance` from the target gets `pointsMilli`.
  z.object({ kind: z.literal('within'), distance: z.number().int().min(0).max(60_000), pointsMilli: PointsMilli }).strict(),
  // Sliding scale: `pointsMilli` for spot on, shrinking evenly to nothing at `distance` (whole points).
  z.object({ kind: z.literal('scale'), distance: z.number().int().min(1).max(60_000), pointsMilli: PointsMilli }).strict(),
]);
export type MinigameScoring = z.infer<typeof MinigameScoringSchema>;

/**
 * How far off a result is, in words an author uses. `perUnit`: result units per author unit
 * (Draw the Graph measures in hundredths of a percent; Cut the Line and Match the Angle in tenths). `within` and `scale`: the standard distances.
 */
export interface Closeness { unit: 'percent' | 'degrees' | 'dots' | 'ms'; perUnit: number; max: number; within: number; scale: number }
