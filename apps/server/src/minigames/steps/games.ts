import { BUS_GUESSES, busGuessRight, isRainbow, type BusGuess, type MinigameSettings, type PlayingCard } from '@party/contracts';
import { dealBus, type MinigameRun } from '../rules.js';

/**
 * A step game's rules, as pure functions over its own JSON state per side (a team, or a
 * player when solo). The engine (engine.ts) does everything else: who may move, team votes
 * and their time, saving, results, points. `run` holds what all sides share (Lucky doors'
 * door order). To add a game: write its rules here and add it to STEP_MINIGAMES (contracts).
 */
export interface StepGame<State> {
  /** A side's state when it first plays (secrets allowed: screens only ever get `view`). */
  start(settings: MinigameSettings, run: MinigameRun, random: (max: number) => number): State;
  /** The choices for the next step, or null once the side is done. */
  options(state: State, settings: MinigameSettings, run: MinigameRun): readonly string[] | null;
  apply(state: State, option: string, settings: MinigameSettings, run: MinigameRun): State;
  /** The side's result once done (ranked as the catalog says, see MINIGAMES[game].better). */
  result(state: State, settings: MinigameSettings, run: MinigameRun): number;
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

// Drive the bus: four cards per side, one guess each; a wrong guess costs that round's sips.
interface BusState { cards: PlayingCard[]; guesses: BusGuess[] }
const sips = (state: BusState, settings: MinigameSettings<'bus'>) =>
  state.guesses.reduce((total, guess, round) => total + (busGuessRight(round, guess, state.cards) ? 0 : settings.sips[round] ?? 0), 0);
const bus: StepGame<BusState> = {
  start: (_settings, _run, random) => ({ cards: dealBus(random), guesses: [] }),
  options: state => state.guesses.length < 4 ? BUS_GUESSES[state.guesses.length]! : null,
  apply: (state, option) => ({ ...state, guesses: [...state.guesses, option as BusGuess] }),
  result: (state, settings) => sips(state, settings as MinigameSettings<'bus'>),
  view: (state, settings, _run, extra) => ({ cards: state.cards.slice(0, state.guesses.length), guesses: state.guesses,
    right: state.guesses.map((guess, round) => busGuessRight(round, guess, state.cards)), sips: sips(state, settings as MinigameSettings<'bus'>) + extra, extra,
    rainbow: rainbowOf(state, settings as MinigameSettings<'bus'>) }),
  resultFlags: (state, settings) => rainbowOf(state, settings as MinigameSettings<'bus'>) ? { rainbow: true } : {},
  // A rainbow (four different suits) makes every other team drink the last round's sips.
  extras: (states, settings) => {
    const rules = settings as MinigameSettings<'bus'>; const rainbows = states.map(entry => entry.done && rainbowOf(entry.state, rules));
    const count = rainbows.filter(Boolean).length;
    return rainbows.map(own => (count - (own ? 1 : 0)) * (rules.sips[3] ?? 0));
  },
};
const rainbowOf = (state: BusState, settings: MinigameSettings<'bus'>) => settings.rainbow !== false && state.guesses.length === 4 && isRainbow(state.cards);

// Lucky doors: one choice of door; the order is shuffled once for the round (run.doorsMilli) and paid at once.
interface DoorsState { picked: number | null }
const doors: StepGame<DoorsState> = {
  start: () => ({ picked: null }),
  options: (state, settings) => state.picked === null ? (settings as MinigameSettings<'lucky-doors'>).doorsMilli.map((_, index) => String(index)) : null,
  apply: (_state, option) => ({ picked: Number(option) }),
  result: state => state.picked ?? 0,
  view: state => ({ picked: state.picked }),
  payoutMilli: (state, _settings, run) => state.picked === null ? 0n : BigInt(run.doorsMilli?.[state.picked] ?? '0'),
};

// Left or right: one secret choice; the majority wins (ranked at the reveal, see outcome.ts). Screens only see that a side chose.
interface SidePick { picked: 'left' | 'right' | null }
const majority: StepGame<SidePick> = {
  start: () => ({ picked: null }),
  options: state => state.picked === null ? ['left', 'right'] : null,
  apply: (_state, option) => ({ picked: option === 'left' ? 'left' : 'right' }),
  result: state => state.picked === 'left' ? 0 : 1,
  view: state => ({ chosen: state.picked !== null }),
  secret: true,
};

export const STEP_GAMES: Record<string, StepGame<unknown>> = {
  bus: bus as StepGame<unknown>, 'lucky-doors': doors as StepGame<unknown>, majority: majority as StepGame<unknown>,
};
