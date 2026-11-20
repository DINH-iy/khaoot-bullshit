import type { CSSProperties } from 'react';
import { ROULETTE_PICKS, ROULETTE_POCKETS, ROULETTE_ORDER, rouletteColor } from '@party/contracts';
import { defineTexts, useTexts } from '../../i18n/texts.js';
import type { Result } from '../shared/countdown.js';
import './roulette.css';

export const ROULETTE_TEXTS = defineTexts('roulette', {
  red: 'Red', black: 'Black', green: 'Green zero', retry: 'Retry spin',
  rules: 'Red and black each have 18 of 37 pockets. Green zero wins for neither color.',
}, {
  nl: { red: 'Rood', black: 'Zwart', green: 'Groene nul', retry: 'Opnieuw proberen', rules: 'Rood en zwart hebben elk 18 van de 37 vakjes. Bij groene nul wint geen van beide kleuren.' },
  de: { red: 'Rot', black: 'Schwarz', green: 'Grüne Null', retry: 'Dreh erneut versuchen', rules: 'Rot und Schwarz haben je 18 der 37 Fächer. Bei der grünen Null gewinnt keine der beiden Farben.' },
  ro: { red: 'Roșu', black: 'Negru', green: 'Zero verde', retry: 'Reîncearcă rotirea', rules: 'Roșu și negru au fiecare 18 dintre cele 37 de sectoare. La zero verde nu câștigă nicio culoare.' },
});

type Pick = typeof ROULETTE_PICKS[number];
const pocketAngle = 360 / ROULETTE_POCKETS;
const segments = ROULETTE_ORDER.map((pocket, index) => (
  `var(--roulette-${rouletteColor(pocket)}) ${index * pocketAngle}deg ${(index + 1) * pocketAngle}deg`
));
const wheelColors = `conic-gradient(from ${-pocketAngle / 2}deg, ${segments.join(', ')})`;

export function RouletteChoices({ disabled, onPick }: { disabled: boolean; onPick: (pick: Pick) => void }) {
  const t = useTexts(ROULETTE_TEXTS);
  return <div className="roulette-choices">{ROULETTE_PICKS.map(color =>
    <button key={color} type="button" className={`roulette-choice ${color}`} disabled={disabled} onClick={() => onPick(color)}>{t(color)}</button>
  )}</div>;
}

export function RoulettePhone({ disabled, onResult }: { disabled: boolean; onResult: (result: Result) => void }) {
  return <RouletteChoices disabled={disabled} onPick={pick => onResult({ value: ROULETTE_PICKS.indexOf(pick) })} />;
}

export function RouletteReveal({ pocket, animate, showNumber = false }: { pocket: number; animate: boolean; showNumber?: boolean }) {
  const t = useTexts(ROULETTE_TEXTS);
  const color = rouletteColor(pocket);
  const style = { '--roulette-stop': `${-ROULETTE_ORDER.findIndex(value => value === pocket) * pocketAngle}deg`, '--roulette-pockets': wheelColors } as CSSProperties;
  return <div className={`roulette-reveal${animate ? ' roulette-animated' : ''}`}>
    {animate && <div className="roulette-display" style={style} aria-hidden="true">
      <div className="roulette-wheel">{showNumber && ROULETTE_ORDER.map((value, index) =>
        <span key={value} className="roulette-wheel-number" style={{ '--pocket-angle': `${index * pocketAngle}deg` } as CSSProperties}>{value}</span>)}</div><span className="roulette-pointer" />
    </div>}
    <p className={`roulette-result ${color}`} role="status">{showNumber ? `${pocket} · ` : ''}{t(color)}</p>
  </div>;
}
