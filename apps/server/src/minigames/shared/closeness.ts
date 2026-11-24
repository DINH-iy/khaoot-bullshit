import { MINIGAMES, type MinigameKey, type MinigameScoring } from '@party/contracts';

/**
 * Points for a result by how close it is (a scene's closeness scoring), from the result's distance
 * in the game's own units (`rankValue`). Close enough: all or nothing. Sliding scale: the full points
 * for spot on, shrinking evenly to nothing at the scene's distance, in whole points.
 */
export function closenessPoints(game: MinigameKey, scoring: MinigameScoring, distance: number | null): bigint {
  const closeness = MINIGAMES[game].closeness;
  if (!closeness || distance === null) return 0n;
  const off = Math.abs(distance) / closeness.perUnit; const most = Number(scoring.pointsMilli);
  if (scoring.kind === 'within') return off <= scoring.distance ? BigInt(scoring.pointsMilli) : 0n;
  if (off >= scoring.distance) return 0n;
  return BigInt(Math.min(most, Math.round(most * (1 - off / scoring.distance) / 1000) * 1000));
}
