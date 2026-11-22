import { BALL_RADIUS, POCKET_RADIUS, POOL_BALL_PRESETS, POOL_HEIGHT, POOL_MAX_MOTION_FRAMES, POOL_POCKETS, POOL_WIDTH, POOL_STEPS_PER_FRAME, type PoolImpact, type PoolBallBehavior, type PoolFrame, type PoolSpin } from './pool.js';

const RATE = 120;
const SAMPLE_INTERVAL = POOL_STEPS_PER_FRAME;
const MAX_STEPS = (POOL_MAX_MOTION_FRAMES - 1) * SAMPLE_INTERVAL;
const DIAMETER = BALL_RADIUS * 2;
type Ball = { id: number; x: number; y: number; vx: number; vy: number };

function collide(a: Ball, b: Ball) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  if (distance >= DIAMETER || distance === 0) return 0;
  const nx = dx / distance;
  const ny = dy / distance;
  const overlap = (DIAMETER - distance) / 2;
  a.x -= overlap * nx;
  a.y -= overlap * ny;
  b.x += overlap * nx;
  b.y += overlap * ny;
  const impulse = ((a.vx - b.vx) * nx + (a.vy - b.vy) * ny) * .97;
  if (impulse <= 0) return 0;
  a.vx -= impulse * nx;
  a.vy -= impulse * ny;
  b.vx += impulse * nx;
  b.vy += impulse * ny;
  return impulse;
}

function cushion(ball: Ball, bounce: number, sideSpin: number) {
  if (ball.x < BALL_RADIUS || ball.x > POOL_WIDTH - BALL_RADIUS) {
    ball.x = Math.max(BALL_RADIUS, Math.min(POOL_WIDTH - BALL_RADIUS, ball.x));
    ball.vx = (ball.x === BALL_RADIUS ? Math.abs(ball.vx) : -Math.abs(ball.vx)) * bounce;
    ball.vy += ball.vx * sideSpin * .23;
  }
  if (ball.y < BALL_RADIUS || ball.y > POOL_HEIGHT - BALL_RADIUS) {
    ball.y = Math.max(BALL_RADIUS, Math.min(POOL_HEIGHT - BALL_RADIUS, ball.y));
    ball.vy = (ball.y === BALL_RADIUS ? Math.abs(ball.vy) : -Math.abs(ball.vy)) * bounce;
    ball.vx -= ball.vy * sideSpin * .23;
  }
}

/** Fixed time steps keep the table consistent for both players and everyone watching. */
export function shootPool(frame: PoolFrame, angle: number, power: number, behavior?: PoolBallBehavior, spin?: PoolSpin) {
  const moving: Ball[] = frame.map(([id, x, y]) => ({ id, x, y, vx: 0, vy: 0 }));
  const cue = moving.find(ball => ball.id === 0)!;
  const radians = angle * Math.PI / 180;
  const speed = 32 + 1168 * (power / 100) ** 1.25;
  cue.vx = Math.cos(radians) * speed;
  cue.vy = Math.sin(radians) * speed;
  const picture = (): PoolFrame => moving.map(({ id, x, y }) => [id, Math.round(x), Math.round(y)]);
  const motion: PoolFrame[] = [picture()];
  const impacts = new Map<number, PoolImpact>();
  const pocketed: { id: number; pocket: number }[] = [];
  let firstHit: number | null = null;
  const table = behavior?.preset === 'custom' ? behavior : POOL_BALL_PRESETS[behavior?.preset ?? 'arcade'];
  const clothDrag = table.rollingResistance * (62 / POOL_BALL_PRESETS.arcade.rollingResistance);

  for (let step = 1; step <= MAX_STEPS; step++) {
    const spinRemaining = spin ? Math.exp(-step / (RATE * 1.25)) : 0;
    const sideSpin = (spin?.[0] ?? 0) / 100 * spinRemaining;
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
      cushion(ball, table.railBounce, ball.id === 0 ? sideSpin : 0);
      const velocity = Math.hypot(ball.vx, ball.vy);
      const keep = velocity < table.stopSpeed ? 0 : 1 - (clothDrag / velocity + .13) / RATE;
      ball.vx *= keep;
      ball.vy *= keep;
    }
    // A second pass resolves nearby contacts in the compact rack.
    // Follow or draw acts on the cue ball after its first object-ball contact.
    const forwardSpin = -(spin?.[1] ?? 0) / 100 * spinRemaining;
    const spinKick = forwardSpin * .56;
    for (let pass = 0; pass < 2; pass++) {
      for (const [index, a] of moving.entries()) for (let other = index + 1; other < moving.length; other++) {
        const b = moving[other]!;
        const cueContact = firstHit === null && (a.id === 0 || b.id === 0);
        const vx = cueContact ? cue.vx : 0;
        const vy = cueContact ? cue.vy : 0;
        const impulse = collide(a, b);
        if (impulse >= 15) {
          const interval = Math.ceil(step / SAMPLE_INTERVAL);
          const strength = Math.min(100, Math.max(1, Math.round(impulse / 10)));
          const strongest = impacts.get(interval);
          if (!strongest || strength > strongest[1]) impacts.set(interval, [step, strength]);
        }
        if (impulse && cueContact) {
          firstHit = a.id === 0 ? b.id : a.id;
          cue.vx += vx * spinKick;
          cue.vy += vy * spinKick;
        }
      }
    }
    for (const ball of moving) cushion(ball, table.railBounce, ball.id === 0 ? sideSpin : 0);
    if (step % SAMPLE_INTERVAL === 0) motion.push(picture());
    if (moving.every(ball => ball.vx === 0 && ball.vy === 0)) break;
  }
  const balls = picture();
  if (motion.length < POOL_MAX_MOTION_FRAMES) motion.push(balls);
  else motion[motion.length - 1] = balls;
  return { balls, motion, impacts: [...impacts.values()], pocketed, firstHit };
}
