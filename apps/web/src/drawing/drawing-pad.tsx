import { useEffect, useId, useRef, useState } from 'react';
import { DRAWING_COLORS, DRAWING_SIZE, DRAWING_WIDTHS, MAX_DRAWING_POINTS, type Drawing, type Stroke } from '@party/contracts';
import { useTexts } from '../i18n/texts.js';
import { DRAWING_TEXTS } from './drawing.text.js';
import { useText } from '../presentation/look.js';
import { Strokes } from './drawing-view.js';
import { Icon } from '../presentation/line-icons.js';

const COLOR_NAMES = ["black","white","grey","red","orange","yellow","green","teal","blue","indigo","purple","pink","brown","skin","darkGreen","wine"] as const;
const WIDTH_NAMES = ["fine","medium","thick","huge"] as const;
/** The paper is white (palette index 1): what the eraser paints with. */
const PAPER = DRAWING_COLORS.indexOf('#ffffff');
/** Points closer than this (on the 1000 grid) are skipped: smaller drawings, same look. */
const MIN_STEP = 4;
export const countPoints = (drawing: Drawing) => drawing.strokes.reduce((sum, stroke) => sum + stroke.p.length / 2, 0);

/**
 * A square to draw on with a finger, mouse or pen. Strokes are recorded on a
 * 1000 × 1000 grid, whatever the screen size. `under` is shown beneath and
 * cannot be changed (a doodle to finish, the team's drawing so far). `blind`
 * hides the player's own strokes until they are sent. `oneStroke` ends after
 * a single stroke (Perfect circle). The eraser paints in the paper's white, so it also
 * rubs out what is `under` (every drawing is shown on white).
 */
export function DrawingPad({ value, onChange, under = [], blind = false, maxStrokes = 400, tools = true, oneStroke = false, disabled = false, label, onStrokeEnd, onStrokeProgress, bringIntoView = false }: {
  value: Drawing; onChange: (drawing: Drawing) => void; under?: readonly Drawing[]; blind?: boolean; maxStrokes?: number; tools?: boolean; oneStroke?: boolean; disabled?: boolean; label: string;
  onStrokeEnd?: (stroke: Stroke, drawing: Drawing) => void;
  /** The stroke being drawn, as it grows (number `strokeId` in the drawing): for showing it live elsewhere. */
  onStrokeProgress?: (stroke: Stroke, strokeId: number) => void;
  /** Scrolls the pad onto the screen when it appears: for timed drawing, where every second counts. */
  bringIntoView?: boolean;
}) {
  const t = useText(); const d = useTexts(DRAWING_TEXTS); const surface = useRef<SVGSVGElement>(null); const hintId = useId();
  const [color, setColor] = useState(0); const [width, setWidth] = useState(1); const [current, setCurrent] = useState<Stroke | null>(null);
  // The eraser: the paper's colour (white, palette index 1) at the chosen size.
  const [erasing, setErasing] = useState(false); const ink = erasing ? PAPER : color;
  const pointer = useRef<number | null>(null);
  // Keyboard drawing: a pen moved with the arrow keys; Space puts it down or lifts it.
  const [pen, setPen] = useState<{ x: number; y: number; active: boolean }>({ x: DRAWING_SIZE / 2, y: DRAWING_SIZE / 2, active: false });
  const grow = (stroke: Stroke) => { setCurrent(stroke); onStrokeProgress?.(stroke, value.strokes.length); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (bringIntoView) surface.current?.scrollIntoView({ block: 'center' }); }, []);
  const full = value.strokes.length >= maxStrokes || countPoints(value) >= MAX_DRAWING_POINTS - 200 || (oneStroke && value.strokes.length > 0);
  const at = (event: React.PointerEvent) => {
    const box = surface.current!.getBoundingClientRect();
    const clamp = (number: number) => Math.max(0, Math.min(DRAWING_SIZE, Math.round(number)));
    return [clamp((event.clientX - box.left) / box.width * DRAWING_SIZE), clamp((event.clientY - box.top) / box.height * DRAWING_SIZE)] as const;
  };
  const start = (event: React.PointerEvent) => {
    if (disabled || full || pointer.current !== null) return;
    event.preventDefault(); surface.current!.setPointerCapture(event.pointerId); pointer.current = event.pointerId;
    const [x, y] = at(event); grow({ c: oneStroke ? 0 : ink, w: oneStroke ? 10 : DRAWING_WIDTHS[width]!, p: [x, y] });
  };
  const move = (event: React.PointerEvent) => {
    if (pointer.current !== event.pointerId || !current) return;
    // Coalesced events keep fast strokes smooth on phones.
    const events = 'getCoalescedEvents' in event.nativeEvent ? (event.nativeEvent as PointerEvent).getCoalescedEvents() : [];
    let points = current.p;
    for (const sample of events.length ? events : [event.nativeEvent]) {
      const [x, y] = at(sample as unknown as React.PointerEvent);
      const lastX = points[points.length - 2]!; const lastY = points[points.length - 1]!;
      if (Math.hypot(x - lastX, y - lastY) >= MIN_STEP && points.length < 1998) points = [...points, x, y];
    }
    if (points !== current.p) grow({ ...current, p: points });
  };
  const finish = () => { if (current) { const next = { ...value, strokes: [...value.strokes, current] }; onChange(next); onStrokeEnd?.(current, next); } setCurrent(null); };
  const end = (event: React.PointerEvent) => { if (pointer.current !== event.pointerId) return; pointer.current = null; finish(); };
  // Locked mid-line (time is up): the line drawn so far is kept instead of lost.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (disabled && current) { pointer.current = null; finish(); } }, [disabled]);
  const key = (event: React.KeyboardEvent) => {
    if (disabled) return;
    const step = event.shiftKey ? 50 : 10; const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = moves[event.key];
    if (move) {
      event.preventDefault(); const x = Math.max(0, Math.min(DRAWING_SIZE, pen.x + move[0])); const y = Math.max(0, Math.min(DRAWING_SIZE, pen.y + move[1]));
      setPen({ ...pen, x, y, active: true });
      if (current && pointer.current === null) grow({ ...current, p: [...current.p, x, y].slice(0, 2000) });
    } else if (event.key === ' ') {
      event.preventDefault(); setPen({ ...pen, active: true });
      if (current && pointer.current === null) finish();
      else if (!full && pointer.current === null) grow({ c: oneStroke ? 0 : ink, w: oneStroke ? 10 : DRAWING_WIDTHS[width]!, p: [pen.x, pen.y] });
    } else if ((event.key === 'Enter' || event.key === 'Escape') && current && pointer.current === null) { event.preventDefault(); finish(); }
  };
  const cannotEdit = disabled || !value.strokes.length;
  const undo = () => onChange({ ...value, strokes: value.strokes.slice(0, -1) });
  const clear = () => onChange({ ...value, strokes: [] });
  return <div className={`drawing-pad${blind ? ' blind' : ''}${disabled ? ' disabled' : ''}${erasing ? ' erasing' : ''}`}>
    {/* Impossible to miss: in a blind round your own lines stay hidden until you send the drawing. */}
    {blind && <p className="blind-banner"><span aria-hidden="true">🙈</span><strong>{t('drawing.blindTitle')}</strong><small>{t('drawing.blindHint')}</small></p>}
    <svg ref={surface} className="drawing-surface" viewBox={`0 0 ${DRAWING_SIZE} ${DRAWING_SIZE}`} role="application" aria-roledescription={d('area')} aria-label={label}
      aria-describedby={hintId} tabIndex={disabled ? -1 : 0} onKeyDown={key} onBlur={() => setPen(previous => ({ ...previous, active: false }))}
      onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <rect width={DRAWING_SIZE} height={DRAWING_SIZE} fill="#ffffff" />
      {under.map((drawing, index) => <Strokes key={index} strokes={drawing.strokes} />)}
      {!blind && <Strokes strokes={value.strokes} />}
      {!blind && current && <Strokes strokes={[current]} />}
      {pen.active && <g className="drawing-pen" aria-hidden="true"><circle cx={pen.x} cy={pen.y} r={current ? 14 : 18} fill={current ? DRAWING_COLORS[ink] : 'none'} stroke="#6d3fd6" strokeWidth={4} /></g>}
    </svg>
    <p id={hintId} className="drawing-keys">{d('keyboard')}</p>
    {blind && <p className="drawing-note">{t('drawing.blind')} · {value.strokes.length + (current ? 1 : 0)}</p>}
    {tools && <div className="drawing-tools">
      <div className="drawing-colors" role="radiogroup" aria-label={t('drawing.colour')}>{DRAWING_COLORS.map((swatch, index) => <button key={swatch} type="button" role="radio" aria-checked={!erasing && color === index} aria-label={d(COLOR_NAMES[index]!)}
        style={{ background: swatch }} onClick={() => { setColor(index); setErasing(false); }} />)}</div>
      {/* Sizes, the eraser (it rubs out at the chosen size), undo and start over. On a short screen they share one row
          as icons (names stay as tooltips and for screen readers), so the drawing keeps its room. */}
      <div className="drawing-row">
        <div className="drawing-widths" role="radiogroup" aria-label={t('drawing.size')}>{DRAWING_WIDTHS.map((size, index) => <button key={size} type="button" role="radio" aria-checked={width === index} aria-label={d(WIDTH_NAMES[index]!)} onClick={() => setWidth(index)}>
          <span style={{ width: Math.max(4, size / 2), height: Math.max(4, size / 2), background: DRAWING_COLORS[ink] }} /></button>)}
          <button type="button" className="drawing-eraser" aria-pressed={erasing} disabled={disabled} title={d('eraser')} onClick={() => setErasing(!erasing)}><Icon name="eraser" size={18} /><span className="tool-label">{d('eraser')}</span></button></div>
        <div className="drawing-actions"><button type="button" className="ghost small-button" disabled={cannotEdit} title={t('drawing.undo')} onClick={undo}><Icon name="undo" size={18} /><span className="tool-label">{t('drawing.undo')}</span></button>
          <button type="button" className="ghost small-button" disabled={cannotEdit} title={t('drawing.clear')} onClick={clear}><Icon name="restart" size={18} /><span className="tool-label">{t('drawing.clear')}</span></button></div>
      </div>
    </div>}
  </div>;
}
