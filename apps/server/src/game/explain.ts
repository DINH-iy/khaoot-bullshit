import { z } from 'zod';
import { GameIdSchema, pointsAtStake, sceneMediaUrl, type PublicStageSchema } from '@party/contracts';
import type { StageDefinition } from './definition.js';

// A scene can explain itself first: it opens untimed and closed to answers (a minigame does not
// start yet), players tap "Got it", and the host starts the round. Stored in the stage run's
// presentation as `explain: { readyIds }`; the text, points and picture stay in the definition.

/** The kinds of scene that can explain themselves first (rounds people play). */
const EXPLAINING_KINDS: StageDefinition['kind'][] = ['collect', 'challenge', 'vote', 'minigame'];
export const explainsFirst = (stage: StageDefinition) => Boolean(stage.explain) && EXPLAINING_KINDS.includes(stage.kind);

const ExplainSchema = z.object({ explain: z.object({ readyIds: z.array(GameIdSchema).max(500) }).strict() }).passthrough();
/** Who has read the explanation so far, or null when the scene is not (or no longer) explaining. */
export function readExplain(presentation: unknown): { readyIds: string[] } | null {
  const parsed = ExplainSchema.safeParse(presentation); return parsed.success ? parsed.data.explain : null;
}
/** The presentation with one more player ready (once). */
export function withReady(presentation: unknown, playerId: string): object {
  const current = readExplain(presentation); if (!current) return presentation as object;
  return { ...(presentation as object), explain: { readyIds: current.readyIds.includes(playerId) ? current.readyIds : [...current.readyIds, playerId] } };
}
/** The presentation without the explanation (the round starts). */
export function withoutExplain(presentation: unknown): Record<string, unknown> {
  const { explain: _done, ...rest } = presentation as Record<string, unknown>; return rest;
}
/** The intro as the screens see it: its text, who is ready, and when asked the points at stake, a picture, screen only. */
export function introView(stage: StageDefinition, readyIds: string[]): NonNullable<z.infer<typeof PublicStageSchema>['explain']> {
  const intro = stage.explain; const points = intro?.points ? pointsAtStake(stage) : null;
  return { text: intro?.text ?? null, readyIds, ...(points ? { points } : {}),
    ...(intro?.picture ? { picture: { ...intro.picture, url: sceneMediaUrl(intro.picture.id) } } : {}), ...(intro?.screenOnly ? { screenOnly: true } : {}) };
}
