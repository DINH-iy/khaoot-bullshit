import { AngleGuessSchema, angleError } from '@party/contracts';
import { requireGame } from '../../game/errors.js';
import type { ResultJudge } from '../shared/judging.js';

// The angle comes in tenths of a degree (a full turn is 3600); the target is a whole degree.
export const matchAngle: ResultJudge = ({ run, value, at, started }) => {
  const angle = value.value === 3600 ? 0 : value.value;
  requireGame(at >= started && run.angleTarget !== undefined && AngleGuessSchema.safeParse(angle).success, 'INVALID_SUBMISSION');
  return { value: angleError(angle, run.angleTarget * 10, 3600), angle };
};
