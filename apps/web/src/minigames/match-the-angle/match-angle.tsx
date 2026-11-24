import { useRef, useState, type PointerEvent } from 'react';
import { useTexts } from '../../i18n/texts.js';
import { CONTROL_TEXTS } from '../shared/controls.text.js';
import type { Result } from '../shared/countdown.js';
import { tenths } from '../shared/result-label.js';
import './match-the-angle.css';

// The ray works in tenths of a degree (a full turn is 3600), so dragging never steps in countable whole degrees.
const wrapAngle = (angle: number) => (angle + 3600) % 3600;

export function AngleTarget({ target }: { target: number }) {
  const t = useTexts(CONTROL_TEXTS);
  return <p className="mg-big mg-angle-target">{t('angleTarget', { target })}</p>;
}

/** `target` in whole degrees, `guess` in tenths. */
export function AngleComparison({ target, guess }: { target: number; guess?: number | undefined }) {
  return <div className="mg-angle-dial mg-angle-comparison" aria-hidden="true">
    <span className="mg-angle-baseline" />
    <span className="mg-angle-ray target-ray" style={{ transform: `rotate(${-target}deg)` }} />
    {guess !== undefined && <span className="mg-angle-ray" style={{ transform: `rotate(${-guess / 10}deg)` }} />}
    <span className="mg-angle-pivot" />
  </div>;
}

export function MatchAngle({ target, disabled, onResult }: { target: number; disabled: boolean; onResult: (result: Result) => void }) {
  const t = useTexts(CONTROL_TEXTS);
  const [angle, setAngle] = useState(0);
  const drag = useRef<number | null>(null);

  const aim = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - (bounds.left + bounds.width / 2);
    const y = bounds.top + bounds.height / 2 - event.clientY;
    if (Math.hypot(x, y) < 10) return;
    setAngle(wrapAngle(Math.round(Math.atan2(y, x) * 1800 / Math.PI)));
  };

  return <div className="mg-match-angle">
    <AngleTarget target={target} />
    <div className="mg-angle-dial" role="slider" tabIndex={disabled ? -1 : 0} aria-disabled={disabled}
      aria-label={t('anglePosition')} aria-valuemin={0} aria-valuemax={359.9} aria-valuenow={angle / 10} aria-valuetext={`${tenths(angle)}°`}
      onPointerDown={event => {
        if (disabled || !event.isPrimary || event.button !== 0) return;
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = event.pointerId;
        aim(event);
      }}
      onPointerMove={event => { if (!disabled && drag.current === event.pointerId) aim(event); }}
      onPointerUp={event => { if (!disabled && drag.current === event.pointerId) aim(event); }}
      onLostPointerCapture={event => { if (drag.current === event.pointerId) drag.current = null; }}
      onKeyDown={event => {
        if (disabled) return;
        switch (event.key) {
          case 'ArrowUp':
          case 'ArrowRight': setAngle(value => wrapAngle(value + 10)); break;
          case 'ArrowDown':
          case 'ArrowLeft': setAngle(value => wrapAngle(value - 10)); break;
          case 'Home': setAngle(0); break;
          case 'End': setAngle(3590); break;
          default: return;
        }
        event.preventDefault();
      }}>
      <span className="mg-angle-baseline" aria-hidden="true" />
      <span className="mg-angle-ray" style={{ transform: `rotate(${-angle / 10}deg)` }} aria-hidden="true" />
      <span className="mg-angle-pivot" aria-hidden="true" />
    </div>
    <button type="button" className="primary" disabled={disabled} onClick={() => onResult({ value: angle })}>{t('lockAngle')}</button>
  </div>;
}
