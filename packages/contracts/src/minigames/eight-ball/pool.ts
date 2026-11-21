import { z } from 'zod';

export const POOL_WIDTH = 800;
export const POOL_HEIGHT = 400;
export const BALL_RADIUS = 10;
export const POCKET_RADIUS = 22;
export const POOL_START_LINE = POOL_WIDTH / 4;
export const POOL_POCKETS = [0, POOL_HEIGHT].flatMap(y => [0, POOL_WIDTH / 2, POOL_WIDTH].map(x => [x, y] as const));
export const oppositePoolPocket = (pocket: number) => POOL_POCKETS.length - 1 - pocket;
export const POOL_MAX_SHOTS = 160;
export const PoolPositionSchema = z.tuple([z.number().int().min(BALL_RADIUS).max(POOL_WIDTH - BALL_RADIUS),
  z.number().int().min(BALL_RADIUS).max(POOL_HEIGHT - BALL_RADIUS)]);
const Ball = z.tuple([z.number().int().min(0).max(15), z.number().min(0).max(POOL_WIDTH), z.number().min(0).max(POOL_HEIGHT)]);
export const PoolFrameSchema = z.array(Ball).max(16);
export type PoolFrame = z.infer<typeof PoolFrameSchema>;
export type PoolBall = z.infer<typeof Ball>;
export const PoolShotSchema = z.strictObject({
  game: z.literal('eight-ball'), angle: z.number().int().min(0).max(359), power: z.number().int().min(1).max(100),
  shot: z.number().int().min(0).max(POOL_MAX_SHOTS - 1),
  cue: PoolPositionSchema.optional(),
});
export const PoolBoardSchema = z.strictObject({
  game: z.literal('eight-ball'), balls: PoolFrameSchema, solids: z.union([z.literal(0), z.literal(1)]).nullable(),
  ballInHand: z.boolean(), foul: z.boolean(), shot: z.number().int().min(0).max(POOL_MAX_SHOTS),
  eightPocket: z.number().int().min(0).max(5).nullable(),
  ending: z.enum(['early', 'scratch', 'wrong-pocket', 'foul', 'clean']).nullable(),
  motion: z.array(PoolFrameSchema).max(101),
});

export function poolGroup(ball: number) {
  return ball >= 1 && ball <= 7 ? 'solid' : ball >= 9 ? 'stripe' : null;
}

export function poolPositionClear(x: number, y: number, balls: PoolFrame) {
  return PoolPositionSchema.safeParse([x, y]).success
    && POOL_POCKETS.every(([px, py]) => Math.hypot(x - px, y - py) > POCKET_RADIUS + BALL_RADIUS)
    && balls.every(([id, bx, by]) => id === 0 || Math.hypot(x - bx, y - by) >= BALL_RADIUS * 2 + 1);
}

export const canPlacePoolCue = (x: number, y: number, balls: PoolFrame) =>
  x <= POOL_START_LINE && poolPositionClear(x, y, balls);
