import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MAX_SCENE_TEXT_LINES, SCENE_TEXT_GRID_COLUMNS } from '@party/contracts';
import { useTexts } from '../../../i18n/texts.js';
import { CanvasObjectHandle, normalizeRotation, rotationGesture, type CanvasAction, type CanvasPoint } from './canvas-object-handle.js';
import type { TextBoxPosition } from '../../../presentation/scene-text-layout.js';
import { TEXT_BOX_TEXTS } from './text-boxes.text.js';

type Action = 'move' | 'resize';
interface Drag {
  action: Action;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  lineHeight: number;
  baseLines: number | undefined;
  position: TextBoxPosition;
  rowLimit: number;
  grid: HTMLElement;
}
interface DragPreview {
  position: TextBoxPosition;
  lines?: number;
  rect: { left: number; top: number; width: number; height: number };
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

function previewDrag(drag: Drag, clientX: number, clientY: number): DragPreview {
  const bounds = drag.grid.getBoundingClientRect();
  const style = getComputedStyle(drag.grid);
  const columnGap = parseFloat(style.columnGap) || 0;
  const rowGap = parseFloat(style.rowGap) || 0;
  const pitch = Math.max(1, (bounds.width + columnGap) / SCENE_TEXT_GRID_COLUMNS);
  const rows = style.gridTemplateRows.split(' ').map(size => parseFloat(size) || drag.lineHeight);
  const tops = [0];
  for (let index = 0; index < drag.rowLimit - 1; index++) tops.push(tops[index]! + (rows[index] ?? drag.lineHeight) + rowGap);

  const dx = clientX - drag.x;
  const dy = clientY - drag.y;
  const original = drag.position;
  let position = original;
  let lines: number | undefined;
  if (drag.action === 'move') {
    const top = (tops[original.row - 1] ?? 0) + dy;
    const row = tops.reduce((best, candidate, index) => Math.abs(candidate - top) < Math.abs(tops[best - 1]! - top) ? index + 1 : best, original.row);
    position = { ...original, row, column: clamp(original.column + Math.round(dx / pitch), 1, SCENE_TEXT_GRID_COLUMNS - original.width + 1) };
  } else {
    const angle = drag.rotation * Math.PI / 180;
    const localX = dx * Math.cos(angle) + dy * Math.sin(angle);
    const localY = -dx * Math.sin(angle) + dy * Math.cos(angle);
    position = { ...original, width: clamp(Math.round((drag.width + localX + columnGap) / pitch), 1, SCENE_TEXT_GRID_COLUMNS - original.column + 1) };
    if (Math.abs(localY) >= drag.lineHeight / 2) {
      const initialLines = drag.baseLines ?? Math.max(1, Math.round(drag.height / drag.lineHeight));
      lines = clamp(initialLines + Math.round(localY / drag.lineHeight), 1, MAX_SCENE_TEXT_LINES);
    }
  }
  return {
    position, ...(lines !== undefined ? { lines } : {}),
    rect: {
      left: bounds.left + (position.column - 1) * pitch,
      top: bounds.top + (tops[position.row - 1] ?? 0),
      width: position.width * pitch - columnGap,
      height: lines === undefined ? drag.height : lines * drag.lineHeight,
    },
  };
}

export function TextBoxHandles({ label, position, lastRow, lines, rotation = 0, selected, onSelect, onPlace, onRotate, children }: {
  label: string; position: TextBoxPosition; lastRow: number; lines: number | undefined; rotation?: number | undefined; selected: boolean;
  onSelect: () => void; onPlace: (position: TextBoxPosition, lines?: number) => void; onRotate: (degrees: number) => void; children: ReactNode;
}) {
  const t = useTexts(TEXT_BOX_TEXTS);
  const wrapper = useRef<HTMLDivElement>(null);
  const [previewRotation, setPreviewRotation] = useState<number>();
  const [preview, setPreview] = useState<DragPreview>();
  const geometry = () => {
    const element = wrapper.current;
    const grid = element?.closest<HTMLElement>('.scene-text-grid');
    const field = element?.querySelector('textarea');
    if (!element || !grid || !field) return null;
    const { offsetWidth: width, offsetHeight: height } = element;
    const lineHeight = parseFloat(getComputedStyle(field).lineHeight);
    return { grid, width, height, lineHeight: Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 20 };
  };
  const begin = (action: CanvasAction, origin: CanvasPoint) => {
    if (action === 'rotate') return wrapper.current ? rotationGesture(wrapper.current, origin, rotation, setPreviewRotation, onRotate) : undefined;
    const size = geometry();
    if (!size) return;
    const drag = { ...size, action, x: origin.x, y: origin.y, position, rotation, rowLimit: lastRow, baseLines: lines };
    const result = (point: CanvasPoint) => previewDrag(drag, point.x, point.y);
    const cancel = () => setPreview(undefined);
    return { update: (point: CanvasPoint) => setPreview(result(point)), cancel, commit: (point: CanvasPoint) => {
      const { position, lines } = result(point);
      cancel();
      onPlace(position, lines);
    } };
  };
  const key = (action: CanvasAction, x: number, y: number, shift: boolean) => {
    if (action === 'rotate') { onRotate(normalizeRotation(rotation + (x || y) * (shift ? 15 : 1))); return; }
    if (action === 'move') {
      onPlace({ ...position, row: clamp(position.row + y, 1, lastRow),
        column: clamp(position.column + x, 1, SCENE_TEXT_GRID_COLUMNS - position.width + 1) });
    } else {
      const size = geometry();
      const initial = lines ?? (size ? Math.round(size.height / size.lineHeight) : 1);
      onPlace({ ...position, width: clamp(position.width + x, 1, SCENE_TEXT_GRID_COLUMNS - position.column + 1) },
        y ? clamp(initial + y, 1, MAX_SCENE_TEXT_LINES) : undefined);
    }
  };
  const editor = preview && wrapper.current?.closest('.editor');
  return <div ref={wrapper} className="canvas-box-frame" data-selected={selected || undefined}
    data-dragging={Boolean(preview || previewRotation !== undefined) || undefined} style={{ rotate: (previewRotation ?? rotation) ? `${previewRotation ?? rotation}deg` : undefined }}>
    {children}
    {(['move', 'resize', 'rotate'] as const).map(action =>
      <CanvasObjectHandle key={action} action={action} label={t(action === 'move' ? 'moveCanvas' : action === 'resize' ? 'resizeCanvas' : 'rotateCanvas', { box: label })}
        description={t('canvasKeys')} select={onSelect} start={point => begin(action, point)} arrow={(x, y, shift) => key(action, x, y, shift)} />)}
    {preview && editor && createPortal(<div className="canvas-box-preview" aria-hidden="true" style={{ ...preview.rect, rotate: rotation ? `${rotation}deg` : undefined }} />, editor)}
  </div>;
}
