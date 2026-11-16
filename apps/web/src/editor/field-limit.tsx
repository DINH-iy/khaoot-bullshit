import { useEffect, useState } from 'react';

/** Show the counter once a field is this full, so short texts stay uncluttered. */
const SHOW_FROM = 0.8;
type Shown = { left: number; top: number; used: number; max: number };

const limited = (target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement =>
  (target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && ['text', 'search', ''].includes(target.getAttribute('type') ?? '')))
  && target.maxLength > 0 && !target.readOnly;

/**
 * "212 / 240" under the text field being typed in, once it is nearly full. Every
 * editor field already stops at what the server accepts; this makes that limit visible.
 * One listener for the whole editor, so no field needs its own counter.
 */
export function FieldLimit() {
  const [shown, setShown] = useState<Shown | null>(null);
  useEffect(() => {
    let field: HTMLInputElement | HTMLTextAreaElement | null = null;
    const update = () => {
      if (!field || !field.isConnected || field.value.length < field.maxLength * SHOW_FROM) { setShown(null); return; }
      const rect = field.getBoundingClientRect();
      setShown({ left: rect.right, top: rect.bottom, used: field.value.length, max: field.maxLength });
    };
    const focus = (event: FocusEvent) => { field = limited(event.target) ? event.target : null; update(); };
    const blur = () => { field = null; setShown(null); };
    const options = { capture: true } as const;
    document.addEventListener('focusin', focus, options); document.addEventListener('focusout', blur, options);
    document.addEventListener('input', update, options); window.addEventListener('scroll', update, options); window.addEventListener('resize', update);
    return () => {
      document.removeEventListener('focusin', focus, options); document.removeEventListener('focusout', blur, options);
      document.removeEventListener('input', update, options); window.removeEventListener('scroll', update, options); window.removeEventListener('resize', update);
    };
  }, []);
  if (!shown) return null;
  return <output className={`field-limit${shown.used >= shown.max ? ' full' : ''}`} style={{ left: shown.left, top: shown.top }} aria-live="polite">{shown.used} / {shown.max}</output>;
}
