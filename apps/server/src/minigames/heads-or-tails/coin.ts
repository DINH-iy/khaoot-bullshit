import { randomInt } from 'node:crypto';
import { COIN_SIDES } from '@party/contracts';

export const flipCoin = (random: (max: number) => number = randomInt) => COIN_SIDES[random(COIN_SIDES.length)]!;
