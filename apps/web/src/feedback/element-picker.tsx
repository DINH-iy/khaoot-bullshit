import { useEffect, useState } from 'react';
import type { PickedElement } from '@party/contracts';
import { describeElement, FEEDBACK_UI } from './describe-element.js';

const BLOCKED = ['pointerdown', 'mousedown', 'mouseup', 'touchend', 'click', 'dblclick', 'contextmenu', 'submit'] as const;
/** A press that moved further than this was a scroll, not a pick. */
const TAP_SLOP_PX = 12;
const ours = (target: EventTarget | null) => target instanceof Element && target.closest(`[${FEEDBACK_UI}]`) !== null;

/**
 * "Point at something": while active, the next click or tap picks the element
 * under it instead of using it. Listeners sit on window in the capture phase,
 * so the app never sees those clicks (no button presses, no drawing).
 */
export function ElementPicker({ onPick, onCancel }: { onPick: (element: PickedElement) => void; onCancel: () => void }) {
  const [hover, setHover] = useState<{ rect: DOMRect; source: string | null }>();
  useEffect(() => {
    const show = (target: EventTarget | null) => {
      if (!(target instanceof Element) || ours(target)) { setHover(undefined); return; }
      setHover({ rect: target.getBoundingClientRect(), source: target.closest('[data-src]')?.getAttribute('data-src') ?? null });
    };
    const move = (event: PointerEvent) => show(document.elementFromPoint(event.clientX, event.clientY));
    const block = (event: Event) => { if (ours(event.target)) return; event.preventDefault(); event.stopImmediatePropagation(); };
    // Picks on release, not on click: phones send no click once touchend is blocked, and disabled
    // controls never get one. The element is found from the point, so it works on any element.
    let pressed: { x: number; y: number } | null = null;
    const press = (event: PointerEvent) => { pressed = ours(event.target) ? null : { x: event.clientX, y: event.clientY }; };
    const pick = (event: PointerEvent) => {
      const start = pressed; pressed = null;
      if (ours(event.target) || !start) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP_PX) return;
      const target = document.elementFromPoint(event.clientX, event.clientY) ?? (event.target instanceof Element ? event.target : null);
      if (!target || ours(target)) return;
      // Picking closes the picker (and its listeners) before the browser sends this press's click: swallow that click too,
      // so the picked button is never pressed.
      const swallow = (click: Event) => { click.preventDefault(); click.stopImmediatePropagation(); };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 500);
      onPick(describeElement(target));
    };
    const cancelPress = () => { pressed = null; };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onCancel(); } };
    // Keyboard users: whatever has focus can be picked with Enter.
    const focus = (event: FocusEvent) => show(event.target);
    const enter = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || ours(event.target) || !(event.target instanceof Element)) return;
      event.preventDefault(); event.stopImmediatePropagation(); onPick(describeElement(event.target));
    };
    const options = { capture: true } as const;
    window.addEventListener('pointermove', move, options);
    window.addEventListener('pointerdown', press, options);
    window.addEventListener('pointerup', pick, options);
    window.addEventListener('pointercancel', cancelPress, options);
    window.addEventListener('keydown', key, options);
    window.addEventListener('keydown', enter, options);
    window.addEventListener('focusin', focus, options);
    for (const type of BLOCKED) window.addEventListener(type, block, options);
    return () => {
      window.removeEventListener('pointermove', move, options);
      window.removeEventListener('pointerdown', press, options);
      window.removeEventListener('pointerup', pick, options);
      window.removeEventListener('pointercancel', cancelPress, options);
      window.removeEventListener('keydown', key, options);
      window.removeEventListener('keydown', enter, options);
      window.removeEventListener('focusin', focus, options);
      for (const type of BLOCKED) window.removeEventListener(type, block, options);
    };
  }, [onPick, onCancel]);
  return <>
    <div className="feedback-picker-bar" role="status" {...{ [FEEDBACK_UI]: '' }}>
      <span>Tap or click the thing you mean</span>
      <button type="button" onClick={onCancel}>Cancel</button>
    </div>
    {hover && <div className="feedback-picker-box" aria-hidden="true" style={{ left: hover.rect.left, top: hover.rect.top, width: hover.rect.width, height: hover.rect.height }}>
      {hover.source && <span>{hover.source}</span>}
    </div>}
  </>;
}
