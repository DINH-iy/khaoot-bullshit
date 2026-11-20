import { AngleSchema, angleError } from '@party/contracts';
import { requireGame } from '../../game/errors.js';
import type { ResultJudge } from '../shared/judging.js';

export const matchAngle: ResultJudge = ({ run, value, at, started }) => {
  const angle = value.value === 360 ? 0 : value.value;
  requireGame(at >= started && run.angleTarget !== undefined && AngleSchema.safeParse(angle).success, 'INVALID_SUBMISSION');
  return { value: angleError(angle, run.angleTarget), angle };
};
