import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { drawDuration, drawMoment, drawPath } from '../../src/room/minigame-draw.js';

describe('the minigame draw animation', () => {
  it('runs around the cards in order for a few laps and lands on the drawn game, the same on every screen', () => {
    fc.assert(fc.property(fc.uuid(), fc.integer({ min: 2, max: 8 }), fc.nat(), (seed, count, pick) => {
      const drawn = pick % count; const path = drawPath(seed, count, drawn);
      expect(path.at(-1)).toBe(drawn);
      expect(path.every((index, at) => at === 0 || index === (path[at - 1]! + 1) % count)).toBe(true);
      expect(path.length).toBeGreaterThan(2 * count);
      expect(drawPath(seed, count, drawn)).toEqual(path);
    }));
  });
  it('waits before a draw, slows down, lands on the drawn card, and shows the result at once to a late screen', () => {
    const path = drawPath('round', 4, 2);
    expect(drawMoment(null, path)).toEqual({ phase: 'waiting' });
    expect(drawMoment(0, path)).toEqual({ phase: 'cycle', lit: path[0] });
    expect(drawMoment(drawDuration(path) + 1, path)).toEqual({ phase: 'done' });
    const moments = Array.from({ length: 800 }, (_, step) => drawMoment(step * 10, path));
    const lit = moments.flatMap(moment => 'lit' in moment ? [moment.lit] : []);
    expect(lit.at(-1)).toBe(2);
    expect(moments.some(moment => moment.phase === 'landed')).toBe(true);
    // Slowing down: each card stays lit at least as long as the one before.
    const runs: number[] = []; lit.forEach((index, at) => { if (at === 0 || index !== lit[at - 1]) runs.push(1); else runs[runs.length - 1]!++; });
    const cycling = runs.slice(0, -1);
    expect(cycling.every((length, at) => at === 0 || length >= cycling[at - 1]! - 1)).toBe(true);
  });
});
