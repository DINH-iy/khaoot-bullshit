import { useState } from 'react';
import { DOT_HEIGHT, DOT_RADIUS, DOT_WIDTH, DotGuessSchema, MAX_DOT_GUESS, type DotPattern } from '@party/contracts';
import { useTexts } from '../../i18n/texts.js';
import { CONTROL_TEXTS } from '../shared/controls.text.js';
import type { Result } from '../shared/countdown.js';
import './count-the-dots.css';

export function DotBoard({ pattern, highlight = false }: { pattern: DotPattern; highlight?: boolean }) {
  const t = useTexts(CONTROL_TEXTS);
  return <div className={`mg-dot-board${highlight ? ' is-counting' : ''}`} role="img" aria-label={t('dotPattern')} style={{ aspectRatio: DOT_WIDTH / DOT_HEIGHT }}>
    {pattern.map(([x, y]) => <span key={`${x}:${y}`} aria-hidden="true" style={{
      left: `${100 * x / DOT_WIDTH}%`, top: `${100 * y / DOT_HEIGHT}%`, width: `${200 * DOT_RADIUS / DOT_WIDTH}%`,
    }} />)}
  </div>;
}

export function DotGuessForm({ disabled, onResult }: { disabled: boolean; onResult: (result: Result) => void }) {
  const t = useTexts(CONTROL_TEXTS);
  const [answer, setAnswer] = useState('');
  const value = answer ? DotGuessSchema.safeParse(Number(answer)).data : undefined;
  return <form className="mg-dot-form" onSubmit={event => {
    event.preventDefault();
    if (!disabled && value !== undefined) onResult({ value });
  }}>
    <label>{t('dotGuess')}<input type="text" inputMode="numeric" enterKeyHint="done" autoComplete="off" placeholder="—"
      value={answer} disabled={disabled} onChange={event => setAnswer(event.currentTarget.value.replace(/[^0-9]/g, '').slice(0, String(MAX_DOT_GUESS).length))} /></label>
    <button type="submit" className="primary" disabled={disabled || value === undefined}>{t('dotSubmit')}</button>
  </form>;
}

export function DotPhoneResult({ count, guess, points, label }: { count: number; guess?: number | undefined; points?: string | undefined; label: string }) {
  const t = useTexts(CONTROL_TEXTS);
  const difference = guess === undefined ? undefined : Math.abs(count - guess);
  return <div className="dot-result" role="region" aria-label={label}>
    <dl>
      <div><dt>{t('dotActual')}</dt><dd>{count}</dd></div>
      <div><dt>{t('dotYours')}</dt><dd>{guess ?? '—'}</dd></div>
    </dl>
    <p role="status">{difference === undefined ? t('dotNoGuess') : difference === 0 ? t('dotExact') : t('dotOff', { value: difference })}
      {points && <strong>{t('dotPoints', { points })}</strong>}</p>
  </div>;
}
