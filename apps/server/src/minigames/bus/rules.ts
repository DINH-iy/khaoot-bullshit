import { randomInt } from 'node:crypto';
import { BUS_GUESSES, BUS_RAINBOW, SUITS, busGuessRight, busRainbowOpen, isRainbow, type BusGuess, type MinigameSettings, type PlayingCard } from '@party/contracts';
import type { StepGame } from '../shared/steps/games.js';

// Drive the bus: four cards per side, one guess each; a wrong guess costs that round's sips. In round 4 a team whose
// first three cards are three different suits may call *Rainbow* instead of a suit: right, the other teams drink
// the last round's sips; wrong, the team drinks them (as for any wrong guess). A rainbow only counts when called.
interface BusState { cards: PlayingCard[]; guesses: BusGuess[] }
const sips = (state: BusState, settings: MinigameSettings<'bus'>) =>
  state.guesses.reduce((total, guess, round) => total + (busGuessRight(round, guess, state.cards) ? 0 : settings.sips[round] ?? 0), 0);
export const bus: StepGame<BusState> = {
  start: (_settings, _run, random) => ({ cards: dealBus(random), guesses: [] }),
  options: (state, settings) => {
    const round = state.guesses.length; if (round >= 4) return null;
    return round === 3 && busRainbowOpen(state.cards, settings as MinigameSettings<'bus'>) ? [...BUS_GUESSES[3], BUS_RAINBOW] : BUS_GUESSES[round]!;
  },
  apply: (state, option) => ({ ...state, guesses: [...state.guesses, option as BusGuess] }),
  result: (state, settings) => sips(state, settings as MinigameSettings<'bus'>),
  view: (state, settings, _run, extra) => ({ cards: state.cards.slice(0, state.guesses.length), guesses: state.guesses,
    right: state.guesses.map((guess, round) => busGuessRight(round, guess, state.cards)), sips: sips(state, settings as MinigameSettings<'bus'>) + extra, extra,
    rainbow: rainbowOf(state, settings as MinigameSettings<'bus'>) }),
  resultFlags: (state, settings) => rainbowOf(state, settings as MinigameSettings<'bus'>) ? { rainbow: true } : {},
  // A called rainbow that came true makes every other team drink the last round's sips.
  extras: (states, settings) => {
    const rules = settings as MinigameSettings<'bus'>; const rainbows = states.map(entry => entry.done && rainbowOf(entry.state, rules));
    const count = rainbows.filter(Boolean).length;
    return rainbows.map(own => (count - (own ? 1 : 0)) * (rules.sips[3] ?? 0));
  },
};
const rainbowOf = (state: BusState, settings: MinigameSettings<'bus'>) => settings.rainbow !== false && state.guesses[3] === BUS_RAINBOW && isRainbow(state.cards);

/** Four cards for a team in Drive the bus: from a fresh, securely shuffled deck of 52. */
export function dealBus(random: (max: number) => number = randomInt): PlayingCard[] {
  const deck = SUITS.flatMap(suit => Array.from({ length: 13 }, (_, index) => ({ rank: index + 2, suit })));
  for (let index = deck.length - 1; index > 0; index--) { const other = random(index + 1); [deck[index], deck[other]] = [deck[other]!, deck[index]!]; }
  return deck.slice(0, 4);
}
