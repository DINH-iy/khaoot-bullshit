import { z } from 'zod';

/**
 * A drawing is a list of strokes, never an image: small, checkable, crisp on
 * every screen, possible to replay stroke by stroke, and possible to add to
 * (relay drawings, finishing someone's doodle). Coordinates are whole numbers
 * on a 1000 × 1000 square; colours come from a fixed palette.
 */
export const DRAWING_SIZE = 1000;
export const DRAWING_COLORS = ['#1d1b2e', '#ffffff', '#8a8a99', '#e8505b', '#f28c28', '#f2c230', '#7bc950', '#2bb3a3', '#36a2eb', '#4f6ae0', '#8e5be8', '#f07aa8', '#8d6e63', '#f2c79b', '#0b6e4f', '#7a1f3d'] as const;
export const DRAWING_WIDTHS = [4, 10, 22, 44] as const;
export const MAX_DRAWING_POINTS = 6000;
export const MAX_DRAWING_BYTES = 96 * 1024;

const Coordinate = z.number().int().min(0).max(DRAWING_SIZE);
/** `c`: palette colour, `w`: width, `p`: x1, y1, x2, y2… (a dot is one point). */
export const StrokeSchema = z.object({ c: z.number().int().min(0).max(DRAWING_COLORS.length - 1), w: z.number().int().min(1).max(60), p: z.array(Coordinate).min(2).max(2 * 1000) }).strict()
  .refine(stroke => stroke.p.length % 2 === 0, 'A stroke needs pairs of coordinates');
export type Stroke = z.infer<typeof StrokeSchema>;
export const DrawingSchema = z.object({ v: z.literal(1), strokes: z.array(StrokeSchema).max(600) }).strict()
  .refine(drawing => drawing.strokes.reduce((sum, stroke) => sum + stroke.p.length / 2, 0) <= MAX_DRAWING_POINTS, 'The drawing has too many points');
export type Drawing = z.infer<typeof DrawingSchema>;
export const emptyDrawing = (): Drawing => ({ v: 1, strokes: [] });

/** A stroke as an SVG path (for every screen). Coordinates are whole numbers, so the path is plain data. */
export function strokePath(stroke: Stroke): string {
  const p = stroke.p; let path = `M${p[0]} ${p[1]}`;
  if (p.length === 2) return `${path}l0.1 0`;
  for (let index = 2; index < p.length; index += 2) path += `L${p[index]} ${p[index + 1]}`;
  return path;
}

/** Samples the drawn line at equal distances so drawing speed does not shift the estimated centre. */
function sampleStroke(points: readonly number[]): { x: number; y: number }[] {
  const count = Math.floor(points.length / 2);
  if (count < 2) return [];
  const distances = [0];
  for (let index = 1; index < count; index++) {
    const at = 2 * index;
    distances.push(distances[index - 1]! + Math.hypot(points[at]! - points[at - 2]!, points[at + 1]! - points[at - 1]!));
  }
  const total = distances[count - 1]!;
  if (total === 0) return [];
  const samples = 64;
  let end = 1;
  return Array.from({ length: samples }, (_, index) => {
    const distance = total * index / (samples - 1);
    while (end < count - 1 && distances[end]! <= distance) end++;
    const start = distances[end - 1]!;
    const span = distances[end]! - start;
    const fraction = span ? (distance - start) / span : 1;
    const at = 2 * end;
    return { x: points[at - 2]! + fraction * (points[at]! - points[at - 2]!),
      y: points[at - 1]! + fraction * (points[at + 1]! - points[at - 1]!) };
  });
}

/**
 * How round a single stroke is, from 0 to 1000 (‰): it must go most of the
 * way round, close up, and keep an even distance from its centre. Used by the
 * Perfect circle minigame, computed on the server from the stroke itself.
 */
export function circleScore(points: readonly number[]): number {
  const samples = sampleStroke(points);
  const count = samples.length; if (!count) return 0;
  const cx = samples.reduce((sum, point) => sum + point.x, 0) / count;
  const cy = samples.reduce((sum, point) => sum + point.y, 0) / count;
  const radii: number[] = []; let turned = 0; let previous: number | null = null;
  for (const { x, y } of samples) {
    const dx = x - cx; const dy = y - cy; radii.push(Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    if (previous !== null) { let step = angle - previous; if (step > Math.PI) step -= 2 * Math.PI; if (step < -Math.PI) step += 2 * Math.PI; turned += step; }
    previous = angle;
  }
  const mean = radii.reduce((sum, radius) => sum + radius, 0) / count; if (mean < 60) return 0;
  const deviation = Math.sqrt(radii.reduce((sum, radius) => sum + (radius - mean) ** 2, 0) / count) / mean;
  const coverage = Math.min(1, Math.abs(turned) / (2 * Math.PI));
  const first = samples[0]!; const last = samples[count - 1]!;
  const gap = Math.hypot(first.x - last.x, first.y - last.y) / (2 * Math.PI * mean);
  const score = (1 - Math.min(1, deviation * 4)) * coverage ** 2 * (1 - Math.min(1, gap * 2));
  return Math.max(0, Math.min(1000, Math.round(score * 1000)));
}
