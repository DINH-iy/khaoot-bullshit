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
const grid = (columns: number, rows: number) => z.array(z.string().length(columns).regex(/^[.#+]+$/)).length(rows);
export const BrickMapSchema = z.union([grid(BRICK_COLUMNS, BRICK_ROWS), grid(LEGACY_COLUMNS, LEGACY_ROWS)])
  .refine(rows => rows.some(row => /[#+]/.test(row)), 'Place at least one brick');

function preset(tile: (x: number, y: number) => string) {
  return Array.from({ length: BRICK_ROWS }, (_, y) => Array.from({ length: BRICK_COLUMNS }, (_, x) => tile(x, y)).join(''));
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
};
export const BRICK_PRESETS = ['steps', 'circuit', 'cascade'] as const;
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
const DENSE_LAYOUT = { x: 16, y: 22, cellWidth: 9, cellHeight: 9, gapX: 1, gapY: 1, splash: 2 };
const LEGACY_LAYOUT = { x: 12, y: 25, cellWidth: 37, cellHeight: 22, gapX: 3, gapY: 4, splash: 0 };

export function brickRect(run: BrickRun, index: number) {
  const { x, y, cellWidth, cellHeight, gapX, gapY } = run.layout;
  return { x: x + index % run.columns * cellWidth, y: y + Math.floor(index / run.columns) * cellHeight, width: cellWidth - gapX, height: cellHeight - gapY };
}

export interface BrickRun {
  tiles: number[];
  columns: number;
  rows: number;
  layout: typeof DENSE_LAYOUT;
  hits: number;
  remaining: number;
  paddle: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  relaunch: number;
  misses: number;
  ticks: number;
}

export function startBrickRun(map: readonly string[]): BrickRun {
  const tiles = [...map.join('')].map(tile => tile === '+' ? 2 : tile === '#' ? 1 : 0);
  const columns = map[0]!.length;
  return { tiles, columns, rows: map.length, layout: columns === LEGACY_COLUMNS ? LEGACY_LAYOUT : DENSE_LAYOUT, hits: 0, remaining: tiles.filter(Boolean).length, paddle: BRICK_WIDTH / 2, x: BRICK_WIDTH / 2, y: BRICK_PADDLE_Y - RADIUS,
    vx: BALL_SPEED * .38, vy: -BALL_SPEED * .925, relaunch: 18, misses: 0, ticks: 0 };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const brickControl = (position: number) => Math.round(clamp((position - HALF_PADDLE) / (BRICK_WIDTH - BRICK_PADDLE_WIDTH), 0, 1) * LAST_CONTROL);
export const brickElapsed = (ticks: number) => Math.round(ticks * 1000 / BRICK_HZ);

/** One fixed tick, shared by the interactive board and the server's replay. */
export function tickBrickRun(run: BrickRun, control: number) {
  if (!run.remaining || run.ticks >= BRICK_MAX_TICKS) return;
  run.ticks++;
  const target = HALF_PADDLE + control / LAST_CONTROL * (BRICK_WIDTH - BRICK_PADDLE_WIDTH);
  run.paddle += clamp(target - run.paddle, -MAX_PADDLE_STEP, MAX_PADDLE_STEP);
  if (run.relaunch > 0) {
    run.relaunch--;
    run.x = run.paddle;
    return;
  }

  const oldX = run.x;
  const oldY = run.y;
  run.x += run.vx;
  run.y += run.vy;
  if (run.x <= RADIUS || run.x >= BRICK_WIDTH - RADIUS) {
    run.x = clamp(run.x, RADIUS, BRICK_WIDTH - RADIUS);
    run.vx = run.x === RADIUS ? Math.abs(run.vx) : -Math.abs(run.vx);
  }
  if (run.y <= RADIUS) { run.y = RADIUS; run.vy = Math.abs(run.vy); }

  if (run.vy > 0 && oldY <= BRICK_PADDLE_Y - RADIUS && run.y >= BRICK_PADDLE_Y - RADIUS) {
    const impact = oldX + (run.x - oldX) * (BRICK_PADDLE_Y - RADIUS - oldY) / (run.y - oldY);
    if (Math.abs(impact - run.paddle) <= HALF_PADDLE + RADIUS) {
      const aim = clamp((impact - run.paddle) / HALF_PADDLE, -.92, .92);
      const horizontal = Math.abs(aim) < .16 ? (run.vx < 0 ? -.16 : .16) : aim;
      run.vx = horizontal * BALL_SPEED;
      run.vy = -Math.sqrt(BALL_SPEED ** 2 - run.vx ** 2);
      run.y = BRICK_PADDLE_Y - RADIUS;
    }
  }

  hitBricks(run, oldX, oldY);

  if (run.y > BRICK_HEIGHT + RADIUS) {
    run.misses++;
    run.relaunch = 34;
    run.x = run.paddle;
    run.y = BRICK_PADDLE_Y - RADIUS;
    run.vx = BALL_SPEED * (run.misses % 2 === 0 ? .38 : -.38);
    run.vy = -BALL_SPEED * .925;
  }
}

function hitBricks(run: BrickRun, oldX: number, oldY: number) {
  const { x, y, cellWidth, cellHeight, splash } = run.layout;
  const leftColumn = Math.max(0, Math.floor((run.x - RADIUS - x) / cellWidth));
  const rightColumn = Math.min(run.columns - 1, Math.floor((run.x + RADIUS - x) / cellWidth));
  const topRow = Math.max(0, Math.floor((run.y - RADIUS - y) / cellHeight));
  const bottomRow = Math.min(run.rows - 1, Math.floor((run.y + RADIUS - y) / cellHeight));
  for (let row = topRow; row <= bottomRow; row++) {
    for (let column = leftColumn; column <= rightColumn; column++) {
      const index = row * run.columns + column;
      if (!run.tiles[index]) continue;
      const rect = brickRect(run, index);
      const left = rect.x - RADIUS; const right = rect.x + rect.width + RADIUS;
      const top = rect.y - RADIUS; const bottom = rect.y + rect.height + RADIUS;
      if (run.x <= left || run.x >= right || run.y <= top || run.y >= bottom) continue;
      for (let dy = -splash; dy <= splash; dy++) {
        for (let dx = -splash; dx <= splash; dx++) {
          const targetColumn = column + dx;
          const targetRow = row + dy;
          if (targetColumn < 0 || targetColumn >= run.columns || targetRow < 0 || targetRow >= run.rows) continue;
          const target = targetRow * run.columns + targetColumn;
          const health = run.tiles[target]!;
          if (!health) continue;
          run.tiles[target] = health - 1;
          if (health === 1) run.remaining--;
        }
      }
      run.hits++;
      if (oldY <= top || oldY >= bottom || (oldX > left && oldX < right)) {
        run.y = run.vy > 0 ? top : bottom;
        run.vy = -run.vy;
      } else {
        run.x = run.vx > 0 ? left : right;
        run.vx = -run.vx;
      }
      return;
    }
  }
}
