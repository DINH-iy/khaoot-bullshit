import { z } from 'zod';

export const COIN_SIDES = ['heads', 'tails'] as const;
export const CoinSideSchema = z.enum(COIN_SIDES);
export type CoinSide = z.infer<typeof CoinSideSchema>;
