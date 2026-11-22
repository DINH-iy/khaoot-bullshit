import { useLayoutEffect, useRef, useState } from 'react';
import { BALL_RADIUS, POOL_POCKETS, POOL_STEPS_PER_FRAME, type HeadToHeadView, type PoolFrame, type PoolImpact } from '@party/contracts';
import { playPoolImpact } from './impact-sound.js';
import { poolPocketCenter, type BallRotation } from './table.js';

type PoolView = Extract<HeadToHeadView['board'], { game: 'eight-ball' }>;
export type PredictedPoolShot = { shot: number; motion: PoolFrame[]; impacts: PoolImpact[]; start: number };
type Roll = { shot: number; balls: PoolFrame; sinking?: Map<number, number> };
const FRAME_MS = 1000 / 15;

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
      if (incoming && impacts.length) playPoolImpact(Math.max(...impacts.map(([, strength]) => strength)));
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
      const position = (time - track.start) / frameMs;
      const step = position * POOL_STEPS_PER_FRAME;
      let loudest = 0;
      for (const [at, strength] of impacts) {
        if (at > track.heardThrough && at <= step && (step - at) * frameMs / POOL_STEPS_PER_FRAME < 100) loudest = Math.max(loudest, strength);
      }
      track.heardThrough = Math.max(track.heardThrough, step);
      if (loudest) playPoolImpact(loudest);

      const index = Math.floor(position);
      const next = motion[index + 1];
      if (!next) {
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
      const to = new Map(next.map(ball => [ball[0], ball]));
      const sinking = new Map<number, number>();
      const picture: PoolFrame = motion[index]!.map(([id, x, y]) => {
        const ball = to.get(id);
        if (ball) return [id, x + (ball[1] - x) * fraction, y + (ball[2] - y) * fraction];
        let nearest = 0;
        for (const [pocket, [px, py]] of POOL_POCKETS.entries()) {
          const [nx, ny] = POOL_POCKETS[nearest]!;
          if (Math.hypot(px - x, py - y) < Math.hypot(nx - x, ny - y)) nearest = pocket;
        }
        const [px, py] = poolPocketCenter(nearest);
        sinking.set(id, 1 - fraction);
        return [id, x + (px - x) * fraction, y + (py - y) * fraction];
      });
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
