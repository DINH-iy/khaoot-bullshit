import { z } from 'zod';
import { chooseNumber, numberChoiceSchema } from '../shared/number-choice.js';
import { RevealEasingSchema } from '../shared/reveal-easing.js';

export const DOT_WIDTH = 800;
export const DOT_HEIGHT = 500;
export const DOT_RADIUS = 11;
export const DOT_VIEW_MIN_SECONDS = 1;
export const DOT_VIEW_MAX_SECONDS = 30;
export const MAX_DOT_GUESS = 999;
export const DOT_RANDOM_MIN = 50;
export const DOT_COUNT_MAX = 500;
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

function densePattern(count: number, random: (max: number) => number, allowOverlap?: boolean): DotPattern {
  // Extra cells leave irregular gaps even at 500 dots. At the cap, cells are 25 × 25.
  const slots = Math.ceil(count * 1.25);
  const columns = Math.ceil(Math.sqrt(slots * DOT_WIDTH / DOT_HEIGHT));
  const rows = Math.ceil(slots / columns);
  const width = DOT_WIDTH / columns;
  const height = DOT_HEIGHT / rows;
  const cells = Array.from({ length: columns * rows }, (_, index) => index);
  const dots: DotPattern = [];
  const coordinate = (index: number, size: number) => {
    const low = Math.ceil(index * size + DOT_RADIUS);
    const high = Math.floor((index + 1) * size - DOT_RADIUS);
    return low + random(high - low + 1);
  };
  while (dots.length < count) {
    const cell = cells.splice(random(cells.length), 1)[0]!;
    const col = cell % columns;
    const y = coordinate(Math.floor(cell / columns), height);
    // A pair shares a boundary between two reserved cells and overlaps by only two units.
    const neighbor = col === columns - 1 ? cell - 1 : cell + 1;
    const pair = allowOverlap && count - dots.length >= 2 && (dots.length === 0 || random(3) === 0)
      ? cells.indexOf(neighbor) : -1;
    if (pair >= 0) {
      cells.splice(pair, 1);
      const x = Math.round(Math.max(col, neighbor % columns) * width);
      dots.push([x - DOT_RADIUS + 1, y], [x + DOT_RADIUS - 1, y]);
    } else dots.push([coordinate(col, width), y]);
  }
  return dots;
}

/** Unique cells keep groups well apart. A paired cell can overlap by only two units. */
export function createDotPattern(random: (max: number) => number, settings: Pick<z.infer<typeof DotSettingsSchema>, 'count' | 'allowOverlap'> = {}): DotPattern {
  const count = settings.count ? chooseNumber(settings.count, random) : DOT_RANDOM_MIN + random(DOT_COUNT_MAX - DOT_RANDOM_MIN + 1);
  if (count > CELLS) return densePattern(count, random, settings.allowOverlap);
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
