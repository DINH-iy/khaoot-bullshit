import { z } from 'zod';

export const POOL_WIDTH = 800;
export const POOL_HEIGHT = 400;
export const BALL_RADIUS = 10;
export const POCKET_RADIUS = 22;
export const POOL_START_LINE = POOL_WIDTH / 4;
export const POOL_START_MIN_PERCENT = 10;
export const POOL_START_MAX_PERCENT = 40;
const StartPercent = z.number().int().min(POOL_START_MIN_PERCENT).max(POOL_START_MAX_PERCENT);
export const PoolStartSchema = z.strictObject({ side: z.enum(['left', 'right', 'random']), percent: StartPercent });
const ResolvedPoolStartSchema = z.strictObject({ side: z.enum(['left', 'right']), percent: StartPercent });
export type PoolStart = z.infer<typeof PoolStartSchema>;
export type ResolvedPoolStart = z.infer<typeof ResolvedPoolStartSchema>;
export const DEFAULT_POOL_START: ResolvedPoolStart = { side: 'left', percent: 25 };
export const poolStartX = (start: ResolvedPoolStart = DEFAULT_POOL_START) => POOL_WIDTH * (start.side === 'right' ? 100 - start.percent : start.percent) / 100;
export const POOL_POCKETS = [0, POOL_HEIGHT].flatMap(y => [0, POOL_WIDTH / 2, POOL_WIDTH].map(x => [x, y] as const));
export const oppositePoolPocket = (pocket: number) => POOL_POCKETS.length - 1 - pocket;
export const POOL_MAX_SHOTS = 160;
export const POOL_MAX_MOTION_FRAMES = 181;
export const POOL_AIM_STEP = .25;
export const POOL_MATCH_MAX_SECONDS = 3600;
export const PoolMatchSecondsSchema = z.number().int().min(1).max(POOL_MATCH_MAX_SECONDS);
export const POOL_CUSTOM_RANGES = {
  rollingResistance: { min: .005, max: .12, step: .001 },
  railBounce: { min: .65, max: .97, step: .01 },
  stopSpeed: { min: 5, max: 35, step: 1 },
} as const;
export const POOL_BALL_PRESETS = {
  realistic: { rollingResistance: .014, railBounce: .9, stopSpeed: 9 },
  arcade: { rollingResistance: .035, railBounce: .85, stopSpeed: 18 },
  heavy: { rollingResistance: .065, railBounce: .78, stopSpeed: 24 },
} as const;
const tuning = (field: keyof typeof POOL_CUSTOM_RANGES) => z.number()
  .min(POOL_CUSTOM_RANGES[field].min).max(POOL_CUSTOM_RANGES[field].max).multipleOf(POOL_CUSTOM_RANGES[field].step);
export const PoolBallBehaviorSchema = z.discriminatedUnion('preset', [
  z.strictObject({ preset: z.enum(['realistic', 'arcade', 'heavy']) }),
  z.strictObject({ preset: z.literal('custom'), rollingResistance: tuning('rollingResistance'), railBounce: tuning('railBounce'), stopSpeed: tuning('stopSpeed') }),
]);
export type PoolBallBehavior = z.infer<typeof PoolBallBehaviorSchema>;
const SpinAxis = z.number().int().min(-100).max(100);
export const PoolSpinSchema = z.tuple([SpinAxis, SpinAxis]).refine(([x, y]) => x * x + y * y <= 10_000, 'Spin must fit on the cue ball');
export type PoolSpin = z.infer<typeof PoolSpinSchema>;
export const PoolPositionSchema = z.tuple([z.number().int().min(BALL_RADIUS).max(POOL_WIDTH - BALL_RADIUS),
  z.number().int().min(BALL_RADIUS).max(POOL_HEIGHT - BALL_RADIUS)]);
const Ball = z.tuple([z.number().int().min(0).max(15), z.number().min(0).max(POOL_WIDTH), z.number().min(0).max(POOL_HEIGHT)]);
export const PoolFrameSchema = z.array(Ball).max(16);
export type PoolFrame = z.infer<typeof PoolFrameSchema>;
export type PoolBall = z.infer<typeof Ball>;
export function rackPool(start: ResolvedPoolStart = DEFAULT_POOL_START): PoolFrame {
  const rack = [[1], [9, 2], [3, 8, 10], [11, 4, 12, 5], [13, 6, 14, 7, 15]];
  return [[0, poolStartX(start), 200], ...rack.flatMap((row, column) => row.map((id, index): PoolBall => [
    id, start.side === 'left' ? 550 + column * 18.6 : 250 - column * 18.6, 200 + (index - (row.length - 1) / 2) * 21,
  ]))];
}
export const PoolShotSchema = z.strictObject({
  game: z.literal('eight-ball'), angle: z.number().multipleOf(POOL_AIM_STEP).min(0).max(360 - POOL_AIM_STEP), power: z.number().int().min(1).max(100),
  shot: z.number().int().min(0).max(POOL_MAX_SHOTS - 1),
  cue: PoolPositionSchema.optional(),
  spin: PoolSpinSchema.optional(),
});
export const PoolBoardSchema = z.strictObject({
  game: z.literal('eight-ball'), balls: PoolFrameSchema, solids: z.union([z.literal(0), z.literal(1)]).nullable(),
  ballInHand: z.boolean(), foul: z.boolean(), shot: z.number().int().min(0).max(POOL_MAX_SHOTS),
  eightPocket: z.number().int().min(0).max(5).nullable(),
  ending: z.enum(['early', 'scratch', 'wrong-pocket', 'foul', 'clean']).nullable(),
  motion: z.array(PoolFrameSchema).max(POOL_MAX_MOTION_FRAMES),
  start: ResolvedPoolStartSchema.optional(),
  potsBySeat: z.tuple([z.array(z.number().int().min(1).max(15)).max(15), z.array(z.number().int().min(1).max(15)).max(15)]).optional(),
});

export function poolGroup(ball: number) {
  return ball >= 1 && ball <= 7 ? 'solid' : ball >= 9 ? 'stripe' : null;
}

export type PoolTarget = 'break' | 'open' | 'solid' | 'stripe' | 'eight';

export function poolLegalTarget(balls: PoolFrame, group: ReturnType<typeof poolGroup>, opening: boolean): PoolTarget {
  if (opening) return 'break';
  return balls.some(([id]) => group === null ? poolGroup(id) !== null : poolGroup(id) === group) ? group ?? 'open' : 'eight';
}

export function isLegalPoolContact(target: PoolTarget, id: number) {
  if (target === 'break') return id > 0;
  if (target === 'eight') return id === 8;
  return target === 'open' ? poolGroup(id) !== null : poolGroup(id) === target;
}

export function poolPositionClear(x: number, y: number, balls: PoolFrame) {
  return PoolPositionSchema.safeParse([x, y]).success
    && POOL_POCKETS.every(([px, py]) => Math.hypot(x - px, y - py) > POCKET_RADIUS + BALL_RADIUS)
    && balls.every(([id, bx, by]) => id === 0 || Math.hypot(x - bx, y - by) >= BALL_RADIUS * 2 + 1);
}

export const canPlacePoolCue = (x: number, y: number, balls: PoolFrame, start = DEFAULT_POOL_START) =>
  (start.side === 'right' ? x >= poolStartX(start) : x <= poolStartX(start)) && poolPositionClear(x, y, balls);
