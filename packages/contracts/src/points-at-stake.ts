import { AwardMilliSchema, PlacesSchema, placePoints, type StakePoints } from './game.js';

import { isMinigameKey, isSharedPrediction, minigameScoring } from './minigames/shared/catalog.js';

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

/** The same list used by timed quiz awards, vote bonuses and the host's place buttons. */
export function configuredPlacePoints(stage: Record<string, unknown>): string[] | null {
  const scoring = stage['scoring'] as Record<string, unknown> | undefined;
  const places = stage['kind'] === 'collect' && scoring?.['kind'] !== 'none' ? scoring?.['places']
    : stage['kind'] === 'vote' || stage['kind'] === 'challenge' ? stage['places'] : undefined;
  const parsed = PlacesSchema.safeParse(places);
  return parsed.success ? placePoints(parsed.data) : null;
}

export function minigamePlacePoints(stage: Record<string, unknown>): string[] {
  const places = PlacesSchema.safeParse(stage['places']);
  if (places.success) return placePoints(places.data);
  const list = stage['placementMilli'];
  return Array.isArray(list) && list.length > 0 && list.length <= 12 && list.every(amount => AwardMilliSchema.safeParse(amount).success)
    ? list : [...STANDARD_PLACEMENT_MILLI];
}

export interface ScenePlaceAwards { amounts: string[]; bonus: boolean }

/** The placement schedule a slide can show before anybody has played. */
export function scenePlaceAwards(stage: Record<string, unknown>): ScenePlaceAwards | undefined {
  const kind = stage['kind'];
  const scoring = stage['scoring'] as Record<string, unknown> | undefined;
  const game = stage['game'];
  let amounts = configuredPlacePoints(stage);
  if (kind === 'minigame' && typeof game === 'string' && isMinigameKey(game) && game !== 'lucky-doors' && game !== 'red-or-black-roulette' && !minigameScoring(game, stage['scoring'])) {
    const winnersOnly = game === 'undercover' || game === 'majority' || isSharedPrediction(game);
    const list = minigamePlacePoints(stage);
    amounts = winnersOnly ? list.slice(0, 1) : list;
  }
  if (kind === 'duel') {
    const places = PlacesSchema.safeParse(stage['places']);
    const contest = stage['contest'] as { kind?: string; game?: string } | undefined;
    amounts = (places.success ? placePoints(places.data) : ['10000']).slice(0, contest?.kind === 'game' && contest.game === 'eight-ball' ? 1 : 2);
  }
  return amounts?.some(amount => amount !== '0')
    ? { amounts, bonus: kind === 'vote' || (kind === 'collect' && scoring?.['kind'] !== 'judged') } : undefined;
}
