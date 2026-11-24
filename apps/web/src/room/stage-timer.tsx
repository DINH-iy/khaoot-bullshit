import { useLook, useText } from '../presentation/look.js';
import { useEffect, useRef, useState } from 'react';
import { translate } from '../i18n/texts.js';
import { EXTRAS_TEXTS } from './extras.text.js';
const x = (key: keyof typeof EXTRAS_TEXTS.en, values?: Record<string, string | number>) => translate(EXTRAS_TEXTS, key, values);
import type { RoomSnapshot } from '@party/contracts';

type Stage = NonNullable<RoomSnapshot['view']['stage']>;
export function formatRemaining(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
/**
 * Nominal time left on the server clock, or null when the stage has no limit.
 * `clockOffset` is server time minus this device's time, so a wrong phone
 * clock cannot shorten or lengthen what the player sees.
 */
export function useRemaining(stage: Stage | null | undefined, clockOffset: number): number | null {
  const deadline = stage?.deadlineAt ? Date.parse(stage.deadlineAt) : null;
  const read = () => deadline === null ? null : Math.max(0, deadline - (Date.now() + clockOffset));
  const [remaining, setRemaining] = useState(read);
  useEffect(() => {
    setRemaining(read());
    if (deadline === null) return;
    const interval = setInterval(() => setRemaining(read()), 250);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, clockOffset]);
  if (stage?.pausedRemainingMs != null) return stage.pausedRemainingMs;
  return remaining;
}
/** The last seconds: the clock pulses red, and flashes red once time is up. */
export const ENDING_MS = 5000;
export function StageTimer({ stage, remaining }: { stage: Stage; remaining: number | null }) {
  const t = useText(); const { theme } = useLook();
  // The whole of this timer: the scene's own length, or more when the host added time (the most ever left).
  const longest = useRef<{ id: string; ms: number }>({ id: '', ms: 0 });
  if (longest.current.id !== stage.id) longest.current = { id: stage.id, ms: 0 };
  if (remaining !== null) longest.current.ms = Math.max(longest.current.ms, remaining);
  if (stage.status !== 'ACTIVE' && !stage.deadlineAt && stage.pausedRemainingMs === null) return null;
  const paused = stage.pausedRemainingMs !== null;
  const text = remaining === null ? t('timer.none') : paused ? t('timer.paused', { time: formatRemaining(remaining) }) : remaining > 0 ? t('timer.left', { time: formatRemaining(remaining) }) : t('timer.up');
  const ending = remaining !== null && remaining <= ENDING_MS && !paused;
  const clock = theme.timerStyle === 'clock' && remaining !== null;
  // role=timer is not announced on every tick; the ending is announced separately.
  return <p className={`timer${ending ? ' timer-ending' : ''}${clock ? ' timer-as-clock' : ''}`} title={clock ? text : undefined}>
    {clock && <ClockFace left={remaining} total={Math.max(stage.timerMs ?? 0, longest.current.ms, 1)} ending={ending} up={remaining === 0 && !paused} paused={paused} clockwise={theme.timerTurn !== 'counterclockwise'} />}
    <span role="timer" aria-label={x('timeLeft')} className={clock ? 'visually-hidden' : 'timer-text'}>{text}</span>
    {/* Narrow phones: just the time (“1:27”), so the top bar stays on one line; the full text is still read out. */}
    {!clock && remaining !== null && remaining > 0 && !paused && <span className="timer-short" aria-hidden="true">{formatRemaining(remaining)}</span>}
    <span className="visually-hidden" role="status">{remaining === 0 && !paused ? x('timeUp') : ''}</span>
  </p>;
}

/**
 * A round clock: the coloured slice is the time left, the empty rest is time gone. Time runs out from the top,
 * clockwise like a clock hand (or the other way). In the last seconds the slice pulses red; when time is up the
 * empty clock flashes red. Shown instead of the numbers when the look asks for it.
 */
export function ClockFace({ left, total, ending, up, paused = false, clockwise = true }: { left: number; total: number; ending: boolean; up: boolean; paused?: boolean; clockwise?: boolean }) {
  const share = Math.max(0, Math.min(1, left / total));
  const r = 13; const point = (turn: number) => `${(16 + r * Math.sin(turn * 2 * Math.PI)).toFixed(2)} ${(16 - r * Math.cos(turn * 2 * Math.PI)).toFixed(2)}`;
  const large = share > .5 ? 1 : 0;
  // Clockwise: the gone part grows clockwise from the top, so what is left runs from the hand on to the top.
  const slice = share >= .999 ? null : clockwise ? `M16 16 L${point(1 - share)} A${r} ${r} 0 ${large} 1 16 ${16 - r} Z` : `M16 16 L16 ${16 - r} A${r} ${r} 0 ${large} 1 ${point(share)} Z`;
  return <svg className={`timer-clock${ending ? ' ending' : ''}${up ? ' up' : ''}${paused ? ' paused' : ''}`} viewBox="0 0 32 32" aria-hidden="true">
    <circle className="timer-clock-face" cx="16" cy="16" r="15" />
    {share > 0 && (slice ? <path className="timer-clock-slice" d={slice} /> : <circle className="timer-clock-slice" cx="16" cy="16" r={r} />)}
    <circle className="timer-clock-hub" cx="16" cy="16" r="2.2" />
  </svg>;
}
