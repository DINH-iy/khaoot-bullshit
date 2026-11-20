import { z } from 'zod';

export const ROULETTE_PICKS = ['red', 'black'] as const;
export const RoulettePickSchema = z.enum(ROULETTE_PICKS);
export const ROULETTE_POCKETS = 37;
export const RoulettePocketSchema = z.number().int().min(0).max(ROULETTE_POCKETS - 1);
export const ROULETTE_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26] as const;
const reds = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export function rouletteColor(pocket: number) {
  return pocket === 0 ? 'green' : reds.has(pocket) ? 'red' : 'black';
}

const RouletteTablePickSchema = z.union([RoulettePickSchema, RoulettePocketSchema]);
export type RouletteTablePick = z.infer<typeof RouletteTablePickSchema>;
export const ROULETTE_MAX_PER_PICK = 1000;
export const RouletteTableBetsSchema = z.array(z.object({
  guess: RouletteTablePickSchema, bet: z.number().int().min(0).max(ROULETTE_MAX_PER_PICK),
}).strict()).min(1).max(ROULETTE_POCKETS + ROULETTE_PICKS.length)
  .refine(bets => new Set(bets.map(entry => entry.guess)).size === bets.length && (bets.length === 1 || bets.every(entry => entry.bet > 0)));
export const RouletteTableSpinSchema = z.object({ roundId: z.uuid(), bets: RouletteTableBetsSchema }).strict();
export const RouletteTableResultSchema = RouletteTableSpinSchema.extend({
  roulette: RoulettePocketSchema, payout: z.number().int().min(0), balance: z.number().int(),
}).strict();
export type RouletteTableSpin = z.infer<typeof RouletteTableSpinSchema>;
export type RouletteTableResult = z.infer<typeof RouletteTableResultSchema>;
export const rouletteMatches = (pocket: number, guess: RouletteTablePick) => typeof guess === 'number' ? pocket === guess : rouletteColor(pocket) === guess;
export const rouletteReturn = (pocket: number, guess: RouletteTablePick, bet: number) =>
  rouletteMatches(pocket, guess) ? bet * (typeof guess === 'number' ? 36 : 2) : 0;
