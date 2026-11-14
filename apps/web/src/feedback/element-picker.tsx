import { useEffect, useState } from 'react';
import type { PickedElement } from '@party/contracts';
import { describeElement, FEEDBACK_UI } from './describe-element.js';

const BLOCKED = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchend', 'dblclick', 'contextmenu', 'submit'] as const;
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
    const pick = (event: MouseEvent) => {
      if (ours(event.target)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const target = document.elementFromPoint(event.clientX, event.clientY) ?? (event.target instanceof Element ? event.target : null);
      if (target && !ours(target)) onPick(describeElement(target));
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onCancel(); } };
    // Keyboard users: whatever has focus can be picked with Enter.
    const focus = (event: FocusEvent) => show(event.target);
    const enter = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || ours(event.target) || !(event.target instanceof Element)) return;
      event.preventDefault(); event.stopImmediatePropagation(); onPick(describeElement(event.target));
    };
    const options = { capture: true } as const;
    window.addEventListener('pointermove', move, options);
    window.addEventListener('click', pick, options);
    window.addEventListener('keydown', key, options);
    window.addEventListener('keydown', enter, options);
    window.addEventListener('focusin', focus, options);
    for (const type of BLOCKED) window.addEventListener(type, block, options);
    return () => {
      window.removeEventListener('pointermove', move, options);
      window.removeEventListener('click', pick, options);
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
