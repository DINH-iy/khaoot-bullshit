import type { MinigameSettings } from '@party/contracts';
import { CLOCK_SLACK_MS, networkAllowance } from '../shared/fairness.js';
import { requireGame } from '../../game/errors.js';
import type { ResultJudge } from '../shared/judging.js';

export const stopClock: ResultJudge = ({ settings, value, at, started, fair }) => {
  requireGame(value.value <= (settings as MinigameSettings<'stop-clock'>).targetMs * 3, 'INVALID_SUBMISSION');
  const elapsed = at - started;
  requireGame(elapsed >= value.value - CLOCK_SLACK_MS, 'INVALID_SUBMISSION');
  // The stop happened at most one network allowance before it arrived.
  return { value: Math.round(Math.min(Math.max(value.value, elapsed - networkAllowance(fair.latencyMs)), Math.max(elapsed, 0))) };
};
