import { z } from 'zod';
import { POOL_MAX_SHOTS, PoolBallBehaviorSchema, PoolBoardSchema, PoolFrameSchema, PoolFeltSchema, PoolShotSchema, PoolStartSchema } from './minigames/eight-ball/pool.js';

/**
 * Head-to-head games: two players, one board. Used by the duel scene (the two
 * duelists play while everyone bets) and by challenges on the phones. Each game
 * is a plug-in: an entry here (name, settings, moves, what a phone sees), one
 * rules module on the server and one board on the phone. Nothing else needs to
 * change to add a game. Seat 0 is the challenger (or the first duelist) and
 * moves first; seat 1 is the other player.
 */
export const HEAD_TO_HEAD_KEYS = ['rps', 'tictactoe', 'chess', 'creature-duel', 'eight-ball'] as const;
export type HeadToHeadKey = typeof HEAD_TO_HEAD_KEYS[number];
export const HeadToHeadKeySchema = z.enum(HEAD_TO_HEAD_KEYS);
export const HEAD_TO_HEAD_GAMES: Record<HeadToHeadKey, { name: string; description: string; howToPlay: string }> = {
  rps: { name: 'Rock paper scissors', description: 'Both pick at once; first to the set number of wins.', howToPlay: 'Pick rock, paper or scissors. Rock beats scissors, scissors beat paper, paper beats rock. A tie is played again.' },
  tictactoe: { name: 'Tic-tac-toe', description: 'Three in a row wins.', howToPlay: 'Take turns placing your mark. Three in a row (across, down or diagonal) wins; a full board is a draw.' },
  'creature-duel': { name: 'Creature duel', description: 'Battle with one creature or a team of three.',
    howToPlay: 'Take turns choosing from three randomly dealt moves. You can switch a living teammate instead. Deplete the other side’s health to win.' },
  chess: { name: 'Chess', description: 'The full game, with every rule.', howToPlay: 'Tap a piece, then where it goes. The first player has white. Checkmate wins; you can also resign.' },
  'eight-ball': { name: '8-ball pool', description: 'Aim, set the power, and clear your balls before the 8.', howToPlay: 'Aim and shoot. Clear your solids or stripes, then sink the 8.' },
};
export const isHeadToHeadKey = (value: unknown): value is HeadToHeadKey => typeof value === 'string' && (HEAD_TO_HEAD_KEYS as readonly string[]).includes(value);

// Settings per game, all with defaults (left out: the defaults).
const SETTINGS = {
  rps: z.object({ firstTo: z.number().int().min(1).max(5) }).strict(),
  tictactoe: z.object({}).strict(),
  chess: z.object({}).strict(),
  'eight-ball': z.object({ ballBehavior: PoolBallBehaviorSchema.optional(), start: PoolStartSchema.optional(), felt: PoolFeltSchema.optional() }).strict(),
  'creature-duel': z.object({ size: z.union([z.literal(1), z.literal(3)]) }).strict(),
} satisfies Record<HeadToHeadKey, z.ZodType>;
export type HeadToHeadSettings<K extends HeadToHeadKey = HeadToHeadKey> = z.infer<typeof SETTINGS[K]>;
export const HEAD_TO_HEAD_DEFAULTS: { [K in HeadToHeadKey]: HeadToHeadSettings<K> } = { rps: { firstTo: 2 }, tictactoe: {}, chess: {}, 'creature-duel': { size: 1 }, 'eight-ball': {} };
/** A game's settings with its defaults filled in, or null when they do not fit the game. */
export function parseHeadToHeadSettings<K extends HeadToHeadKey>(game: K, raw: unknown): HeadToHeadSettings<K> | null {
  const parsed = SETTINGS[game].safeParse({ ...HEAD_TO_HEAD_DEFAULTS[game], ...(raw && typeof raw === 'object' ? raw : {}) });
  return parsed.success ? parsed.data as HeadToHeadSettings<K> : null;
}

export const CREATURES = ['emberwing', 'reedrunner', 'stormshell', 'moonmoth', 'stonehorn', 'brambletail'] as const;
export const CREATURE_MOVE_KEYS = ['jab', 'surge', 'crush', 'guard', 'mend'] as const;
export const CREATURE_MAX_HP = 24;
const CreatureMove = z.enum(CREATURE_MOVE_KEYS);
const Roster = z.array(z.object({ kind: z.enum(CREATURES), hp: z.number().int().min(0).max(CREATURE_MAX_HP) }).strict()).min(1).max(3);
const CreatureFrame = z.object({
  teams: z.tuple([Roster, Roster]), active: z.tuple([z.number().int().min(0).max(2), z.number().int().min(0).max(2)]),
  last: z.union([CreatureMove, z.literal('switch')]).nullable(),
}).strict();

const Square = z.string().regex(/^[a-h][1-8]$/);
export const RpsPickSchema = z.enum(['rock', 'paper', 'scissors']);
/** One move. Resigning is not a move: it has its own command. */
export const HeadToHeadMoveSchema = z.discriminatedUnion('game', [
  PoolShotSchema,
  z.object({ game: z.literal('creature-duel'), pick: z.union([CreatureMove, z.number().int().min(0).max(2)]) }).strict(),
  z.object({ game: z.literal('rps'), pick: RpsPickSchema }).strict(),
  z.object({ game: z.literal('tictactoe'), cell: z.number().int().min(0).max(8) }).strict(),
  z.object({ game: z.literal('chess'), from: Square, to: Square, promotion: z.enum(['q', 'r', 'b', 'n']).optional() }).strict(),
]);
export type HeadToHeadMove = z.infer<typeof HeadToHeadMoveSchema>;

const Seat = z.union([z.literal(0), z.literal(1)]);
export const HeadToHeadOutcomeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('win'), seat: Seat, reason: z.enum(['played', 'resigned']) }).strict(),
  z.object({ kind: z.literal('draw') }).strict(),
]);
export type HeadToHeadOutcome = z.infer<typeof HeadToHeadOutcomeSchema>;
/**
 * A finished game, move by move, so a phone can play it back (and save it as a
 * video). Kept only as long as the match itself: it goes when the room ends.
 */
export const HeadToHeadReplaySchema = z.discriminatedUnion('game', [
  z.strictObject({ game: z.literal('eight-ball'), frames: z.array(PoolFrameSchema).min(1).max(POOL_MAX_SHOTS + 1), felt: PoolFeltSchema.optional() }),
  z.object({ game: z.literal('creature-duel'), frames: z.array(CreatureFrame).min(1).max(41) }).strict(),
  z.object({ game: z.literal('rps'), rounds: z.array(z.object({ picks: z.tuple([RpsPickSchema, RpsPickSchema]), winner: z.union([z.literal(0), z.literal(1)]).nullable() }).strict()).max(200) }).strict(),
  z.object({ game: z.literal('tictactoe'), moves: z.array(z.number().int().min(0).max(8)).max(9) }).strict(),
  z.object({ game: z.literal('chess'), frames: z.array(z.object({ fen: z.string().max(100), from: Square.nullable(), to: Square.nullable() }).strict()).max(1200) }).strict(),
]);
export type HeadToHeadReplay = z.infer<typeof HeadToHeadReplaySchema>;
/**
 * The board as one phone sees it: never the other player's hidden pick.
 * `turn`: whose move it is (`both` when both pick at once), null when it is over.
 * `seat`: the viewer's seat, null for anyone else.
 */
export const HeadToHeadViewSchema = z.object({
  game: HeadToHeadKeySchema, seat: Seat.nullable(), turn: z.union([Seat, z.literal('both')]).nullable(), outcome: HeadToHeadOutcomeSchema.nullable(),
  // Once the game is over: the whole game, to play back.
  replay: HeadToHeadReplaySchema.nullable(),
  board: z.discriminatedUnion('game', [
    PoolBoardSchema,
    CreatureFrame.extend({ game: z.literal('creature-duel'), moves: z.array(CreatureMove).max(3), guards: z.tuple([z.boolean(), z.boolean()]) }).strict(),
    z.object({ game: z.literal('rps'), firstTo: z.number().int(), wins: z.tuple([z.number().int(), z.number().int()]), round: z.number().int(),
      picked: z.tuple([z.boolean(), z.boolean()]), yourPick: RpsPickSchema.nullable(),
      last: z.object({ picks: z.tuple([RpsPickSchema, RpsPickSchema]), winner: Seat.nullable() }).strict().nullable() }).strict(),
    z.object({ game: z.literal('tictactoe'), cells: z.array(Seat.nullable()).length(9), line: z.array(z.number().int()).nullable() }).strict(),
    z.object({ game: z.literal('chess'), fen: z.string().max(100), check: z.boolean(), lastMove: z.object({ from: Square, to: Square }).strict().nullable(),
      // The viewer's legal moves when it is their turn (empty otherwise), so a phone needs no chess rules of its own.
      legal: z.array(z.object({ from: Square, to: Square, promotion: z.boolean() }).strict()), moves: z.number().int().min(0) }).strict(),
  ]),
}).strict();
export type HeadToHeadView = z.infer<typeof HeadToHeadViewSchema>;

// Challenges on the phones: one player challenges another in the same room to a
// head-to-head game, optionally for a stake in chips (each puts it in; the winner
// takes both; a draw gives them back). Kept only while the room is on.
export const ChallengeStatusSchema = z.enum(['INVITED', 'PLAYING', 'FINISHED', 'DECLINED', 'CANCELLED']);
export const MAX_CHALLENGE_STAKE = 100_000;
export const NewChallengeSchema = z.object({
  challengeId: z.uuid(), opponentId: z.uuid(), game: HeadToHeadKeySchema,
  stake: z.number().int().min(0).max(MAX_CHALLENGE_STAKE), settings: z.record(z.string(), z.json()).optional(),
}).strict();
export const ChallengeMoveSchema = z.object({ move: HeadToHeadMoveSchema }).strict();
export const ChallengeSchema = z.object({
  id: z.uuid(), game: HeadToHeadKeySchema, stake: z.number().int().min(0), status: ChallengeStatusSchema,
  challengerId: z.uuid(), opponentId: z.uuid(), mine: z.enum(['challenger', 'opponent']),
  view: HeadToHeadViewSchema, updatedAt: z.string(),
}).strict();
export type Challenge = z.infer<typeof ChallengeSchema>;
// `chips`: whether challenges in this room may have a stake (else they are for fun only).
export const ChallengeListSchema = z.object({ challenges: z.array(ChallengeSchema), balance: z.number().int(), chips: z.boolean() }).strict();
