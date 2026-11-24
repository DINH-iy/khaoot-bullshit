import { BALL_RADIUS, inPoolMouth, POOL_BALL_PRESETS, POOL_JAWS, POOL_HEIGHT, POOL_MAX_MOTION_FRAMES, POOL_POCKETS, POOL_WIDTH, POOL_STEPS_PER_FRAME, type PoolImpact, type PoolBallBehavior, type PoolFrame, type PoolSpin } from './pool.js';

const RATE = 120;
const SAMPLE_INTERVAL = POOL_STEPS_PER_FRAME;
const MAX_STEPS = (POOL_MAX_MOTION_FRAMES - 1) * SAMPLE_INTERVAL;
const DIAMETER = BALL_RADIUS * 2;
const BREAK_BOOST = 1.4;
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
  const impulse = ((a.vx - b.vx) * nx + (a.vy - b.vy) * ny) * .98;
  if (impulse <= 0) return 0;
  a.vx -= impulse * nx;
  a.vy -= impulse * ny;
  b.vx += impulse * nx;
  b.vy += impulse * ny;
  return impulse;
}

/** The radius of a jaw's rounded nose. */
const JAW_ROUND = 4;

function cushion(ball: Ball, bounce: number, sideSpin: number) {
  let impact = 0;
  // Pocket openings have no cushion: the ball runs on into the pocket unless it clips a jaw.
  if ((ball.x < BALL_RADIUS || ball.x > POOL_WIDTH - BALL_RADIUS) && !inPoolMouth(ball.y, POOL_HEIGHT, false)) {
    impact = Math.max(0, ball.x < BALL_RADIUS ? -ball.vx : ball.vx);
    ball.x = Math.max(BALL_RADIUS, Math.min(POOL_WIDTH - BALL_RADIUS, ball.x));
    ball.vx = (ball.x === BALL_RADIUS ? Math.abs(ball.vx) : -Math.abs(ball.vx)) * bounce;
    ball.vy += ball.vx * sideSpin * .23;
  }
  if ((ball.y < BALL_RADIUS || ball.y > POOL_HEIGHT - BALL_RADIUS) && !inPoolMouth(ball.x, POOL_WIDTH, true)) {
    impact = Math.max(impact, ball.y < BALL_RADIUS ? -ball.vy : ball.vy);
    ball.y = Math.max(BALL_RADIUS, Math.min(POOL_HEIGHT - BALL_RADIUS, ball.y));
    ball.vy = (ball.y === BALL_RADIUS ? Math.abs(ball.vy) : -Math.abs(ball.vy)) * bounce;
    ball.vx -= ball.vy * sideSpin * .23;
  }
  // Each jaw is a rounded cushion nose set into the rail at the pocket's edge: a ball that catches the edge of an
  // opening is reflected out off its curve, the way a real pocket's point throws it back.
  for (const [tipX, tipY] of POOL_JAWS) {
    const jx = tipX === 0 ? -JAW_ROUND : tipX === POOL_WIDTH ? POOL_WIDTH + JAW_ROUND : tipX;
    const jy = tipY === 0 ? -JAW_ROUND : tipY === POOL_HEIGHT ? POOL_HEIGHT + JAW_ROUND : tipY;
    const reach = BALL_RADIUS + JAW_ROUND;
    const dx = ball.x - jx, dy = ball.y - jy;
    const distance = Math.hypot(dx, dy);
    if (distance >= reach || distance === 0) continue;
    const nx = dx / distance, ny = dy / distance;
    const toward = ball.vx * nx + ball.vy * ny;
    ball.x = jx + nx * reach;
    ball.y = jy + ny * reach;
    if (toward >= 0) continue;
    ball.vx -= (1 + bounce) * toward * nx;
    ball.vy -= (1 + bounce) * toward * ny;
    impact = Math.max(impact, -toward);
  }
  return impact;
}

/**
 * The pocket a ball drops into, once more than half of it is over the edge of the cloth (its centre past the edge).
 * That only happens at a pocket opening (elsewhere the cushion keeps it on the table), so a ball that only grazes an
 * opening on its way along the rail rolls on: it is not pulled in from beside the pocket.
 */
function pocketFor(ball: Ball) {
  if (ball.x >= 0 && ball.x <= POOL_WIDTH && ball.y >= 0 && ball.y <= POOL_HEIGHT) return -1;
  let closest = 0;
  for (const [index, [x, y]] of POOL_POCKETS.entries()) {
    const [cx, cy] = POOL_POCKETS[closest]!;
    if (Math.hypot(x - ball.x, y - ball.y) < Math.hypot(cx - ball.x, cy - ball.y)) closest = index;
  }
  return closest;
}

/** Fixed time steps keep the table consistent for both players and everyone watching. */
export function shootPool(frame: PoolFrame, angle: number, power: number, behavior?: PoolBallBehavior, spin?: PoolSpin, opening = false) {
  const moving: Ball[] = frame.map(([id, x, y]) => ({ id, x, y, vx: 0, vy: 0 }));
  const cue = moving.find(ball => ball.id === 0)!;
  const radians = angle * Math.PI / 180;
  // The break hits harder than any later shot, so the rack opens up the way players expect.
  const speed = (32 + 1168 * (power / 100) ** 1.25) * (opening ? BREAK_BOOST : 1);
  cue.vx = Math.cos(radians) * speed;
  cue.vy = Math.sin(radians) * speed;
  const picture = (): PoolFrame => moving.map(({ id, x, y }) => [id, Math.round(x), Math.round(y)]);
  const motion: PoolFrame[] = [picture()];
  const impacts = new Map<number, PoolImpact>();
  const recordImpact = (step: number, impulse: number, rail = false) => {
    if (impulse < 15) return;
    const slot = 2 * Math.ceil(step / SAMPLE_INTERVAL) + Number(rail);
    const strength = Math.min(100, Math.round(impulse / 10));
    if (strength > (impacts.get(slot)?.[1] ?? 0)) impacts.set(slot, rail ? [step, strength, 'cushion'] : [step, strength]);
  };
  const pocketed: { id: number; pocket: number }[] = [];
  let firstHit: number | null = null;
  const table = behavior?.preset === 'custom' ? behavior : POOL_BALL_PRESETS[behavior?.preset ?? 'arcade'];
  const clothDrag = table.rollingResistance * (62 / POOL_BALL_PRESETS.arcade.rollingResistance);
  // A struck cue ball first slides, then rolls. Spin from the tip fades over this distance into natural roll.
  const slide = 60 + speed * .25;
  let cueTravel = 0;

  for (let step = 1; step <= MAX_STEPS; step++) {
    const spinRemaining = spin ? Math.exp(-step / (RATE * 1.25)) : 0;
    const sideSpin = (spin?.[0] ?? 0) / 100 * spinRemaining;
    for (let index = moving.length - 1; index >= 0; index--) {
      const ball = moving[index]!;
      ball.x += ball.vx / RATE;
      ball.y += ball.vy / RATE;
      if (ball === cue) cueTravel += Math.hypot(ball.vx, ball.vy) / RATE;
      const pocket = pocketFor(ball);
      if (pocket !== -1) {
        pocketed.push({ id: ball.id, pocket });
        moving.splice(index, 1);
        continue;
      }
      recordImpact(step, cushion(ball, table.railBounce, ball.id === 0 ? sideSpin : 0), true);
      const velocity = Math.hypot(ball.vx, ball.vy);
      const keep = velocity < table.stopSpeed ? 0 : 1 - (clothDrag / velocity + .13) / RATE;
      ball.vx *= keep;
      ball.vy *= keep;
    }
    // A second pass resolves nearby contacts in the compact rack.
    // Follow or draw acts on the cue ball after its first object-ball contact.
    // Follow (positive) or draw (negative) at contact: what is left of the tip's spin plus the
    // natural roll gained so far, which carries a rolling ball on at about 2/7 of its speed.
    const tipSpin = Math.exp(-cueTravel / slide);
    const spinKick = -(spin?.[1] ?? 0) / 100 * tipSpin * .56 + (1 - tipSpin) * .29;
    for (let pass = 0; pass < 2; pass++) {
      for (const [index, a] of moving.entries()) for (let other = index + 1; other < moving.length; other++) {
        const b = moving[other]!;
        const cueContact = firstHit === null && (a.id === 0 || b.id === 0);
        const vx = cueContact ? cue.vx : 0;
        const vy = cueContact ? cue.vy : 0;
        const impulse = collide(a, b);
        recordImpact(step, impulse);
        if (impulse && cueContact) {
          firstHit = a.id === 0 ? b.id : a.id;
          cue.vx += vx * spinKick;
          cue.vy += vy * spinKick;
        }
      }
    }
    for (const ball of moving) recordImpact(step, cushion(ball, table.railBounce, ball.id === 0 ? sideSpin : 0), true);
    if (step % SAMPLE_INTERVAL === 0) motion.push(picture());
    if (moving.every(ball => ball.vx === 0 && ball.vy === 0)) break;
  }
  const balls = picture();
  if (motion.length < POOL_MAX_MOTION_FRAMES) motion.push(balls);
  else motion[motion.length - 1] = balls;
  return { balls, motion, impacts: [...impacts.values()].sort((a, b) => a[0] - b[0]), pocketed, firstHit };
}
