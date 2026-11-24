import { POOL_FELTS, type PoolFelt } from '@party/contracts';
import type { CSSProperties } from 'react';
import { defineTexts, useTexts } from '../../i18n/texts.js';
import { POOL_FELT_COLORS } from './table.js';

const TEXTS = defineTexts('pool-felt', {
  felt: 'Table cloth', green: 'Green', blue: 'Blue', teal: 'Teal', red: 'Red', purple: 'Purple', gray: 'Gray',
}, {
  nl: { felt: 'Kleed', green: 'Groen', blue: 'Blauw', teal: 'Petrol', red: 'Rood', purple: 'Paars', gray: 'Grijs' },
  de: { felt: 'Tischtuch', green: 'Grün', blue: 'Blau', teal: 'Petrol', red: 'Rot', purple: 'Lila', gray: 'Grau' },
  ro: { felt: 'Postav', green: 'Verde', blue: 'Albastru', teal: 'Petrol', red: 'Roșu', purple: 'Mov', gray: 'Gri' },
});

export function PoolFeltFields({ value, onChange }: { value: PoolFelt; onChange: (felt: PoolFelt) => void }) {
  const t = useTexts(TEXTS);
  return <fieldset className="pool-felt-fields">
    <legend>{t('felt')}</legend>
    <div className="pool-felt-swatches">
      {POOL_FELTS.map(felt => <button key={felt} type="button" className="pool-felt-swatch" aria-pressed={value === felt} title={t(felt)}
        aria-label={t(felt)} style={{ '--felt': POOL_FELT_COLORS[felt].base, '--felt-edge': POOL_FELT_COLORS[felt].edge } as CSSProperties}
        onClick={() => onChange(felt)} />)}
    </div>
  </fieldset>;
}
