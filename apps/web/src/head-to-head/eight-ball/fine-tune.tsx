import { POOL_AIM_STEP, poolAngle } from '@party/contracts';
import { useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { defineTexts, useTexts } from '../../i18n/texts.js';

const TEXTS = defineTexts('pool-fine-tune', {
  aim: 'Aim', hint: 'Roll the wheel for small aim changes',
}, {
  nl: { aim: 'Richting', hint: 'Rol aan het wiel voor kleine aanpassingen' },
  de: { aim: 'Winkel', hint: 'Am Rad drehen für feine Korrekturen' },
  ro: { aim: 'Unghi', hint: 'Rotește roata pentru ajustări fine' },
});

/** Degrees of aim per pixel of wheel travel: a quarter degree for 6 pixels, turned continuously (not in steps). */
const DEGREES_PER_PIXEL = .25 / 6;
/** Arrow keys turn a quarter degree; Page Up and Page Down five degrees. */
const KEY_STEP = .25;

/** A ridged wheel beside the table for precise aiming: rolling it turns the cue a little at a time. */
export function PoolFineTune({ angle, disabled, sideways, onChange }: {
  angle: number; disabled: boolean; sideways: boolean; onChange: (angle: number) => void;
}) {
  const t = useTexts(TEXTS);
  const drag = useRef<{ pointerId: number; last: number; carry: number; exact: number }>(undefined);
  // Several moves can arrive before the next render, so keep turning from the newest angle.
  const latest = useRef(angle);
  latest.current = angle;
  const key = (event: KeyboardEvent) => {
    const step = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 20, PageDown: -20 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    onChange(poolAngle(angle + step * KEY_STEP));
  };
  return <div className="pool-fine-tune" role="slider" tabIndex={disabled ? -1 : 0} aria-label={t('aim')} aria-orientation="vertical"
    aria-valuemin={0} aria-valuemax={360 - POOL_AIM_STEP} aria-valuenow={angle} aria-valuetext={`${angle}°`}
    aria-disabled={disabled} aria-description={t('hint')} title={t('hint')}
    style={{ '--pool-wheel': `${angle / DEGREES_PER_PIXEL}px` } as CSSProperties}
    onKeyDown={disabled ? undefined : key}
    onPointerDown={event => {
      if (disabled || event.button !== 0 || !event.isPrimary) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { pointerId: event.pointerId, last: sideways ? -event.clientX : event.clientY, carry: 0, exact: latest.current };
    }}
    onPointerMove={event => {
      const current = drag.current;
      if (current?.pointerId !== event.pointerId) return;
      // Every pixel turns the aim a little (kept unrounded while dragging, so slow moves still add up).
      const position = sideways ? -event.clientX : event.clientY;
      current.exact += (position - current.last) * DEGREES_PER_PIXEL;
      current.last = position;
      const next = poolAngle(current.exact);
      if (next !== latest.current) { latest.current = next; onChange(next); }
    }}
    onPointerUp={() => { drag.current = undefined; }} onPointerCancel={() => { drag.current = undefined; }}>
    <span aria-hidden="true" />
  </div>;
}
