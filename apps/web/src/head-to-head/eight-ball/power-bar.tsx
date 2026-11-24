import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { defineTexts, useTexts } from '../../i18n/texts.js';

const TEXTS = defineTexts('pool-power-bar', {
  power: 'Power', hint: 'Pull down and let go to shoot',
}, {
  nl: { power: 'Kracht', hint: 'Trek omlaag en laat los om te stoten' },
  de: { power: 'Stärke', hint: 'Nach unten ziehen und loslassen zum Stoßen' },
  ro: { power: 'Putere', hint: 'Trage în jos și dă drumul pentru a lovi' },
});

/** Below this the pull counts as a cancel, so a slip of the finger never shoots. */
const MIN_SHOT = 3;
const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

/**
 * The power bar beside the table: drag the cue down the bar and release to shoot.
 * The table shows the cue pulled back while dragging. Keys set the power; Enter or
 * Space shoots with it.
 */
export function PoolPowerBar({ power, disabled, sideways, onPull, onPower, onShoot }: {
  power: number; disabled: boolean; sideways: boolean;
  onPull: (power: number | undefined) => void; onPower: (power: number) => void; onShoot: (power: number) => void;
}) {
  const t = useTexts(TEXTS);
  const drag = useRef<{ pointerId: number; start: number; size: number; value: number }>(undefined);
  const [pulled, setPulled] = useState<number>();
  const along = (event: PointerEvent) => sideways ? -event.clientX : event.clientY;
  const finish = (shoot: boolean) => {
    const value = drag.current?.value ?? 0;
    drag.current = undefined;
    setPulled(undefined);
    onPull(undefined);
    if (shoot && value >= MIN_SHOT) { onPower(value); onShoot(value); }
  };
  const shown = pulled ?? 0;
  const key = (event: KeyboardEvent) => {
    const step = { ArrowUp: 5, ArrowRight: 5, ArrowDown: -5, ArrowLeft: -5, PageUp: 20, PageDown: -20 }[event.key];
    if (step !== undefined) { event.preventDefault(); onPower(clamp(power + step) || 1); }
    else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); onPower(event.key === 'Home' ? 1 : 100); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onShoot(power); }
  };
  return <div className="pool-power" data-pulling={pulled !== undefined}>
    <div className="pool-power-track" role="slider" tabIndex={disabled ? -1 : 0} aria-label={t('power')} aria-orientation="vertical"
      aria-valuemin={1} aria-valuemax={100} aria-valuenow={pulled ?? power} aria-valuetext={`${pulled ?? power}%`}
      aria-disabled={disabled} aria-description={t('hint')} title={t('hint')}
      style={{ '--pool-power': `${shown}%`, '--pool-last': `${power}%` } as CSSProperties}
      onKeyDown={disabled ? undefined : key}
      onPointerDown={event => {
        if (disabled || event.button !== 0 || !event.isPrimary) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const rect = event.currentTarget.getBoundingClientRect();
        drag.current = { pointerId: event.pointerId, start: along(event), size: sideways ? rect.width : rect.height, value: 0 };
        setPulled(0);
        onPull(0);
      }}
      onPointerMove={event => {
        const current = drag.current;
        if (current?.pointerId !== event.pointerId) return;
        const value = clamp((along(event) - current.start) / (current.size * .9) * 100);
        current.value = value;
        setPulled(value);
        onPull(value);
      }}
      onPointerUp={event => { if (drag.current?.pointerId === event.pointerId) finish(true); }}
      onPointerCancel={event => { if (drag.current?.pointerId === event.pointerId) finish(false); }}>
      <span className="pool-power-fill" aria-hidden="true" />
      <span className="pool-power-cue" aria-hidden="true" />
    </div>
    <span aria-hidden="true">{pulled ?? power}%</span>
  </div>;
}
