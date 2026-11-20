import { circleScore, type MinigameSettings } from '@party/contracts';
import { CLOCK_SLACK_MS } from '../shared/fairness.js';
import { requireGame } from '../../game/errors.js';
import type { ResultJudge } from '../shared/judging.js';

export const perfectCircle: ResultJudge = ({ settings, value, at, started }) => {
  // The score is the server's own measurement of the stroke; whatever number the phone sends is ignored.
  requireGame(value.stroke !== undefined && value.stroke.length % 2 === 0, 'INVALID_SUBMISSION');
  requireGame(at <= started + (settings as MinigameSettings<'perfect-circle'>).seconds * 1000 + CLOCK_SLACK_MS, 'TOO_LATE');
  return { value: circleScore(value.stroke), stroke: value.stroke };
};
