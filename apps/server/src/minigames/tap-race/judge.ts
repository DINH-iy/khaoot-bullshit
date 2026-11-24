import type { MinigameSettings } from '@party/contracts';
import { CLOCK_SLACK_MS } from '../shared/fairness.js';
import { requireGame } from '../../game/errors.js';
import type { ResultJudge } from '../shared/judging.js';

/** Taps a phone may still have had in hand after its last report reached the server. */
export const TAP_TAIL = 6;

export const tapRace: ResultJudge = ({ settings, value, at, started, fair }) => {
  const seconds = (settings as MinigameSettings<'tap-race'>).seconds;
  requireGame(at >= started + seconds * 1000 - CLOCK_SLACK_MS, 'INVALID_SUBMISSION');
  // When the server followed this race, a count beyond what it saw (plus a last handful) is not believed.
  if (fair.taps.streamed) return { value: Math.min(value.value, (fair.taps.seen ?? 0) + TAP_TAIL) };
  return { value: value.value };
};
