import { useEffect, useRef, useState } from 'react';
import type { MinigameSettings } from '@party/contracts';
import { Countdown, type ControllerProps } from '../shared/countdown.js';
import { useText } from '../../presentation/look.js';
import { useServerNow } from '../shared/clock.js';
import './tap-race.css';

/**
 * Tap as often as you can until the time is up. The running count goes to the
 * server a few times a second (it draws the race bars and is what the final
 * count is checked against); the final count is saved once, at the end.
 */
export function TapRace({ settings, startsAt, offset, disabled, onResult, onTaps }: ControllerProps<MinigameSettings<'tap-race'>> & { onTaps: (count: number) => void }) {
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

