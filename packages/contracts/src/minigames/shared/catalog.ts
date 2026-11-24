import { z } from 'zod';
import { COIN_SIDES, CoinSideSchema } from '../heads-or-tails/coin.js';
import { RoulettePocketSchema, RouletteTableBetsSchema } from '../red-or-black-roulette/roulette.js';
import { DotGuessSchema, DotPatternSchema, DotSettingsSchema } from '../count-the-dots/dot-pattern.js';
import { GraphHueSchema, GraphLineSchema, GraphRoundViewSchema, GraphSettingsSchema, GraphDataSchema } from '../draw-the-graph/graph.js';
import { CutSettingsSchema, CutTargetSchema } from '../cut-the-line/target.js';
import { COURSE_HEIGHT, COURSE_WIDTH, raceCourseHasRoute } from '../speed-run/course.js';

const Milli = z.string().regex(/^(0|[1-9][0-9]{0,11})$/);

/**
 * The minigame catalog: what each minigame is, its settings and how its result
 * reads. Phones measure their own play (fair over slow networks) and send one
 * result; the server checks it is possible and ranks everyone. Rules that must
 * stay secret (what is behind each door) live only on the server.
 */
export const MinigameSettingsSchemas = {
  // Wait for GO, then tap as fast as possible. Tapping early is a false start.
  reaction: z.object({ minWaitMs: z.number().int().min(1000).max(10_000), maxWaitMs: z.number().int().min(1000).max(15_000) }).strict()
    .refine(settings => settings.minWaitMs <= settings.maxWaitMs, 'The shortest wait must not be longer than the longest'),
  // Tap as often as possible before the time runs out.
  'clap-beat': z.object({}).strict(),
  'tap-race': z.object({ seconds: z.number().int().min(3).max(60) }).strict(),
  'speed-run': z.object({ course: z.array(z.string().length(COURSE_WIDTH)).length(COURSE_HEIGHT).refine(course =>
    /^S[.#]{6}$/.test(course[0] ?? '') && /^[.#]{6}F$/.test(course[COURSE_HEIGHT - 1] ?? '')
    && course.slice(1, -1).every(row => /^[.#]{7}$/.test(row)) && raceCourseHasRoute(course),
  'Keep an open route from the start to the flag').optional() }).strict(),
  // Stop a clock at exactly the target; it disappears after a while.
  'stop-clock': z.object({ targetMs: z.number().int().min(2000).max(60_000), visibleMs: z.number().int().min(0).max(60_000) }).strict()
    .refine(settings => settings.visibleMs < settings.targetMs, 'The clock must disappear before the target'),
  // Pick a door; each door hides points, shuffled for every game.
  // `order`: shuffled every game (the default), or fixed as listed (the host decides which door hides what).
  'lucky-doors': z.object({ doorsMilli: z.array(Milli).min(2).max(8), order: z.enum(['random', 'fixed']).optional() }).strict(),
  // Draw one circle in one stroke; the server scores how round it is.
  'perfect-circle': z.object({ seconds: z.number().int().min(3).max(30) }).strict(),
  'cut-the-line': CutSettingsSchema,
  'match-the-angle': z.object({}).strict(),
  'count-the-dots': DotSettingsSchema,
  'draw-the-graph': GraphSettingsSchema,
  'heads-or-tails': z.object({}).strict(),
  // Roulette: players bet their points. `betFloor`: what a player may bet when their score is lower (ROULETTE_BET_FLOOR when absent).
  'red-or-black-roulette': z.object({ betFloor: z.number().int().min(0).max(10_000).optional() }).strict(),
  // Pass the pencil: each team draws one picture, members taking turns; then everyone votes for the best (not their own).
  'relay-drawing': z.object({ secondsPerTurn: z.number().int().min(5).max(60), voteSeconds: z.number().int().min(10).max(120), animation: z.boolean().optional() }).strict(),
  // Drive the bus (the Dutch drinking game "bussen", without the final bus): each team guesses four cards
  // together; a wrong guess costs every member that round's sips. Fewest sips wins.
  // `rainbow`: a team whose four cards are four different suits makes the other teams drink the last round's sips.
  bus: z.object({ sips: z.array(z.number().int().min(0).max(20)).length(4), rainbow: z.boolean().optional() }).strict(),
  // Left or right: everyone picks left or right in secret (no talking); the majority wins. A tie: nobody wins.
  majority: z.object({}).strict(),
} as const;
export type MinigameKey = keyof typeof MinigameSettingsSchemas;
export type MinigameSettings<K extends MinigameKey = MinigameKey> = z.infer<typeof MinigameSettingsSchemas[K]>;
export const MINIGAME_KEYS = Object.keys(MinigameSettingsSchemas) as MinigameKey[];
export const TRYOUT_GAME_KEYS = [...MINIGAME_KEYS, 'eight-ball'] as const;
export type TryoutGame = typeof TRYOUT_GAME_KEYS[number];
export const isMinigameKey = (key: string): key is MinigameKey => key in MinigameSettingsSchemas;

/** Countdown before every minigame starts, so all phones begin together. */
export const MINIGAME_COUNTDOWN_MS = 3000;
export const ANGLE_TARGETS = Array.from({ length: 360 }, (_, angle) => angle).filter(angle =>
  [30, 45].every(step => Math.abs(angle - Math.round(angle / step) * step) > 5));
export const AngleSchema = z.number().int().min(0).max(359);

/** The smaller distance around the circle, including across 0°. */
export function angleError(guess: number, target: number): number {
  const difference = Math.abs(guess - target);
  return Math.min(difference, 360 - difference);
}
export const CLAP_BEATS_MS = [800, 2150, 3500, 4900, 6150, 7550] as const;
export const CLAP_WINDOW_MS = 550;
export const CLAP_END_MS = CLAP_BEATS_MS[CLAP_BEATS_MS.length - 1]! + CLAP_WINDOW_MS;

export function clapBeatAt(elapsed: number): number {
  return CLAP_BEATS_MS.findIndex(at => elapsed >= at && elapsed < at + CLAP_WINDOW_MS);
}

export interface MinigameInfo {
  name: string; description: string; howToPlay: string;
  /** How results compare: higher, lower, or no ranking (points come straight from the game). */
  better: 'higher' | 'lower' | 'none';
  defaults: MinigameSettings; defaultSeconds: number;
}
export const MINIGAMES: { [K in MinigameKey]: MinigameInfo & { defaults: MinigameSettings<K> } } = {
  reaction: { name: 'Reaction duel', description: 'Wait for GO, then tap first.', howToPlay: 'Wait until your screen says GO, then tap as fast as you can. Tap too early and you are out.',
    better: 'lower', defaults: { minWaitMs: 2000, maxWaitMs: 6000 }, defaultSeconds: 20 },
  'clap-beat': { name: 'Clap the beat', description: 'Clap or tap when the beat lights up.',
    howToPlay: 'Clap softly or tap on each lit beat. Each beat counts once. The microphone is optional.',
    better: 'higher', defaults: {}, defaultSeconds: 12 },
  'tap-race': { name: 'Tap race', description: 'Tap as often as you can.', howToPlay: 'When it starts, tap the big button as often as you can until the time runs out.',
    better: 'higher', defaults: { seconds: 10 }, defaultSeconds: 20 },
  'speed-run': { name: 'Speed run', description: 'Find the fastest route through an obstacle course.',
    howToPlay: 'Use the arrows to go around the walls and reach the flag. Fastest finish wins.',
    better: 'lower', defaults: {}, defaultSeconds: 45 },
  'stop-clock': { name: 'Stop the clock', description: 'Stop a vanishing clock at exactly the target.', howToPlay: 'A clock starts counting. It disappears after a while. Tap Stop when you think it reaches the target.',
    better: 'lower', defaults: { targetMs: 10_000, visibleMs: 3000 }, defaultSeconds: 30 },
  'lucky-doors': { name: 'Lucky doors', description: 'Pick a door and hope for the best.', howToPlay: 'Choose one door. Each door hides a number of points. Nobody knows which is which.',
    better: 'none', defaults: { doorsMilli: ['0', '5000', '10000'] }, defaultSeconds: 20 },
  'perfect-circle': { name: 'Perfect circle', description: 'Draw the roundest circle.', howToPlay: 'Draw one circle with one finger, in one go. The roundest circle wins.',
    better: 'higher', defaults: { seconds: 10 }, defaultSeconds: 25 },
  'cut-the-line': { name: 'Cut the Line', description: 'Estimate a percentage on an unmarked bar.',
    howToPlay: 'Drag the marker to cut the bar at the target percentage, then lock in your cut. Closest wins.',
    better: 'lower', defaults: {}, defaultSeconds: 20 },
  'match-the-angle': { name: 'Match the Angle', description: 'Aim a ray at the target angle.',
    howToPlay: 'Drag the ray to the target angle and lock it in. Angles start pointing right and increase counterclockwise. Closest wins, with faster submissions breaking ties.',
    better: 'lower', defaults: {}, defaultSeconds: 20 },
  'count-the-dots': { name: 'Count the Dots', description: 'Remember how many dots flashed on the shared screen.',
    howToPlay: 'Count the dots. Lock in your count on your phone.',
    better: 'lower', defaults: { viewSeconds: 5 }, defaultSeconds: 15 },
  'draw-the-graph': { name: 'Draw the Graph', description: 'Predict the missing half of a line graph.',
    howToPlay: 'Start at the last dot and draw the rest of the graph. Closest wins, with faster submissions breaking ties.',
    better: 'lower', defaults: {}, defaultSeconds: 30 },
  'heads-or-tails': { name: 'Heads or Tails', description: 'Make a private prediction for one shared coin flip.',
    howToPlay: 'Pick a side. Correct guesses earn points.',
    better: 'none', defaults: {}, defaultSeconds: 15 },
  'red-or-black-roulette': { name: 'Roulette', description: 'Bet your points on one shared roulette spin.',
    howToPlay: 'Put points on numbers, colours, odd or even, low or high, dozens or columns. The ball rolls when betting closes. A number pays 35 to 1, a dozen or column 2 to 1, the rest 1 to 1. Losing bets are lost.',
    better: 'none', defaults: {}, defaultSeconds: 30 },
  'relay-drawing': { name: 'Pass the pencil', description: 'Teams draw one picture together, taking turns; then everyone votes.', howToPlay: 'Your team draws one picture. Each player adds to it in turn. Then vote for the best drawing of another team.',
    better: 'higher', defaults: { secondsPerTurn: 15, voteSeconds: 30 }, defaultSeconds: 120 },
  bus: { name: 'Drive the bus', description: 'Teams guess four cards: red or black, higher or lower, inside or outside, the suit. Wrong: drink.',
    howToPlay: 'Decide together with your team, then tap your guess. 1: red or black? 2: higher or lower than the first card? 3: inside or outside the first two? 4: which suit? A wrong guess: everyone in your team drinks that round\u2019s sips.',
    better: 'lower', defaults: { sips: [1, 2, 3, 4], rainbow: true }, defaultSeconds: 180 },
  majority: { name: 'Left or right', description: 'Pick left or right without talking; the majority wins.',
    howToPlay: 'Choose left or right, in secret: no talking, no signs. Everyone who chose what most people chose wins. A tie: nobody wins.',
    better: 'none', defaults: {}, defaultSeconds: 20 },
};
/** Minigames that only work as a team round. */
export const TEAM_MINIGAMES: readonly MinigameKey[] = ['relay-drawing', 'bus'];
/** Games that require a host or shared display, unavailable in phone-only Arcade lobbies. */
export const SHARED_SCREEN_MINIGAMES: readonly MinigameKey[] = ['count-the-dots', 'draw-the-graph', 'heads-or-tails', 'red-or-black-roulette'];
export const isSharedPrediction = (game: string) => game === 'heads-or-tails' || game === 'red-or-black-roulette';

/** Settings for a minigame, or null when they do not fit it. */
export function parseMinigameSettings(game: string, settings: unknown): MinigameSettings | null {
  if (!isMinigameKey(game)) return null;
  const parsed = MinigameSettingsSchemas[game].safeParse(settings ?? MINIGAMES[game].defaults);
  return parsed.success ? parsed.data : null;
}

/** A result in words, for screens: "231 ms", "57 taps", "0.12 s off", "Door 2". */
export function formatMinigameResult(game: MinigameKey, value: number | null, settings: MinigameSettings): string {
  if (value === null) return game === 'reaction' ? 'False start' : 'No result';
  if (game === 'reaction') return `${value} ms`;
  if (game === 'speed-run') return `${(value / 1000).toFixed(2)} s`;
  if (game === 'clap-beat') return `${value}/${CLAP_BEATS_MS.length} beats`;
  if (game === 'tap-race') return `${value} ${value === 1 ? 'tap' : 'taps'}`;
  if (game === 'stop-clock') { const off = Math.abs(value - (settings as MinigameSettings<'stop-clock'>).targetMs) / 1000; return `${(value / 1000).toFixed(2)} s · ${off.toFixed(2)} s off`; }
  if (game === 'perfect-circle') return `${(value / 10).toFixed(1)}% round`;
  if (game === 'cut-the-line') return `${value} percentage points off`;
  if (game === 'match-the-angle') return `${value}° off`;
  if (game === 'count-the-dots') return `${value} off`;
  if (game === 'draw-the-graph') return `${(value / 100).toFixed(1)}% off`;
  if (game === 'heads-or-tails') return COIN_SIDES[value] === 'heads' ? 'Heads' : 'Tails';
  if (game === 'red-or-black-roulette') return value === 0 ? 'Free pick' : `Bet ${value}`;
  if (game === 'relay-drawing') return `${value} ${value === 1 ? 'vote' : 'votes'}`;
  if (game === 'bus') return `${value} ${value === 1 ? 'sip' : 'sips'}`;
  if (game === 'majority') return value === 0 ? 'Left' : 'Right';
  return `Door ${value + 1}`;
}

// ---------- Drive the bus ----------
export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
export type Suit = typeof SUITS[number];
// A playing card: rank 2–14 (11 jack, 12 queen, 13 king, 14 ace).
export const PlayingCardSchema = z.object({ rank: z.number().int().min(2).max(14), suit: z.enum(SUITS) }).strict();
export type PlayingCard = z.infer<typeof PlayingCardSchema>;
// The four rounds and what a team may guess in each.
export const BUS_GUESSES = [['red', 'black'], ['higher', 'lower'], ['inside', 'outside'], [...SUITS]] as const;
export type BusGuess = typeof BUS_GUESSES[number][number];
export const BusGuessSchema = z.enum(['red', 'black', 'higher', 'lower', 'inside', 'outside', ...SUITS]);
/**
 * Whether a guess about card `round` is right, given the cards before it. Equal is wrong:
 * the same rank is neither higher nor lower, and a card on the edge is neither inside nor outside.
 */
export function busGuessRight(round: number, guess: BusGuess, cards: PlayingCard[]): boolean {
  const card = cards[round]!;
  if (round === 0) return (guess === 'red') === (card.suit === 'hearts' || card.suit === 'diamonds');
  if (round === 1) { const first = cards[0]!.rank; return guess === 'higher' ? card.rank > first : card.rank < first; }
  if (round === 2) { const low = Math.min(cards[0]!.rank, cards[1]!.rank); const high = Math.max(cards[0]!.rank, cards[1]!.rank);
    return guess === 'inside' ? card.rank > low && card.rank < high : card.rank < low || card.rank > high; }
  return card.suit === guess;
}
/** A rainbow: four cards of four different suits. */
export const isRainbow = (cards: PlayingCard[]) => cards.length === 4 && new Set(cards.map(card => card.suit)).size === 4;
// What Drive the bus shows of a team: its cards so far (only those guessed), its guesses, right or wrong, its sips (its own wrong
// guesses plus `extra` from other teams' rainbows), and whether its own cards made a rainbow.
export const BusViewSchema = z.object({ cards: z.array(PlayingCardSchema), guesses: z.array(BusGuessSchema), right: z.array(z.boolean()), sips: z.number().int().min(0),
  extra: z.number().int().min(0).optional(), rainbow: z.boolean().optional() }).strict();
export type BusView = z.infer<typeof BusViewSchema>;

// The illustration prompts are public. The server assigns each team a secret index into this list.
export const ANIMATION_WORDS = ['rocket', 'turtle', 'volcano', 'skateboard', 'octopus', 'snowman', 'helicopter', 'frog', 'waterfall', 'train', 'robot', 'balloon'] as const;

// ---------- step games ----------
/**
 * Minigames played step by step, each step a choice (Drive the bus, Lucky doors…). One engine runs
 * them all (apps/server/src/minigames/shared/steps): a game plugs in its rules; playing, how a team decides,
 * saving, ranking and points are shared. A side plays: a team in a team round, else each player.
 */
export const STEP_MINIGAMES: readonly MinigameKey[] = ['bus', 'lucky-doors', 'majority', 'speed-run'];
export const isStepMinigame = (game: string) => (STEP_MINIGAMES as readonly string[]).includes(game);
/**
 * How a team decides each move (a scene setting): anyone in the team taps it; the team votes (each
 * member once, within the vote time; who does not vote is not counted); or the captain decides
 * (a team without a captain gets one at random).
 */
export const TEAM_DECIDES = ['anyone', 'vote', 'captain'] as const;
export type TeamDecides = typeof TEAM_DECIDES[number];
// A side on screens: the game's own view of it (public parts only), the step it is at, the options now
// (null when done), its result once done (not for a secret choice), its captain, and in a team vote when
// it ends, who has voted and (for the team itself) the count per option.
export const StepSideViewSchema = z.object({
  teamId: z.string().uuid().nullable(), playerId: z.string().uuid().nullable(), name: z.string(),
  step: z.number().int().min(0), options: z.array(z.string()).nullable(), result: z.number().int().nullable(),
  captainId: z.string().uuid().nullable(), voteEndsAt: z.string().datetime().nullable(),
  votes: z.array(z.object({ option: z.string(), count: z.number().int().min(0) }).strict()), voters: z.array(z.string().uuid()),
  view: z.unknown(),
}).strict();
export type StepSideView = z.infer<typeof StepSideViewSchema>;
// What Lucky doors shows of a side: the door it picked (the points behind the doors stay secret until the reveal).
export const DoorsViewSchema = z.object({ picked: z.number().int().min(0).nullable() }).strict();

/** What a phone sends: one number whose meaning depends on the minigame (see the catalog). */
// `stroke`: the circle drawn in Perfect circle (scored by the server); `teamId`: the team voted for in Pass the pencil.
// `rainbow`: Drive the bus, the team's cards made a rainbow (the other teams drink).
export const MinigameValueSchema = z.object({ kind: z.literal('minigame'), value: z.number().int().min(0).max(600_000), early: z.literal(true).optional(), rainbow: z.literal(true).optional(),
  stroke: z.array(z.number().int().min(0).max(1000)).min(2).max(800).optional(), teamId: z.string().uuid().optional(),
  // The server records the original cut here and puts its distance from the target in value.
  cut: z.number().int().min(0).max(100).optional(),
  angle: AngleSchema.optional(), dotGuess: DotGuessSchema.optional(), graphLine: GraphLineSchema.optional(),
  // Roulette: the bets (value holds their total stake).
  bets: RouletteTableBetsSchema.optional() }).strict();

/** The minigame as a screen sees it while it runs. Never contains secret parts (which door hides what). */
export const PublicMinigameSchema = z.object({
  game: z.enum(MINIGAME_KEYS as [MinigameKey, ...MinigameKey[]]), settings: z.record(z.string(), z.unknown()),
  // Server time: when the countdown ends and play begins (null while teams are being made), and for a reaction duel, when GO shows.
  startsAt: z.string().datetime().nullable(), goAt: z.string().datetime().nullable(),
  cutTarget: CutTargetSchema.optional(),
  angleTarget: AngleSchema.optional(),
  graph: GraphRoundViewSchema.optional(),
  dots: z.object({ guessAt: z.string().datetime(), pattern: DotPatternSchema.optional() }).strict().optional(),
  // Pass the pencil: the turns, who draws when, each team's parts so far (everyone may watch), and when voting starts.
  // A team step game (Drive the bus…): how teams decide, and every team's progress.
  steps: z.object({ decides: z.enum(TEAM_DECIDES), sides: z.array(StepSideViewSchema) }).strict().nullable().optional(),
  relay: z.object({ guessUntil: z.string().datetime().optional(), animation: z.object({ prompt: z.number().int().min(0).max(ANIMATION_WORDS.length - 1), targetTeamId: z.string().uuid().nullable() }).strict().optional(), turns: z.number().int().min(1), voteAt: z.string().datetime().nullable(),
    teams: z.array(z.object({ teamId: z.string().uuid(), name: z.string(), word: z.number().int().min(0).max(ANIMATION_WORDS.length - 1).optional(), drawers: z.array(z.string().uuid()), parts: z.array(z.object({ turn: z.number().int().min(0), assetId: z.string().uuid() }).strict()) }).strict()) }).strict().nullable(),
}).strict();
/** After the reveal: everyone's result and place, and for lucky doors what was behind each door. */
export const MinigameRevealSchema = z.object({
  kind: z.literal('minigame'), game: z.enum(MINIGAME_KEYS as [MinigameKey, ...MinigameKey[]]),
  entries: z.array(z.object({ playerId: z.string().uuid().nullable(), teamId: z.string().uuid().nullable(), value: z.number().int().nullable(), place: z.number().int().min(1).nullable(),
    stroke: z.array(z.number().int()).optional(), cut: z.number().int().min(0).max(100).optional(), angle: AngleSchema.optional(), dotGuess: DotGuessSchema.optional(), graphLine: GraphLineSchema.optional(), graphHue: GraphHueSchema.optional(), bets: RouletteTableBetsSchema.optional() }).strict()),
  doorsMilli: z.array(Milli).nullable(), graph: GraphDataSchema.optional(), dotCount: z.number().int().positive().optional(), coin: CoinSideSchema.optional(), roulette: RoulettePocketSchema.optional(),
  dotReveal: z.strictObject({ pattern: DotPatternSchema, startedAt: z.string().datetime() }).optional(),
}).strict();
