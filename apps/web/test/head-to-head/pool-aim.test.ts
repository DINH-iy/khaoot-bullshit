import { describe, expect, it } from 'vitest';
import { isLegalPoolContact, poolLegalTarget, type PoolFrame } from '@party/contracts';
import { isPoolCueShaftAt, poolAimPath, poolObjectPath } from '../../src/head-to-head/eight-ball/aim.js';

describe('8-ball aim assist', () => {
  it('grabs the full cue shaft at the drawn angle without grabbing the aim line', () => {
    const cue = [0, 200, 200] as const;
    expect(isPoolCueShaftAt([...cue], 0, 75, 101, 208, 12)).toBe(true);
    expect(isPoolCueShaftAt([...cue], 90, 75, 208, 101, 12)).toBe(true);
    expect(isPoolCueShaftAt([...cue], 0, 75, 300, 200, 12)).toBe(false);
    expect(isPoolCueShaftAt([...cue], 0, 75, 100, 234, 12)).toBe(false);
  });

  it('uses the first contact angle and stops the projected object ball at the next ball', () => {
    const balls: PoolFrame = [[0, 120, 120], [3, 200, 132], [4, 240, 162], [12, 550, 350]];
    const shot = poolAimPath(balls[0]!, 1, 0, balls);
    expect(shot.hit?.[0]).toBe(3);
    expect(shot.distance).toBe(64);
    const path = poolObjectPath(shot.hit!, 120 + shot.distance, 120, balls)!;
    expect(path).toEqual({ dx: .8, dy: .6, distance: 30 });
  });

  it('marks the group in play and switches to the 8 even when the other group has balls left', () => {
    const balls: PoolFrame = [[0, 120, 120], [8, 250, 150], [12, 550, 350]];
    const open = poolLegalTarget(balls, null, false);
    expect(balls.filter(([id]) => isLegalPoolContact(open, id)).map(([id]) => id)).toEqual([12]);
    const eight = poolLegalTarget(balls, 'solid', false);
    expect(balls.filter(([id]) => isLegalPoolContact(eight, id)).map(([id]) => id)).toEqual([8]);
  });
});
