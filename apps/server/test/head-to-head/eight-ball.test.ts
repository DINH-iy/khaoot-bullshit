import { HeadToHeadViewSchema, type PoolFrame } from '@party/contracts';
import { describe, expect, it } from 'vitest';
import { eightBall } from '../../src/head-to-head/eight-ball/rules.js';
import { matchView, playMove, startMatch } from '../../src/head-to-head/match.js';

const shot = (angle = 270, index = 1) => ({ game: 'eight-ball' as const, angle, power: 60, shot: index });
const straightPot = (ball: number): PoolFrame => [[0, 400, 100], [ball, 400, 40], [9, 600, 160]];
const shotAfterBreak = (frame: PoolFrame) => {
  const data = eightBall.start({});
  return { ...data, frames: [...data.frames, frame] };
};

describe('8-ball pool', () => {
  it('resolves the break on the server with bounded motion and the same board for players and spectators', () => {
    const initial = startMatch('eight-ball', undefined)!;
    expect(() => playMove(initial, 1, shot(0))).toThrow('Not your turn');
    const match = playMove(initial, 0, { game: 'eight-ball', angle: 0, power: 100, shot: 0 });
    const player = HeadToHeadViewSchema.parse(matchView(match, 0));
    const spectator = HeadToHeadViewSchema.parse(matchView(match, null));
    expect(player.board).toEqual(spectator.board);
    if (player.board.game !== 'eight-ball') throw new Error('Wrong board');
    expect(player.board.motion.length).toBeGreaterThan(2);
    expect(player.board.motion[0]).not.toEqual(player.board.balls);
    expect(player.board.solids).toBeNull();
  });

  it('leaves the table open on the break and on a scratch, then assigns a group on a legal pot', () => {
    const opening = eightBall.apply({ ...eightBall.start({}), frames: [straightPot(1)] }, 0, shot(270, 0));
    expect(opening.solids).toBeNull();
    expect(eightBall.board(opening, null).balls.some(([id]) => id === 1)).toBe(false);

    const scratched = eightBall.apply(shotAfterBreak([[0, 360, 55], [1, 399, 24], [9, 600, 160]]), 0, shot(305));
    expect(scratched).toMatchObject({ solids: null, ballInHand: true, turn: 1 });
    expect(eightBall.board(scratched, null).balls.some(([id]) => id === 1)).toBe(false);
    expect(() => eightBall.apply(scratched, 1, { ...shot(0, 2), cue: [201, 200] })).toThrow('cannot be placed');
    expect(() => eightBall.apply(scratched, 1, { ...shot(0, 2), cue: [150, 200] })).not.toThrow();

    const secured = eightBall.apply(shotAfterBreak(straightPot(1)), 0, shot());
    expect(secured.solids).toBe(0);
    expect(() => eightBall.apply(secured, 0, shot())).toThrow('already been played');
    expect(eightBall.board(secured, null).eightPocket).toBe(4);
  });

  it('requires the opposite pocket and gives the opponent the win on an early 8 or a scratch with the 8', () => {
    const ready = { ...shotAfterBreak(straightPot(8)), solids: 0 as const, lastPocket: { solid: 4, stripe: null } };
    expect(eightBall.outcome(eightBall.apply(ready, 0, shot()))).toMatchObject({ kind: 'win', seat: 0 });
    expect(eightBall.outcome(eightBall.apply({ ...ready, lastPocket: { solid: 3, stripe: null } }, 0, shot()))).toMatchObject({ kind: 'win', seat: 1 });
    const early = { ...ready, frames: [...ready.frames, [...straightPot(8), [1, 550, 100]] as PoolFrame] };
    expect(eightBall.outcome(eightBall.apply(early, 0, shot(270, 2)))).toMatchObject({ kind: 'win', seat: 1 });
    const scratched = { ...shotAfterBreak([[0, 360, 55], [8, 399, 24], [9, 600, 160]]), solids: 0 as const, lastPocket: { solid: 3, stripe: null } };
    expect(eightBall.outcome(eightBall.apply(scratched, 0, shot(305)))).toMatchObject({ kind: 'win', seat: 1 });
  });
});
