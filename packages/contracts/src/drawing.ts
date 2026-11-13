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

/**
 * How round a single stroke is, from 0 to 1000 (‰): it must go most of the
 * way round, close up, and keep an even distance from its centre. Used by the
 * Perfect circle minigame, computed on the server from the stroke itself.
 */
export function circleScore(points: readonly number[]): number {
  const count = Math.floor(points.length / 2); if (count < 12) return 0;
  let cx = 0; let cy = 0; for (let index = 0; index < count; index++) { cx += points[2 * index]!; cy += points[2 * index + 1]!; }
  cx /= count; cy /= count;
  const radii: number[] = []; let turned = 0; let previous: number | null = null;
  for (let index = 0; index < count; index++) {
    const dx = points[2 * index]! - cx; const dy = points[2 * index + 1]! - cy; radii.push(Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    if (previous !== null) { let step = angle - previous; if (step > Math.PI) step -= 2 * Math.PI; if (step < -Math.PI) step += 2 * Math.PI; turned += step; }
    previous = angle;
  }
  const mean = radii.reduce((sum, radius) => sum + radius, 0) / count; if (mean < 60) return 0;
  const deviation = Math.sqrt(radii.reduce((sum, radius) => sum + (radius - mean) ** 2, 0) / count) / mean;
  const coverage = Math.min(1, Math.abs(turned) / (2 * Math.PI));
  const gap = Math.hypot(points[0]! - points[2 * count - 2]!, points[1]! - points[2 * count - 1]!) / (2 * Math.PI * mean);
  const score = (1 - Math.min(1, deviation * 4)) * coverage ** 2 * (1 - Math.min(1, gap * 2));
  return Math.max(0, Math.min(1000, Math.round(score * 1000)));
}
