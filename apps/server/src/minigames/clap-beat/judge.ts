import { CLAP_BEATS_MS, CLAP_END_MS } from '@party/contracts';
import { requireGame } from '../../game/errors.js';
import type { ResultJudge } from '../shared/judging.js';

export const clapBeat: ResultJudge = ({ value, at, started }) => {
  requireGame(value.value <= CLAP_BEATS_MS.length && at >= started + CLAP_END_MS - 150, 'INVALID_SUBMISSION');
  return { value: value.value };
};
