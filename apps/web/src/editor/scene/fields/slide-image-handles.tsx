import { useRef, useState } from 'react';
import type { SlideImage } from '@party/contracts';
import { useTexts } from '../../../i18n/texts.js';
import { slideObjectStyle, slidePercent } from '../../../presentation/slide-object.js';
import { SlidePicture } from '../../../presentation/slide-images.js';
import { CanvasObjectHandle, normalizeRotation, rotationGesture, type CanvasAction, type CanvasPoint } from './canvas-object-handle.js';
import { SLIDE_IMAGE_TEXTS } from './slide-images.text.js';



export function SlideImageHandles({ image, index, selected, select, change }: {
  image: SlideImage; index: number; selected: boolean; select: () => void; change: (patch: Partial<SlideImage>) => void;
}) {
  const t = useTexts(SLIDE_IMAGE_TEXTS);
  const frame = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<Partial<SlideImage>>();
  const current = { ...image, ...preview };
  const start = (action: CanvasAction, origin: CanvasPoint) => {
    const element = frame.current;
    const layer = element?.closest('.scene-slide-images');
    if (!element || !layer) return;
    if (action === 'rotate') return rotationGesture(element, origin, image.rotation,
      rotation => setPreview(rotation === undefined ? undefined : { rotation }), rotation => change({ rotation }));

    const bounds = layer.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const angle = image.rotation * Math.PI / 180;
    const ratio = element.offsetHeight / Math.max(1, element.offsetWidth);
    const next = (point: CanvasPoint) => {
      const dx = point.x - origin.x;
      const dy = point.y - origin.y;
      if (action === 'move') return { x: slidePercent(image.x + dx * 100 / bounds.width), y: slidePercent(image.y + dy * 100 / bounds.height) };
      // Resize proportionally from the center, along the picture's rotated diagonal.
      const localX = dx * Math.cos(angle) + dy * Math.sin(angle);
      const localY = -dx * Math.sin(angle) + dy * Math.cos(angle);
      return { width: slidePercent(image.width + 200 * (localX + ratio * localY) / ((1 + ratio * ratio) * bounds.width), 2) };
    };
    return {
      update: (point: CanvasPoint) => setPreview(next(point)),
      commit: (point: CanvasPoint) => { setPreview(undefined); change(next(point)); },
      cancel: () => setPreview(undefined),
    };
  };
  const arrow = (action: CanvasAction, x: number, y: number, shift: boolean) => {
    const step = shift ? 5 : 1;
    if (action === 'move') change({ x: slidePercent(image.x + x * step), y: slidePercent(image.y + y * step) });
    else if (action === 'resize') change({ width: slidePercent(image.width + (x || y) * step, 2) });
    else change({ rotation: normalizeRotation(image.rotation + (x || y) * (shift ? 15 : 1)) });
  };
  const name = t('picture', { number: index + 1 });
  return <div className="scene-slide-image" style={slideObjectStyle(current)}>
    <div ref={frame} className="canvas-box-frame free-picture-frame" data-selected={selected || undefined} style={{ rotate: `${current.rotation}deg` }}>
      <SlidePicture image={image} />
      {(['move', 'resize', 'rotate'] as const).map(action =>
        <CanvasObjectHandle key={action} action={action} surface={action === 'move'} label={t(action, { picture: name })}
          description={t('keys')} select={select} start={point => start(action, point)} arrow={(x, y, shift) => arrow(action, x, y, shift)} />)}
    </div>
  </div>;
}
