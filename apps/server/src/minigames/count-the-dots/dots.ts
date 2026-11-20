import { DotPatternSchema } from '@party/contracts';
import { z } from 'zod';

export const DotRunSchema = z.object({
  pattern: DotPatternSchema,
  guessAt: z.string().datetime(),
  pausedAt: z.string().datetime().optional(),
}).strict();

type DotRun = z.infer<typeof DotRunSchema>;

/** Resuming or reopening keeps the same pattern and its remaining viewing time. */
export function shiftDotWindow(startsAt: string, dots: DotRun, stoppedAt: number, now: Date) {
  const shift = Math.max(0, now.getTime() - stoppedAt);
  const move = (time: string) => new Date(Date.parse(time) + shift).toISOString();
  return {
    startsAt: move(startsAt),
    dots: { pattern: dots.pattern, guessAt: move(dots.guessAt) },
  };
}
