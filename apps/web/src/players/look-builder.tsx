import { useEffect, useRef, useState } from 'react';
import { defaultLook, emptyDrawing, LOOK_COLORS, LOOK_PART_NAMES, LOOK_PARTS, PlayerLookSchema, type LookPart, type PlayerLook, type RoomReply } from '@party/contracts';
import { DrawingPad } from '../drawing/drawing-pad.js';
import { uploadDrawing } from '../drawing/drawing-view.js';
import { Avatar, describeLook } from './avatar.js';

const SAVED = 'party_look';
/** The look this phone used last, so a new game starts with it. */
export function savedLook(): PlayerLook | undefined {
  try { const parsed = PlayerLookSchema.safeParse(JSON.parse(localStorage.getItem(SAVED) ?? 'null')); return parsed.success ? parsed.data : undefined; } catch { return undefined; }
}
/** Remembers the character only: a picture belongs to this room. */
export function rememberLook(look: PlayerLook) { const { picture: _picture, ...parts } = look; try { localStorage.setItem(SAVED, JSON.stringify(parts)); } catch { /* only a convenience */ } }

type Tab = 'color' | LookPart | 'photo' | 'draw';
const TABS: Tab[] = ['body', 'color', 'eyes', 'mouth', 'hat', 'extra', 'photo', 'draw'];
const tabName = (tab: Tab) => tab === 'color' ? 'Colour' : tab === 'photo' ? 'Photo' : tab === 'draw' ? 'Draw' : LOOK_PART_NAMES[tab].title;
const withoutPicture = (look: PlayerLook): PlayerLook => { const { picture: _picture, ...parts } = look; return parts; };

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
async function sendPhoto(sessionId: string, file: File): Promise<string> {
  const response = await fetch(`/api/rooms/${sessionId}/picture`, { method: 'POST', credentials: 'same-origin', headers: { 'x-party-request': '1', 'content-type': 'image/png' }, body: await squarePhoto(file) });
  const reply = await response.json() as RoomReply<{ assetId: string }>; if (!reply.ok) throw new Error(reply.error.code); return reply.data.assetId;
}

/** Put a character together from built-in parts (each choice shows how it would look), or use a photo or a drawing. */
export function LookBuilder({ initial, name, busy, sessionId, onSave, onCancel }: { initial: PlayerLook; name: string; busy: boolean; sessionId: string; onSave: (look: PlayerLook) => void; onCancel: () => void }) {
  const [look, setLook] = useState(initial); const [tab, setTab] = useState<Tab>('body');
  const [drawing, setDrawing] = useState(emptyDrawing()); const [working, setWorking] = useState(false); const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null); useEffect(() => { heading.current?.focus(); }, []);
  const character = withoutPicture(look);
  const options: { key: string; label: string; look: PlayerLook }[] = tab === 'photo' || tab === 'draw' ? [] : tab === 'color'
    ? LOOK_COLORS.map((_, index) => ({ key: String(index), label: `Colour ${index + 1}`, look: { ...character, color: index } }))
    : (LOOK_PARTS[tab] as readonly string[]).map(value => ({ key: value, label: (LOOK_PART_NAMES[tab].names as Record<string, string>)[value]!, look: { ...character, [tab]: value } as PlayerLook }));
  const chosen = tab === 'color' ? String(look.color) : tab === 'photo' || tab === 'draw' ? '' : look[tab];
  const attempt = async (work: () => Promise<string>, kind: 'photo' | 'drawing') => {
    setWorking(true); setError('');
    try { const assetId = await work(); setLook({ ...look, picture: { assetId, kind } }); }
    catch (cause) { setError(cause instanceof Error && cause.message === 'UNSUPPORTED_MEDIA' ? 'That picture could not be used. Try another one.' : cause instanceof Error && cause.message === 'RATE_LIMITED' ? 'Too many pictures in a short time. Wait a moment.' : 'The picture could not be sent. Try again.'); }
    finally { setWorking(false); }
  };
  return <section className="look-builder" aria-labelledby="look-builder-heading">
    <h2 id="look-builder-heading" tabIndex={-1} ref={heading}>Your look</h2>
    <div className="look-hero"><Avatar look={look} size={132} label={`${name}: ${describeLook(look)}`} />
      <div className="actions">{look.picture ? <button type="button" className="ghost" onClick={() => setLook(character)}>Use my character</button>
        : <button type="button" className="ghost" onClick={() => setLook(defaultLook(`${Date.now()}-${Math.random()}`))}>Surprise me</button>}</div></div>
    <div className="look-tabs" role="tablist" aria-label="Part to change">{TABS.map(entry => <button key={entry} type="button" role="tab" aria-selected={tab === entry} onClick={() => setTab(entry)}>{tabName(entry)}</button>)}</div>
    {options.length > 0 && <div className={`look-options${tab === 'color' ? ' colors' : ''}`} role="radiogroup" aria-label={tabName(tab)}>
      {options.map(option => <button key={option.key} type="button" role="radio" aria-checked={chosen === option.key} aria-label={option.label} onClick={() => setLook(option.look)}>
        {tab === 'color' ? <span className="swatch" style={{ background: LOOK_COLORS[Number(option.key)] }} /> : <Avatar look={option.look} size={56} />}
        {tab !== 'color' && <span className="option-name">{option.label}</span>}</button>)}
    </div>}
    {tab === 'photo' && <div className="look-picture">
      <p>Take a selfie or pick a photo. Everyone in the room will see it; the host can remove it.</p>
      <label className="button-like">Choose a photo<input className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" capture="user" disabled={working}
        onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void attempt(() => sendPhoto(sessionId, file), 'photo'); }} /></label>
    </div>}
    {tab === 'draw' && <div className="look-picture">
      <DrawingPad value={drawing} onChange={setDrawing} maxStrokes={200} label="Draw your picture" disabled={working} />
      <button type="button" disabled={working || !drawing.strokes.length} onClick={() => { void attempt(async () => (await uploadDrawing(sessionId, 'avatar', drawing)).assetId, 'drawing'); }}>Use this drawing</button>
    </div>}
    {working && <p role="status">Sending your picture…</p>}
    {error && <p role="alert" className="error">{error}</p>}
    <div className="actions"><button type="button" className="primary" disabled={busy || working} onClick={() => onSave(look)}>Save my look</button><button type="button" className="ghost" onClick={onCancel}>Cancel</button></div>
  </section>;
}
