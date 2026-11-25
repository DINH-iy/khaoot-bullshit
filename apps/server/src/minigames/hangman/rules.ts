import { HANGMAN_ALPHABET, HANGMAN_WORDS, hangmanPattern, hangmanProgress, hangmanView, readHangmanWordMove, type HangmanOwnView, type MinigameSettings } from '@party/contracts';
import type { StepGame } from '../shared/steps/games.js';
import type { MinigameRun } from '../shared/rules.js';

// Galgje (Hangman): every side guesses the round's word (drawn at the start, kept in the run), one letter per step.
// A side's state is just its guesses (letters, and whole words it tried); the word itself never goes into a view before the reveal.
interface Guesses { guessed: string[]; words?: string[] }
type Settings = MinigameSettings<'hangman'>;

/** The round's word, drawn from the author's words or the built-in list. */
export function drawHangmanWord(settings: Settings, random: (max: number) => number): string {
  const words = settings.words?.length ? settings.words : HANGMAN_WORDS[settings.wordLanguage ?? 'en'];
  return words[random(words.length)]!;
}

const wordOf = (run: MinigameRun) => run.hangmanWord ?? '';
const progress = (state: Guesses, settings: MinigameSettings, run: MinigameRun) => hangmanProgress(wordOf(run), state.guessed, (settings as Settings).lives, state.words);

export const hangman: StepGame<Guesses> = {
  start: () => ({ guessed: [] }),
  // The letters not guessed yet, until the word is found or the gallows is finished.
  options: (state, settings, run) => {
    const { solved, hanged } = progress(state, settings, run);
    return !wordOf(run) || solved || hanged ? null : HANGMAN_ALPHABET.filter(letter => !state.guessed.includes(letter));
  },
  // A whole word (not tried before) may be guessed at any moment the side still plays.
  accepts: (state, option) => { const word = readHangmanWordMove(option); return word !== null && !(state.words ?? []).includes(word); },
  apply: (state, option) => { const word = readHangmanWordMove(option); return word !== null ? { ...state, words: [...state.words ?? [], word] } : { ...state, guessed: [...state.guessed, option] }; },
  // Found: the number of wrong letters (fewer is better). Hanged: no result.
  result: (state, settings, run) => { const { solved, wrong } = progress(state, settings, run); return solved ? wrong : null; },
  view: (state, settings, run) => hangmanView(wordOf(run), state.guessed, (settings as Settings).lives, state.words),
  // Found by naming the word: the whole word shows. Wrong words are listed with the wrong letters.
  ownView: (state, _settings, run): HangmanOwnView => { const word = wordOf(run); const named = (state.words ?? []).includes(word);
    return { pattern: named ? word : hangmanPattern(word, state.guessed), guessed: state.guessed, words: (state.words ?? []).filter(entry => entry !== word) }; },
};
