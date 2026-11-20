import { networkAllowance } from '../shared/fairness.js';
import { requireGame } from '../../game/errors.js';
import type { ResultJudge } from '../shared/judging.js';

/** Faster than this is not a human reaction; it counts as a false start. */
export const FASTEST_REACTION_MS = 80;
export const reaction: ResultJudge = ({ run, value, at, fair }) => {
  const go = Date.parse(run.goAt!);
  // Before GO the phone cannot know when GO comes (it is not sent in advance): any tap then is a false start.
  if (value.early || at < go) { requireGame(value.value === 0 || !value.early, 'INVALID_SUBMISSION'); return { value: 0, early: true }; }
  requireGame(value.value >= FASTEST_REACTION_MS && value.value <= 10_000, 'INVALID_SUBMISSION');
  return { value: Math.max(value.value, at - go - networkAllowance(fair.latencyMs)) };
};
