import { useRef } from 'react';
import { Icon } from '../../../presentation/line-icons.js';

export interface CanvasPoint { x: number; y: number; shiftKey: boolean }
interface Gesture { update: (point: CanvasPoint) => void; commit: (point: CanvasPoint) => void; cancel: () => void }
export type CanvasAction = 'move' | 'resize' | 'rotate';

export const normalizeRotation = (angle: number) => ((Math.round(angle) + 180) % 360 + 360) % 360 - 180;

export function rotationGesture(element: HTMLElement, start: CanvasPoint, rotation: number,
  preview: (angle?: number) => void, commit: (angle: number) => void): Gesture {
  const bounds = element.getBoundingClientRect();
  const x = bounds.left + bounds.width / 2;
  const y = bounds.top + bounds.height / 2;
  const angle = (point: CanvasPoint) => Math.atan2(point.y - y, point.x - x) * 180 / Math.PI;
  const initial = angle(start);
  const value = (point: CanvasPoint) => {
    const step = point.shiftKey ? 15 : 1;
    return normalizeRotation(Math.round((rotation + angle(point) - initial) / step) * step);
  };
  return { update: point => preview(value(point)), commit: point => { preview(); commit(value(point)); }, cancel: () => preview() };
}

export function CanvasObjectHandle({ action, label, description, select, start, arrow, surface }: {
  action: CanvasAction; surface?: boolean; label: string; description: string; select: () => void;
  start: (point: CanvasPoint) => Gesture | undefined; arrow: (x: number, y: number, shift: boolean) => void;
}) {
  const active = useRef<{ id: number; origin: CanvasPoint; gesture: Gesture }>(undefined);
  const point = (event: { clientX: number; clientY: number; shiftKey: boolean }) =>
    ({ x: event.clientX, y: event.clientY, shiftKey: event.shiftKey });
  const moved = (now: CanvasPoint, origin: CanvasPoint) => Math.hypot(now.x - origin.x, now.y - origin.y) >= 4;
  const cancel = (id?: number) => {
    const drag = active.current;
    if (!drag || (id !== undefined && id !== drag.id)) return;
    active.current = undefined;
    drag.gesture.cancel();
  };
  return <button type="button" className={`canvas-box-handle ${action}${surface ? ' drag-surface' : ''}`} aria-label={label} title={label}
    aria-description={description} onFocus={select} onClick={select}
    onPointerDown={event => {
      if (event.button !== 0 || !event.isPrimary) return;
      const origin = point(event);
      const gesture = start(origin);
      if (!gesture) return;
      select();
      active.current = { id: event.pointerId, origin, gesture };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      const drag = active.current;
      if (drag?.id !== event.pointerId) return;
      const now = point(event);
      if (moved(now, drag.origin)) drag.gesture.update(now);
      else drag.gesture.cancel();
    }}
    onPointerUp={event => {
      const drag = active.current;
      if (drag?.id !== event.pointerId) return;
      active.current = undefined;
      const now = point(event);
      if (moved(now, drag.origin)) drag.gesture.commit(now);
      else drag.gesture.cancel();
    }}
    onPointerCancel={event => cancel(event.pointerId)} onLostPointerCapture={event => cancel(event.pointerId)}
    onKeyDown={event => {
      if (event.key === 'Escape' && active.current) { cancel(); event.stopPropagation(); return; }
      const x = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
      const y = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
      if (!x && !y) return;
      event.preventDefault();
      event.stopPropagation();
      arrow(x, y, event.shiftKey);
    }}>
    <span><Icon name={action === 'move' ? 'move' : action === 'resize' ? 'resize-corner' : 'restart'} size={16} /></span>
  </button>;
}
