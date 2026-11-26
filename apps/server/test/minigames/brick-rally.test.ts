import { describe, expect, it } from 'vitest';
import { BRICK_COLUMNS, BRICK_MAPS, BRICK_ROWS, BrickMapSchema, startBrickRun, tickBrickRun } from '@party/contracts';

describe('Brick Rally maps', () => {
  it('provides three distinct dense playable layouts', () => {
    const presets = Object.values(BRICK_MAPS);
    expect(new Set(presets.map(map => map.join())).size).toBe(presets.length);
    for (const map of presets) {
      expect(BrickMapSchema.safeParse(map).success).toBe(true);
      expect(map).toHaveLength(BRICK_ROWS);
      expect(map.every(line => line.length === BRICK_COLUMNS)).toBe(true);
      expect(startBrickRun(map).remaining).toBeGreaterThan(450);
    }
  });

  it('clears nearby tiles on impact while tough bricks take another hit', () => {
    const empty = '.'.repeat(BRICK_COLUMNS);
    const map = Array<string>(BRICK_ROWS).fill(empty);
    map[BRICK_ROWS - 2] = `${empty.slice(0, 20)}#${empty.slice(21)}`;
    map[BRICK_ROWS - 1] = `${empty.slice(0, 20)}#+${empty.slice(22)}`;
    const run = startBrickRun(map);
    for (let tick = 0; tick < 60 && run.hits === 0; tick++) tickBrickRun(run, 32);
    expect(run.hits).toBe(1);
    expect(run.remaining).toBe(1);
    expect(run.tiles[(BRICK_ROWS - 1) * BRICK_COLUMNS + 21]).toBe(1);
  });
});
