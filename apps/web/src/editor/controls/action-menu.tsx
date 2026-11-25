import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon } from './icons.js';

/**
 * One item: `icon` before it, `shortcut` (as the Help panel writes it, "Ctrl + Shift + L") after it; `problems`: how
 * many problems are behind it (a red count, and a red dot on the menu's button); `separated`: a line above it.
 */
export interface MenuAction { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean; icon?: string; shortcut?: string; problems?: number; separated?: boolean }

/**
 * The list of a menu: its items, focus on the first one when it opens, arrow keys to move through them.
 * `onPick` runs before the chosen item's action (to close the menu); `onEscape` when Escape is pressed.
 */
function MenuList({ id, label, actions, intro, className = '', style, onPick, onEscape, listRef }: { id?: string; label: string; actions: MenuAction[]; intro?: ReactNode | undefined; className?: string; style?: CSSProperties; onPick: () => void; onEscape: () => void; listRef?: React.RefObject<HTMLDivElement | null> }) {
  const own = useRef<HTMLDivElement>(null); const list = listRef ?? own;
  useEffect(() => { list.current?.querySelector<HTMLElement>('[role=menuitem]:not(:disabled)')?.focus(); }, [list]);
  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.stopPropagation(); onEscape(); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = [...list.current!.querySelectorAll<HTMLElement>('[role=menuitem]:not(:disabled)')];
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };
  const withIcons = actions.some(action => action.icon);
  return <div ref={list} id={id} className={`action-menu-list${withIcons ? ' with-icons' : ''}${className ? ` ${className}` : ''}`} style={style} role="menu" aria-label={label} onKeyDown={onKey}>
    {intro && <p className="action-menu-intro">{intro}</p>}
    {actions.map(action => [
      action.separated && <hr key={`${action.label}-line`} className="action-menu-separator" role="separator" />,
      <button key={action.label} type="button" role="menuitem" disabled={action.disabled} className={action.danger ? 'danger-item' : undefined}
        aria-keyshortcuts={action.shortcut ? action.shortcut.replace(/ \+ /g, '+').replace('⌘', 'Meta') : undefined}
        onClick={() => { onPick(); action.onSelect(); }}>
        {withIcons && <span className="action-menu-icon">{action.icon && <Icon name={action.icon} size={18} />}</span>}
        <span className="action-menu-label">{action.label}</span>
        {(action.problems ?? 0) > 0 && <span className="action-menu-problems">{action.problems}<span className="visually-hidden"> {action.problems === 1 ? 'problem' : 'problems'}</span></span>}
        {action.shortcut && <kbd className="action-menu-keys">{action.shortcut.replace(/ \+ /g, '+')}</kbd>}
      </button>])}
  </div>;
}

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
    const outside = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);
  const problems = actions.reduce((sum, action) => sum + (action.problems ?? 0), 0);
  return <div ref={box} className={`action-menu${text ? ' has-text' : ''}${align === 'start' ? ' align-start' : ''}`} onKeyDown={event => { if (open && event.key === 'Escape') { event.stopPropagation(); setOpen(false); button.current?.focus(); } }}>
    {/* With `text`, a labelled button ("Play & publish ▾"); without, the ☰ icon. */}
    <button ref={button} type="button" className={text ? `action-menu-text${icon ? ' with-icon' : ''}` : 'small-button icon-only'} aria-label={text || (problems ? `${label} (${problems} ${problems === 1 ? 'problem' : 'problems'})` : label)} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}>
      {text ? <>{icon && <Icon name={icon} size={18} />}<span className="action-menu-button-label">{text}</span><span className="action-menu-caret" aria-hidden="true">▾</span></> : <Icon name="menu" size={18} />}{problems > 0 && <span className="action-menu-alert" aria-hidden="true">!</span>}</button>
    {open && <MenuList id={id} label={label} actions={actions} intro={intro} onPick={() => setOpen(false)} onEscape={() => { setOpen(false); button.current?.focus(); }} />}
  </div>;
}

/**
 * A menu at a point on the screen (`at`, in client pixels): a right-click menu. It is kept inside the window,
 * and closes on a click outside it, on Escape (focus goes back to `returnFocus`), when focus leaves it, or when
 * the window scrolls, zooms or resizes. On phones it opens as a sheet at the bottom, like the other menus.
 */
export function ContextMenu({ label, actions, at, onClose, returnFocus }: { label: string; actions: MenuAction[]; at: { x: number; y: number }; onClose: () => void; returnFocus?: HTMLElement | null }) {
  const list = useRef<HTMLDivElement>(null); const [spot, setSpot] = useState(at);
  useLayoutEffect(() => {
    const menu = list.current; if (!menu) return;
    setSpot({ x: Math.max(8, Math.min(at.x, window.innerWidth - menu.offsetWidth - 8)), y: Math.max(8, Math.min(at.y, window.innerHeight - menu.offsetHeight - 8)) });
  }, [at]);
  useEffect(() => {
    const outside = (event: Event) => { if (!list.current?.contains(event.target as Node)) onClose(); };
    document.addEventListener('pointerdown', outside, true); window.addEventListener('wheel', outside, true);
    window.addEventListener('resize', onClose); window.addEventListener('blur', onClose);
    return () => { document.removeEventListener('pointerdown', outside, true); window.removeEventListener('wheel', outside, true); window.removeEventListener('resize', onClose); window.removeEventListener('blur', onClose); };
  }, [onClose]);
  return <div className="context-menu-anchor" onBlur={event => { if (event.relatedTarget && !list.current?.contains(event.relatedTarget as Node)) onClose(); }}
    onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}>
    <MenuList listRef={list} label={label} actions={actions} className="context-menu" style={{ '--menu-x': `${spot.x}px`, '--menu-y': `${spot.y}px` } as CSSProperties}
      onPick={onClose} onEscape={() => { onClose(); returnFocus?.focus(); }} />
  </div>;
}
