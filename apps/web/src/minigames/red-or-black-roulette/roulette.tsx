import { useId, useState, type CSSProperties } from 'react';
import {
  ROULETTE_CHIPS, ROULETTE_MAX_PER_PICK, ROULETTE_ORDER, ROULETTE_POCKETS, rouletteStake, rouletteColor, roulettePays,
  type RouletteBets, type RouletteOutside, type RouletteTablePick,
} from '@party/contracts';
import { defineTexts, translate, useTexts } from '../../i18n/texts.js';
import type { Result } from '../shared/countdown.js';
import './roulette.css';

/**
 * One roulette everywhere: the hosted minigame and the arcade (stakes in points)
 * and the phone side game (stakes in play chips) share this table, this wheel
 * and the payouts in the contracts' roulette rules.
 */
export const ROULETTE_TEXTS = defineTexts('roulette', {
  red: 'Red', black: 'Black', green: 'Green zero', retry: 'Retry spin',
  odd: 'Odd', even: 'Even', low: '1–18', high: '19–36', dozen1: '1–12', dozen2: '13–24', dozen3: '25–36',
  column1: 'Column 1', column2: 'Column 2', column3: 'Column 3', column1Short: 'Col 1', column2Short: 'Col 2', column3Short: 'Col 3', bets: 'Bets',
  board: 'Roulette table', chip: 'Chip', free: 'Free', boardNumber: '{number} · {color}',
  place: 'Pick a chip, then tap where to bet.', freeHint: 'Tap a number or a bet to pick it for free.',
  stake: 'Stake {amount} of {limit}', freeStake: 'Free pick', undo: 'Undo last chip', lockIn: 'Lock in bets', locked: 'Bets locked in. The ball rolls when betting closes.',
  freePick: 'Free pick', bet: 'Bet {amount}', yourBets: 'Your bets', landed: 'Landed on {number} · {color}',
  rules: 'A number (green 0 too) pays 35 to 1, a dozen or column 2 to 1, the others 1 to 1. A winning bet also returns its stake; a losing bet is lost. Green zero loses every bet except a bet on 0.',
}, {
  nl: {
    red: 'Rood', black: 'Zwart', green: 'Groene nul', retry: 'Opnieuw proberen',
    odd: 'Oneven', even: 'Even', low: '1–18', high: '19–36', dozen1: '1–12', dozen2: '13–24', dozen3: '25–36',
    column1: 'Kolom 1', column2: 'Kolom 2', column3: 'Kolom 3', column1Short: 'Kol 1', column2Short: 'Kol 2', column3Short: 'Kol 3', bets: 'Inzetten',
    board: 'Roulettetafel', chip: 'Fiche', free: 'Gratis', boardNumber: '{number} · {color}',
    place: 'Kies een fiche en tik waar je inzet.', freeHint: 'Tik op een nummer of inzet om die gratis te kiezen.',
    stake: 'Inzet {amount} van {limit}', freeStake: 'Gratis keuze', undo: 'Laatste fiche terug', lockIn: 'Inzet vastleggen', locked: 'Inzet vastgelegd. De bal rolt zodra het inzetten sluit.',
    freePick: 'Gratis keuze', bet: 'Inzet {amount}', yourBets: 'Jouw inzet', landed: 'Gevallen op {number} · {color}',
    rules: 'Een nummer (ook groene 0) betaalt 35 tegen 1, een dozijn of kolom 2 tegen 1, de rest 1 tegen 1. Een winnende inzet krijg je ook terug; een verliezende inzet ben je kwijt. Groene nul verliest elke inzet behalve een inzet op 0.',
  },
  de: {
    red: 'Rot', black: 'Schwarz', green: 'Grüne Null', retry: 'Dreh erneut versuchen',
    odd: 'Ungerade', even: 'Gerade', low: '1–18', high: '19–36', dozen1: '1–12', dozen2: '13–24', dozen3: '25–36',
    column1: 'Spalte 1', column2: 'Spalte 2', column3: 'Spalte 3', column1Short: 'Sp. 1', column2Short: 'Sp. 2', column3Short: 'Sp. 3', bets: 'Einsätze',
    board: 'Roulettetisch', chip: 'Chip', free: 'Gratis', boardNumber: '{number} · {color}',
    place: 'Wähle einen Chip und tippe, wo du setzt.', freeHint: 'Tippe auf eine Zahl oder Wette, um sie gratis zu wählen.',
    stake: 'Einsatz {amount} von {limit}', freeStake: 'Gratis-Tipp', undo: 'Letzten Chip zurück', lockIn: 'Einsätze festlegen', locked: 'Einsätze festgelegt. Die Kugel rollt, wenn die Einsätze schließen.',
    freePick: 'Gratis-Tipp', bet: 'Einsatz {amount}', yourBets: 'Deine Einsätze', landed: 'Gelandet auf {number} · {color}',
    rules: 'Eine Zahl (auch die grüne 0) zahlt 35 zu 1, ein Dutzend oder eine Spalte 2 zu 1, der Rest 1 zu 1. Eine gewinnende Wette bringt auch den Einsatz zurück; eine verlorene ist weg. Die grüne Null verliert jede Wette außer einer auf 0.',
  },
  ro: {
    red: 'Roșu', black: 'Negru', green: 'Zero verde', retry: 'Reîncearcă rotirea',
    odd: 'Impar', even: 'Par', low: '1–18', high: '19–36', dozen1: '1–12', dozen2: '13–24', dozen3: '25–36',
    column1: 'Coloana 1', column2: 'Coloana 2', column3: 'Coloana 3', column1Short: 'Col 1', column2Short: 'Col 2', column3Short: 'Col 3', bets: 'Pariuri',
    board: 'Masa de ruletă', chip: 'Jeton', free: 'Gratis', boardNumber: '{number} · {color}',
    place: 'Alege un jeton, apoi atinge unde pariezi.', freeHint: 'Atinge un număr sau un pariu ca să-l alegi gratis.',
    stake: 'Miză {amount} din {limit}', freeStake: 'Alegere gratuită', undo: 'Anulează ultimul jeton', lockIn: 'Confirmă pariurile', locked: 'Pariuri confirmate. Bila se rostogolește când se închid pariurile.',
    freePick: 'Alegere gratuită', bet: 'Miză {amount}', yourBets: 'Pariurile tale', landed: 'A căzut pe {number} · {color}',
    rules: 'Un număr (și 0 verde) plătește 35 la 1, o duzină sau o coloană 2 la 1, restul 1 la 1. Un pariu câștigător îți dă înapoi și miza; un pariu pierdut se pierde. Zero verde pierde orice pariu, în afară de cel pe 0.',
  },
});

const pickName = (t: (key: keyof typeof ROULETTE_TEXTS.en, values?: Record<string, string | number>) => string, guess: RouletteTablePick) =>
  typeof guess === 'number' ? String(guess) : t(guess);
/** The bets in words: "Red 10 · 17 5", or just the picks when they were free. */
export function betSummary(bets: RouletteBets): string {
  const t = (key: keyof typeof ROULETTE_TEXTS.en, values?: Record<string, string | number>) => translate(ROULETTE_TEXTS, key, values);
  return bets.map(entry => entry.bet ? `${pickName(t, entry.guess)} ${entry.bet}` : pickName(t, entry.guess)).join(' · ');
}

const pocketAngle = 360 / ROULETTE_POCKETS;
const segments = ROULETTE_ORDER.map((pocket, index) => (
  `var(--roulette-${rouletteColor(pocket)}) ${index * pocketAngle}deg ${(index + 1) * pocketAngle}deg`
));
const wheelColors = `conic-gradient(from ${-pocketAngle / 2}deg, ${segments.join(', ')})`;

/**
 * The wheel turns one way while the ball rolls the other way around the rim,
 * drops, bounces and settles in the winning pocket, then rides it until the
 * wheel stops. With less motion the wheel shows its final position at once.
 */
export function RouletteReveal({ pocket, animate }: { pocket: number; animate: boolean }) {
  const t = useTexts(ROULETTE_TEXTS);
  const color = rouletteColor(pocket);
  const index = ROULETTE_ORDER.findIndex(value => value === pocket);
  const style = { '--roulette-stop': `${-index * pocketAngle}deg`, '--roulette-pocket': `${index * pocketAngle}deg`, '--roulette-pockets': wheelColors } as CSSProperties;
  return <div className={`roulette-reveal${animate ? ' roulette-animated' : ''}`}>
    {animate && <div className="roulette-display" style={style} aria-hidden="true">
      <div className="roulette-wheel">
        {ROULETTE_ORDER.map((value, at) =>
          <span key={value} className="roulette-wheel-number" style={{ '--pocket-angle': `${at * pocketAngle}deg` } as CSSProperties}>{value}</span>)}
        <span className="roulette-ball-seat"><span className="roulette-ball" /></span>
        <span className="roulette-turret" />
      </div>
      <span className="roulette-ball-orbit"><span className="roulette-ball" /></span>
    </div>}
    <p className={`roulette-result ${color}`} role="status">{pocket} · {t(color)}</p>
  </div>;
}

const NUMBERS = { left: Array.from({ length: 18 }, (_, at) => at + 1), right: Array.from({ length: 18 }, (_, at) => at + 19) };
const OUTSIDE_ROWS: RouletteOutside[][] = [['dozen1', 'dozen2', 'dozen3', 'column1', 'column2', 'column3'], ['low', 'even', 'red', 'black', 'odd', 'high']];
// On the table, columns carry a short label; their full name is what assistive technology reads.
const shortLabel = (guess: RouletteOutside) => guess === 'column1' ? 'column1Short' : guess === 'column2' ? 'column2Short' : guess === 'column3' ? 'column3Short' : guess;

/**
 * The betting table. With stakes, players pick a chip and tap squares to stack
 * it (up to `limit` in all); without, one tap picks one free bet. The table
 * keeps the bets until `onSubmit`; remount it (a new key) to clear it.
 */
export function RouletteBoard({ stakes, limit, disabled, action, onSubmit }: {
  stakes: boolean; limit: number; disabled: boolean; action: string; onSubmit: (bets: RouletteBets) => void;
}) {
  const t = useTexts(ROULETTE_TEXTS);
  const group = useId();
  const chips = stakes ? ROULETTE_CHIPS.filter(amount => amount <= limit) : [];
  const [chip, setChip] = useState<number>(chips[0] ?? 0);
  const [placed, setPlaced] = useState<{ guess: RouletteTablePick; bet: number }[]>([]);
  const stake = rouletteStake(placed);
  const totals = new Map<RouletteTablePick, number>();
  for (const { guess, bet } of placed) totals.set(guess, (totals.get(guess) ?? 0) + bet);
  const bets: RouletteBets = [...totals].map(([guess, bet]) => ({ guess, bet }));

  const square = (guess: RouletteTablePick, extra = '') => {
    const color = typeof guess === 'number' ? rouletteColor(guess) : guess === 'red' || guess === 'black' ? guess : 'outside';
    const amount = totals.get(guess);
    const name = typeof guess === 'number' ? t('boardNumber', { number: guess, color: t(rouletteColor(guess)) }) : t(guess);
    const title = `${name}, ${roulettePays(guess)}:1`;
    const full = chip > 0 && (stake + chip > limit || (amount ?? 0) + chip > ROULETTE_MAX_PER_PICK);
    return <button key={guess} className={`roulette-square ${color}${extra}`} type="button" aria-pressed={amount !== undefined}
      aria-label={amount ? `${title}, ${amount}` : title} disabled={disabled || full}
      onClick={() => setPlaced(entries => chip === 0 ? [{ guess, bet: 0 }] : [...entries.filter(entry => entry.bet > 0), { guess, bet: chip }])}>
      <span>{typeof guess === 'number' ? guess : t(shortLabel(guess))}</span>{Boolean(amount) && <span className="roulette-chip">{amount}</span>}
    </button>;
  };

  return <div className="roulette-table">
    {chips.length > 0 && <fieldset className="roulette-chips" disabled={disabled}><legend className="visually-hidden">{t('chip')}</legend>
      {[0, ...chips].map(amount => <label key={amount} className={chip === amount ? 'chosen' : ''}>
        <input type="radio" name={group} checked={chip === amount} onChange={() => {
          // A free pick and staked chips do not mix on one spin.
          if ((amount === 0) !== (chip === 0)) setPlaced([]);
          setChip(amount);
        }} />{amount === 0 ? t('free') : amount}</label>)}
    </fieldset>}
    <p className="roulette-hint">{t(chip ? 'place' : 'freeHint')}</p>
    <div className="roulette-board" role="group" aria-label={t('board')}>
      {square(0, ' zero')}
      <div className="roulette-numbers">{NUMBERS.left.map(value => square(value))}</div>
      <div className="roulette-numbers">{NUMBERS.right.map(value => square(value))}</div>
      {OUTSIDE_ROWS.map(row => <div key={row[0]} className="roulette-outside">{row.map(guess => square(guess))}</div>)}
    </div>
    <div className="roulette-controls">
      <span className="roulette-stake">{chip ? t('stake', { amount: stake, limit }) : t('freeStake')}</span>
      <button type="button" className="ghost small-button roulette-undo" aria-label={t('undo')} title={t('undo')} disabled={disabled || placed.length === 0}
        onClick={() => setPlaced(entries => entries.slice(0, -1))}><span aria-hidden="true">↶</span></button>
      <button type="button" className="primary" disabled={disabled || bets.length === 0} onClick={() => onSubmit(bets)}>{action}</button>
    </div>
  </div>;
}

/** The hosted round and the arcade: bet points (up to `limit`) on the one shared spin. */
export function RoulettePhone({ limit, disabled, onResult }: { limit: number; disabled: boolean; onResult: (result: Result) => void }) {
  const t = useTexts(ROULETTE_TEXTS);
  return <RouletteBoard stakes={limit > 0} limit={limit} disabled={disabled} action={t('lockIn')}
    onSubmit={bets => onResult({ value: rouletteStake(bets), bets })} />;
}
