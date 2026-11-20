import type { StepGame } from '../shared/steps/games.js';

// Left or right: one secret choice; the majority wins (ranked at the reveal, see outcome.ts). Screens only see that a side chose.
interface SidePick { picked: 'left' | 'right' | null }
export const majority: StepGame<SidePick> = {
  start: () => ({ picked: null }),
  options: state => state.picked === null ? ['left', 'right'] : null,
  apply: (_state, option) => ({ picked: option === 'left' ? 'left' : 'right' }),
  result: state => state.picked === 'left' ? 0 : 1,
  view: state => ({ chosen: state.picked !== null }),
  secret: true,
};
