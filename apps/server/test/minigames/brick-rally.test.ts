import { describe, expect, it } from 'vitest';
import { BRICK_BALL_RADIUS, BRICK_COLUMNS, BRICK_HEIGHT, BRICK_HZ, BRICK_MAPS, BRICK_PADDLE_WIDTH, BRICK_ROWS, BrickMapSchema, brickPaddleWidth, brickRect, startBrickRun, tickBrickRun } from '@party/contracts';

describe('Brick Rally maps', () => {
  it('provides distinct playable layouts, including the oudje lettering', () => {
    const presets = Object.values(BRICK_MAPS);
    expect(new Set(presets.map(map => map.join())).size).toBe(presets.length);
    for (const map of presets) {
      expect(BrickMapSchema.safeParse(map).success).toBe(true);
      expect(map).toHaveLength(BRICK_ROWS);
      expect(map.every(line => line.length === BRICK_COLUMNS)).toBe(true);
      if (map === BRICK_MAPS.oudje) {
        expect(startBrickRun(map).remaining).toBeGreaterThan(90);
      } else {
        expect(startBrickRun(map).remaining).toBeGreaterThan(450);
        expect(map.join('')).toContain('S');
        expect(map.join('')).toContain('W');
      }
    }
  });

  it('chips the contact edge without clearing tiles behind it', () => {
    const empty = '.'.repeat(BRICK_COLUMNS);
    const map = Array<string>(BRICK_ROWS).fill(empty);
    map[BRICK_ROWS - 2] = `${empty.slice(0, 20)}#${empty.slice(21)}`;
    map[BRICK_ROWS - 1] = `${empty.slice(0, 20)}#+${empty.slice(22)}`;
    const run = startBrickRun(map);
    const hit = brickRect(run, (BRICK_ROWS - 1) * BRICK_COLUMNS + 20);
    run.relaunch = 0;
    Object.assign(run.balls[0]!, { x: hit.x + hit.width + .5, y: hit.y + hit.height + BRICK_BALL_RADIUS + 1, vx: 0, vy: -run.speed });
    tickBrickRun(run, 32);
    expect(run.hits).toBe(1);
    expect(run.remaining).toBe(2);
    expect(run.tiles[(BRICK_ROWS - 2) * BRICK_COLUMNS + 20]).toBe(1);
    expect(run.tiles[(BRICK_ROWS - 1) * BRICK_COLUMNS + 21]).toBe(1);
  });

  it('keeps a custom tough brick until it takes its configured number of hits', () => {
    const map = ['........', '........', '........', '........', '......5.'];
    expect(BrickMapSchema.safeParse(map).success).toBe(true);
    const run = startBrickRun(map);
    const brick = brickRect(run, 38);
    run.relaunch = 0;
    for (let health = 4; health >= 0; health--) {
      Object.assign(run.balls[0]!, { x: brick.x + brick.width / 2, y: brick.y + brick.height + BRICK_BALL_RADIUS + 1, vx: 0, vy: -run.speed });
      tickBrickRun(run, 32);
      expect(run.tiles[38]).toBe(health);
      expect(run.remaining).toBe(health === 0 ? 0 : 1);
    }
  });

  it('adds a ball on impact and keeps playing when one of the pair is lost', () => {
    const map = ['#.......', '........', '........', '........', '......S.'];
    const run = startBrickRun(map);
    for (let tick = 0; tick < BRICK_HZ && !run.hits; tick++) tickBrickRun(run, 32);
    expect(run.remaining).toBe(1);
    expect(run.balls).toHaveLength(2);
    expect(run.balls[0]!.vx).toBe(-run.balls[1]!.vx);
    expect(run.balls.every(ball => ball.vy > 0)).toBe(true);
    run.balls[0]!.y = BRICK_HEIGHT + BRICK_BALL_RADIUS;
    tickBrickRun(run, 32);
    expect(run.balls).toHaveLength(1);
    expect(run.relaunch).toBe(0);
    expect(run.misses).toBe(0);
  });

  it('widens the paddle for eight seconds when its power-up brick breaks', () => {
    const map = ['#.......', '........', '........', '........', '......W.'];
    const run = startBrickRun(map);
    expect(brickPaddleWidth(run)).toBe(BRICK_PADDLE_WIDTH);
    for (let tick = 0; tick < BRICK_HZ && !run.hits; tick++) tickBrickRun(run, 32);
    expect(brickPaddleWidth(run)).toBeGreaterThan(BRICK_PADDLE_WIDTH);
    const impactTick = run.ticks;
    for (let tick = 0; tick < 8 * BRICK_HZ - 1; tick++) tickBrickRun(run, 0);
    expect(run.ticks - impactTick).toBe(8 * BRICK_HZ - 1);
    expect(brickPaddleWidth(run)).toBeGreaterThan(BRICK_PADDLE_WIDTH);
    tickBrickRun(run, 0);
    expect(brickPaddleWidth(run)).toBe(BRICK_PADDLE_WIDTH);
  });
});
