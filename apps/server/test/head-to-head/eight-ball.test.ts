import { BALL_RADIUS, HeadToHeadViewSchema, POOL_HEIGHT, POOL_WIDTH, PoolFrameSchema, rackPool, shootPool, type PoolFrame } from '@party/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { eightBall, finishPoolOnTime, settlePoolTie } from '../../src/head-to-head/eight-ball/rules.js';
import { matchView, playMove, startMatch } from '../../src/head-to-head/match.js';

const shot = (angle = 270, index = 1) => ({ game: 'eight-ball' as const, angle, power: 60, shot: index });
const straightPot = (ball: number): PoolFrame => [[0, 400, 100], [ball, 400, 40], [9, 600, 160]];
const shotAfterBreak = (frame: PoolFrame) => {
  const data = eightBall.start({});
  return { ...data, frames: [...data.frames, frame] };
};

describe('8-ball pool', () => {
  it('resolves the break on the server with bounded motion and the same board for players and spectators', () => {
    vi.useFakeTimers({ now: 2_000_000 });
    const initial = startMatch('eight-ball', undefined)!;
    expect(() => playMove(initial, 1, shot(0))).toThrow('Not your turn');
    const match = playMove(initial, 0, { game: 'eight-ball', angle: 0, power: 100, shot: 0 });
    const player = HeadToHeadViewSchema.parse(matchView(match, 0));
    const spectator = HeadToHeadViewSchema.parse(matchView(match, null));
    expect(player.board).toEqual(spectator.board);
    if (player.board.game !== 'eight-ball') throw new Error('Wrong board');
    expect(player.board.motion.length).toBeGreaterThan(2);
    expect(player.board.motion[0]).not.toEqual(player.board.balls);
    expect(player.board.impacts?.length).toBeGreaterThan(0);
    expect(player.board.solids).toBeNull();
    vi.useRealTimers();
  });

  it('leaves the table open on the break and on a scratch, then assigns a group on a legal pot', () => {
    const opening = eightBall.apply({ ...eightBall.start({}), frames: [straightPot(1)] }, 0, shot(270, 0));
    expect(opening.solids).toBeNull();
    expect(opening.pots).toEqual([0, 0]);
    expect(eightBall.board(opening, null).potsBySeat).toEqual([[1], []]);
    expect(eightBall.board(opening, null).balls.some(([id]) => id === 1)).toBe(false);

    const scratched = eightBall.apply(shotAfterBreak([[0, 360, 55], [1, 399, 24], [9, 600, 160]]), 0, shot(306));
    expect(scratched).toMatchObject({ solids: null, ballInHand: true, turn: 1, pots: [0, 0], scratches: [1, 0] });
    expect(eightBall.board(scratched, null).balls.some(([id]) => id === 1)).toBe(false);
    expect(() => eightBall.apply(scratched, 1, { ...shot(0, 2), cue: [201, 200] })).toThrow('cannot be placed');
    expect(() => eightBall.apply(scratched, 1, { ...shot(0, 2), cue: [150, 200] })).not.toThrow();

    const secured = eightBall.apply(shotAfterBreak(straightPot(1)), 0, shot());
    expect(secured.solids).toBe(0);
    expect(secured.pots).toEqual([1, 0]);
    expect(() => eightBall.apply(secured, 0, shot())).toThrow('already been played');
    expect(eightBall.board(secured, null).eightPocket).toBe(4);
  });

  it('mirrors the rack and confines cue placement to a custom right-side starting area', () => {
    const initial = eightBall.start({ start: { side: 'right', percent: 30 } });
    expect(eightBall.board(initial, null)).toMatchObject({ start: { side: 'right', percent: 30 },
      balls: expect.arrayContaining([[0, 560, 200], [1, 250, 200]]) });
    const missed = eightBall.apply(initial, 0, { game: 'eight-ball', angle: 0, power: 5, shot: 0 });
    expect(missed.ballInHand).toBe(true);
    expect(() => eightBall.apply(missed, 1, { ...shot(180), cue: [500, 150] })).toThrow('cannot be placed');
    expect(() => eightBall.apply(missed, 1, { ...shot(180), cue: [600, 150] })).not.toThrow();
  });

  it('carries the chosen felt to the board and replay, and leaves it out by default', () => {
    const blue = eightBall.start({ felt: 'blue' });
    expect(eightBall.board(blue, null)).toMatchObject({ felt: 'blue' });
    expect(eightBall.replay(blue)).toMatchObject({ felt: 'blue' });
    expect(eightBall.board(eightBall.start({}), null)).not.toHaveProperty('felt');
  });

  it('returns the eight to the table after the break and omits it from both pot trays', () => {
    const frame: PoolFrame = [[0, 400, 110], [1, 400, 75], [8, 400, 40], [9, 600, 160]];
    const opening = eightBall.apply({ ...eightBall.start({}), frames: [frame] }, 0, shot(270, 0));
    expect(opening.foul).toBe(false);
    expect(eightBall.outcome(opening)).toBeNull();
    const board = eightBall.board(opening, null);
    expect(board.motion.at(-1)?.some(([id]) => id === 8)).toBe(false);
    expect(board.balls.filter(([id]) => id === 8)).toEqual([[8, 550, 200]]);
    expect(board.potsBySeat).toEqual([[], []]);
    expect(eightBall.board({ ...opening, potsBySeat: [[8], []] }, null).potsBySeat).toEqual([[], []]);
  });

  it('keeps touch shots soft while a medium shot can roll most of the table', () => {
    const frame: PoolFrame = [[0, 100, 200]];
    expect(shootPool(frame, 0, 5).balls[0]![1]).toBeLessThan(150);
    expect(shootPool(frame, 0, 35).balls[0]![1]).toBeGreaterThan(650);
    const railShot = shootPool([[0, 740, 200]], 0, 60);
    expect(railShot.impacts.length).toBeGreaterThan(0);
    expect(railShot.impacts.every(impact => impact[2] === 'cushion')).toBe(true);
  });

  it('changes both roll distance and settling time with cloth choice, including custom resistance', () => {
    const frame: PoolFrame = [[0, 100, 200]];
    const realistic = shootPool(frame, 0, 25, { preset: 'realistic' });
    const custom = shootPool(frame, 0, 25, { preset: 'custom', rollingResistance: .025, railBounce: .86, stopSpeed: 11 });
    const arcade = shootPool(frame, 0, 25);
    const heavy = shootPool(frame, 0, 25, { preset: 'heavy' });
    for (const [long, short] of [[realistic, custom], [custom, arcade], [arcade, heavy]] as const) {
      expect(long.balls[0]![1]).toBeGreaterThan(short.balls[0]![1]);
      expect(long.motion.length).toBeGreaterThan(short.motion.length);
    }
  });

  it('applies follow and draw from the cue tip and changes rail rebounds with sidespin', () => {
    const frame: PoolFrame = [[0, 250, 200], [1, 325, 200]];
    const follow = shootPool(frame, 0, 38, undefined, [0, -100]);
    const draw = shootPool(frame, 0, 38, undefined, [0, 100]);
    expect(follow.firstHit).toBe(1);
    expect(draw.firstHit).toBe(1);
    expect(follow.balls.find(ball => ball[0] === 0)![1]).toBeGreaterThan(325);
    expect(draw.balls.find(ball => ball[0] === 0)![1]).toBeLessThan(250);
    expect(shootPool([[0, 100, 200]], 180, 40, undefined, [100, 0]).balls[0]![2]).toBeGreaterThan(225);
    expect(shootPool([[0, 100, 200]], 180, 40, undefined, [-100, 0]).balls[0]![2]).toBeLessThan(175);
  });

  it('lets a center-ball hit roll on after contact from a distance but stop short from close up', () => {
    const cueAfter = (from: number) => shootPool([[0, from, 200], [1, 400, 200]], 0, 38).balls.find(ball => ball[0] === 0)![1];
    expect(cueAfter(100)).toBeGreaterThan(390);
    expect(cueAfter(365)).toBeLessThan(385);
  });

  it('sends balls through pocket openings without letting any leave the table another way', () => {
    // Along the top cushion straight through the side-pocket opening.
    expect(shootPool([[0, 200, 12], [3, 700, 300]], 0, 60).pocketed[0]).toEqual({ id: 0, pocket: 1 });
    // Straight at a jaw tip: the ball comes back out instead of dropping.
    expect(shootPool([[0, 377, 200]], 270, 50).pocketed).toEqual([]);
    for (let angle = 0; angle < 360; angle += 7.25) {
      for (const power of [35, 70, 100]) {
        const shot = shootPool(rackPool(), angle, power);
        expect(PoolFrameSchema.safeParse(shot.balls).success).toBe(true);
        expect(shot.balls.length + shot.pocketed.length).toBe(16);
        for (const [, x, y] of shot.balls) {
          expect(x).toBeGreaterThanOrEqual(BALL_RADIUS - 1);
          expect(x).toBeLessThanOrEqual(POOL_WIDTH - BALL_RADIUS + 1);
          expect(y).toBeGreaterThanOrEqual(BALL_RADIUS - 1);
          expect(y).toBeLessThanOrEqual(POOL_HEIGHT - BALL_RADIUS + 1);
        }
      }
    }
  });

  it('hits harder on the break so a full-power break spreads the rack', () => {
    const rack = rackPool();
    const shot = shootPool(rack, 0, 100, undefined, undefined, true);
    const later = shootPool(rack, 0, 100);
    expect(Math.hypot(...[0, 1].map(axis => shot.motion[1]![0]![axis + 1]! - rack[0]![axis + 1]!)))
      .toBeGreaterThan(Math.hypot(...[0, 1].map(axis => later.motion[1]![0]![axis + 1]! - rack[0]![axis + 1]!)));
    const moved = rack.filter(([id, x, y]) => {
      const after = shot.balls.find(ball => ball[0] === id);
      return id !== 0 && (!after || Math.hypot(after[1] - x, after[2] - y) > 40);
    });
    expect(moved.length).toBeGreaterThanOrEqual(10);
  });

  describe('shot clock', () => {
    afterEach(() => { vi.useRealTimers(); });
    const timeout = (shot: number) => ({ game: 'eight-ball' as const, timeout: true as const, shot });

    it('runs 30 seconds by default, refuses an early claim and lets the other player break when the breaker runs out', () => {
      vi.useFakeTimers({ now: 1_000_000 });
      const data = eightBall.start({});
      expect(eightBall.board(data, null).shotClock).toEqual({ seconds: 30, leftMs: 30_000 });
      vi.setSystemTime(1_000_000 + 20_000);
      expect(() => eightBall.apply(data, 1, timeout(0))).toThrow('There is still time');
      vi.setSystemTime(1_000_000 + 30_000);
      const passed = eightBall.apply(data, 1, timeout(0));
      expect(eightBall.turn(passed)).toBe(1);
      expect(eightBall.board(passed, null)).toMatchObject({ shot: 0, ballInHand: false, shotTimedOut: true, shotClock: { leftMs: 30_000 } });
      // The same claim again is refused: the new shooter's clock has only just started.
      expect(() => eightBall.apply(passed, 0, timeout(0))).toThrow('There is still time');
    });

    it('gives ball in hand behind the line after a timeout later on, and restarts the clock after a shot once the balls settle', () => {
      vi.useFakeTimers({ now: 5_000_000 });
      const data = { ...shotAfterBreak(straightPot(1)), turnFrom: 5_000_000, shotSeconds: 15 };
      vi.setSystemTime(5_000_000 + 15_000);
      const fouled = eightBall.apply(data, 1, timeout(1));
      expect(eightBall.turn(fouled)).toBe(1);
      expect(eightBall.board(fouled, null)).toMatchObject({ shot: 2, foul: true, ballInHand: true, shotTimedOut: true });
      expect(eightBall.board(fouled, null).balls.find(([id]) => id === 0)![1]).toBeLessThanOrEqual(200);
      const played = eightBall.apply(fouled, 1, shot(270, 2));
      const clock = eightBall.board(played, null);
      expect(clock.shotClock!.leftMs).toBeGreaterThan(15_000);
      expect(clock).not.toHaveProperty('shotTimedOut');
    });

    it('has no clock and refuses timeout claims when switched off', () => {
      const data = eightBall.start({ shotSeconds: 0 });
      expect(eightBall.board(data, null)).not.toHaveProperty('shotClock');
      expect(() => eightBall.apply(data, 1, timeout(0))).toThrow('There is still time');
    });
  });

  it('uses pots at expiry and switches to scratches when both sides are on the eight', () => {
    const data = { ...shotAfterBreak(straightPot(1)), pots: [3, 2] as [number, number], scratches: [2, 1] as [number, number] };
    expect(eightBall.outcome(finishPoolOnTime(data))).toMatchObject({ kind: 'win', seat: 0 });
    const bothOnEight = { ...data, frames: [[[0, 200, 200], [8, 500, 200]]] as PoolFrame[] };
    expect(eightBall.outcome(finishPoolOnTime(bothOnEight))).toMatchObject({ kind: 'win', seat: 1 });
    const tied = finishPoolOnTime({ ...bothOnEight, scratches: [2, 2] });
    expect(eightBall.turn(tied)).toBeNull();
    expect(eightBall.outcome(tied)).toEqual({ kind: 'draw' });
    expect(eightBall.outcome(settlePoolTie(tied, 0))).toMatchObject({ kind: 'win', seat: 0 });
  });

  it('requires the opposite pocket and gives the opponent the win on an early 8 or a scratch with the 8', () => {
    const ready = { ...shotAfterBreak(straightPot(8)), solids: 0 as const, lastPocket: { solid: 4, stripe: null } };
    const finished = eightBall.apply({ ...ready, potsBySeat: [[], [8]] }, 0, shot());
    expect(eightBall.outcome(finished)).toMatchObject({ kind: 'win', seat: 0 });
    expect(eightBall.board(finished, null).potsBySeat).toEqual([[8], []]);
    expect(eightBall.board({ ...finished, potsBySeat: [[8], [8]] }, null).potsBySeat).toEqual([[8], []]);
    expect(eightBall.outcome(eightBall.apply({ ...ready, lastPocket: { solid: 3, stripe: null } }, 0, shot()))).toMatchObject({ kind: 'win', seat: 1 });
    const early = { ...ready, frames: [...ready.frames, [...straightPot(8), [1, 550, 100]] as PoolFrame] };
    expect(eightBall.outcome(eightBall.apply(early, 0, shot(270, 2)))).toMatchObject({ kind: 'win', seat: 1 });
    const scratched = { ...shotAfterBreak([[0, 360, 55], [8, 399, 24], [9, 600, 160]]), solids: 0 as const, lastPocket: { solid: 3, stripe: null } };
    expect(eightBall.outcome(eightBall.apply(scratched, 0, shot(306)))).toMatchObject({ kind: 'win', seat: 1 });
  });
});
