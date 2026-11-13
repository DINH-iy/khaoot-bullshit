import { useEffect, useRef, useState } from 'react';
import { emptyDrawing, MINIGAME_COUNTDOWN_MS, type MinigameSettings } from '@party/contracts';
import { DrawingPad } from '../drawing/drawing-pad.js';
import { useText } from '../presentation/look.js';
import { useServerNow } from './clock.js';

export interface Result { value: number; early?: true; stroke?: number[]; teamId?: string }
interface Props<S> { settings: S; startsAt: string; goAt: string | null; offset: number; disabled: boolean; onResult: (result: Result) => void }

/** "3, 2, 1" until play starts, the same moment on every phone. Renders children once it has. */
export function Countdown({ startsAt, offset, children }: { startsAt: string; offset: number; children: React.ReactNode }) {
  const t = useText(); const now = useServerNow(offset, true); const left = Date.parse(startsAt) - now;
  if (left > 0) return <div className="mg-countdown" role="timer" aria-label="Starts in"><span>{t('minigame.getReady')}</span><strong key={Math.ceil(left / 1000)}>{Math.min(Math.ceil(left / 1000), MINIGAME_COUNTDOWN_MS / 1000)}</strong></div>;
  return <>{children}</>;
}

/**
 * Wait for GO, then tap. GO is never known in advance: it appears when the
 * server announces it, and the phone times the tap from the first frame that shows it.
 */
export function ReactionPad({ startsAt, goAt, offset, disabled, onResult }: Props<MinigameSettings<'reaction'>>) {
  const t = useText(); const go = goAt !== null; const shownAt = useRef<number | null>(null); const done = useRef(false);
  useEffect(() => { if (go) requestAnimationFrame(() => { shownAt.current = performance.now(); }); }, [go]);
  const tap = () => {
    if (done.current || disabled) return; done.current = true;
    if (!go || shownAt.current === null) onResult({ value: 0, early: true });
    else onResult({ value: Math.max(1, Math.round(performance.now() - shownAt.current)) });
  };
  return <Countdown startsAt={startsAt} offset={offset}>
    <button type="button" className={`mg-pad ${go ? 'go' : 'wait'}`} onPointerDown={tap} onKeyDown={event => { if (!event.repeat && (event.key === ' ' || event.key === 'Enter')) { event.preventDefault(); tap(); } }}>
      {go ? t('minigame.go') : t('minigame.wait')}</button>
  </Countdown>;
}

/**
 * Tap as often as you can until the time is up. The running count goes to the
 * server a few times a second (it draws the race bars and is what the final
 * count is checked against); the final count is saved once, at the end.
 */
export function TapRace({ settings, startsAt, offset, disabled, onResult, onTaps }: Props<MinigameSettings<'tap-race'>> & { onTaps: (count: number) => void }) {
  const t = useText(); const [taps, setTaps] = useState(0); const count = useRef(0); const sent = useRef(false); const reported = useRef(0);
  const end = Date.parse(startsAt) + settings.seconds * 1000; const now = useServerNow(offset, true);
  const over = now >= end; const started = now >= Date.parse(startsAt);
  useEffect(() => {
    if (!started || over) return;
    const timer = setInterval(() => { if (count.current !== reported.current) { reported.current = count.current; onTaps(count.current); } }, 250);
    return () => clearInterval(timer);
  }, [started, over, onTaps]);
  useEffect(() => { if (over && !sent.current) { sent.current = true; onTaps(count.current); onResult({ value: count.current }); } }, [over, onResult, onTaps]);
  const tap = () => { if (over || disabled) return; count.current = Math.min(count.current + 1, settings.seconds * 16); setTaps(count.current); };
  return <Countdown startsAt={startsAt} offset={offset}>
    <p className="mg-big" aria-live="off">{taps}</p>
    <p className="mg-sub">{t('timer.left', { time: `${Math.max(0, (end - now) / 1000).toFixed(1)} s` })}</p>
    <button type="button" className="mg-pad go" disabled={over} onPointerDown={tap} onKeyDown={event => { if (!event.repeat && (event.key === ' ' || event.key === 'Enter')) { event.preventDefault(); tap(); } }}>{t('minigame.tap')}</button>
  </Countdown>;
}

/** A clock counts up from the start and vanishes; stop it at the target. */
export function StopClock({ settings, startsAt, offset, disabled, onResult }: Props<MinigameSettings<'stop-clock'>>) {
  const t = useText(); const now = useServerNow(offset, true); const sent = useRef(false);
  const elapsed = Math.max(0, now - Date.parse(startsAt)); const visible = elapsed < settings.visibleMs;
  const stop = () => { if (sent.current || disabled) return; sent.current = true; onResult({ value: Math.round(Date.now() + offset - Date.parse(startsAt)) }); };
  return <Countdown startsAt={startsAt} offset={offset}>
    <p className="mg-sub">Target: <strong>{(settings.targetMs / 1000).toFixed(2)} s</strong></p>
    <p className="mg-big mg-clock" aria-live="off">{visible ? (elapsed / 1000).toFixed(2) : '??.??'}</p>
    <button type="button" className="mg-pad stop" onClick={stop}>{t('minigame.stop')}</button>
  </Countdown>;
}

/** Choose one of the doors. */
export function LuckyDoors({ settings, startsAt, offset, disabled, onResult }: Props<MinigameSettings<'lucky-doors'>>) {
  const t = useText(); const [picked, setPicked] = useState<number | null>(null);
  return <Countdown startsAt={startsAt} offset={offset}>
    <p className="mg-sub">{t('minigame.pickDoor')}</p>
    <div className="mg-doors">{settings.doorsMilli.map((_, index) => <button key={index} type="button" className="mg-door" disabled={disabled || picked !== null}
      onClick={() => { setPicked(index); onResult({ value: index }); }}>{t('minigame.door', { number: index + 1 })}</button>)}</div>
  </Countdown>;
}

/** Keeps at most `max` points of a stroke, evenly spread (the server scores the shape, not every pixel). */
const thin = (points: readonly number[], max: number) => {
  const count = points.length / 2; if (count <= max) return [...points];
  return Array.from({ length: max }, (_, index) => { const at = Math.round(index * (count - 1) / (max - 1)); return [points[2 * at]!, points[2 * at + 1]!]; }).flat();
};
/** Draw one circle in one go; the server measures how round it is. */
export function PerfectCircle({ settings, startsAt, offset, disabled, onResult }: Props<MinigameSettings<'perfect-circle'>>) {
  const t = useText(); const [drawing, setDrawing] = useState(emptyDrawing()); const sent = useRef(false);
  const now = useServerNow(offset, true); const end = Date.parse(startsAt) + settings.seconds * 1000; const over = now >= end;
  return <Countdown startsAt={startsAt} offset={offset}>
    <p className="mg-sub">{t('minigame.drawCircle')} · {t('timer.left', { time: `${Math.max(0, (end - now) / 1000).toFixed(1)} s` })}</p>
    <DrawingPad value={drawing} onChange={setDrawing} tools={false} oneStroke disabled={disabled || over} label="Your circle" bringIntoView
      onStrokeEnd={stroke => { if (sent.current) return; sent.current = true; const points = stroke.p.length >= 24 ? thin(stroke.p, 400) : [...stroke.p, ...Array.from({ length: 24 - stroke.p.length }, () => stroke.p[0]!)]; onResult({ value: 0, stroke: points }); }} />
  </Countdown>;
}
