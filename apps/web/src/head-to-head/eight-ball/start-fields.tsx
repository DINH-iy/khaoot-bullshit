import { POOL_START_MAX_PERCENT, POOL_START_MIN_PERCENT, PoolStartSchema, type PoolStart } from '@party/contracts';
import { defineTexts, useTexts } from '../../i18n/texts.js';

export const POOL_START_TEXTS = defineTexts('pool-start', {
  side: 'Starting side', left: 'Left', right: 'Right', random: 'Random', line: 'Starting line (% from edge)', lineShort: 'Starting line',
}, {
  nl: { side: 'Startkant', left: 'Links', right: 'Rechts', random: 'Willekeurig', line: 'Startlijn (% vanaf rand)', lineShort: 'Startlijn' },
  de: { side: 'Startseite', left: 'Links', right: 'Rechts', random: 'Zufällig', line: 'Startlinie (% vom Rand)', lineShort: 'Startlinie' },
  ro: { side: 'Partea de start', left: 'Stânga', right: 'Dreapta', random: 'Aleatoriu', line: 'Linia de start (% de la margine)', lineShort: 'Linia de start' },
});

export function PoolStartFields({ value, onChange, lineLabel }: { value: PoolStart; lineLabel?: string; onChange: (start: PoolStart) => void }) {
  const t = useTexts(POOL_START_TEXTS);
  return <>
    <label>{t('side')}<select value={value.side} onChange={event => {
      const parsed = PoolStartSchema.safeParse({ ...value, side: event.currentTarget.value });
      if (parsed.success) onChange(parsed.data);
    }}>
      {(['left', 'right', 'random'] as const).map(side => <option key={side} value={side}>{t(side)}</option>)}
    </select></label>
    <label>{lineLabel ?? t('line')}<input aria-label={lineLabel ? t('line') : undefined} key={value.percent} type="number" inputMode="numeric" min={POOL_START_MIN_PERCENT} max={POOL_START_MAX_PERCENT}
      defaultValue={value.percent} onBlur={event => {
        const entry = event.currentTarget;
        const parsed = PoolStartSchema.safeParse({ ...value, percent: entry.valueAsNumber });
        if (parsed.success && parsed.data.percent !== value.percent) onChange(parsed.data);
        else entry.value = String(value.percent);
      }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>
  </>;
}
