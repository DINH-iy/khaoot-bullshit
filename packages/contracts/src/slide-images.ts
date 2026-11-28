import { z } from 'zod';
import { GameKeySchema } from './game-key.js';

export const MAX_SLIDE_IMAGES = 12;
export const SlideImageSchema = z.object({
  key: GameKeySchema,
  id: z.uuid(),
  // The center, as percentages of the slide's width and height.
  x: z.number().finite().min(0).max(100),
  y: z.number().finite().min(0).max(100),
  width: z.number().finite().min(2).max(100),
  rotation: z.number().int().min(-180).max(180),
  alt: z.string().max(200).optional(),
}).strict();
export const SlideImagesSchema = z.array(SlideImageSchema).max(MAX_SLIDE_IMAGES)
  .refine(images => new Set(images.map(image => image.key)).size === images.length, 'Slide image keys must be unique.');
export type SlideImage = z.infer<typeof SlideImageSchema>;
