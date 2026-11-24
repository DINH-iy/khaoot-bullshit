import { AwardMilliSchema, PlacesSchema, placePoints, type StakePoints } from './game.js';

/** A minigame's points for 1st, 2nd, 3rd… when the scene leaves them out. */
export const STANDARD_PLACEMENT_MILLI = ['10000', '6000', '3000'] as const;


const milli = (value: unknown): bigint => AwardMilliSchema.safeParse(value).success ? BigInt(value as string) : 0n;
const firstPlace = (places: unknown): bigint => { const parsed = PlacesSchema.safeParse(places); return parsed.success ? milli(placePoints(parsed.data)[0]) : 0n; };

/**
 * The points a round puts at stake, worked out from its own scoring so the intro never goes stale.
 * Takes a scene as the server stores it, or as the editor holds it while it is being changed.
 * Null for scenes that earn no points (cutscenes, polls, writing without a vote…).
 */
export function pointsAtStake(stage: Record<string, unknown>): StakePoints | null {
  const round = (total: bigint, upTo: boolean): StakePoints | null => total > 0n ? { kind: 'round', milli: String(total), upTo } : null;
  if (stage['kind'] === 'collect') {
    const scoring = stage['scoring'] as Record<string, unknown> | undefined;
    // The host gives up to the maximum, or a place's points.
    if (scoring?.['kind'] === 'judged') return round(scoring['places'] ? firstPlace(scoring['places']) : milli(scoring['maxAwardMilli']), true);
    if (!scoring || (scoring['kind'] !== 'correct-choice' && scoring['kind'] !== 'correct-order')) return null;
    // A right answer, plus the extra for the fastest right answers.
    const extra = firstPlace(scoring['places']);
    return round(milli(scoring['awardMilli']) + extra, extra > 0n);
  }
  // The host gives up to the maximum, or the points of the place they give.
  if (stage['kind'] === 'challenge') return round(stage['places'] ? firstPlace(stage['places']) : milli(stage['maxAwardMilli']), true);
  if (stage['kind'] === 'minigame') {
    // Closeness scoring: the most a result can earn.
    const scoring = stage['scoring'] as Record<string, unknown> | undefined;
    if (scoring?.['kind'] === 'within' || scoring?.['kind'] === 'scale') return round(milli(scoring['pointsMilli']), true);
    const list = Array.isArray(stage['placementMilli']) && stage['placementMilli'].length ? stage['placementMilli'] : STANDARD_PLACEMENT_MILLI;
    return round(stage['places'] ? firstPlace(stage['places']) : milli(list[0]), true);
  }
  if (stage['kind'] === 'vote') {
    const perVote = milli(stage['awardPerVoteMilli']); const bonus = firstPlace(stage['places']);
    return perVote > 0n || bonus > 0n ? { kind: 'vote', perVoteMilli: String(perVote), bonusMilli: bonus > 0n ? String(bonus) : null } : null;
  }
  return null;
}
