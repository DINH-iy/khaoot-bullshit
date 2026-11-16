import { useEffect, useRef, useState } from 'react';
import type { RoomSnapshot, TextKey } from '@party/contracts';
import { useText } from '../presentation/look.js';
import { Avatar } from '../players/avatar.js';
import './room-extras.css';

type View = RoomSnapshot['view'];
const WHEEL_COLORS = ['var(--a1)', 'var(--a2)', 'var(--a3)', 'var(--a4)', 'var(--a5)', 'var(--a6)', 'var(--a7)', 'var(--a8)'];

/** A break: the game is paused for everyone. Covers every screen until the host continues. */
export function BreakOverlay({ state, host, disabled, onContinue }: { state: RoomSnapshot; host: boolean; disabled: boolean; onContinue: () => void }) {
  const t = useText(); const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  if (!state.break.active) return null;
  const minutes = state.break.startedAt ? Math.max(0, Math.floor((now - Date.parse(state.break.startedAt)) / 60_000)) : 0;
  return <div className="break-overlay" role="dialog" aria-modal="true" aria-labelledby="break-title">
    <p className="break-icon" aria-hidden="true">{t('break.icon')}</p>
    <h2 id="break-title">{t('break.title')}</h2>
    <p>{t('break.text')}</p>
    {minutes > 0 && <p className="break-time">{minutes} min</p>}
    {host && <button className="primary big" disabled={disabled} onClick={onContinue}>{t('break.host')}</button>}
  </div>;
}

/**
 * The wheel of fortune. A fresh spin covers the screen: the wheel turns for
 * its set time and stops on the entry the server picked. Afterwards the
 * result stays small in a corner ("Now: …") until the next spin.
 */
export function WheelOverlay({ wheel, offset }: { wheel: View['wheel']; offset: number }) {
  const spin = wheel.spin; const [now, setNow] = useState(() => Date.now() + offset);
  const spunAt = spin ? Date.parse(spin.spunAt) : 0; const showFor = spin ? spin.seconds * 1000 + 3500 : 0;
  useEffect(() => {
    if (!spin) return; setNow(Date.now() + offset);
    const timer = setInterval(() => setNow(Date.now() + offset), 250); return () => clearInterval(timer);
  }, [spin?.spunAt, offset]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!spin || now - spunAt > showFor || now < spunAt - 2000) return null;
  const count = spin.entries.length; const slice = 360 / count; const done = now - spunAt >= spin.seconds * 1000;
  // Several full turns, ending with the picked slice under the pointer at the top.
  const turn = 360 * 6 - (spin.index * slice + slice / 2);
  const gradient = `conic-gradient(${spin.entries.map((_, index) => `${WHEEL_COLORS[index % WHEEL_COLORS.length]} ${index * slice}deg ${(index + 1) * slice}deg`).join(', ')})`;
  return <div className="wheel-overlay" role="status" aria-label={done ? `${spin.title}: ${spin.label}` : spin.title}>
    <p className="wheel-title">{spin.title}</p>
    <div className="wheel-frame"><span className="wheel-pointer" aria-hidden="true" />
      <div className="wheel-disc" key={spin.spunAt} style={{ background: gradient, '--turn': `${turn}deg`, '--spin-time': `${spin.seconds}s` } as React.CSSProperties} aria-hidden="true">
        {spin.entries.map((label, index) => <span key={index} className="wheel-label" style={{ transform: `rotate(${index * slice + slice / 2}deg) translateY(-34%)` }}><i>{label.length > 18 ? `${label.slice(0, 17)}…` : label}</i></span>)}
      </div></div>
    <p className={`wheel-result${done ? ' shown' : ''}`}>{done ? spin.label : '…'}</p>
  </div>;
}
/** The last wheel result, small in a corner of the shared screen and as a line on phones. */
export function WheelBadge({ wheel }: { wheel: View['wheel'] }) {
  const t = useText(); if (!wheel.current) return null;
  return <p className="wheel-badge"><span>{wheel.current.title}</span><strong>{t('wheel.current', { result: wheel.current.label })}</strong></p>;
}

/** The end-of-game show: one award per slide, moving on by itself; anyone can also step through it. */
export function FinaleShow({ state }: { state: RoomSnapshot }) {
  const t = useText(); const slides = state.view.awards ?? []; const [at, setAt] = useState(0);
  // Swipe or tap through the awards. Playing them by itself is a choice on each screen: on for the shared screen (nobody
  // touches a TV), off on phones and for the host.
  const [auto, setAuto] = useState(state.role === 'display');
  useEffect(() => { if (!auto || slides.length < 2) return; const timer = setInterval(() => setAt(value => (value + 1) % slides.length), 6000); return () => clearInterval(timer); }, [auto, slides.length]);
  const startX = useRef<number | null>(null);
  if (!slides.length) return null;
  const go = (step: number) => setAt(value => (value + step + slides.length) % slides.length);
  const slide = slides[Math.min(at, slides.length - 1)]!;
  const players = slide.playerIds.map(id => state.players.find(player => player.id === id)).filter(player => player !== undefined);
  return <section className="finale" aria-labelledby="finale-heading"
    onPointerDown={event => { startX.current = event.clientX; }}
    onPointerUp={event => { const from = startX.current; startX.current = null; if (from === null) return; const dx = event.clientX - from; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); }}>
    <h2 id="finale-heading">{t('stat.title')}</h2>
    <div className="finale-slide" key={slide.stat} aria-live="polite">
      <p className="finale-stat">{t(`stat.${slide.stat}` as TextKey)}</p>
      <div className="finale-people">{players.length ? players.map(player => <span key={player.id}><Avatar look={player.look} size={84} /><strong>{player.displayName}</strong></span>) : <strong>—</strong>}</div>
      <p className="finale-value">{slide.value}</p>
    </div>
    {slides.length > 1 && <div className="finale-nav">
      <button type="button" className="finale-step" aria-label="Previous award" onClick={() => go(-1)}>‹</button>
      <span className="finale-count">{Math.min(at, slides.length - 1) + 1} / {slides.length}</span>
      <button type="button" className="finale-step" aria-label="Next award" onClick={() => go(1)}>›</button>
      <button type="button" className="finale-auto" aria-pressed={auto} onClick={() => setAuto(value => !value)}>{auto ? '⏸ Stop auto-play' : '▶ Auto-play'}</button>
    </div>}
    {slides.length > 1 && <div className="finale-dots" role="group" aria-label="Awards">{slides.map((entry, index) => <button key={entry.stat} type="button" aria-pressed={index === at} aria-label={t(`stat.${entry.stat}` as TextKey)} onClick={() => setAt(index)} />)}</div>}
  </section>;
}
