import { z } from 'zod';
import { chooseNumber, numberChoiceSchema } from '../shared/number-choice.js';
import { RevealEasingSchema } from '../shared/reveal-easing.js';

export const DOT_WIDTH = 800;
export const DOT_HEIGHT = 500;
export const DOT_RADIUS = 11;
export const DOT_VIEW_MIN_SECONDS = 1;
export const DOT_VIEW_MAX_SECONDS = 30;
export const MAX_DOT_GUESS = 999;
const MIN_DOTS = 12;
export const DOT_COUNT_MAX = 36;
export const DotSettingsSchema = z.strictObject({
  viewSeconds: z.number().int().min(DOT_VIEW_MIN_SECONDS).max(DOT_VIEW_MAX_SECONDS),
  count: numberChoiceSchema(1, DOT_COUNT_MAX).optional(),
  allowOverlap: z.boolean().optional(),
  revealEasing: RevealEasingSchema.optional(),
});
const CELL_SIZE = 100;
const COLUMNS = DOT_WIDTH / CELL_SIZE;
const CELLS = COLUMNS * DOT_HEIGHT / CELL_SIZE;

export const DotPatternSchema = z.array(z.tuple([
  z.number().int().min(DOT_RADIUS).max(DOT_WIDTH - DOT_RADIUS),
  z.number().int().min(DOT_RADIUS).max(DOT_HEIGHT - DOT_RADIUS),
])).min(1).max(DOT_COUNT_MAX);
export type DotPattern = z.infer<typeof DotPatternSchema>;
export const DotGuessSchema = z.number().int().min(0).max(MAX_DOT_GUESS);

/** Unique cells keep groups well apart. A paired cell can overlap by only two units. */
export function createDotPattern(random: (max: number) => number, settings: Pick<z.infer<typeof DotSettingsSchema>, 'count' | 'allowOverlap'> = {}): DotPattern {
  const count = settings.count ? chooseNumber(settings.count, random) : MIN_DOTS + random(DOT_COUNT_MAX - MIN_DOTS + 1);
  const cells = Array.from({ length: CELLS }, (_, index) => index);
  const dots: DotPattern = [];
  while (dots.length < count) {
    const cell = cells.splice(random(cells.length), 1)[0]!;
    const x = (cell % COLUMNS) * CELL_SIZE + 21 + random(59);
    const y = Math.floor(cell / COLUMNS) * CELL_SIZE + 21 + random(59);
    if (settings.allowOverlap && count - dots.length >= 2 && (dots.length === 0 || random(3) === 0)) {
      const horizontal = random(2) === 0;
      dots.push(horizontal ? [x - 10, y] : [x, y - 10], horizontal ? [x + 10, y] : [x, y + 10]);
    } else {
      dots.push([x, y]);
    }
  }
  return dots;
}
