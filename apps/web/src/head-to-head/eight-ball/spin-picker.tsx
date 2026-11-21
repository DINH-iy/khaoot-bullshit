import type { PoolSpin } from '@party/contracts';
import { useId, type CSSProperties, type PointerEvent } from 'react';
import { defineTexts, useTexts } from '../../i18n/texts.js';

const TEXTS = defineTexts('pool-spin', {
  spin: 'Spin', target: 'Cue-ball contact', position: 'Cue-ball contact · side {x}, height {y}',
  hint: 'Drag the marker or use the arrow keys. Top adds follow, bottom adds draw.', center: 'Center', done: 'Done',
}, {
  nl: { spin: 'Effect', target: 'Raakpunt op de witte bal', position: 'Raakpunt · zijwaarts {x}, hoogte {y}', hint: 'Sleep de stip of gebruik de pijltjestoetsen. Boven geeft doorloop, onder geeft terugloop.', center: 'Midden', done: 'Klaar' },
  de: { spin: 'Effet', target: 'Treffpunkt am Spielball', position: 'Treffpunkt · Seite {x}, Höhe {y}', hint: 'Ziehe die Markierung oder nutze die Pfeiltasten. Oben gibt Nachlauf, unten Rücklauf.', center: 'Mitte', done: 'Fertig' },
  ro: { spin: 'Efect', target: 'Punct de contact pe bila albă', position: 'Punct de contact · lateral {x}, înălțime {y}', hint: 'Trage marcajul sau folosește săgețile. Sus dă efect înainte, jos efect înapoi.', center: 'Centru', done: 'Gata' },
});

const DEAD_CENTER: PoolSpin = [0, 0];
const nudge: Record<string, PoolSpin> = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] };
function fitSpin(x: number, y: number): PoolSpin {
  const scale = Math.min(1, 100 / Math.hypot(x, y));
  return [Math.trunc(x * scale), Math.trunc(y * scale)];
}
const marker = ([x, y]: PoolSpin) => ({ '--spin-x': `${50 + x * .39}%`, '--spin-y': `${50 + y * .39}%` }) as CSSProperties;

export function PoolSpinButton({ value, disabled, onClick }: { value: PoolSpin; disabled: boolean; onClick: () => void }) {
  const t = useTexts(TEXTS);
  return <button type="button" className="pool-spin-button" disabled={disabled} onClick={onClick}>
    <span className="pool-spin-ball" aria-hidden="true" style={marker(value)} />{t('spin')}
  </button>;
}

export function PoolSpinPicker({ value, sideways, onChange, onDone }: {
  value: PoolSpin; sideways: boolean; onChange: (next: PoolSpin) => void; onDone: () => void;
}) {
  const t = useTexts(TEXTS);
  const hintId = useId();
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = sideways ? (event.clientY - rect.top) / rect.height : (event.clientX - rect.left) / rect.width;
    const y = sideways ? (rect.right - event.clientX) / rect.width : (event.clientY - rect.top) / rect.height;
    onChange(fitSpin((x - .5) * 255, (y - .5) * 255));
  };
  return <div className="pool-spin-picker" role="group" aria-label={t('spin')}>
    <span id={hintId} className="visually-hidden">{t('hint')}</span>
    <button type="button" className="pool-spin-ball" autoFocus style={marker(value)}
      aria-label={t('target')} aria-describedby={hintId} onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        move(event);
      }} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) move(event); }}
      onKeyDown={event => {
        const delta = nudge[event.key];
        if (!delta) return;
        event.preventDefault();
        onChange(fitSpin(value[0] + delta[0], value[1] + delta[1]));
      }} />
    <output className="visually-hidden">{t('position', { x: value[0], y: -value[1] })}</output>
    <div className="pool-spin-actions">
      <button type="button" onClick={() => onChange(DEAD_CENTER)}>{t('center')}</button>
      <button type="button" className="primary" onClick={onDone}>{t('done')}</button>
    </div>
  </div>;
}
