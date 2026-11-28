import { SlideImagesSchema, type SlideImage } from '@party/contracts';
import type { Stage } from '../model.js';

export const sceneSlideImages = (stage: Stage) => SlideImagesSchema.safeParse(stage['slideImages']).data ?? [];

export function setSlideImages(stage: Stage, images: SlideImage[]): Stage {
  const next = { ...stage };
  if (images.length) next['slideImages'] = images;
  else delete next['slideImages'];
  return next;
}

export function updateSlideImage(stage: Stage, key: string, patch: Partial<SlideImage>) {
  return setSlideImages(stage, sceneSlideImages(stage).map(image => image.key === key ? { ...image, ...patch } : image));
}
