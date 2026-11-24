import { CutGuessSchema } from '@party/contracts';
import { requireGame } from '../../game/errors.js';
import type { ResultJudge } from '../shared/judging.js';

// The cut comes in tenths of a percent; the target is a whole percent.
export const cutLine: ResultJudge = ({ run, value, at, started }) => {
  requireGame(at >= started && run.cutTarget !== undefined && CutGuessSchema.safeParse(value.value).success, 'INVALID_SUBMISSION');
  return { value: Math.abs(value.value - run.cutTarget * 10), cut: value.value };
};
