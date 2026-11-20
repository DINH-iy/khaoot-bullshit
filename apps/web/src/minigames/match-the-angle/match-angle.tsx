import { useRef, useState, type PointerEvent } from 'react';
import { useTexts } from '../../i18n/texts.js';
import { CONTROL_TEXTS } from '../shared/controls.text.js';
import type { Result } from '../shared/countdown.js';
import './match-the-angle.css';

const wrapAngle = (angle: number) => (angle + 360) % 360;

export function AngleTarget({ target }: { target: number }) {
  const t = useTexts(CONTROL_TEXTS);
  return <p className="mg-big mg-angle-target">{t('angleTarget', { target })}</p>;
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
    setAngle(wrapAngle(Math.round(Math.atan2(y, x) * 180 / Math.PI)));
  };

  return <div className="mg-match-angle">
    <AngleTarget target={target} />
    <div className="mg-angle-dial" role="slider" tabIndex={disabled ? -1 : 0} aria-disabled={disabled}
      aria-label={t('anglePosition')} aria-valuemin={0} aria-valuemax={359} aria-valuenow={angle} aria-valuetext={`${angle}°`}
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
          case 'ArrowRight': setAngle(value => wrapAngle(value + 1)); break;
          case 'ArrowDown':
          case 'ArrowLeft': setAngle(value => wrapAngle(value - 1)); break;
          case 'Home': setAngle(0); break;
          case 'End': setAngle(359); break;
          default: return;
        }
        event.preventDefault();
      }}>
      <span className="mg-angle-baseline" aria-hidden="true" />
      <span className="mg-angle-ray" style={{ transform: `rotate(${-angle}deg)` }} aria-hidden="true" />
      <span className="mg-angle-pivot" aria-hidden="true" />
    </div>
    <button type="button" className="primary" disabled={disabled} onClick={() => onResult({ value: angle })}>{t('lockAngle')}</button>
  </div>;
}
