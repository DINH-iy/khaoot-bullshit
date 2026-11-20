import { useState } from 'react';
import { DOT_HEIGHT, DOT_RADIUS, DOT_WIDTH, DotGuessSchema, MAX_DOT_GUESS, type DotPattern } from '@party/contracts';
import { useTexts } from '../../i18n/texts.js';
import { useText } from '../../presentation/look.js';
import { useServerNow } from '../shared/clock.js';
import { CONTROL_TEXTS } from '../shared/controls.text.js';
import type { Result } from '../shared/countdown.js';
import './count-the-dots.css';

export function DotBoard({ pattern }: { pattern: DotPattern }) {
  const t = useTexts(CONTROL_TEXTS);
  return <div className="mg-dot-board" role="img" aria-label={t('dotPattern')} style={{ aspectRatio: DOT_WIDTH / DOT_HEIGHT }}>
    {pattern.map(([x, y]) => <span key={`${x}:${y}`} aria-hidden="true" style={{
      left: `${100 * x / DOT_WIDTH}%`, top: `${100 * y / DOT_HEIGHT}%`, width: `${200 * DOT_RADIUS / DOT_WIDTH}%`,
    }} />)}
  </div>;
}

export function DotGuessForm({ disabled, onResult }: { disabled: boolean; onResult: (result: Result) => void }) {
  const t = useTexts(CONTROL_TEXTS);
  const text = useText();
  const [answer, setAnswer] = useState('');
  const value = answer.trim() === '' ? undefined : DotGuessSchema.safeParse(Number(answer)).data;
  return <form className="mg-dot-form" onSubmit={event => {
    event.preventDefault();
    if (!disabled && value !== undefined) onResult({ value });
  }}>
    <label>{t('dotGuess')}<input type="number" inputMode="numeric" min={0} max={MAX_DOT_GUESS} step={1} required
      value={answer} disabled={disabled} onChange={event => setAnswer(event.currentTarget.value)} /></label>
    <button type="submit" className="primary" disabled={disabled || value === undefined}>{text('answer.submit')}</button>
  </form>;
}

export function DotPhone({ guessAt, offset, disabled, onResult }: {
  guessAt: string; offset: number; disabled: boolean; onResult: (result: Result) => void;
}) {
  const t = useTexts(CONTROL_TEXTS);
  const now = useServerNow(offset, true);
  if (now < Date.parse(guessAt)) return <p className="mg-sub" role="status">{t('dotWatch')}</p>;
  return <DotGuessForm disabled={disabled} onResult={onResult} />;
}
