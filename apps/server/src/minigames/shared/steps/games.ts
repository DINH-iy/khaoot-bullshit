import type { MinigameSettings } from '@party/contracts';
import type { MinigameRun } from '../rules.js';
import { bus } from '../../bus/rules.js';
import { doors } from '../../lucky-doors/rules.js';
import { majority } from '../../majority/rules.js';
import { speedRun } from '../../speed-run/rules.js';

/**
 * A step game's rules, as pure functions over its own JSON state per side (a team, or a
 * player when solo). The engine (engine.ts) does everything else: who may move, team votes
 * and their time, saving, results, points. `run` holds what all sides share (Lucky doors'
 * door order). To add a game: register its rules here and add it to STEP_MINIGAMES (contracts).
 */
export interface StepGame<State> {
  /** A side's state when it first plays (secrets allowed: screens only ever get `view`). */
  start(settings: MinigameSettings, run: MinigameRun, random: (max: number) => number): State;
  /** The choices for the next step, or null once the side is done. */
  options(state: State, settings: MinigameSettings, run: MinigameRun): readonly string[] | null;
  apply(state: State, option: string, settings: MinigameSettings, run: MinigameRun): State;
  /** The side's result once done (ranked as the catalog says, see MINIGAMES[game].better). */
  result(state: State, settings: MinigameSettings, run: MinigameRun, now: Date): number | null;
  /** What screens may see of the side while the game runs: never the secrets. `extra`: added to its result by other sides (see `extras`). */
  view(state: State, settings: MinigameSettings, run: MinigameRun, extra: number): unknown;
  /** Points paid at once when the side is done (instead of by place), if any. */
  payoutMilli?(state: State, settings: MinigameSettings, run: MinigameRun): bigint;
  /** The result stays secret until the reveal (a choice others must not see). */
  secret?: boolean;
  /** Flags stored with a side's result when it is done (Drive the bus: its cards made a rainbow). */
  resultFlags?(state: State, settings: MinigameSettings, run: MinigameRun): Record<string, true>;
  /** What other sides add to each side's result (Drive the bus: another team's rainbow), from every side's state, in order. */
  extras?(states: { state: State; done: boolean }[], settings: MinigameSettings): number[];
}

export const STEP_GAMES: Record<string, StepGame<unknown>> = {
  bus: bus as StepGame<unknown>, 'lucky-doors': doors as StepGame<unknown>, majority: majority as StepGame<unknown>, 'speed-run': speedRun as StepGame<unknown>,
};
