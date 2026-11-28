import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { MediaLayout } from '@party/contracts';
import { useTexts } from '../../../i18n/texts.js';
import { SCENE_PRESENTATION_TEXTS } from '../scene-presentation.text.js';
import { CanvasObjectHandle, normalizeRotation, rotationGesture, type CanvasAction, type CanvasPoint } from './canvas-object-handle.js';

const widthPercent = (value: number) => Math.min(80, Math.max(10, Math.round(value)));

export function ImageHandles({ layout, onChange, children }: {
  layout: MediaLayout; onChange: (patch: Partial<MediaLayout>) => void; children: ReactNode;
}) {
  const t = useTexts(SCENE_PRESENTATION_TEXTS);
  const frame = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(false);
  const [angle, setAngle] = useState<number>();
  const [preview, setPreview] = useState<{ left: number; top: number; width: number; height: number }>();
  const rotation = layout.imageRotation ?? 0;
  const select = () => setSelected(true);
  const start = (action: CanvasAction, origin: CanvasPoint) => {
    const image = frame.current;
    const composition = image?.closest('.scene-composition');
    const copy = composition?.querySelector('.composition-copy');
    const picture = image?.querySelector<HTMLElement>('.stage-media.image');
    if (!image || !composition || !copy || !picture) return;
    if (action === 'rotate') return rotationGesture(image, origin, rotation, setAngle, imageRotation => onChange({ imageRotation }));

    const bounds = image.getBoundingClientRect();
    const composed = composition.getBoundingClientRect();
    const text = copy.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = picture;
    if (!width || !composed.width) return;
    const center = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    const radians = rotation * Math.PI / 180;
    const delta = (point: CanvasPoint) => ({ x: point.x - origin.x, y: point.y - origin.y });
    const resize = (point: CanvasPoint) => {
      const { x, y } = delta(point);
      const horizontal = x * Math.cos(radians) + y * Math.sin(radians);
      const vertical = -x * Math.sin(radians) + y * Math.cos(radians);
      const ratio = height / width;
      return widthPercent(100 * (width + (horizontal + ratio * vertical) / (1 + ratio * ratio)) / composed.width);
    };
    const cancel = () => setPreview(undefined);
    return {
      cancel,
      update: (point: CanvasPoint) => {
        const { x, y } = delta(point);
        const nextWidth = action === 'resize' ? resize(point) * composed.width / 100 : width;
        const nextHeight = nextWidth * height / width;
        setPreview({ left: center.x - nextWidth / 2 + (action === 'move' ? x : 0),
          top: center.y - nextHeight / 2 + (action === 'move' ? y : 0), width: nextWidth, height: nextHeight });
      },
      commit: (point: CanvasPoint) => {
        cancel();
        if (action === 'resize') { onChange({ imageWidth: resize(point) }); return; }
        const { x, y } = delta(point);
        const dx = (center.x + x - (text.left + text.width / 2)) / Math.max(text.width, 1);
        const dy = (center.y + y - (text.top + text.height / 2)) / Math.max(text.height, 1);
        const position = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'above' : 'below');
        onChange({ position });
      },
    };
  };
  const arrow = (action: CanvasAction, x: number, y: number, shift: boolean) => {
    if (action === 'move') { onChange({ position: x ? (x < 0 ? 'left' : 'right') : (y < 0 ? 'above' : 'below') }); return; }
    if (action === 'rotate') { onChange({ imageRotation: normalizeRotation(rotation + (x || y) * (shift ? 15 : 1)) }); return; }
    const width = frame.current?.querySelector<HTMLElement>('.stage-media.image')?.offsetWidth ?? 0;
    const total = frame.current?.closest<HTMLElement>('.scene-composition')?.offsetWidth ?? 0;
    if (total) onChange({ imageWidth: widthPercent((layout.imageWidth ?? 100 * width / total) + (x || y) * (shift ? 5 : 1)) });
  };
  const editor = preview && frame.current?.closest('.editor');
  return <div className="canvas-box-frame canvas-image-frame" ref={frame} data-selected={selected || undefined}
    data-dragging={Boolean(preview || angle !== undefined) || undefined} style={{ rotate: (angle ?? rotation) ? `${angle ?? rotation}deg` : undefined }}
    onPointerDown={select} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setSelected(false); }}>
    {children}
    {(['move', 'resize', 'rotate'] as const).map(action =>
      <CanvasObjectHandle key={action} action={action} label={t(action === 'move' ? 'moveImage' : action === 'resize' ? 'resizeImage' : 'rotateImage')}
        description={t('imageKeys')} select={select} start={point => start(action, point)} arrow={(x, y, shift) => arrow(action, x, y, shift)} />)}
    {preview && editor && createPortal(<div className="canvas-box-preview" aria-hidden="true" style={{ ...preview, rotate: `${rotation}deg` }} />, editor)}
  </div>;
}
