import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MAX_SCENE_TEXT_LINES, type SceneTextBoxPlacement } from '@party/contracts';
import { useTexts } from '../../../i18n/texts.js';
import { slideObjectStyle, slidePercent } from '../../../presentation/slide-object.js';
import { CanvasObjectHandle, normalizeRotation, rotationGesture, type CanvasAction, type CanvasPoint } from './canvas-object-handle.js';
import { TEXT_BOX_TEXTS } from './text-boxes.text.js';

type PlacementChange = { placement: SceneTextBoxPlacement; lines?: number };
const textLines = (value: number) => Math.min(MAX_SCENE_TEXT_LINES, Math.max(1, value));

function measureBox(element: HTMLElement) {
  const slide = element.closest<HTMLElement>('.tv-screen');
  const layer = slide?.querySelector<HTMLElement>(':scope > .scene-slide-text-layer');
  const field = element.querySelector('textarea');
  if (!slide || !layer || !field) return;
  const board = layer.getBoundingClientRect();
  if (!board.width || !board.height || !layer.offsetWidth || !layer.offsetHeight) return;
  const box = element.getBoundingClientRect();
  const scale = board.height / layer.offsetHeight;
  const lineHeight = (parseFloat(getComputedStyle(field).lineHeight) || 20) * scale;
  const height = element.offsetHeight * scale;
  return { slide, board, height, lineHeight, placement: {
    x: slidePercent((box.left + box.width / 2 - board.left) * 100 / board.width),
    y: slidePercent((box.top + box.height / 2 - board.top) * 100 / board.height),
    width: slidePercent(element.offsetWidth * 100 / layer.offsetWidth, 2),
  } };
}

export function measureTextPlacement(preview: HTMLElement | null, key: string) {
  const element = preview?.querySelector<HTMLElement>(`.tv-screen [data-text-box-key="${CSS.escape(key)}"]`);
  return element ? measureBox(element)?.placement : undefined;
}

export function TextBoxHandles({ boxKey, label, placement, lines, rotation = 0, selected, onSelect, onPlace, onRotate, children }: {
  boxKey: string; label: string; placement: SceneTextBoxPlacement | undefined; lines: number | undefined; rotation?: number | undefined;
  selected: boolean; onSelect: () => void; onPlace: (placement: SceneTextBoxPlacement, lines?: number) => void;
  onRotate: (degrees: number) => void; children: ReactNode;
}) {
  const t = useTexts(TEXT_BOX_TEXTS);
  const wrapper = useRef<HTMLDivElement>(null);
  const [previewRotation, setPreviewRotation] = useState<number>();
  const [positionPreview, setPositionPreview] = useState<SceneTextBoxPlacement>();
  const [outline, setOutline] = useState<{ left: number; top: number; width: number; height: number }>();
  const commit = (slide: HTMLElement, action: CanvasAction, { placement: next, lines }: PlacementChange) => {
    const focused = !placement && wrapper.current?.contains(document.activeElement);
    onPlace(next, lines);
    if (focused) requestAnimationFrame(() => slide.querySelector<HTMLButtonElement>(
      `.scene-slide-text-layer [data-text-box-key="${CSS.escape(boxKey)}"] .canvas-box-handle.${action}`,
    )?.focus({ preventScroll: true }));
  };

  const begin = (action: CanvasAction, origin: CanvasPoint) => {
    const element = wrapper.current;
    if (!element) return;
    if (action === 'rotate') return rotationGesture(element, origin, rotation, setPreviewRotation, onRotate);
    const geometry = measureBox(element);
    if (!geometry) return;
    const { board, height, lineHeight, slide } = geometry;
    const initial = placement ?? geometry.placement;
    const initialLines = lines ?? Math.max(1, Math.round(height / lineHeight));
    const angle = rotation * Math.PI / 180;
    const next = (point: CanvasPoint): PlacementChange => {
      const dx = point.x - origin.x;
      const dy = point.y - origin.y;
      if (action === 'move') return { placement: {
        ...initial, x: slidePercent(initial.x + dx * 100 / board.width), y: slidePercent(initial.y + dy * 100 / board.height),
      } };
      const localX = dx * Math.cos(angle) + dy * Math.sin(angle);
      const localY = -dx * Math.sin(angle) + dy * Math.cos(angle);
      const change = Math.round(localY / lineHeight);
      return { placement: { ...initial, width: slidePercent(initial.width + localX * 200 / board.width, 2) },
        ...(change ? { lines: textLines(initialLines + change) } : {}) };
    };
    const cancel = () => { setOutline(undefined); setPositionPreview(undefined); };
    return {
      update: (point: CanvasPoint) => {
        const result = next(point);
        if (placement && action === 'move') { setPositionPreview(result.placement); return; }
        const width = result.placement.width * board.width / 100;
        const displayHeight = result.lines === undefined ? height : result.lines * lineHeight;
        setOutline({ width, height: displayHeight,
          left: board.left + result.placement.x * board.width / 100 - width / 2,
          top: board.top + result.placement.y * board.height / 100 - displayHeight / 2,
        });
      },
      cancel,
      commit: (point: CanvasPoint) => { cancel(); commit(slide, action, next(point)); },
    };
  };
  const key = (action: CanvasAction, x: number, y: number, shift: boolean) => {
    if (action === 'rotate') { onRotate(normalizeRotation(rotation + (x || y) * (shift ? 15 : 1))); return; }
    const geometry = wrapper.current && measureBox(wrapper.current);
    if (!geometry) return;
    const initial = placement ?? geometry.placement;
    const step = shift ? 5 : 1;
    if (action === 'move') {
      commit(geometry.slide, action, { placement: { ...initial, x: slidePercent(initial.x + x * step), y: slidePercent(initial.y + y * step) } });
    } else {
      commit(geometry.slide, action, { placement: { ...initial, width: slidePercent(initial.width + x * step, 2) },
        ...(y ? { lines: textLines((lines ?? Math.round(geometry.height / geometry.lineHeight)) + y) } : {}) });
    }
  };
  const editor = outline && wrapper.current?.closest('.editor');
  const frame = <div ref={wrapper} className="canvas-box-frame" data-text-box-key={boxKey} data-selected={selected || undefined}
    data-dragging={Boolean(outline || positionPreview || previewRotation !== undefined) || undefined}
    style={{ rotate: (previewRotation ?? rotation) ? `${previewRotation ?? rotation}deg` : undefined }}>
    {children}
    {(['move', 'resize', 'rotate'] as const).map(action =>
      <CanvasObjectHandle key={action} action={action} label={t(action === 'move' ? 'moveCanvas' : action === 'resize' ? 'resizeCanvas' : 'rotateCanvas', { box: label })}
        description={t('canvasKeys')} select={onSelect} start={point => begin(action, point)} arrow={(x, y, shift) => key(action, x, y, shift)} />)}
    {outline && editor && createPortal(<div className="canvas-box-preview" aria-hidden="true" style={{ ...outline, rotate: rotation ? `${rotation}deg` : undefined }} />, editor)}
  </div>;
  return placement ? <div className="scene-positioned-text-box" style={slideObjectStyle(positionPreview ?? placement)}>{frame}</div> : frame;
}
