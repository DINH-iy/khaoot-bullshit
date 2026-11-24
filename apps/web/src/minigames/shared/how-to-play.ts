import { howToPlayKey, MINIGAMES, type MinigameKey, type MinigameScoring, type TextKey } from '@party/contracts';
import { formatPoints } from '../../room/results.js';

type Text = (key: TextKey, values?: Record<string, string | number>) => string;

/** A distance in the minigame's own unit, as players read it: 5%, 10°, 12 dots, 0.25 s. */
export function closenessDistance(text: Text, game: MinigameKey, distance: number): string {
  const unit = MINIGAMES[game].closeness?.unit;
  if (unit === 'degrees') return `${distance}°`;
  if (unit === 'dots') return text('minigame.unitDots', { count: distance });
  if (unit === 'ms') return `${distance / 1000} s`;
  return `${distance}%`;
}

/**
 * A minigame's “how to play” in the game's texts, followed by how this round pays:
 * by closeness, or by place with the tie rule when speed settles ties.
 */
export function howToPlay(text: Text, minigame: { game: MinigameKey; tiebreak?: 'faster' | undefined; scoring?: MinigameScoring | undefined }): string {
  const how = text(howToPlayKey(minigame.game)); const scoring = minigame.scoring;
  const extra = scoring
    ? text(scoring.kind === 'within' ? 'minigame.scoreWithin' : 'minigame.scoreScale', { distance: closenessDistance(text, minigame.game, scoring.distance), points: formatPoints(scoring.pointsMilli) })
    : minigame.tiebreak === 'faster' ? text('minigame.tieFaster') : '';
  return `${how} ${extra}`.trim();
}
