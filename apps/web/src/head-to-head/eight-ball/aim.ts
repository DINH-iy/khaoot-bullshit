import { BALL_RADIUS, POOL_HEIGHT, POOL_WIDTH, type PoolBall, type PoolFrame } from '@party/contracts';

type BallPath = { distance: number; hit?: PoolBall };
export const POOL_CUE_LENGTH = 145;
export const poolCueOffset = (power: number) => 17 + power * .6;

export function isPoolCueShaftAt([, cueX, cueY]: PoolBall, angle: number, power: number, x: number, y: number, tolerance: number) {
  const radians = angle * Math.PI / 180;
  const dx = Math.cos(radians), dy = Math.sin(radians);
  const backX = cueX - x, backY = cueY - y;
  const along = backX * dx + backY * dy;
  const across = backX * dy - backY * dx;
  const tip = poolCueOffset(power);
  const beyond = Math.max(tip - along, along - (tip + POOL_CUE_LENGTH), 0);
  return Math.hypot(across, beyond) <= tolerance;
}

/** Trace a ball center to the first ball it would contact or the edge of the cushion. */
export function poolAimPath(origin: PoolBall, dx: number, dy: number, balls: PoolFrame): BallPath {
  const [id, x, y] = origin;
  let distance = Math.min(
    Math.abs(dx) < .00001 ? Infinity : (dx >= 0 ? POOL_WIDTH - BALL_RADIUS - x : x - BALL_RADIUS) / Math.abs(dx),
    Math.abs(dy) < .00001 ? Infinity : (dy >= 0 ? POOL_HEIGHT - BALL_RADIUS - y : y - BALL_RADIUS) / Math.abs(dy),
  );
  let hit: PoolBall | undefined;
  for (const ball of balls) {
    const [other, bx, by] = ball;
    if (other === 0 || other === id) continue;
    const along = (bx - x) * dx + (by - y) * dy;
    const cross = (bx - x) * dy - (by - y) * dx;
    const diameter = BALL_RADIUS * 2;
    if (along <= 0 || Math.abs(cross) >= diameter) continue;
    const entry = Math.max(0, along - Math.sqrt(diameter ** 2 - cross ** 2));
    if (entry <= distance) { distance = entry; hit = ball; }
  }
  return hit ? { distance, hit } : { distance };
}

/** Equal-size balls push apart along the line through their centers at impact. */
export function poolObjectPath(hit: PoolBall, cueX: number, cueY: number, balls: PoolFrame) {
  const x = hit[1] - cueX;
  const y = hit[2] - cueY;
  const length = Math.hypot(x, y);
  if (length < .00001) return null;
  const dx = x / length;
  const dy = y / length;
  return { dx, dy, distance: poolAimPath(hit, dx, dy, balls).distance };
}
