import { z } from 'zod';

export const DOT_WIDTH = 800;
export const DOT_HEIGHT = 500;
export const DOT_RADIUS = 11;
export const DOT_VIEW_MIN_SECONDS = 1;
export const DOT_VIEW_MAX_SECONDS = 30;
export const MAX_DOT_GUESS = 999;
const MIN_DOTS = 12;
const MAX_DOTS = 36;
const CELL_SIZE = 100;
const COLUMNS = DOT_WIDTH / CELL_SIZE;
const CELLS = COLUMNS * DOT_HEIGHT / CELL_SIZE;

export const DotPatternSchema = z.array(z.tuple([
  z.number().int().min(DOT_RADIUS).max(DOT_WIDTH - DOT_RADIUS),
  z.number().int().min(DOT_RADIUS).max(DOT_HEIGHT - DOT_RADIUS),
])).min(MIN_DOTS).max(MAX_DOTS);
export type DotPattern = z.infer<typeof DotPatternSchema>;
export const DotGuessSchema = z.number().int().min(0).max(MAX_DOT_GUESS);

/** Jitter unique cells; even neighboring centers stay at least 40 units apart. */
export function createDotPattern(random: (max: number) => number): DotPattern {
  const count = MIN_DOTS + random(MAX_DOTS - MIN_DOTS + 1);
  const cells = Array.from({ length: CELLS }, (_, index) => index);
  return Array.from({ length: count }, () => {
    const cell = cells.splice(random(cells.length), 1)[0]!;
    return [(cell % COLUMNS) * CELL_SIZE + 20 + random(61), Math.floor(cell / COLUMNS) * CELL_SIZE + 20 + random(61)];
  });
}
