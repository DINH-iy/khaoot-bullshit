import type { ReactNode } from 'react';
import { sceneMediaUrl, type SlideImage } from '@party/contracts';
import { slideObjectStyle } from './slide-object.js';

export function SlidePicture({ image }: { image: SlideImage }) {
  return <img className="slide-picture" src={sceneMediaUrl(image.id)} alt={image.alt ?? ''} draggable={false} />;
}

export function SlideImages({ images, renderImage }: {
  images: readonly SlideImage[] | undefined; renderImage?: (image: SlideImage, index: number) => ReactNode;
}) {
  if (!images?.length) return null;
  return <div className="scene-slide-layer scene-slide-images" data-editable={Boolean(renderImage) || undefined}>
    {images.map((image, index) => renderImage ? renderImage(image, index) :
      <div key={image.key} className="scene-slide-image" style={slideObjectStyle(image)}>
        <div style={{ rotate: `${image.rotation}deg` }}><SlidePicture image={image} /></div>
      </div>)}
  </div>;
}
