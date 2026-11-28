import type { ScenePlaceAwards } from '@party/contracts';
import { useLanguage } from '../i18n/language.js';
import { defineTexts, useTexts } from '../i18n/texts.js';

const TEXTS = defineTexts('scene-place-awards', {
  place: '{position}{ordinal}', point: '{place}: {bonus}{amount} point', points: '{place}: {bonus}{amount} points',
  unconfigured: 'Set points by place in this scene’s scoring settings.',
}, {
  nl: { place: '{position}e plek', point: '{place}: {bonus}{amount} punt', points: '{place}: {bonus}{amount} punten',
    unconfigured: 'Stel punten per plek in bij de puntentelling van deze dia.' },
  de: { place: '{position}. Platz', point: '{place}: {bonus}{amount} Punkt', points: '{place}: {bonus}{amount} Punkte',
    unconfigured: 'Lege in der Punktevergabe dieser Szene Punkte nach Platz fest.' },
  ro: { place: 'Locul {position}', point: '{place}: {bonus}{amount} punct', points: '{place}: {bonus}{amount} puncte',
    unconfigured: 'Configurează punctele pe loc în setările de punctaj ale scenei.' },
});

export function useScenePlaceAwards(awards: ScenePlaceAwards | undefined, editing = false): string {
  const language = useLanguage();
  const t = useTexts(TEXTS);
  if (!awards) return editing ? t('unconfigured') : '';
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 3 });
  const ordinal = new Intl.PluralRules('en', { type: 'ordinal' });
  return awards.amounts.map((amount, index) => {
    const position = index + 1;
    const suffix = ordinal.select(position);
    const bonus = awards.bonus ? '+' : '';
    const place = t('place', { position, ordinal: suffix === 'one' ? 'st' : suffix === 'two' ? 'nd' : suffix === 'few' ? 'rd' : 'th' });
    return t(amount === '1000' ? 'point' : 'points', { place, bonus, amount: number.format(Number(amount) / 1000) });
  }).join(' · ');
}
