import { HANGMAN_ALPHABET, HANGMAN_WORDS, hangmanPattern, hangmanProgress, hangmanView, type HangmanOwnView, type MinigameSettings } from '@party/contracts';
import type { StepGame } from '../shared/steps/games.js';
import type { MinigameRun } from '../shared/rules.js';

// Galgje (Hangman): every side guesses the round's word (drawn at the start, kept in the run), one letter per step.
// A side's state is just its guesses; the word itself never goes into a view before the reveal.
interface Guesses { guessed: string[] }
type Settings = MinigameSettings<'hangman'>;

/** The round's word, drawn from the author's words or the built-in list. */
export function drawHangmanWord(settings: Settings, random: (max: number) => number): string {
  const words = settings.words?.length ? settings.words : HANGMAN_WORDS[settings.wordLanguage ?? 'en'];
  return words[random(words.length)]!;
}

const wordOf = (run: MinigameRun) => run.hangmanWord ?? '';
const progress = (state: Guesses, settings: MinigameSettings, run: MinigameRun) => hangmanProgress(wordOf(run), state.guessed, (settings as Settings).lives);

export const hangman: StepGame<Guesses> = {
  start: () => ({ guessed: [] }),
  // The letters not guessed yet, until the word is found or the gallows is finished.
  options: (state, settings, run) => {
    const { solved, hanged } = progress(state, settings, run);
    return !wordOf(run) || solved || hanged ? null : HANGMAN_ALPHABET.filter(letter => !state.guessed.includes(letter));
  },
  apply: (state, option) => ({ guessed: [...state.guessed, option] }),
  // Found: the number of wrong letters (fewer is better). Hanged: no result.
  result: (state, settings, run) => { const { solved, wrong } = progress(state, settings, run); return solved ? wrong : null; },
  view: (state, settings, run) => hangmanView(wordOf(run), state.guessed, (settings as Settings).lives),
  ownView: (state, _settings, run): HangmanOwnView => ({ pattern: hangmanPattern(wordOf(run), state.guessed), guessed: state.guessed }),
};
