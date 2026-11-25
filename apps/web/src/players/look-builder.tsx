import { useEffect, useRef, useState } from 'react';
import { seatHeaders } from '../room/test-seat.js';
import { defaultLook, emptyDrawing, LOOK_COLORS, LOOK_PARTS, PlayerLookSchema, type LookPart, type PlayerLook, type RoomReply } from '@party/contracts';
import { DrawingPad } from '../drawing/drawing-pad.js';
import { uploadDrawing } from '../drawing/drawing-view.js';
import { useTexts } from '../i18n/texts.js';
import { describeLook, partName } from './character-parts.text.js';
import { BUILDER_TEXTS } from './look-builder.text.js';
import { Avatar } from './avatar.js';

const SAVED = 'party_look';
/** The look this phone used last, so a new game starts with it. */
export function savedLook(): PlayerLook | undefined {
  try { const parsed = PlayerLookSchema.safeParse(JSON.parse(localStorage.getItem(SAVED) ?? 'null')); return parsed.success ? parsed.data : undefined; } catch { return undefined; }
}
/** Remembers the character only: a picture belongs to this room. */
export function rememberLook(look: PlayerLook) { const { picture: _picture, ...parts } = look; try { localStorage.setItem(SAVED, JSON.stringify(parts)); } catch { /* only a convenience */ } }

type Tab = 'color' | LookPart | 'photo' | 'draw';
const PARTS = ['body', 'color', 'eyes', 'mouth', 'hat', 'extra', 'beard', 'piercing', 'marks'] as const;
const MODES = ['body', 'photo', 'draw'] as const;
const withoutPicture = (look: PlayerLook): PlayerLook => { const { picture: _picture, ...parts } = look; return parts; };
/** "Surprise me": a random character, now and then with facial hair, a piercing or a tattoo. */
function surprise(): PlayerLook {
  const pick = <K extends 'beard' | 'piercing' | 'marks'>(key: K) => { const list = (LOOK_PARTS[key] as readonly string[]).filter(entry => entry !== 'none'); return (Math.random() < 0.3 ? list[Math.floor(Math.random() * list.length)] : undefined) as PlayerLook[K]; };
  const look: PlayerLook = defaultLook(`${Date.now()}-${Math.random()}`);
  const beard = pick('beard'); const piercing = pick('piercing'); const marks = pick('marks');
  return { ...look, ...(beard ? { beard } : {}), ...(piercing ? { piercing } : {}), ...(marks ? { marks } : {}) };
}

/**
 * A square photo for the player's picture: cropped from the middle and drawn
 * again on a small canvas, which also leaves out what the camera stored in the
 * file (such as the location). The server keeps only the image itself.
 */
async function squarePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const side = Math.min(bitmap.width, bitmap.height); const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  canvas.getContext('2d')!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256); bitmap.close();
  const blob = await new Promise<Blob | null>(done => canvas.toBlob(done, 'image/png'));
  if (!blob) throw new Error('UNSUPPORTED_MEDIA'); return blob;
}
export async function sendPhoto(sessionId: string, file: File, playerId?: string): Promise<string> {
  const response = await fetch(`/api/rooms/${sessionId}/picture${playerId ? `?playerId=${playerId}` : ''}`, { method: 'POST', credentials: 'same-origin', headers: { 'x-party-request': '1', ...seatHeaders(), 'content-type': 'image/png' }, body: await squarePhoto(file) });
  const reply = await response.json() as RoomReply<{ assetId: string }>; if (!reply.ok) throw new Error(reply.error.code); return reply.data.assetId;
}

/**
 * Put a character together from built-in parts (each choice shows how it would look), or use a photo or a drawing.
 * With `confirm` (a room setting) nothing is used until "Save my look". Without it every choice is used at once
 * (`onApply`), and a drawing in progress is used when the player is done or `finishSignal` changes (the game starts).
 */
export function LookBuilder({ initial, name, busy, sessionId, onSave, onCancel, confirm = true, onApply, finishSignal = 0 }: { initial: PlayerLook; name: string; busy: boolean; sessionId: string; onSave: (look: PlayerLook) => void; onCancel: () => void; confirm?: boolean; onApply?: (look: PlayerLook) => void; finishSignal?: number }) {
  const t = useTexts(BUILDER_TEXTS);
  const [look, setLookState] = useState(initial); const [tab, setTab] = useState<Tab>('body');
  const mode = tab === 'photo' || tab === 'draw' ? tab : 'body';
  const lastPart = useRef<typeof PARTS[number]>('body');
  const [draftPhoto, setDraftPhoto] = useState<PlayerLook['picture']>();
  const [drawing, setDrawingState] = useState(emptyDrawing()); const [working, setWorking] = useState(false); const [error, setError] = useState('');
  // Used at once (debounced, so tapping through options sends one change), unless the room wants a confirmation.
  const applyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const setLook = (next: PlayerLook) => { setLookState(next); if (confirm || !onApply) return; clearTimeout(applyTimer.current); applyTimer.current = setTimeout(() => onApply(next), 500); };
  useEffect(() => () => clearTimeout(applyTimer.current), []);
  // A drawing that has changed since it was last sent.
  const [drawn, setDrawn] = useState(false); const setDrawing = (next: typeof drawing) => { setDrawingState(next); setDrawn(true); };
  const heading = useRef<HTMLHeadingElement>(null); useEffect(() => { heading.current?.focus(); }, []);
  const character = withoutPicture(look);
  const shown = tab === 'photo' && draftPhoto ? { ...look, picture: draftPhoto } : look;
  const options: { key: string; label: string; look: PlayerLook }[] = tab === 'photo' || tab === 'draw' ? [] : tab === 'color'
    ? LOOK_COLORS.map((_, index) => ({ key: String(index), label: t('colorNumber', { number: index + 1 }), look: { ...character, color: index } }))
    : LOOK_PARTS[tab].map(value => ({ key: value, label: partName(tab, value), look: { ...character, [tab]: value } as PlayerLook }));
  const chosen = tab === 'color' ? String(look.color) : tab === 'photo' || tab === 'draw' ? '' : look[tab] ?? 'none';
  const attempt = async (work: () => Promise<string>, kind: 'photo' | 'drawing') => {
    setWorking(true); setError('');
    try {
      const assetId = await work();
      const next: PlayerLook = { ...look, picture: { assetId, kind } };
      if (kind === 'photo' && confirm) setDraftPhoto(next.picture);
      else setLook(next);
      if (kind === 'drawing') setDrawn(false);
      return next;
    }
    catch (cause) { setError(cause instanceof Error && cause.message === 'UNSUPPORTED_MEDIA' ? t('unsupported') : cause instanceof Error && cause.message === 'RATE_LIMITED' ? t('limited') : t('failed')); }
    finally { setWorking(false); }
    return null;
  };
  // Finish the active tab. A draft on another tab does not take over the selected look.
  const finish = async () => {
    clearTimeout(applyTimer.current);
    if (working) return;
    if (tab === 'draw' && drawn && drawing.strokes.length) {
      const sent = await attempt(async () => (await uploadDrawing(sessionId, 'avatar', drawing)).assetId, 'drawing');
      if (sent) onSave(sent);
      return;
    }
    onSave(tab === 'photo' && draftPhoto ? { ...look, picture: draftPhoto } : look);
  };
  // The game starts while the look is open: use what there is and close.
  const firstSignal = useRef(finishSignal);
  useEffect(() => {
    if (finishSignal === firstSignal.current || confirm || working) return;
    firstSignal.current = finishSignal;
    void finish();
  }, [finishSignal, confirm, working]);
  return <section className="look-builder" aria-labelledby="look-builder-heading">
    <header className="look-header">
      <h2 id="look-builder-heading" tabIndex={-1} ref={heading}>{t('yourLook')}</h2>
      <div className="look-tabs look-modes" role="tablist" aria-label={t('style')}>{MODES.map(entry =>
        <button key={entry} type="button" role="tab" disabled={working} aria-selected={mode === entry}
          onClick={() => setTab(entry === 'body' ? lastPart.current : entry)}>{t(entry)}</button>)}</div>
    </header>
    <div className="look-content">
      {mode !== 'draw' && <div className="look-hero"><Avatar look={shown} size={90} label={`${name}: ${describeLook(shown)}`} />
        <div className="actions">{shown.picture ? <button type="button" className="ghost" onClick={() => { setDraftPhoto(undefined); setLook(character); }}>{t('character')}</button>
          : <button type="button" className="ghost" onClick={() => setLook(surprise())}>{t('surprise')}</button>}</div></div>}
      {mode === 'body' && <div className="look-tabs look-parts" role="tablist" aria-label={t('part')}>{PARTS.map(entry =>
        <button key={entry} type="button" role="tab" aria-selected={tab === entry} onClick={() => {
          lastPart.current = entry;
          setTab(entry);
        }}>{t(entry === 'body' ? 'shape' : entry)}</button>)}</div>}
      {options.length > 0 && <div className={`look-options${tab === 'color' ? ' colors' : ''}`} role="radiogroup" aria-label={t(tab)}>
        {options.map(option => <button key={option.key} type="button" role="radio" aria-checked={chosen === option.key} aria-label={option.label} onClick={() => setLook(option.look)}>
          {tab === 'color' ? <span className="swatch" style={{ background: LOOK_COLORS[Number(option.key)] }} /> : <Avatar look={option.look} size={56} />}
          {tab !== 'color' && <span className="option-name">{option.label}</span>}</button>)}
      </div>}
      {tab === 'photo' && <div className="look-picture">
        <p>{t('photoHint')}</p>
        <label className="button-like">{t('choosePhoto')}<input className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" capture="user" disabled={working}
          onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void attempt(() => sendPhoto(sessionId, file), 'photo'); }} /></label>
      </div>}
      {tab === 'draw' && <div className="look-picture">
        <DrawingPad value={drawing} onChange={setDrawing} maxStrokes={200} label={t('drawPicture')} disabled={working} />
      </div>}
    </div>
    <footer className="look-footer">
      {working && <p role="status">{t('sending')}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <div className="actions">
        {confirm && <button type="button" className="ghost" disabled={working} onClick={onCancel}>{t('cancel')}</button>}
        <button type="button" className="primary" disabled={busy || working} onClick={() => void finish()}>
          {tab === 'draw' && drawn && drawing.strokes.length ? t('useDrawing') : t(confirm ? 'save' : 'done')}
        </button>
      </div>
    </footer>
  </section>;
}
