import { BALL_RADIUS, POCKET_RADIUS, POOL_HEIGHT, POOL_POCKETS, POOL_WIDTH, type PoolFrame } from '@party/contracts';

const RATE = 120;
const SAMPLE_INTERVAL = 8;
const MAX_STEPS = 800;
const DIAMETER = BALL_RADIUS * 2;
type Ball = { id: number; x: number; y: number; vx: number; vy: number };

export function rackPool(): PoolFrame {
  const rack = [[1], [9, 2], [3, 8, 10], [11, 4, 12, 5], [13, 6, 14, 7, 15]];
  return [[0, 200, 200], ...rack.flatMap((row, column) => row.map((id, index): PoolFrame[number] => [
    id, 550 + column * 18.6, 200 + (index - (row.length - 1) / 2) * 21,
  ]))];
}

function collide(a: Ball, b: Ball) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  if (distance >= DIAMETER || distance === 0) return false;
  const nx = dx / distance;
  const ny = dy / distance;
  const overlap = (DIAMETER - distance) / 2;
  a.x -= overlap * nx;
  a.y -= overlap * ny;
  b.x += overlap * nx;
  b.y += overlap * ny;
  const impulse = ((a.vx - b.vx) * nx + (a.vy - b.vy) * ny) * .97;
  if (impulse <= 0) return false;
  a.vx -= impulse * nx;
  a.vy -= impulse * ny;
  b.vx += impulse * nx;
  b.vy += impulse * ny;
  return true;
}

function cushion(ball: Ball) {
  if (ball.x < BALL_RADIUS || ball.x > POOL_WIDTH - BALL_RADIUS) {
    ball.x = Math.max(BALL_RADIUS, Math.min(POOL_WIDTH - BALL_RADIUS, ball.x));
    ball.vx = (ball.x === BALL_RADIUS ? Math.abs(ball.vx) : -Math.abs(ball.vx)) * .79;
  }
  if (ball.y < BALL_RADIUS || ball.y > POOL_HEIGHT - BALL_RADIUS) {
    ball.y = Math.max(BALL_RADIUS, Math.min(POOL_HEIGHT - BALL_RADIUS, ball.y));
    ball.vy = (ball.y === BALL_RADIUS ? Math.abs(ball.vy) : -Math.abs(ball.vy)) * .79;
  }
}

/** Fixed time steps keep the table consistent for both players and everyone watching. */
export function shootPool(frame: PoolFrame, angle: number, power: number) {
  const moving: Ball[] = frame.map(([id, x, y]) => ({ id, x, y, vx: 0, vy: 0 }));
  const cue = moving.find(ball => ball.id === 0)!;
  const radians = angle * Math.PI / 180;
  const speed = 80 + power * 11;
  cue.vx = Math.cos(radians) * speed;
  cue.vy = Math.sin(radians) * speed;
  const picture = (): PoolFrame => moving.map(({ id, x, y }) => [id, Math.round(x), Math.round(y)]);
  const motion: PoolFrame[] = [picture()];
  const pocketed: { id: number; pocket: number }[] = [];
  let firstHit: number | null = null;

  for (let step = 1; step <= MAX_STEPS; step++) {
    for (let index = moving.length - 1; index >= 0; index--) {
      const ball = moving[index]!;
      ball.x += ball.vx / RATE;
      ball.y += ball.vy / RATE;
      const pocket = POOL_POCKETS.findIndex(([x, y]) => Math.hypot(x - ball.x, y - ball.y) < POCKET_RADIUS);
      if (pocket !== -1) {
        pocketed.push({ id: ball.id, pocket });
        moving.splice(index, 1);
        continue;
      }
      cushion(ball);
      const velocity = Math.hypot(ball.vx, ball.vy);
      const keep = velocity === 0 ? 0 : Math.max(0, (velocity - 190 / RATE) / velocity);
      ball.vx *= keep;
      ball.vy *= keep;
    }
    // A second pass resolves nearby contacts in the compact rack.
    for (let pass = 0; pass < 2; pass++) {
      for (const [index, a] of moving.entries()) for (let other = index + 1; other < moving.length; other++) {
        const b = moving[other]!;
        if (collide(a, b) && firstHit === null && (a.id === 0 || b.id === 0)) firstHit = a.id === 0 ? b.id : a.id;
      }
    }
    for (const ball of moving) cushion(ball);
    if (step % SAMPLE_INTERVAL === 0) motion.push(picture());
    if (moving.every(ball => ball.vx === 0 && ball.vy === 0)) break;
  }
  const balls = picture();
  return { balls, motion: motion.length === 101 ? [...motion.slice(0, 100), balls] : [...motion, balls], pocketed, firstHit };
}
