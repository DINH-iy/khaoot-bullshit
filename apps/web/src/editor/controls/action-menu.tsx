import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './icons.js';

export interface MenuAction { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean }

/**
 * A ☰ button that opens a short menu of actions (a scene's Start here, Duplicate,
 * Save as prefab, Delete…), so they sit in the panel's header instead of a row of
 * buttons. Escape or a click outside closes it; arrow keys move through the items.
 */
export function ActionMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  const [open, setOpen] = useState(false); const id = useId();
  const box = useRef<HTMLDivElement>(null); const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    box.current?.querySelector<HTMLElement>('[role=menuitem]:not(:disabled)')?.focus();
    const outside = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);
  const close = () => { setOpen(false); button.current?.focus(); };
  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = [...box.current!.querySelectorAll<HTMLElement>('[role=menuitem]:not(:disabled)')];
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };
  return <div ref={box} className="action-menu" onKeyDown={onKey}>
    <button ref={button} type="button" className="small-button icon-only" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}><Icon name="menu" size={18} /></button>
    {open && <div id={id} className="action-menu-list" role="menu" aria-label={label}>
      {actions.map(action => <button key={action.label} type="button" role="menuitem" disabled={action.disabled} className={action.danger ? 'danger-item' : undefined}
        onClick={() => { setOpen(false); action.onSelect(); }}>{action.label}</button>)}
    </div>}
  </div>;
}
