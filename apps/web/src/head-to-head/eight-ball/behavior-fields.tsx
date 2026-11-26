import { POOL_BALL_PRESETS, POOL_CUSTOM_RANGES, PoolBallBehaviorSchema, type PoolBallBehavior } from '@party/contracts';
import { useId } from 'react';
import { defineTexts, useTexts } from '../../i18n/texts.js';

export const POOL_BEHAVIOR_TEXTS = defineTexts('pool-ball-behavior', {
  behavior: 'Ball behavior', realistic: 'Realistic Sim', arcade: 'Balanced Arcade', heavy: 'Casual / Heavy Felt', custom: 'Custom',
  rollingResistance: 'Rolling resistance', railBounce: 'Rail bounce', stopSpeed: 'Stop speed',
}, {
  nl: { behavior: 'Balgedrag', realistic: 'Realistische simulatie', arcade: 'Gebalanceerde arcade', heavy: 'Casual / zwaar laken', custom: 'Aangepast', rollingResistance: 'Rolweerstand', railBounce: 'Bandterugslag', stopSpeed: 'Stopsnelheid' },
  de: { behavior: 'Kugelverhalten', realistic: 'Realistische Simulation', arcade: 'Ausgewogenes Arcade-Spiel', heavy: 'Casual / schweres Tuch', custom: 'Benutzerdefiniert', rollingResistance: 'Rollwiderstand', railBounce: 'Bandensprung', stopSpeed: 'Stoppgeschwindigkeit' },
  ro: { behavior: 'Comportamentul bilelor', realistic: 'Simulare realistă', arcade: 'Arcade echilibrat', heavy: 'Casual / postav greu', custom: 'Personalizat', rollingResistance: 'Rezistență la rulare', railBounce: 'Reculul mantinei', stopSpeed: 'Viteză de oprire' },
});

export function PoolBehaviorFields({ value, onChange }: { value: PoolBallBehavior; onChange: (next: PoolBallBehavior) => void }) {
  const t = useTexts(POOL_BEHAVIOR_TEXTS);
  const id = useId();
  return <>
    <label htmlFor={id}>{t('behavior')}<select id={id} value={value.preset} onChange={event => {
      const preset = event.currentTarget.value;
      if (preset === 'custom' && value.preset !== 'custom') onChange({ preset, ...POOL_BALL_PRESETS[value.preset] });
      if (preset === 'realistic' || preset === 'arcade' || preset === 'heavy') onChange({ preset });
    }}>
      {(['realistic', 'arcade', 'heavy', 'custom'] as const).map(preset => <option key={preset} value={preset}>{t(preset)}</option>)}
    </select></label>
    {value.preset === 'custom' && (Object.keys(POOL_CUSTOM_RANGES) as (keyof typeof POOL_CUSTOM_RANGES)[]).map(field =>
      <label key={field}>{t(field)}<input type="number" {...POOL_CUSTOM_RANGES[field]} key={value[field]} defaultValue={value[field]}
        onBlur={event => {
          const input = event.currentTarget;
          const parsed = PoolBallBehaviorSchema.safeParse({ ...value, [field]: input.valueAsNumber });
          if (parsed.success && parsed.data.preset === 'custom' && parsed.data[field] !== value[field]) onChange(parsed.data);
          else input.value = String(value[field]);
        }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>)}
  </>;
}
