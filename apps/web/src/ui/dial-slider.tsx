import { type CSSProperties } from 'react';
import { defineTexts, useTexts } from '../i18n/texts.js';
import './game-slider.css';
import './dial-slider.css';

const TEXTS = defineTexts('dial slider', { less: 'Previous value', more: 'Next value' }, {
  nl: { less: 'Vorige waarde', more: 'Volgende waarde' },
  de: { less: 'Vorheriger Wert', more: 'Nächster Wert' },
  ro: { less: 'Valoarea anterioară', more: 'Valoarea următoare' },
});

export function DialSlider({ id, labels, value, onChange }: {
  id: string; labels: readonly string[]; value: number; onChange: (value: number) => void;
}) {
  const t = useTexts(TEXTS);
  const last = labels.length - 1;
  const positions = [...new Set([0, Math.round(last / 2), last])];
  const position = last > 0 ? value / last * 100 : 0;
  return <div className="dial-slider" dir="ltr" style={{ '--dial-position': `${position}%` } as CSSProperties}>
    <output className="dial-value" htmlFor={id} dir="auto">{labels[value]}</output>
    <button className="dial-step" type="button" aria-label={t('less')} disabled={value === 0} onClick={() => onChange(value - 1)}>−</button>
    <input id={id} className="game-slider slider-dial" type="range" min={0} max={last} value={value}
      aria-valuetext={labels[value]} disabled={last === 0} onChange={event => onChange(event.currentTarget.valueAsNumber)} />
    <button className="dial-step" type="button" aria-label={t('more')} disabled={value === last} onClick={() => onChange(value + 1)}>+</button>
    <div className="dial-ticks" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${positions.length}, minmax(0, 1fr))` }}>
      {positions.map(index => <span key={index} title={labels[index]}>{labels[index]}</span>)}
    </div>
  </div>;
}
