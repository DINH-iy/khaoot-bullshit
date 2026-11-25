import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { translate } from '../i18n/texts.js';
import { CONTROLS_TEXTS } from '../editor/controls/controls.text.js';
const t = (key: keyof typeof CONTROLS_TEXTS.en, values?: Record<string, string | number>) => translate(CONTROLS_TEXTS, key, values);
import { createPortal } from 'react-dom';
import './dropdown.css';

/**
 * After an option is clicked the list closes at once, and whatever was under it is exposed: a
 * double click (or a quick second click) would land there, such as on a style card that replaces
 * the whole look. The rest of that multi-click (detail above 1) is dropped; a new single click is not.
 */
function swallowStrayClick() {
  const stop = (event: MouseEvent) => { if (event.detail > 1) { event.preventDefault(); event.stopPropagation(); } };
  document.addEventListener('click', stop, true); document.addEventListener('dblclick', stop, true);
  setTimeout(() => { document.removeEventListener('click', stop, true); document.removeEventListener('dblclick', stop, true); }, 400);
}

/** `badge`: a short tag after the label ("Own look"), in the list and on the button. */
export interface DropdownOption { value: string; label: string; group?: string; disabled?: boolean; lang?: string; style?: CSSProperties; badge?: string }

/**
 * A themed single-select control for the app. It follows the standard "select-only
 * combobox" pattern so it works like a real one: put it inside a <label> for its
 * name; arrows, Home/End and Page Up/Down move, Enter/Space choose, Escape closes,
 * typing jumps to a matching option; Tab chooses the highlighted option and moves on.
 * The list is drawn over the page (not clipped by a scrolling panel) and opens
 * upwards when there is no room below.
 */
/** Where a fixed element's (0, 0) really is on screen: the window's corner, or that of a parent that became its frame. */
function frameOrigin(node: HTMLElement | null): { left: number; top: number } {
  if (!node) return { left: 0, top: 0 };
  const style = node.style; const saved = [style.left, style.top, style.bottom, style.transform] as const;
  style.left = '0px'; style.top = '0px'; style.bottom = 'auto'; style.transform = 'none';
  const corner = node.getBoundingClientRect();
  [style.left, style.top, style.bottom, style.transform] = saved;
  return { left: corner.left, top: corner.top };
}

export function Dropdown({ id: buttonId, value, options, onChange, placeholder = t('choose'), className, disabled, label, title }: {
  id?: string; value: string; options: DropdownOption[]; onChange: (value: string) => void; placeholder?: string; className?: string; disabled?: boolean; label?: string; title?: string;
}) {
  const id = useId(); const triggerId = buttonId ?? `${id}-trigger`; const button = useRef<HTMLButtonElement>(null); const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false); const [active, setActive] = useState(-1);
  const [place, setPlace] = useState<CSSProperties>({});
  const typed = useRef({ text: '', at: 0 });
  const selected = options.findIndex(option => option.value === value);
  const enabled = (index: number) => index >= 0 && index < options.length && !options[index]!.disabled;
  const step = (from: number, by: number) => { let index = from; for (let tries = 0; tries < options.length; tries++) { index = Math.max(0, Math.min(options.length - 1, index + by)); if (enabled(index)) return index; if (index === 0 || index === options.length - 1) break; } return from; };
  const first = () => options.findIndex((_, index) => enabled(index));
  const last = () => { for (let index = options.length - 1; index >= 0; index--) if (enabled(index)) return index; return -1; };

  const show = (at = selected >= 0 ? selected : first()) => { setActive(at); setOpen(true); };
  const choose = (index: number) => { if (enabled(index) && options[index]!.value !== value) onChange(options[index]!.value); setOpen(false); };

  // Place the list under the button (or above it when there is no room), and keep it there while scrolling.
  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const box = button.current?.getBoundingClientRect(); if (!box) return;
      const viewport = window.visualViewport;
      const topEdge = viewport?.offsetTop ?? 0;
      const bottomEdge = topEdge + (viewport?.height ?? window.innerHeight);
      const below = bottomEdge - box.bottom - 8; const above = box.top - topEdge - 8; const up = below < 220 && above > below;
      const width = Math.min(window.innerWidth - 16, Math.max(box.width, 220));
      // A "fixed" list is placed against the window, unless a parent (a dialog with a transform, filter or backdrop
      // filter, now or mid-animation) becomes its frame: then it lands off by that parent's position. Measure where
      // the frame's corner really is and correct for it, so the list always opens right at its button.
      const origin = frameOrigin(list.current);
      const left = Math.max(8, Math.min(box.left, window.innerWidth - width - 8)) - origin.left;
      setPlace({ left, width, maxHeight: Math.max(0, Math.min(320, up ? above : below)),
        ...(up ? { top: box.top - 4 - origin.top, transform: 'translateY(-100%)' } : { top: box.bottom + 4 - origin.top }) });
    };
    position();
    window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', position); viewport?.addEventListener('scroll', position);
    return () => {
      window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true);
      viewport?.removeEventListener('resize', position); viewport?.removeEventListener('scroll', position);
    };
  }, [open]);
  // The highlighted option stays in view.
  useEffect(() => { if (open && active >= 0) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [open, active, id]);
  // A click anywhere else closes the list.
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { const target = event.target as Node; if (!button.current?.contains(target) && !list.current?.contains(target)) setOpen(false); };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);

  // Type to find: letters typed quickly after each other build up one search.
  const find = (key: string) => {
    const now = Date.now(); typed.current = { text: (now - typed.current.at < 600 ? typed.current.text : '') + key.toLowerCase(), at: now };
    const start = open ? active : selected; const text = typed.current.text;
    const order = [...options.keys()].map(offset => (Math.max(0, start) + (text.length === 1 ? 1 : 0) + offset) % options.length);
    return order.find(index => enabled(index) && options[index]!.label.toLowerCase().startsWith(text)) ?? -1;
  };
  const onKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const { key } = event;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(key)) { event.preventDefault(); show(); }
      else if (key === 'Home') { event.preventDefault(); show(first()); }
      else if (key === 'End') { event.preventDefault(); show(last()); }
      else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) { const found = find(key); if (found >= 0) show(found); }
      return;
    }
    if (key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); }
    else if (key === 'ArrowDown') { event.preventDefault(); if (event.altKey) choose(active); else setActive(step(active, 1)); }
    else if (key === 'ArrowUp') { event.preventDefault(); if (event.altKey) choose(active); else setActive(step(active, -1)); }
    else if (key === 'Home') { event.preventDefault(); setActive(first()); }
    else if (key === 'End') { event.preventDefault(); setActive(last()); }
    else if (key === 'PageDown') { event.preventDefault(); setActive(step(active, 10)); }
    else if (key === 'PageUp') { event.preventDefault(); setActive(step(active, -10)); }
    else if (key === 'Enter' || key === ' ') { event.preventDefault(); choose(active); }
    else if (key === 'Tab') choose(active);
    else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) { const found = find(key); if (found >= 0) setActive(found); }
  };

  // Options in their groups, in order.
  const groups: { name: string | undefined; items: number[] }[] = [];
  options.forEach((option, index) => { const lastGroup = groups.at(-1); if (lastGroup && lastGroup.name === option.group) lastGroup.items.push(index); else groups.push({ name: option.group, items: [index] }); });
  const optionEl = (index: number) => { const option = options[index]!; return <div key={index} id={`${id}-${index}`} role="option" data-value={option.value} lang={option.lang} aria-selected={index === selected} aria-disabled={option.disabled || undefined}
    className={`ed-dropdown-option${index === active ? ' active' : ''}`} style={option.style}
    onPointerMove={() => { if (enabled(index) && index !== active) setActive(index); }} onPointerDown={event => event.preventDefault()} onClick={() => { choose(index); swallowStrayClick(); }}>{index === selected && <span className="ed-dropdown-check" aria-hidden="true">✓</span>}{option.label}{option.badge && <span className="ed-dropdown-badge"> {option.badge}</span>}</div>; };
  const root = (button.current?.closest('dialog[open], [role=dialog], .app-menu, .editor, .room') as HTMLElement | null) ?? document.body;

  return <>
    <button ref={button} id={triggerId} type="button" role="combobox" value={value} aria-label={label} title={title} disabled={disabled} className={`ed-dropdown${className ? ` ${className}` : ''}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? `${id}-list` : undefined}
      aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined} onKeyDown={onKey}
      onClick={event => { event.preventDefault(); if (open) setOpen(false); else show(); }} onBlur={() => setOpen(false)}>
      <span lang={options[selected]?.lang} className={selected < 0 ? 'ed-dropdown-placeholder' : undefined} style={selected >= 0 ? options[selected]!.style : undefined}>{selected >= 0 ? options[selected]!.label : placeholder}{selected >= 0 && options[selected]!.badge && <span className="ed-dropdown-badge"> {options[selected]!.badge}</span>}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {open && createPortal(<div ref={list} id={`${id}-list`} role="listbox" aria-labelledby={triggerId} className="ed-dropdown-list" style={place} tabIndex={-1} onPointerDown={event => event.preventDefault()}>
      {groups.map((group, position) => group.name ? <div key={position} role="group" aria-label={group.name}><div className="ed-dropdown-group" aria-hidden="true">{group.name}</div>{group.items.map(optionEl)}</div> : group.items.map(optionEl))}
    </div>, root)}
  </>;
}
