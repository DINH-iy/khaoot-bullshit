import { z } from 'zod';

export const BRICK_COLUMNS = 32;
export const BRICK_ROWS = 24;
export const BRICK_MAX_SECONDS = 120;
export const BRICK_HZ = 60;
export const BRICK_MAX_TICKS = BRICK_HZ * BRICK_MAX_SECONDS;
export const BRICK_CONTROLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export const BrickTraceSchema = z.string().min(1).max(BRICK_MAX_TICKS).regex(/^[A-Za-z0-9_-]+$/);
const LEGACY_COLUMNS = 8;
const LEGACY_ROWS = 5;
const grid = (columns: number, rows: number) => z.array(z.string().length(columns).regex(/^[.#+3-9SW]+$/)).length(rows);
export const BrickMapSchema = z.union([grid(BRICK_COLUMNS, BRICK_ROWS), grid(LEGACY_COLUMNS, LEGACY_ROWS)])
  .refine(rows => rows.some(row => /[^.]/.test(row)), 'Place at least one brick');

export const BRICK_SPLIT_TILE = 'S';
export const BRICK_WIDE_TILE = 'W';
export const BRICK_TOUGHNESS = [2, 3, 4, 5, 6, 7, 8, 9] as const;

export function brickTileHits(tile: string): number {
  if (tile === '.') return 0;
  if (tile === '+') return 2;
  if (tile >= '3' && tile <= '9') return Number(tile);
  return 1;
}
const POWER_UP_TICKS = 8 * BRICK_HZ;
const MAX_BALLS = 3;
const WIDE_PADDLE = 108;

function preset(tile: (x: number, y: number) => string) {
  return Array.from({ length: BRICK_ROWS }, (_, y) => Array.from({ length: BRICK_COLUMNS }, (_, x) => {
    const cell = tile(x, y);
    if (cell !== '#') return cell;
    const position = (x * 19 + y * 37) % 89;
    return position < 2 ? BRICK_SPLIT_TILE : position === 2 ? BRICK_WIDE_TILE : cell;
  }).join(''));
}

export const BRICK_MAPS = {
  steps: preset((x, y) => {
    const tier = Math.floor(y / 4);
    return x < 2 + tier * 2 || x > 29 || (y % 4 === 0 && x < 12 + tier * 2) ? '.' : y % 8 === 3 && x % 3 === 0 ? '+' : '#';
  }),
  circuit: preset((x, y) => {
    if (x < 1 || x > 30 || y < 1 || y > 22) return '.';
    const ring = Math.min(x - 1, 30 - x, y - 1, 22 - y);
    if ((ring === 2 || ring === 7) && Math.abs(x - 15.5) > 1.5) return '.';
    if (x > 12 && x < 19 && y > 8 && y < 16) return '+';
    return '#';
  }),
  cascade: preset((x, y) => {
    const lane = (x + Math.floor(y / 2)) % 11;
    return y >= 23 || lane === 0 || lane === 1 ? '.' : lane === 2 && y % 2 === 0 ? '+' : '#';
  }),
  oudje: [
    '................................',
    '................................',
    '................................',
    '...#...#........................',
    '...##.##........................',
    '...#.#.#..##..###..###...##.....',
    '...#.#.#.#..#.#..#.#..#.#..#....',
    '...#...#.####.#..#.#..#.#..#....',
    '...#...#.#....#..#.#..#.#..#....',
    '...#...#..###.#..#.#..#..##.....',
    '................................',
    '................................',
    '................................',
    '...#......................#.#...',
    '..........................#.#...',
    '...#..###.....##..#..#..###.#...',
    '...#.#.......#..#.#..#.#..#.#...',
    '...#..##.....#..#.#..#.#..#.#...',
    '...#....#....#..#.#..#.#..#.....',
    '...#.###......##...###..###.#...',
    '................................',
    '................................',
    '................................',
    '................................',
  ],
};
export const BRICK_PRESETS = ['steps', 'circuit', 'cascade', 'oudje'] as const;
export const BrickSettingsSchema = z.object({ preset: z.enum(BRICK_PRESETS).optional(), map: BrickMapSchema.optional() }).strict()
  .refine(settings => !settings.preset || !settings.map, 'Choose a preset or a custom map');
export type BrickSettings = z.infer<typeof BrickSettingsSchema>;
export const brickMap = (settings: BrickSettings = {}) => settings.map ?? BRICK_MAPS[settings.preset ?? 'steps'];

export const BRICK_WIDTH = 320;
export const BRICK_HEIGHT = 372;
export const BRICK_PADDLE_Y = 332;
export const BRICK_PADDLE_WIDTH = 72;
export const BRICK_BALL_RADIUS = 5;
const BALL_SPEED = 5.5;
const MAX_PADDLE_STEP = 12;
const HALF_PADDLE = BRICK_PADDLE_WIDTH / 2;
const LAST_CONTROL = BRICK_CONTROLS.length - 1;
const RADIUS = BRICK_BALL_RADIUS;
const DENSE_LAYOUT = { x: 16, y: 22, cellWidth: 9, cellHeight: 9, gapX: 1, gapY: 1 };
const LEGACY_LAYOUT = { x: 12, y: 25, cellWidth: 37, cellHeight: 22, gapX: 3, gapY: 4 };

export function brickRect(run: BrickRun, index: number) {
  const { x, y, cellWidth, cellHeight, gapX, gapY } = run.layout;
  return { x: x + index % run.columns * cellWidth, y: y + Math.floor(index / run.columns) * cellHeight, width: cellWidth - gapX, height: cellHeight - gapY };
}

interface BrickBall { x: number; y: number; vx: number; vy: number }

export interface BrickRun {
  tiles: number[];
  powerTiles: readonly string[];
  columns: number;
  rows: number;
  layout: typeof DENSE_LAYOUT;
  speed: number;
  hits: number;
  remaining: number;
  paddle: number;
  balls: BrickBall[];
  wideUntil: number;
  relaunch: number;
  misses: number;
  ticks: number;
}

export function startBrickRun(map: readonly string[]): BrickRun {
  const powerTiles = [...map.join('')];
  const tiles = powerTiles.map(brickTileHits);
  const columns = map[0]!.length;
  const remaining = tiles.filter(Boolean).length;
  // Full maps need more passes with smaller hits. Sparse maps keep the original pace.
  const speed = columns === LEGACY_COLUMNS ? BALL_SPEED : BALL_SPEED + Math.min(4, Math.max(0, remaining - 40) / 100);
  const paddle = BRICK_WIDTH / 2;
  return { tiles, powerTiles, columns, rows: map.length, layout: columns === LEGACY_COLUMNS ? LEGACY_LAYOUT : DENSE_LAYOUT, speed,
    hits: 0, remaining, paddle, balls: [launchBall(paddle, speed, .38)], wideUntil: 0, relaunch: 18, misses: 0, ticks: 0 };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const brickControl = (position: number) => Math.round(clamp((position - HALF_PADDLE) / (BRICK_WIDTH - BRICK_PADDLE_WIDTH), 0, 1) * LAST_CONTROL);
export const brickElapsed = (ticks: number) => Math.round(ticks * 1000 / BRICK_HZ);

const launchBall = (paddle: number, speed: number, direction: number): BrickBall => ({
  x: paddle, y: BRICK_PADDLE_Y - RADIUS, vx: speed * direction, vy: -speed * .925,
});
export const brickPaddleWidth = (run: BrickRun) => run.ticks < run.wideUntil ? WIDE_PADDLE : BRICK_PADDLE_WIDTH;

/** One fixed tick, shared by the interactive board and the server's replay. */
export function tickBrickRun(run: BrickRun, control: number) {
  if (!run.remaining || run.ticks >= BRICK_MAX_TICKS) return;
  run.ticks++;
  const halfPaddle = brickPaddleWidth(run) / 2;
  const target = HALF_PADDLE + control / LAST_CONTROL * (BRICK_WIDTH - BRICK_PADDLE_WIDTH);
  run.paddle = clamp(run.paddle + clamp(target - run.paddle, -MAX_PADDLE_STEP, MAX_PADDLE_STEP), halfPaddle, BRICK_WIDTH - halfPaddle);
  if (run.relaunch > 0) {
    run.relaunch--;
    run.balls[0]!.x = run.paddle;
    return;
  }

  const splits: BrickBall[] = [];
  for (const ball of run.balls) {
    const split = moveBall(run, ball, halfPaddle);
    if (split) splits.push(split);
  }
  const nextHalfPaddle = brickPaddleWidth(run) / 2;
  run.paddle = clamp(run.paddle, nextHalfPaddle, BRICK_WIDTH - nextHalfPaddle);
  run.balls = run.balls.filter(ball => ball.y <= BRICK_HEIGHT + RADIUS);
  run.balls.push(...splits.slice(0, MAX_BALLS - run.balls.length));
  if (!run.balls.length) {
    run.misses++;
    run.relaunch = 34;
    run.balls = [launchBall(run.paddle, run.speed, run.misses % 2 === 0 ? .38 : -.38)];
  }
}

function moveBall(run: BrickRun, ball: BrickBall, halfPaddle: number) {
  const oldX = ball.x;
  const oldY = ball.y;
  ball.x += ball.vx;
  ball.y += ball.vy;
  if (ball.x <= RADIUS || ball.x >= BRICK_WIDTH - RADIUS) {
    ball.x = clamp(ball.x, RADIUS, BRICK_WIDTH - RADIUS);
    ball.vx = ball.x === RADIUS ? Math.abs(ball.vx) : -Math.abs(ball.vx);
  }
  if (ball.y <= RADIUS) { ball.y = RADIUS; ball.vy = Math.abs(ball.vy); }

  if (ball.vy > 0 && oldY <= BRICK_PADDLE_Y - RADIUS && ball.y >= BRICK_PADDLE_Y - RADIUS) {
    const impact = oldX + (ball.x - oldX) * (BRICK_PADDLE_Y - RADIUS - oldY) / (ball.y - oldY);
    if (Math.abs(impact - run.paddle) <= halfPaddle + RADIUS) {
      const aim = clamp((impact - run.paddle) / halfPaddle, -.92, .92);
      const horizontal = Math.abs(aim) < .16 ? (ball.vx < 0 ? -.16 : .16) : aim;
      ball.vx = horizontal * run.speed;
      ball.vy = -Math.sqrt(run.speed ** 2 - ball.vx ** 2);
      ball.y = BRICK_PADDLE_Y - RADIUS;
    }
  }

  return hitBricks(run, ball, oldX, oldY);
}

function hitBricks(run: BrickRun, ball: BrickBall, oldX: number, oldY: number): BrickBall | undefined {
  const { x, y, cellWidth, cellHeight } = run.layout;
  const leftColumn = Math.max(0, Math.floor((ball.x - RADIUS - x) / cellWidth));
  const rightColumn = Math.min(run.columns - 1, Math.floor((ball.x + RADIUS - x) / cellWidth));
  const topRow = Math.max(0, Math.floor((ball.y - RADIUS - y) / cellHeight));
  const bottomRow = Math.min(run.rows - 1, Math.floor((ball.y + RADIUS - y) / cellHeight));
  for (let rowOffset = 0; rowOffset <= bottomRow - topRow; rowOffset++) {
    const row = ball.vy < 0 ? bottomRow - rowOffset : topRow + rowOffset;
    for (let columnOffset = 0; columnOffset <= rightColumn - leftColumn; columnOffset++) {
      const column = ball.vx < 0 ? rightColumn - columnOffset : leftColumn + columnOffset;
      const index = row * run.columns + column;
      if (!run.tiles[index]) continue;
      const rect = brickRect(run, index);
      const left = rect.x - RADIUS; const right = rect.x + rect.width + RADIUS;
      const top = rect.y - RADIUS; const bottom = rect.y + rect.height + RADIUS;
      if (ball.x <= left || ball.x >= right || ball.y <= top || ball.y >= bottom) continue;
      const verticalBounce = oldY <= top || oldY >= bottom || (oldX > left && oldX < right);
      let split = damageBrick(run, index);
      if (run.columns === BRICK_COLUMNS) {
        // Along the face the ball hit, its footprint can overlap an adjacent tile.
        const first = verticalBounce ? Math.max(leftColumn, column - 1) : Math.max(topRow, row - 1);
        const last = verticalBounce ? Math.min(rightColumn, column + 1) : Math.min(bottomRow, row + 1);
        for (let neighbor = first; neighbor <= last; neighbor++) {
          const target = verticalBounce ? row * run.columns + neighbor : neighbor * run.columns + column;
          if (target === index) continue;
          const adjacent = brickRect(run, target);
          const offset = verticalBounce ? ball.x - adjacent.x : ball.y - adjacent.y;
          const length = verticalBounce ? adjacent.width : adjacent.height;
          if (offset > -RADIUS && offset < length + RADIUS) split = damageBrick(run, target) || split;
        }
      }
      run.hits++;
      if (verticalBounce) {
        ball.y = ball.vy > 0 ? top : bottom;
        ball.vy = -ball.vy;
      } else {
        ball.x = ball.vx > 0 ? left : right;
        ball.vx = -ball.vx;
      }
      return split && run.balls.length < MAX_BALLS ? splitBall(ball, verticalBounce, run.speed) : undefined;
    }
  }
  return undefined;
}

function splitBall(ball: BrickBall, verticalBounce: boolean, speed: number): BrickBall {
  // Send the pair away from the same brick face, in different directions.
  const tangent = verticalBounce ? 'vx' : 'vy';
  const normal = verticalBounce ? 'vy' : 'vx';
  if (Math.abs(ball[tangent]) < speed * .25) {
    ball[tangent] = (ball[tangent] < 0 ? -.3 : .3) * speed;
    ball[normal] = Math.sign(ball[normal]) * Math.sqrt(speed ** 2 - ball[tangent] ** 2);
  }
  return { ...ball, [tangent]: -ball[tangent] };
}

function damageBrick(run: BrickRun, index: number) {
  const health = run.tiles[index]!;
  if (!health) return false;
  run.tiles[index] = health - 1;
  if (health !== 1) return false;
  run.remaining--;
  const power = run.powerTiles[index];
  if (power === BRICK_WIDE_TILE) run.wideUntil = run.ticks + POWER_UP_TICKS;
  return power === BRICK_SPLIT_TILE;
}
