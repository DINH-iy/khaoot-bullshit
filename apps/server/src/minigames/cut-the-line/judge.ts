import { requireGame } from '../../game/errors.js';
import type { ResultJudge } from '../shared/judging.js';

export const cutLine: ResultJudge = ({ run, value, at, started }) => {
  requireGame(at >= started && run.cutTarget !== undefined && Number.isInteger(value.value) && value.value >= 0 && value.value <= 100, 'INVALID_SUBMISSION');
  return { value: Math.abs(value.value - run.cutTarget), cut: value.value };
};
