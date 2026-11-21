import { useState } from 'react';
import { useTexts } from '../../i18n/texts.js';
import { useLook } from '../../presentation/look.js';
import { CONTROL_TEXTS } from '../shared/controls.text.js';
import type { Result } from '../shared/countdown.js';
import '../../ui/game-slider.css';
import './cut-the-line.css';

export function CutTarget({ target }: { target: number }) {
  const t = useTexts(CONTROL_TEXTS);
  return <p className="mg-cut-target">{t('cutTarget', { target })}</p>;
}

export function CutLine({ target, disabled, onResult }: { target: number; disabled: boolean; onResult: (result: Result) => void }) {
  const t = useTexts(CONTROL_TEXTS);
  const { theme } = useLook();
  const [cut, setCut] = useState(50);
  return <div className="mg-cut-line">
    <CutTarget target={target} />
    <div className="cut-scale" dir="ltr">
      <input className={`game-slider slider-${theme.sliderStyle}`} type="range" min={0} max={100} step={1} value={cut} disabled={disabled}
        aria-label={t('cutPosition')} aria-valuetext={`${cut}%`}
        onChange={event => setCut(event.currentTarget.valueAsNumber)} />
      <div className="cut-endpoints" aria-hidden="true"><span>0%</span><span>100%</span></div>
    </div>
    <button type="button" className="primary" disabled={disabled} onClick={() => onResult({ value: cut })}>{t('lockCut')}</button>
  </div>;
}
