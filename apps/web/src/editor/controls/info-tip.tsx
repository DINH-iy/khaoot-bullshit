import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons.js';

/**
 * A small ⓘ (or other icon) button that shows an explanation in a bubble: on hover
 * or focus, and pinned open by a click or tap (Escape or a click elsewhere closes
 * it). Keeps long explanations out of the way of short option names.
 * `align` says which edge of the button the bubble lines up with.
 */
export function InfoTip({ label, children, icon = 'about', text, align = 'end' }: { label: string; children: ReactNode; icon?: string; text?: string; align?: 'start' | 'end' }) {
  const [open, setOpen] = useState(false); const id = useId(); const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', key); };
  }, [open]);
  return <span ref={box} className={`info-tip align-${align}${open ? ' open' : ''}${text ? ' with-text' : ''}`}>
    <button type="button" className="info-tip-button" aria-label={text ? undefined : label} title={text ? label : undefined} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      <Icon name={icon} size={text ? 18 : 16} />{text}</button>
    <span id={id} className="info-tip-bubble" role="note">{children}</span>
  </span>;
}
