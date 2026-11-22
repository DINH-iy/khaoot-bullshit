import { useLayoutEffect, useRef, useState } from 'react';
import { BALL_RADIUS, POOL_POCKETS, POOL_STEPS_PER_FRAME, type HeadToHeadView, type PoolFrame, type PoolImpact } from '@party/contracts';
import { playPoolImpact } from './impact-sound.js';
import { poolPocketCenter, type BallRotation } from './table.js';

type PoolView = Extract<HeadToHeadView['board'], { game: 'eight-ball' }>;
export type PredictedPoolShot = { shot: number; motion: PoolFrame[]; impacts: PoolImpact[]; start: number };
type Roll = { shot: number; balls: PoolFrame; sinking?: Map<number, number> };
const FRAME_MS = 1000 / 15;
const POCKET_DROP_MS = 175;

function pocketDrops(motion: PoolFrame[], frameMs: number) {
  const final = new Set(motion.at(-1)!.map(([id]) => id));
  return motion[0]!.filter(([id]) => !final.has(id)).map(([id]) => {
    const missing = motion.findIndex(frame => !frame.some(([ball]) => ball === id));
    const [, x, y] = motion[missing - 1]!.find(([ball]) => ball === id)!;
    let nearest = 0;
    for (const [pocket, [px, py]] of POOL_POCKETS.entries()) {
      const [nx, ny] = POOL_POCKETS[nearest]!;
      if (Math.hypot(px - x, py - y) < Math.hypot(nx - x, ny - y)) nearest = pocket;
    }
    return { id, x, y, center: poolPocketCenter(nearest), start: (missing - .35) * frameMs };
  });
}

export function usePoolPlayback(board: PoolView, prediction: PredictedPoolShot | undefined) {
  const rotations = useRef(new Map<number, BallRotation>());
  const observed = useRef(board.shot);
  const playback = useRef<{ shot: number; start: number; heardThrough: number; previous: Map<number, PoolFrame[number]> }>(undefined);
  const [roll, setRoll] = useState<Roll>();
  const [shownPots, setShownPots] = useState(board.potsBySeat);

  useLayoutEffect(() => {
    const incoming = observed.current !== board.shot;
    observed.current = board.shot;
    const local = prediction?.shot === board.shot + 1 ? prediction : undefined;
    if (!incoming && !local) {
      if (playback.current && playback.current.shot !== board.shot) {
        playback.current = undefined;
        setRoll(undefined);
      }
      return;
    }

    const shot = local?.shot ?? board.shot;
    const motion = local?.motion ?? board.motion;
    const impacts = local?.impacts ?? board.impacts ?? [];
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || motion.length < 2) {
      const strongest = impacts.reduce<PoolImpact | undefined>((best, impact) => !best || impact[1] > best[1] ? impact : best, undefined);
      if (incoming && strongest) playPoolImpact(strongest[2] ?? 'ball', strongest[1]);
      setShownPots(board.potsBySeat);
      setRoll(undefined);
      return;
    }

    const continuing = playback.current?.shot === shot;
    const track = continuing ? playback.current! : {
      shot, start: local?.start ?? performance.now(), heardThrough: 0,
      previous: new Map(motion[0]!.map(ball => [ball[0], ball])),
    };
    playback.current = track;
    const frameMs = Math.min(FRAME_MS, 4600 / (motion.length - 1));
    const drops = pocketDrops(motion, frameMs);

    const rotateBalls = (next: PoolFrame) => {
      for (const ball of next) {
        const [id, x, y] = ball;
        const before = track.previous.get(id);
        if (!before) continue;
        const dx = x - before[1], dy = y - before[2];
        const distance = Math.hypot(dx, dy);
        if (distance < .04) continue;
        const old = rotations.current.get(id);
        rotations.current.set(id, { phase: ((old?.phase ?? 0) + distance / BALL_RADIUS) % (Math.PI * 2), direction: Math.atan2(dy, dx) });
      }
      track.previous = new Map(next.map(ball => [ball[0], ball]));
    };
    let frame: number;
    const advance = (time: number) => {
      if (time < track.start) { frame = requestAnimationFrame(advance); return; }
      const elapsed = time - track.start;
      const position = elapsed / frameMs;
      const step = position * POOL_STEPS_PER_FRAME;
      const loudest = { ball: 0, cushion: 0 };
      for (const [at, strength, kind = 'ball'] of impacts) {
        if (at > track.heardThrough && at <= step && (step - at) * frameMs / POOL_STEPS_PER_FRAME < 100) loudest[kind] = Math.max(loudest[kind], strength);
      }
      track.heardThrough = Math.max(track.heardThrough, step);
      if (loudest.ball) playPoolImpact('ball', loudest.ball);
      if (loudest.cushion) playPoolImpact('cushion', loudest.cushion);

      const index = Math.floor(position);
      const next = motion[index + 1];
      const sinking = new Map<number, number>();
      const pocketBalls: PoolFrame = [];
      for (const { id, x, y, center: [px, py], start } of drops) {
        const progress = (elapsed - start) / POCKET_DROP_MS;
        if (progress < 0 || progress >= 1) continue;
        const travel = 1 - (1 - progress) ** 2;
        sinking.set(id, 1 - progress ** 1.55);
        pocketBalls.push([id, x + (px - x) * travel, y + (py - y) * travel]);
      }
      if (!next && !pocketBalls.length) {
        const last = motion.at(-1)!;
        rotateBalls(last);
        if (local) setRoll({ shot, balls: last });
        else {
          setShownPots(board.potsBySeat);
          setRoll(undefined);
        }
        return;
      }
      const fraction = position - index;
      const to = new Map(next?.map(ball => [ball[0], ball]));
      const picture: PoolFrame = (motion[index] ?? motion.at(-1)!).filter(([id]) => !sinking.has(id)).map(([id, x, y]) => {
        const ball = to.get(id);
        if (ball) return [id, x + (ball[1] - x) * fraction, y + (ball[2] - y) * fraction];
        return [id, x, y];
      });
      picture.push(...pocketBalls);
      rotateBalls(picture);
      setRoll({ shot, balls: picture, sinking });
      frame = requestAnimationFrame(advance);
    };
    if (!continuing) setRoll({ shot, balls: motion[0]! });
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  // Motion and impact events belong to the shot number and can be replayed from its original start time.
  }, [board.shot, prediction]);

  return { roll, rotations, shownPots };
}
