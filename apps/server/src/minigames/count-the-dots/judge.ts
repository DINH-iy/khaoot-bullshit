import { DotGuessSchema } from '@party/contracts';
import { requireGame } from '../../game/errors.js';
import type { ResultJudge } from '../shared/judging.js';

export const countDots: ResultJudge = ({ run, value, at, started }) => {
  requireGame(run.dots && at >= started && DotGuessSchema.safeParse(value.value).success, 'INVALID_SUBMISSION');
  return { value: Math.abs(value.value - run.dots.pattern.length), dotGuess: value.value };
};
