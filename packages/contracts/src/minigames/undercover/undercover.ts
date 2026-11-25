import { z } from 'zod';

/**
 * Undercover / Mr. White: most players (civilians) get the same secret word; the undercover players get a
 * similar word, and Mr. White gets none. Nobody knows who is who (Mr. White knows they have no word). In turns
 * everyone says one clue about their word out loud, then all vote one player out, whose role is shown. A Mr.
 * White who is voted out may guess the civilians' word and wins alone when right. The civilians win when every
 * undercover player and Mr. White are out; those win when they are as many as the civilians left.
 * The server deals and keeps every word and role; a phone only ever gets its own word.
 */
export const UNDERCOVER_ROLES = ['civilian', 'undercover', 'white'] as const;
export type UndercoverRole = typeof UNDERCOVER_ROLES[number];
export const UNDERCOVER_LANGUAGES = ['en', 'nl', 'de', 'ro'] as const;
export const UNDERCOVER_MIN_PLAYERS = 3;
/** Seconds Mr. White has to guess the word once voted out. */
export const UNDERCOVER_GUESS_SECONDS = 30;

const Word = z.string().trim().min(1).max(30);
/** A word pair: the civilians' word, then the undercover players' (similar, but different). */
export const UndercoverPairSchema = z.tuple([Word, Word]).refine(([civilian, undercover]) => civilian.toLowerCase() !== undercover.toLowerCase(), 'Use two different words');
export type UndercoverPair = z.infer<typeof UndercoverPairSchema>;

// `undercovers`: how many undercover players (fewer when there are not enough players). `mrWhite`: one player gets no word
// (from 5 players). `turnSeconds`: time per clue; afterwards anyone may move on. `voteSeconds`: time to vote.
// `pairs`: the author's own word pairs (one drawn per round); without them a pair from the built-in list in `wordLanguage`.
export const UndercoverSettingsSchema = z.object({
  undercovers: z.number().int().min(1).max(3),
  mrWhite: z.boolean(),
  turnSeconds: z.number().int().min(10).max(120),
  voteSeconds: z.number().int().min(15).max(180),
  pairs: z.array(UndercoverPairSchema).min(1).max(100).optional(),
  wordLanguage: z.enum(UNDERCOVER_LANGUAGES).optional(),
}).strict();
export type UndercoverSettings = z.infer<typeof UndercoverSettingsSchema>;

/** Built-in pairs per language: close enough to blend in, different enough to give yourself away. */
export const UNDERCOVER_PAIRS: Record<typeof UNDERCOVER_LANGUAGES[number], readonly UndercoverPair[]> = {
  en: [['coffee', 'tea'], ['cat', 'tiger'], ['beach', 'desert'], ['guitar', 'violin'], ['pizza', 'burger'], ['train', 'tram'], ['football', 'rugby'], ['winter', 'autumn'],
    ['apple', 'pear'], ['doctor', 'nurse'], ['piano', 'organ'], ['moon', 'sun'], ['wedding', 'birthday'], ['lion', 'wolf'], ['hotel', 'hostel'], ['sea', 'lake'],
    ['shoe', 'boot'], ['king', 'president'], ['cinema', 'theatre'], ['rain', 'snow']],
  nl: [['koffie', 'thee'], ['fiets', 'scooter'], ['kat', 'tijger'], ['strand', 'woestijn'], ['gitaar', 'viool'], ['pizza', 'hamburger'], ['trein', 'tram'], ['voetbal', 'hockey'],
    ['winter', 'herfst'], ['appel', 'peer'], ['dokter', 'verpleger'], ['piano', 'orgel'], ['maan', 'zon'], ['bruiloft', 'verjaardag'], ['leeuw', 'wolf'], ['zee', 'meer'],
    ['stroopwafel', 'koekje'], ['koning', 'president'], ['bioscoop', 'theater'], ['regen', 'sneeuw']],
  de: [['Kaffee', 'Tee'], ['Fahrrad', 'Roller'], ['Katze', 'Tiger'], ['Strand', 'Wüste'], ['Gitarre', 'Geige'], ['Pizza', 'Burger'], ['Zug', 'Straßenbahn'], ['Fußball', 'Handball'],
    ['Winter', 'Herbst'], ['Apfel', 'Birne'], ['Arzt', 'Pfleger'], ['Klavier', 'Orgel'], ['Mond', 'Sonne'], ['Hochzeit', 'Geburtstag'], ['Löwe', 'Wolf'], ['Meer', 'See'],
    ['Brezel', 'Brötchen'], ['König', 'Präsident'], ['Kino', 'Theater'], ['Regen', 'Schnee']],
  ro: [['cafea', 'ceai'], ['bicicletă', 'trotinetă'], ['pisică', 'tigru'], ['plajă', 'deșert'], ['chitară', 'vioară'], ['pizza', 'burger'], ['tren', 'tramvai'], ['fotbal', 'handbal'],
    ['iarnă', 'toamnă'], ['măr', 'pară'], ['doctor', 'asistent'], ['pian', 'orgă'], ['lună', 'soare'], ['nuntă', 'aniversare'], ['leu', 'lup'], ['mare', 'lac'],
    ['covrig', 'gogoașă'], ['rege', 'președinte'], ['cinema', 'teatru'], ['ploaie', 'zăpadă']],
};

/** How a guess compares to the word: case, accents, spaces and punctuation do not matter. */
export const undercoverGuessMatches = (guess: string, word: string) => {
  const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').toLowerCase().replace(/[^a-z0-9]/g, '');
  return plain(guess).length > 0 && plain(guess) === plain(word);
};

export const UNDERCOVER_PHASES = ['clues', 'vote', 'guess', 'done'] as const;
const Id = z.string().uuid();
// What every screen sees: the speaking order, who is out (with their role, shown when voted out), the round and phase,
// whose clue it is, who has voted (not for whom), the last vote's count and who went out (or a tie), Mr. White's guess
// time, and once done the winner. Words and the roles of players still in never appear here.
export const UndercoverViewSchema = z.object({
  order: z.array(Id), out: z.array(z.object({ playerId: Id, role: z.enum(UNDERCOVER_ROLES), round: z.number().int().min(1) }).strict()),
  round: z.number().int().min(1), phase: z.enum(UNDERCOVER_PHASES),
  speakerId: Id.nullable(), turnEndsAt: z.string().datetime().nullable(),
  voters: z.array(Id), voteEndsAt: z.string().datetime().nullable(),
  last: z.object({ round: z.number().int().min(1), tally: z.array(z.object({ playerId: Id, count: z.number().int().min(1) }).strict()), outId: Id.nullable() }).strict().nullable(),
  guesserId: Id.nullable(), guessEndsAt: z.string().datetime().nullable(),
  winner: z.enum(['civilians', 'impostors', 'white']).nullable(),
  tooFew: z.boolean(),
}).strict();
export type UndercoverView = z.infer<typeof UndercoverViewSchema>;
// What only one phone gets: its own word (null for Mr. White) and whom it voted for this round.
export const UndercoverOwnSchema = z.object({ word: z.string().nullable(), vote: Id.nullable() }).strict();
export type UndercoverOwn = z.infer<typeof UndercoverOwnSchema>;
// After the reveal: both words, everyone's role, the winner and Mr. White's guess.
export const UndercoverRevealSchema = z.object({ words: z.tuple([z.string(), z.string()]), roles: z.array(z.object({ playerId: Id, role: z.enum(UNDERCOVER_ROLES) }).strict()),
  winner: z.enum(['civilians', 'impostors', 'white']).nullable(), guess: z.string().max(60).optional() }).strict();
export type UndercoverReveal = z.infer<typeof UndercoverRevealSchema>;
