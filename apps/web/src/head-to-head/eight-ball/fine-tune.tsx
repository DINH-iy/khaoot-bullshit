import { POOL_AIM_STEP } from '@party/contracts';
import { useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { defineTexts, useTexts } from '../../i18n/texts.js';

const TEXTS = defineTexts('pool-fine-tune', {
  aim: 'Aim', hint: 'Roll the wheel for small aim changes',
}, {
  nl: { aim: 'Richting', hint: 'Rol aan het wiel voor kleine aanpassingen' },
  de: { aim: 'Winkel', hint: 'Am Rad drehen für feine Korrekturen' },
  ro: { aim: 'Unghi', hint: 'Rotește roata pentru ajustări fine' },
});

/** Screen pixels of wheel travel per quarter degree of aim. */
const PIXELS_PER_STEP = 6;
const normal = (angle: number) => (Math.round(angle / POOL_AIM_STEP) * POOL_AIM_STEP + 360) % 360;

/** A ridged wheel beside the table for precise aiming: rolling it turns the cue a little at a time. */
export function PoolFineTune({ angle, disabled, sideways, onChange }: {
  angle: number; disabled: boolean; sideways: boolean; onChange: (angle: number) => void;
}) {
  const t = useTexts(TEXTS);
  const drag = useRef<{ pointerId: number; last: number; carry: number }>(undefined);
  // Several moves can arrive before the next render, so keep turning from the newest angle.
  const latest = useRef(angle);
  latest.current = angle;
  const key = (event: KeyboardEvent) => {
    const step = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 20, PageDown: -20 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    onChange(normal(angle + step * POOL_AIM_STEP));
  };
  return <div className="pool-fine-tune" role="slider" tabIndex={disabled ? -1 : 0} aria-label={t('aim')} aria-orientation="vertical"
    aria-valuemin={0} aria-valuemax={360 - POOL_AIM_STEP} aria-valuenow={angle} aria-valuetext={`${angle}°`}
    aria-disabled={disabled} aria-description={t('hint')} title={t('hint')}
    style={{ '--pool-wheel': `${(angle / POOL_AIM_STEP) * PIXELS_PER_STEP}px` } as CSSProperties}
    onKeyDown={disabled ? undefined : key}
    onPointerDown={event => {
      if (disabled || event.button !== 0 || !event.isPrimary) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { pointerId: event.pointerId, last: sideways ? -event.clientX : event.clientY, carry: 0 };
    }}
    onPointerMove={event => {
      const current = drag.current;
      if (current?.pointerId !== event.pointerId) return;
      const position = sideways ? -event.clientX : event.clientY;
      const travel = current.carry + position - current.last;
      const steps = Math.trunc(travel / PIXELS_PER_STEP);
      current.last = position;
      current.carry = travel - steps * PIXELS_PER_STEP;
      if (steps) { latest.current = normal(latest.current + steps * POOL_AIM_STEP); onChange(latest.current); }
    }}
    onPointerUp={() => { drag.current = undefined; }} onPointerCancel={() => { drag.current = undefined; }}>
    <span aria-hidden="true" />
  </div>;
}
