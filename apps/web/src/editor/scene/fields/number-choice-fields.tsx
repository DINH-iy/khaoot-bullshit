import type { NumberChoice } from '@party/contracts';
import { defineTexts, useTexts } from '../../../i18n/texts.js';
import { Segmented } from '../../controls/segmented.js';

export const NUMBER_CHOICE_TEXTS = defineTexts('minigame number settings', {
  target: 'Target percentage', count: 'Dot count', overlap: 'Allow slight overlap', random: 'Random', exact: 'Exact',
  range: 'Random range', minimum: 'Minimum', maximum: 'Maximum',
}, {
  nl: { target: 'Doelpercentage', count: 'Aantal stippen', overlap: 'Lichte overlap toestaan', random: 'Willekeurig', exact: 'Vast', range: 'Willekeurig bereik', minimum: 'Minimum', maximum: 'Maximum' },
  de: { target: 'Zielprozentsatz', count: 'Punktanzahl', overlap: 'Leichte Überlappung zulassen', random: 'Zufällig', exact: 'Fest', range: 'Zufallsbereich', minimum: 'Minimum', maximum: 'Maximum' },
  ro: { target: 'Procent țintă', count: 'Număr de puncte', overlap: 'Permite suprapunerea ușoară', random: 'Aleatoriu', exact: 'Fix', range: 'Interval aleatoriu', minimum: 'Minim', maximum: 'Maxim' },
});

export function NumberChoiceFields({ label, value, min, max, initial, range, onChange }: {
  label: string; value?: NumberChoice | undefined; min: number; max: number; initial: number;
  range: readonly [number, number]; onChange: (value: NumberChoice | undefined) => void;
}) {
  const t = useTexts(NUMBER_CHOICE_TEXTS);
  const input = (label: string, number: number, update: (next: number) => void) =>
    <label>{label}<input type="number" min={min} max={max} step={1} value={number} onChange={event => {
      const next = event.currentTarget.valueAsNumber;
      if (Number.isInteger(next) && next >= min && next <= max) update(next);
    }} /></label>;
  return <>
    <Segmented label={label} value={value?.mode ?? 'random'}
      choices={(['random', 'exact', 'range'] as const).map(mode => ({ value: mode, label: t(mode) }))}
      onChange={mode => onChange(mode === 'random' ? undefined : mode === 'exact' ? { mode, value: initial } : { mode, min: range[0], max: range[1] })} />
    {value?.mode === 'exact' && input(label, value.value, next => onChange({ mode: 'exact', value: next }))}
    {value?.mode === 'range' && <div className="field-pair">
      {input(t('minimum'), value.min, next => onChange({ mode: 'range', min: next, max: Math.max(next, value.max) }))}
      {input(t('maximum'), value.max, next => onChange({ mode: 'range', min: Math.min(value.min, next), max: next }))}
    </div>}
  </>;
}
