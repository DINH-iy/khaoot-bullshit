import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { circleScore, MINIGAME_COUNTDOWN_MS, MINIGAMES, parseMinigameSettings, type MinigameKey, type MinigameSettings } from '@party/contracts';
import { requireGame } from '../game/errors.js';

/** Allowed difference between a phone's clock (after correction) and the server's. */
export const CLOCK_SLACK_MS = 2000;
/** Faster than this is not a human reaction; it counts as a false start. */
export const FASTEST_REACTION_MS = 80;
/** About the fastest anyone taps a phone screen for several seconds. */
export const MAX_TAPS_PER_SECOND = 16;

/**
 * Stored on the stage run when play starts. `doorsMilli` is the shuffled secret
 * for lucky doors; views never show it before the reveal.
 */
export const MinigameRunSchema = z.object({ startsAt: z.string().datetime(), goAt: z.string().datetime().nullable(), doorsMilli: z.array(z.string()).nullable() }).strict();
export type MinigameRun = z.infer<typeof MinigameRunSchema>;
export const readMinigameRun = (presentation: unknown): MinigameRun | null => {
  const parsed = MinigameRunSchema.safeParse((presentation as { minigame?: unknown } | null)?.minigame);
  return parsed.success ? parsed.data : null;
};

/** Starts play after the countdown: picks the hidden GO moment or shuffles the doors. */
export function startMinigame(game: MinigameKey, settings: MinigameSettings, now: Date, random: (max: number) => number = randomInt): MinigameRun {
  const startsAt = now.getTime() + MINIGAME_COUNTDOWN_MS;
  if (game === 'reaction') {
    const { minWaitMs, maxWaitMs } = settings as MinigameSettings<'reaction'>;
    return { startsAt: new Date(startsAt).toISOString(), goAt: new Date(startsAt + minWaitMs + random(maxWaitMs - minWaitMs + 1)).toISOString(), doorsMilli: null };
  }
  if (game === 'lucky-doors') {
    // Fisher–Yates with the system's secure random numbers.
    const doors = [...(settings as MinigameSettings<'lucky-doors'>).doorsMilli];
    for (let index = doors.length - 1; index > 0; index--) { const other = random(index + 1); [doors[index], doors[other]] = [doors[other]!, doors[index]!]; }
    return { startsAt: new Date(startsAt).toISOString(), goAt: null, doorsMilli: doors };
  }
  return { startsAt: new Date(startsAt).toISOString(), goAt: null, doorsMilli: null };
}

/** What the server knows about the phone that sent a result (see live.ts). */
export interface Fairness { latencyMs: number | null; taps: { seen: number | null; streamed: boolean } }
export const NO_FAIRNESS: Fairness = { latencyMs: null, taps: { seen: null, streamed: false } };
/**
 * How much earlier than its arrival a phone may say it acted: the delay of the
 * GO message to the phone plus the result coming back (about one round trip),
 * with room for drawing the screen. Capped, so a phone that answers pings
 * slowly on purpose cannot buy itself time.
 */
export const networkAllowance = (latencyMs: number | null) => latencyMs === null ? 450 : Math.round(Math.min(600, Math.max(200, latencyMs * 1.3 + 150)));
/** Taps a phone may still have had in hand after its last report reached the server. */
export const TAP_TAIL = 6;

/**
 * Judges a result: refuses what could not have happened, and adjusts what the
 * network says is too good. A phone measures its own play (fair on slow
 * connections), but it cannot claim to have acted earlier than its result's
 * arrival allows, nor to have tapped more than the server saw. A modified
 * phone can therefore gain at most about one network round trip.
 * Returns the result to store.
 */
export function judgeResult(game: MinigameKey, settings: MinigameSettings, run: MinigameRun, value: { value: number; early?: true | undefined; stroke?: number[] | undefined; teamId?: string | undefined }, now: Date, fair: Fairness = NO_FAIRNESS): { value: number; early?: true; stroke?: number[]; teamId?: string } {
  const started = Date.parse(run.startsAt); const at = now.getTime();
  requireGame(at >= started - CLOCK_SLACK_MS, 'INVALID_SUBMISSION');
  if (game === 'reaction') {
    const go = Date.parse(run.goAt!);
    // Before GO the phone cannot know when GO comes (it is not sent in advance): any tap then is a false start.
    if (value.early || at < go) { requireGame(value.value === 0 || !value.early, 'INVALID_SUBMISSION'); return { value: 0, early: true }; }
    requireGame(value.value >= FASTEST_REACTION_MS && value.value <= 10_000, 'INVALID_SUBMISSION');
    return { value: Math.max(value.value, at - go - networkAllowance(fair.latencyMs)) };
  }
  requireGame(!value.early, 'INVALID_SUBMISSION');
  if (game === 'tap-race') {
    const seconds = (settings as MinigameSettings<'tap-race'>).seconds;
    requireGame(value.value <= seconds * MAX_TAPS_PER_SECOND, 'INVALID_SUBMISSION');
    requireGame(at >= started + seconds * 1000 - CLOCK_SLACK_MS, 'INVALID_SUBMISSION');
    // When the server followed this race, a count beyond what it saw (plus a last handful) is not believed.
    if (fair.taps.streamed) return { value: Math.min(value.value, (fair.taps.seen ?? 0) + TAP_TAIL) };
    return { value: value.value };
  }
  if (game === 'stop-clock') {
    requireGame(value.value <= (settings as MinigameSettings<'stop-clock'>).targetMs * 3, 'INVALID_SUBMISSION');
    const elapsed = at - started;
    requireGame(elapsed >= value.value - CLOCK_SLACK_MS, 'INVALID_SUBMISSION');
    // The stop happened at most one network allowance before it arrived.
    return { value: Math.round(Math.min(Math.max(value.value, elapsed - networkAllowance(fair.latencyMs)), Math.max(elapsed, 0))) };
  }
  if (game === 'perfect-circle') {
    // The score is the server's own measurement of the stroke; whatever number the phone sends is ignored.
    requireGame(value.stroke !== undefined && value.stroke.length % 2 === 0, 'INVALID_SUBMISSION');
    requireGame(at <= started + (settings as MinigameSettings<'perfect-circle'>).seconds * 1000 + CLOCK_SLACK_MS, 'TOO_LATE');
    return { value: circleScore(value.stroke), stroke: value.stroke };
  }
  if (game === 'relay-drawing') { requireGame(value.teamId !== undefined, 'INVALID_SUBMISSION'); return { value: 0, teamId: value.teamId }; }
  requireGame(value.value < run.doorsMilli!.length, 'INVALID_SUBMISSION');
  return { value: value.value };
}

/** A number to rank by (lower is better), or null when the result does not rank (false start). */
export function rankValue(game: MinigameKey, settings: MinigameSettings, value: { value: number; early?: true | undefined }): number | null {
  if (value.early) return null;
  if (game === 'reaction') return value.value;
  if (game === 'tap-race') return -value.value;
  if (game === 'stop-clock') return Math.abs(value.value - (settings as MinigameSettings<'stop-clock'>).targetMs);
  if (game === 'perfect-circle') return -value.value;
  return null;
}

/** Places for ranked results: equal results share a place (1, 1, 3). Unranked results get no place. */
export function places<T>(entries: T[], score: (entry: T) => number | null): Map<T, number> {
  const ranked = entries.filter(entry => score(entry) !== null).sort((a, b) => score(a)! - score(b)!);
  const result = new Map<T, number>();
  ranked.forEach((entry, index) => { const previous = ranked[index - 1]; result.set(entry, previous !== undefined && score(previous) === score(entry) ? result.get(previous)! : index + 1); });
  return result;
}

/** A team's result from its members' results: best, average (rounded) or total. Total only makes sense when higher is better. */
export function teamValue(game: MinigameKey, rule: 'best' | 'average' | 'total', values: number[]): number | null {
  if (!values.length) return null;
  if (rule === 'best') return Math.min(...values);
  if (rule === 'total' && MINIGAMES[game].better === 'higher') return values.reduce((sum, value) => sum + value, 0);
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export { parseMinigameSettings };
