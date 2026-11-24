import { z } from 'zod';

/**
 * European roulette, the same table everywhere: the hosted minigame (stakes are
 * the players' points), the arcade round and the phone side game (stakes are
 * play chips). One wheel, the same bets, the same payouts.
 */
export const ROULETTE_POCKETS = 37;
export const RoulettePocketSchema = z.number().int().min(0).max(ROULETTE_POCKETS - 1);
export const ROULETTE_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26] as const;
const reds = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export function rouletteColor(pocket: number) {
  return pocket === 0 ? 'green' : reds.has(pocket) ? 'red' : 'black';
}

/** Outside bets. Green zero loses every one of them. */
export const ROULETTE_OUTSIDE = ['red', 'black', 'odd', 'even', 'low', 'high', 'dozen1', 'dozen2', 'dozen3', 'column1', 'column2', 'column3'] as const;
export type RouletteOutside = typeof ROULETTE_OUTSIDE[number];
const RouletteTablePickSchema = z.union([z.enum(ROULETTE_OUTSIDE), RoulettePocketSchema]);
/** A bet's target: one number (0–36, including green zero) or an outside bet. */
export type RouletteTablePick = z.infer<typeof RouletteTablePickSchema>;

/** Chip values on the table; a stake of 0 is a free pick, just for fun. */
export const ROULETTE_CHIPS = [1, 5, 10, 25, 100] as const;
export const ROULETTE_MAX_PER_PICK = 10_000;
/** Bets on one spin: each target once. A single bet may be free (0); with several, every bet has a stake. */
export const RouletteTableBetsSchema = z.array(z.object({
  guess: RouletteTablePickSchema, bet: z.number().int().min(0).max(ROULETTE_MAX_PER_PICK),
}).strict()).min(1).max(ROULETTE_POCKETS + ROULETTE_OUTSIDE.length)
  .refine(bets => new Set(bets.map(entry => entry.guess)).size === bets.length && (bets.length === 1 || bets.every(entry => entry.bet > 0)));
export type RouletteBets = z.infer<typeof RouletteTableBetsSchema>;
export const RouletteTableSpinSchema = z.object({ roundId: z.uuid(), bets: RouletteTableBetsSchema }).strict();
export const RouletteTableResultSchema = RouletteTableSpinSchema.extend({
  roulette: RoulettePocketSchema, payout: z.number().int().min(0), balance: z.number().int(),
}).strict();
export type RouletteTableSpin = z.infer<typeof RouletteTableSpinSchema>;
export type RouletteTableResult = z.infer<typeof RouletteTableResultSchema>;

export function rouletteMatches(pocket: number, guess: RouletteTablePick): boolean {
  if (typeof guess === 'number') return pocket === guess;
  if (pocket === 0) return false;
  switch (guess) {
    case 'red': case 'black': return rouletteColor(pocket) === guess;
    case 'odd': return pocket % 2 === 1;
    case 'even': return pocket % 2 === 0;
    case 'low': return pocket <= 18;
    case 'high': return pocket >= 19;
    case 'dozen1': return pocket <= 12;
    case 'dozen2': return pocket >= 13 && pocket <= 24;
    case 'dozen3': return pocket >= 25;
    case 'column1': return pocket % 3 === 1;
    case 'column2': return pocket % 3 === 2;
    case 'column3': return pocket % 3 === 0;
  }
}
/** The odds a winning bet pays ("35 to 1"): a number 35, a dozen or column 2, the even-money bets 1. */
export const roulettePays = (guess: RouletteTablePick) => typeof guess === 'number' ? 35 : guess.startsWith('dozen') || guess.startsWith('column') ? 2 : 1;
/** What a bet returns: its stake plus the winnings when it wins, nothing when it loses. */
export const rouletteReturn = (pocket: number, guess: RouletteTablePick, bet: number) =>
  rouletteMatches(pocket, guess) ? bet * (roulettePays(guess) + 1) : 0;
export const rouletteStake = (bets: RouletteBets) => bets.reduce((total, entry) => total + entry.bet, 0);
/** What the bets win or lose in all: the returns minus the stakes. */
export const rouletteNet = (pocket: number, bets: RouletteBets) =>
  bets.reduce((total, entry) => total + rouletteReturn(pocket, entry.guess, entry.bet) - entry.bet, 0);

/**
 * In a game, players bet their points: up to their score, or up to the round's
 * minimum stake when their score is lower (so a player with few or no points,
 * as everyone in a fresh arcade round, can still play, and may go below 0).
 */
export const ROULETTE_BET_FLOOR = 100;
export const rouletteBetLimit = (scorePoints: number, floor = ROULETTE_BET_FLOOR) => Math.max(Math.floor(scorePoints), floor);
