import { SPEED_RUN_COURSE, SPEED_RUN_FINISH, SPEED_RUN_START, raceOptions, type MinigameSettings } from '@party/contracts';
import type { StepGame } from '../shared/steps/games.js';

const courseFor = (settings: MinigameSettings) => (settings as MinigameSettings<'speed-run'>).course ?? SPEED_RUN_COURSE;
export const speedRun: StepGame<{ cell: number; moves: number }> = {
  start: () => ({ cell: SPEED_RUN_START, moves: 0 }),
  options: (state, settings) => state.cell === SPEED_RUN_FINISH || state.moves >= 64 ? null : raceOptions(courseFor(settings), state.cell).map(move => move.direction),
  apply: (state, option, settings) => ({
    cell: raceOptions(courseFor(settings), state.cell).find(move => move.direction === option)!.cell,
    moves: state.moves + 1,
  }),
  result: (state, _settings, run, now) => state.cell === SPEED_RUN_FINISH
    ? Math.min(600_000, (run.raceElapsedMs ?? 0) + Math.max(0, now.getTime() - Date.parse(run.startsAt)))
    : null,
  view: state => ({ cell: state.cell }),
};
