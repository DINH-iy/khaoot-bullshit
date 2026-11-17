import { useText } from '../presentation/look.js';
import { useEffect, useState } from 'react';
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
  const deadline = stage?.status === 'ACTIVE' && stage.deadlineAt ? Date.parse(stage.deadlineAt) : null;
  const read = () => deadline === null ? null : Math.max(0, deadline - (Date.now() + clockOffset));
  const [remaining, setRemaining] = useState(read);
  useEffect(() => {
    setRemaining(read());
    if (deadline === null) return;
    const interval = setInterval(() => setRemaining(read()), 250);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, clockOffset]);
  if (stage?.status === 'ACTIVE' && stage.pausedRemainingMs !== null) return stage.pausedRemainingMs;
  return remaining;
}
export function StageTimer({ stage, remaining }: { stage: Stage; remaining: number | null }) {
  const t = useText();
  if (stage.status !== 'ACTIVE') return null;
  const paused = stage.pausedRemainingMs !== null;
  const text = remaining === null ? t('timer.none') : paused ? t('timer.paused', { time: formatRemaining(remaining) }) : remaining > 0 ? t('timer.left', { time: formatRemaining(remaining) }) : t('timer.up');
  // role=timer is not announced on every tick; the ending is announced separately.
  return <p className={`timer${remaining !== null && remaining <= 5000 && !paused ? ' timer-ending' : ''}`}>
    <span role="timer" aria-label="Time left">{text}</span>
    <span className="visually-hidden" role="status">{remaining === 0 && !paused ? 'Time is up.' : ''}</span>
  </p>;
}
