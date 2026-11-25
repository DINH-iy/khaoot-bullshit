import { z } from 'zod';

/**
 * Galgje (Hangman): every side guesses the same secret word, one letter at a time. The word is drawn
 * by the server when play starts and stays on the server until the reveal; a side's own phones see its
 * letters, everyone else only its gallows and how far it got.
 */
export const HANGMAN_ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');
export const HANGMAN_WORD_LANGUAGES = ['en', 'nl', 'de', 'ro'] as const;
export type HangmanWordLanguage = typeof HANGMAN_WORD_LANGUAGES[number];
/** The gallows is drawn in this many parts; fewer lives draw several parts per wrong guess. */
export const HANGMAN_PARTS = 10;

/** A word as it is played: lower case, accents taken off (é → e, ß → ss), only letters, single spaces and hyphens. */
export function normalizeHangmanWord(word: string): string {
  return word.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').toLowerCase()
    .replace(/[^a-z -]/g, '').replace(/\s+/g, ' ').replace(/-+/g, '-').trim();
}
/** 2–30 characters with at least two letters, after normalizing. */
export const HangmanWordSchema = z.string().max(60).transform(normalizeHangmanWord)
  .refine(word => word.length <= 30 && word.replace(/[^a-z]/g, '').length >= 2 && /^[a-z]/.test(word) && /[a-z]$/.test(word), 'Use a word of 2 to 30 letters');

// `lives`: wrong guesses a side may make (the last one hangs it). `words`: the author's own words (one is drawn per round);
// without them a word comes from the built-in list in `wordLanguage` (English when absent).
export const HangmanSettingsSchema = z.object({
  lives: z.number().int().min(3).max(12),
  words: z.array(HangmanWordSchema).min(1).max(200).optional(),
  wordLanguage: z.enum(HANGMAN_WORD_LANGUAGES).optional(),
}).strict();

/** Built-in words per language: common, mostly 5–10 letters, without accents. */
export const HANGMAN_WORDS: Record<HangmanWordLanguage, readonly string[]> = {
  en: ['giraffe', 'pancake', 'volcano', 'umbrella', 'pyramid', 'keyboard', 'jellyfish', 'astronaut', 'rainbow', 'penguin', 'lighthouse', 'skeleton', 'sandwich', 'treasure', 'dinosaur',
    'trumpet', 'blizzard', 'cactus', 'popcorn', 'spaghetti', 'wizard', 'hammock', 'zeppelin', 'octopus', 'marathon', 'firework', 'labyrinth', 'snowflake', 'kangaroo', 'waterfall'],
  nl: ['fiets', 'stroopwafel', 'molen', 'paraplu', 'drop', 'tulp', 'hagelslag', 'kaasschaaf', 'klompen', 'dijk', 'pindakaas', 'boterham', 'zeehond', 'vuurtoren', 'regenboog',
    'olifant', 'pannenkoek', 'brandweer', 'schaatsen', 'kabouter', 'sinterklaas', 'appeltaart', 'wolkenkrabber', 'sneeuwpop', 'vlinder', 'kikker', 'gitaar', 'ijsbeer', 'zandkasteel', 'kermis'],
  de: ['fahrrad', 'regenschirm', 'brezel', 'kuckucksuhr', 'schneemann', 'leuchtturm', 'apfelstrudel', 'eichhoernchen', 'feuerwehr', 'kartoffel', 'schmetterling', 'regenbogen', 'zahnbuerste', 'bratwurst', 'gitarre',
    'elefant', 'pinguin', 'vulkan', 'pfannkuchen', 'sandburg', 'achterbahn', 'drachen', 'zauberer', 'schatzkiste', 'wasserfall', 'eisbaer', 'kaktus', 'trompete', 'tannenbaum', 'luftballon'],
  ro: ['bicicleta', 'umbrela', 'castel', 'papusa', 'clatite', 'vulpe', 'zmeu', 'dragon', 'cartof', 'curcubeu', 'elefant', 'girafa', 'pinguin', 'vulcan', 'chitara',
    'fluture', 'broasca', 'comoara', 'vrajitor', 'cascada', 'sanie', 'ciocolata', 'pompier', 'balon', 'zapada', 'pepene', 'farfurie', 'telefon', 'avion', 'ursulet'],
};

// What everyone sees of a side: the word's shape (letters as "_", spaces and hyphens shown), how many letter places it found, its wrong guesses and lives.
export const HangmanViewSchema = z.object({ mask: z.string().max(30), found: z.number().int().min(0), wrong: z.number().int().min(0), lives: z.number().int().min(1),
  solved: z.boolean(), hanged: z.boolean() }).strict();
export type HangmanView = z.infer<typeof HangmanViewSchema>;
// What only the side's own phones see: the word with its found letters ("ga_g_e"), and every letter it guessed, in order.
export const HangmanOwnViewSchema = z.object({ pattern: z.string().max(30), guessed: z.array(z.string().length(1)) }).strict();
export type HangmanOwnView = z.infer<typeof HangmanOwnViewSchema>;

/** The word with only the guessed letters showing ("_" for the others). */
export const hangmanPattern = (word: string, guessed: readonly string[]) => [...word].map(char => /[a-z]/.test(char) && !guessed.includes(char) ? '_' : char).join('');
/** Gallows parts showing after `wrong` mistakes with `lives` lives: all of them once hanged. */
export const hangmanParts = (wrong: number, lives: number) => Math.min(HANGMAN_PARTS, Math.round(wrong * HANGMAN_PARTS / lives));

/** Where a side stands: its wrong guesses, letter places found, and whether it found the word or is hanged. */
export function hangmanProgress(word: string, guessed: readonly string[], lives: number) {
  const inWord = new Set([...word].filter(char => /[a-z]/.test(char)));
  const wrong = guessed.filter(letter => !inWord.has(letter)).length;
  const solved = [...inWord].every(letter => guessed.includes(letter));
  return { wrong, solved, hanged: !solved && wrong >= lives, found: [...word].filter(char => /[a-z]/.test(char) && guessed.includes(char)).length };
}
/** The view everyone sees of a side (no letters). */
export const hangmanView = (word: string, guessed: readonly string[], lives: number): HangmanView => {
  const { wrong, solved, hanged, found } = hangmanProgress(word, guessed, lives);
  return { mask: word.replace(/[a-z]/g, '_'), found, wrong, lives, solved, hanged };
};
