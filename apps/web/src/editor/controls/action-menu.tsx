import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons.js';

/**
 * One item: `icon` before it, `shortcut` (as the Help panel writes it, "Ctrl + Shift + L") after it; `problems`: how
 * many problems are behind it (a red count, and a red dot on the menu's button).
 */
export interface MenuAction { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean; icon?: string; shortcut?: string; problems?: number }

/**
 * A ☰ button that opens a short menu of actions (a scene's Start here, Duplicate,
 * Save as prefab, Delete…), so they sit in the panel's header instead of a row of
 * buttons. Escape or a click outside closes it; arrow keys move through the items.
 * With `text` the button is labelled ("Play & publish ▾"), with `icon` too; `align`
 * says which edge of the button the list lines up with (the end by default).
 */
export function ActionMenu({ label, actions, text, icon, intro, align = 'end' }: { label: string; actions: MenuAction[]; text?: string; icon?: string; intro?: ReactNode | undefined; align?: 'start' | 'end' }) {
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
  const withIcons = actions.some(action => action.icon);
  const problems = actions.reduce((sum, action) => sum + (action.problems ?? 0), 0);
  return <div ref={box} className={`action-menu${text ? ' has-text' : ''}${align === 'start' ? ' align-start' : ''}`} onKeyDown={onKey}>
    {/* With `text`, a labelled button ("Play & publish ▾"); without, the ☰ icon. */}
    <button ref={button} type="button" className={text ? `action-menu-text${icon ? ' with-icon' : ''}` : 'small-button icon-only'} aria-label={text ? undefined : problems ? `${label} (${problems} ${problems === 1 ? 'problem' : 'problems'})` : label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}>
      {text ? <>{icon && <Icon name={icon} size={18} />}{text}<span className="action-menu-caret" aria-hidden="true">▾</span></> : <Icon name="menu" size={18} />}{problems > 0 && <span className="action-menu-alert" aria-hidden="true">!</span>}</button>
    {open && <div id={id} className={`action-menu-list${withIcons ? ' with-icons' : ''}`} role="menu" aria-label={label}>
      {intro && <p className="action-menu-intro">{intro}</p>}
      {actions.map(action => <button key={action.label} type="button" role="menuitem" disabled={action.disabled} className={action.danger ? 'danger-item' : undefined}
        aria-keyshortcuts={action.shortcut ? action.shortcut.replace(/ \+ /g, '+').replace('⌘', 'Meta') : undefined}
        onClick={() => { setOpen(false); action.onSelect(); }}>
        {withIcons && <span className="action-menu-icon">{action.icon && <Icon name={action.icon} size={18} />}</span>}
        <span className="action-menu-label">{action.label}</span>
        {(action.problems ?? 0) > 0 && <span className="action-menu-problems">{action.problems}<span className="visually-hidden"> {action.problems === 1 ? 'problem' : 'problems'}</span></span>}
        {action.shortcut && <kbd className="action-menu-keys">{action.shortcut.replace(/ \+ /g, '+')}</kbd>}
      </button>)}
    </div>}
  </div>;
}
