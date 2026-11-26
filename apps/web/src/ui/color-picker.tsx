import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { translate } from '../i18n/texts.js';
import { CONTROLS_TEXTS } from '../editor/controls/controls.text.js';
import { hsvToRgb, parseColor, rgbToHsv, toHex, toRgbaText, type Hsva, type Rgba } from './color.js';
import './color-picker.css';
const t = (key: keyof typeof CONTROLS_TEXTS.en, values?: Record<string, string | number>) => translate(CONTROLS_TEXTS, key, values);

type Format = 'hex' | 'rgba';
const FORMAT_KEY = 'colour-picker-format';
const savedFormat = (): Format => { try { return localStorage.getItem(FORMAT_KEY) === 'rgba' ? 'rgba' : 'hex'; } catch { return 'hex'; } };
const saveFormat = (format: Format) => { try { localStorage.setItem(FORMAT_KEY, format); } catch { /* only a convenience */ } };

// The browser's screen eyedropper (Chrome and Edge); hidden where it does not exist.
type EyeDropperApi = new () => { open: () => Promise<{ sRGBHex: string }> };
const eyeDropper = () => (globalThis as { EyeDropper?: EyeDropperApi }).EyeDropper;

/**
 * A text field that applies what was typed on Enter or when leaving it (never half-typed
 * values: each change of a look's colour can ask whether to change the style). Escape puts
 * the current value back. An invalid entry is marked and not applied.
 */
function DraftField({ value, onCommit, label, className, inputMode, visibleLabel }: {
  value: string; onCommit: (text: string) => boolean; label: string; className?: string; inputMode?: 'text' | 'numeric' | 'decimal'; visibleLabel?: string;
}) {
  const [draft, setDraft] = useState(value); const [invalid, setInvalid] = useState(false);
  useEffect(() => { setDraft(value); setInvalid(false); }, [value]);
  const commit = () => { if (draft === value) { setInvalid(false); return; } const ok = onCommit(draft); setInvalid(!ok); };
  const field = <input value={draft} aria-label={label} aria-invalid={invalid || undefined} inputMode={inputMode} spellCheck={false} autoComplete="off"
    onChange={event => setDraft(event.target.value)} onBlur={commit}
    onKeyDown={event => {
      if (event.key === 'Enter') { event.preventDefault(); commit(); }
      else if (event.key === 'Escape' && draft !== value) { event.stopPropagation(); setDraft(value); setInvalid(false); }
    }} />;
  return visibleLabel ? <label className={className}><span aria-hidden="true">{visibleLabel}</span>{field}</label> : <span className={className}>{field}</span>;
}

/**
 * The app's own colour picker. The trigger shows the colour (with a checkerboard behind
 * see-through colours); it opens a panel with a shade square, hue and opacity sliders,
 * the code as hex or as red/green/blue/opacity numbers (any hex or rgb()/rgba() code can
 * be typed or pasted in either), the colours already used, and the screen eyedropper
 * where the browser has one. It hands back `#rrggbb`, or `#rrggbbaa` when see-through.
 * `children` is shown inside the trigger next to the colour (such as the colour's name).
 */
export function ColorPicker({ value, onChange, label, suggestions = [], className, children, title, opaque = false }: {
  value: string; onChange: (hex: string) => void; label: string; suggestions?: string[]; className?: string; children?: ReactNode; title?: string; opaque?: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null); const pop = useRef<HTMLDivElement>(null); const area = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false); const [place, setPlace] = useState<CSSProperties>({});
  const [format, setFormat] = useState<Format>(savedFormat);
  const [hsva, setHsva] = useState<Hsva>(() => rgbToHsv(parseColor(value) ?? { r: 0, g: 0, b: 0, a: 1 }));
  // The last colour handed back: a different value from outside (undo, a cancelled change) is taken over.
  const emitted = useRef(value.toLowerCase());
  useEffect(() => {
    if (value.toLowerCase() === emitted.current) return;
    emitted.current = value.toLowerCase(); const rgba = parseColor(value); if (rgba) setHsva(rgbToHsv(rgba));
  }, [value]);

  const update = (next: Hsva) => {
    setHsva(next); const hex = toHex(hsvToRgb(next));
    if (hex !== emitted.current) { emitted.current = hex; onChange(hex); }
  };
  // A colour typed, pasted or picked: greys keep the hue that was set, so the hue slider does not jump.
  const setRgba = (rgba: Rgba) => { const next = rgbToHsv(opaque ? { ...rgba, a: 1 } : rgba); update(next.s === 0 || next.v === 0 ? { ...next, h: hsva.h } : next); };
  const rgba = hsvToRgb(hsva); const hex = toHex(rgba); const solid = toHex({ ...rgba, a: 1 });
  const close = (focus = true) => { setOpen(false); if (focus) trigger.current?.focus(); };
  // Opening starts from the colour as it is now (a change can be held back or cancelled while closed).
  const show = () => {
    const current = parseColor(value);
    if (current && toHex(current) !== hex) setHsva(rgbToHsv(current));
    emitted.current = value.toLowerCase(); setOpen(true);
  };

  // Under the trigger (or above it when there is no room), kept in place while scrolling.
  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const box = trigger.current?.getBoundingClientRect(); if (!box || !pop.current) return;
      const { offsetWidth: width, offsetHeight: height } = pop.current;
      const below = window.innerHeight - box.bottom - 8; const up = below < height && box.top - 8 > below;
      setPlace({ left: Math.max(8, Math.min(box.left, window.innerWidth - width - 8)),
        top: up ? Math.max(8, box.top - height - 6) : Math.min(box.bottom + 6, Math.max(8, window.innerHeight - height - 8)) });
    };
    position();
    // Switching HEX/RGBA changes its height: placed again so it never covers its own trigger.
    const resized = new ResizeObserver(position); if (pop.current) resized.observe(pop.current);
    window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
    return () => { resized.disconnect(); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); };
  }, [open]);
  useEffect(() => { if (open) area.current?.focus({ preventScroll: true }); }, [open]);
  // A click elsewhere, or keyboard focus moving out, closes it.
  useEffect(() => {
    if (!open) return;
    const inside = (target: EventTarget | null) => target instanceof Node && (trigger.current?.contains(target) || pop.current?.contains(target));
    const outside = (event: PointerEvent) => { if (!inside(event.target)) close(false); };
    const focus = (event: FocusEvent) => { if (event.target && !inside(event.target)) close(false); };
    document.addEventListener('pointerdown', outside, true); document.addEventListener('focusin', focus);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('focusin', focus); };
  }, [open]);

  // The shade square: left to right is saturation, top to bottom is brightness.
  const fromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    update({ ...hsva, s: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)), v: Math.min(1, Math.max(0, 1 - (event.clientY - box.top) / box.height)) });
  };
  const onAreaKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? .1 : .01;
    const moves: Record<string, Partial<Hsva>> = { ArrowLeft: { s: hsva.s - step }, ArrowRight: { s: hsva.s + step }, ArrowUp: { v: hsva.v + step }, ArrowDown: { v: hsva.v - step },
      Home: { s: 0 }, End: { s: 1 }, PageUp: { v: 1 }, PageDown: { v: 0 } };
    const move = moves[event.key]; if (!move) return;
    event.preventDefault();
    const next = { ...hsva, ...move }; update({ ...next, s: Math.min(1, Math.max(0, next.s)), v: Math.min(1, Math.max(0, next.v)) });
  };
  const typed = (text: string) => { const parsed = parseColor(text); if (parsed) setRgba(parsed); return !!parsed; };
  const channel = (key: 'r' | 'g' | 'b') => (text: string) => {
    if (parseColor(text)) return typed(text);
    const amount = Number(text.trim()); if (text.trim() === '' || !Number.isFinite(amount)) return false;
    setRgba({ ...rgba, [key]: Math.round(Math.min(255, Math.max(0, amount))) }); return true;
  };
  const alphaField = (text: string) => {
    const amount = Number(text.trim().replace(/%$/, '')); if (text.trim() === '' || !Number.isFinite(amount)) return false;
    update({ ...hsva, a: Math.min(100, Math.max(0, amount)) / 100 }); return true;
  };
  const pickFromScreen = async () => {
    const Dropper = eyeDropper(); if (!Dropper) return;
    try { const picked = parseColor((await new Dropper().open()).sRGBHex); if (picked) setRgba(picked); } catch { /* cancelled */ }
  };
  const chooseFormat = (next: Format) => { setFormat(next); saveFormat(next); };
  const quick = [...new Set(suggestions.map(color => color.toLowerCase()))].filter(color => parseColor(color)).slice(0, 16);
  const root = (trigger.current?.closest('dialog[open], [role=dialog], .editor, .room') as HTMLElement | null) ?? document.body;

  return <>
    <button ref={trigger} type="button" className={`color-trigger${className ? ` ${className}` : ''}`} aria-label={children ? undefined : label} title={title ?? value.toUpperCase()}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-pop` : undefined} onClick={() => (open ? close() : show())}>
      <span className="color-chip" aria-hidden="true"><i style={{ background: value }} /></span>{children}
    </button>
    {open && createPortal(<div ref={pop} id={`${id}-pop`} role="dialog" aria-label={label} className="color-pop" style={{ ...place, '--pick-hue': `hsl(${hsva.h} 100% 50%)`, '--pick-solid': solid } as CSSProperties}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}>
      <div ref={area} className="color-area" role="slider" tabIndex={0} aria-label={t('colourShade')}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hsva.s * 100)} aria-valuetext={t('colourShadeValue', { s: Math.round(hsva.s * 100), v: Math.round(hsva.v * 100) })}
        onKeyDown={onAreaKey}
        onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus({ preventScroll: true }); fromPointer(event); }}
        onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) fromPointer(event); }}>
        <span className="color-area-thumb" style={{ left: `${hsva.s * 100}%`, top: `${(1 - hsva.v) * 100}%`, background: solid }} />
      </div>
      <div className="color-sliders">
        <div className="color-slider-stack">
          <input type="range" className="color-hue" min={0} max={359} value={Math.round(hsva.h)} aria-label={t('colourHue')} onChange={event => update({ ...hsva, h: Number(event.target.value) })} />
          {!opaque && <input type="range" className="color-alpha" min={0} max={100} value={Math.round(hsva.a * 100)} aria-label={t('colourOpacity')} aria-valuetext={`${Math.round(hsva.a * 100)}%`}
            onChange={event => update({ ...hsva, a: Number(event.target.value) / 100 })} />}
        </div>
        <span className="color-chip color-preview" aria-hidden="true"><i style={{ background: hex }} /></span>
      </div>
      <div className="color-format" role="group" aria-label={t('colourFormat')}>
        {(['hex', 'rgba'] as const).map(option => <button key={option} type="button" aria-pressed={format === option} onClick={() => chooseFormat(option)}>{opaque && option === 'rgba' ? 'RGB' : option.toUpperCase()}</button>)}
        {eyeDropper() && <button type="button" className="color-dropper" aria-label={t('colourFromScreen')} title={t('colourFromScreen')} onClick={() => void pickFromScreen()}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m14 7 3 3M5 16l9.6-9.6a2.1 2.1 0 0 1 3 3L8 19H5z" /><path d="m13 5 1.5-1.5a2.1 2.1 0 0 1 3 0l3 3a2.1 2.1 0 0 1 0 3L19 11" /></svg>
        </button>}
      </div>
      {format === 'hex'
        ? <DraftField className="color-code" value={hex.toUpperCase()} label={t('colourHex')} onCommit={typed} />
        : <div className="color-channels">
          <DraftField visibleLabel="R" value={String(rgba.r)} label={t('colourRed')} inputMode="numeric" onCommit={channel('r')} />
          <DraftField visibleLabel="G" value={String(rgba.g)} label={t('colourGreen')} inputMode="numeric" onCommit={channel('g')} />
          <DraftField visibleLabel="B" value={String(rgba.b)} label={t('colourBlue')} inputMode="numeric" onCommit={channel('b')} />
          {!opaque && <DraftField visibleLabel="A %" value={String(Math.round(hsva.a * 100))} label={t('colourOpacity')} inputMode="decimal" onCommit={alphaField} />}
        </div>}
      <p className="color-code-other" aria-live="polite">{format === 'hex' ? toRgbaText(rgba) : hex.toUpperCase()}</p>
      {quick.length > 0 && <div className="color-quick" role="group" aria-label={t('colourUsed')}>
        {quick.map(color => <button key={color} type="button" className="color-chip" aria-label={color.toUpperCase()} title={color.toUpperCase()} aria-pressed={color === hex}
          onClick={() => typed(color)}><i style={{ background: color }} /></button>)}
      </div>}
    </div>, root)}
  </>;
}
