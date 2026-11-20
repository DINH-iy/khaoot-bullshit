import { useState } from 'react';
import { useTexts } from '../../i18n/texts.js';
import { CONTROL_TEXTS } from '../shared/controls.text.js';
import type { Result } from '../shared/countdown.js';
import './cut-the-line.css';

export function CutTarget({ target }: { target: number }) {
  const t = useTexts(CONTROL_TEXTS);
  return <p className="mg-big mg-cut-target">{t('cutTarget', { target })}</p>;
}

export function CutLine({ target, disabled, onResult }: { target: number; disabled: boolean; onResult: (result: Result) => void }) {
  const t = useTexts(CONTROL_TEXTS);
  const [cut, setCut] = useState(50);
  return <div className="mg-cut-line">
    <CutTarget target={target} />
    <input className="mg-cut-range" type="range" min={0} max={100} step={1} value={cut} disabled={disabled}
      aria-label={t('cutPosition')} aria-valuetext={`${cut}%`}
      onChange={event => setCut(event.currentTarget.valueAsNumber)} />
    <button type="button" className="primary" disabled={disabled} onClick={() => onResult({ value: cut })}>{t('lockCut')}</button>
  </div>;
}
