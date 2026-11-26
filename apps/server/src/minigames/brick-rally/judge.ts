import { BRICK_CONTROLS, BrickTraceSchema, brickElapsed, brickMap, startBrickRun, tickBrickRun, type BrickSettings } from '@party/contracts';
import { requireGame } from '../../game/errors.js';
import type { ResultJudge } from '../shared/judging.js';

export function verifiedBrickClear(map: readonly string[], input: unknown, elapsedWallMs: number): number | null {
  const trace = BrickTraceSchema.safeParse(input);
  if (!trace.success) return null;
  const elapsed = brickElapsed(trace.data.length);
  if (elapsedWallMs < 0 || elapsed > elapsedWallMs + 100) return null;
  const run = startBrickRun(map);
  for (const control of trace.data) {
    if (run.remaining === 0) return null;
    tickBrickRun(run, BRICK_CONTROLS.indexOf(control));
  }
  return run.remaining === 0 && run.ticks === trace.data.length ? elapsed : null;
}

export const brickRally: ResultJudge = ({ settings, value, at, started }) => {
  const elapsed = verifiedBrickClear(brickMap(settings as BrickSettings), value.brickTrace, at - started);
  requireGame(elapsed !== null, 'INVALID_SUBMISSION');
  return { value: elapsed };
};
