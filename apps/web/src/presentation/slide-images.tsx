import type { CSSProperties, ReactNode } from 'react';
import { sceneMediaUrl, type SlideImage } from '@party/contracts';
import './slide-images.css';

export function slideImageStyle(image: SlideImage): CSSProperties {
  return { left: `${image.x}%`, top: `${image.y}%`, width: `${image.width}%` };
}

export function SlidePicture({ image }: { image: SlideImage }) {
  return <img className="slide-picture" src={sceneMediaUrl(image.id)} alt={image.alt ?? ''} draggable={false} />;
}

export function SlideImages({ images, renderImage }: {
  images: readonly SlideImage[] | undefined; renderImage?: (image: SlideImage, index: number) => ReactNode;
}) {
  if (!images?.length) return null;
  return <div className="scene-slide-images" data-editable={Boolean(renderImage) || undefined}>
    {images.map((image, index) => renderImage ? renderImage(image, index) :
      <div key={image.key} className="scene-slide-image" style={slideImageStyle(image)}>
        <div style={{ rotate: `${image.rotation}deg` }}><SlidePicture image={image} /></div>
      </div>)}
  </div>;
}
