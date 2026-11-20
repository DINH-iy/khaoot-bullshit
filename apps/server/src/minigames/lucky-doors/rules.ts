import type { MinigameSettings } from '@party/contracts';
import type { StepGame } from '../shared/steps/games.js';

// Lucky doors: one choice of door; the order is shuffled once for the round (run.doorsMilli) and paid at once.
interface DoorsState { picked: number | null }
export const doors: StepGame<DoorsState> = {
  start: () => ({ picked: null }),
  options: (state, settings) => state.picked === null ? (settings as MinigameSettings<'lucky-doors'>).doorsMilli.map((_, index) => String(index)) : null,
  apply: (_state, option) => ({ picked: Number(option) }),
  result: state => state.picked ?? 0,
  view: state => ({ picked: state.picked }),
  payoutMilli: (state, _settings, run) => state.picked === null ? 0n : BigInt(run.doorsMilli?.[state.picked] ?? '0'),
};
