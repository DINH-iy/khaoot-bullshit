import { useId, useState } from 'react';
import {
  BETS, NetworkErrorCodeSchema, ROULETTE_MAX_PER_PICK, ROULETTE_POCKETS, ROULETTE_PICKS,
  RouletteTableResultSchema, rouletteColor, rouletteMatches, type RouletteTablePick, type RouletteTableResult, type RouletteTableSpin,
} from '@party/contracts';
import { defineTexts, useTexts } from '../i18n/texts.js';
import { COIN_TEXTS } from '../minigames/heads-or-tails/coin.text.js';
import { RouletteReveal, ROULETTE_TEXTS } from '../minigames/red-or-black-roulette/roulette.js';
import { newId } from '../room/api.js';
import { chips, sideApi, sideProblem, st } from './side-api.js';

const TEXTS = defineTexts('roulette-table', {
  board: 'Roulette betting board', place: 'Choose a chip value, then place it on any number or color.',
  free: 'Pick a number or color, then spin.', total: 'Stake: {amount}', undo: 'Undo bet',
  odds: 'A number, including green 0, pays 35 to 1. Red and black pay 1 to 1. A win returns the stake on that bet.',
  boardNumber: '{number} · {color}',
}, {
  nl: {
    board: 'Roulette-inzetbord', place: 'Kies de waarde van je fiche en leg het op een nummer of kleur.',
    free: 'Kies een nummer of kleur en draai.', total: 'Inzet: {amount}', undo: 'Inzet ongedaan maken',
    odds: 'Een nummer, inclusief groene 0, betaalt 35 tegen 1. Rood en zwart betalen 1 tegen 1. Bij winst krijg je de inzet van die weddenschap terug.',
    boardNumber: '{number} · {color}',
  },
  de: {
    board: 'Roulette-Spielfeld', place: 'Wähle den Chipwert und setze ihn auf eine Zahl oder Farbe.',
    free: 'Wähle eine Zahl oder Farbe und drehe.', total: 'Einsatz: {amount}', undo: 'Einsatz zurücknehmen',
    odds: 'Eine Zahl, auch die grüne 0, zahlt 35 zu 1. Rot und Schwarz zahlen 1 zu 1. Bei einem Gewinn bekommst du den Einsatz dieser Wette zurück.',
    boardNumber: '{number} · {color}',
  },
  ro: {
    board: 'Masa de ruletă', place: 'Alege valoarea jetonului și pune-l pe un număr sau o culoare.',
    free: 'Alege un număr sau o culoare, apoi rotește.', total: 'Miză: {amount}', undo: 'Anulează miza',
    odds: 'Un număr, inclusiv 0 verde, plătește 35 la 1. Roșu și negru plătesc 1 la 1. La câștig primești înapoi și miza pariului respectiv.',
    boardNumber: '{number} · {color}',
  },
});

const denominations = [0, ...BETS] as const;
type Denomination = typeof denominations[number];
type Bet = RouletteTableSpin['bets'][number];

export function SoloRoulette({ sessionId, balance, onBalance, forChips }: {
  sessionId: string; balance: number; onBalance: (balance: number) => void; forChips: boolean;
}) {
  const t = useTexts(TEXTS);
  const coin = useTexts(COIN_TEXTS);
  const wheel = useTexts(ROULETTE_TEXTS);
  const group = useId();
  const [denomination, setDenomination] = useState<Denomination>(0);
  const [placed, setPlaced] = useState<Bet[]>([]);
  const [result, setResult] = useState<RouletteTableResult>();
  const [retry, setRetry] = useState<RouletteTableSpin>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const total = placed.reduce((sum, entry) => sum + entry.bet, 0);
  const totals = new Map<RouletteTablePick, number>();
  for (const { guess, bet } of placed) totals.set(guess, (totals.get(guess) ?? 0) + bet);
  const disabled = busy || Boolean(retry);
  const activeStake = forChips ? denomination : 0;

  async function spin(request: RouletteTableSpin) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const next = RouletteTableResultSchema.parse(await sideApi(sessionId, '/roulette', request));
      setResult(next);
      onBalance(next.balance);
      setPlaced([]);
      setRetry(undefined);
    } catch (cause) {
      const code = NetworkErrorCodeSchema.safeParse(cause instanceof Error ? cause.message : null);
      setRetry(!code.success || code.data === 'GAME_UNAVAILABLE' ? request : undefined);
      setError(sideProblem(cause));
    } finally {
      setBusy(false);
    }
  }

  const square = (guess: RouletteTablePick) => {
    const color = typeof guess === 'number' ? rouletteColor(guess) : guess;
    const amount = totals.get(guess);
    const title = typeof guess === 'number' ? t('boardNumber', { number: guess, color: wheel(color) }) : wheel(guess);
    return <button key={guess} className={`roulette-square ${color}`} type="button" aria-pressed={amount !== undefined}
      aria-label={amount ? `${title}, ${chips(amount)}` : title}
      disabled={disabled || (activeStake > 0 && (total + activeStake > balance || (amount ?? 0) + activeStake > ROULETTE_MAX_PER_PICK))}
      onClick={() => setPlaced(entries => activeStake === 0 ? [{ guess, bet: 0 }] : [...entries, { guess, bet: activeStake }])}>
      <span>{guess === 0 ? title : typeof guess === 'number' ? guess : title}</span>{Boolean(amount) && <span className="roulette-chip">{amount}</span>}
    </button>;
  };

  const hit = result?.bets.some(entry => rouletteMatches(result.roulette, entry.guess));
  return <div className="side-game roulette-table">
    {result && <>
      <RouletteReveal key={result.roundId} pocket={result.roulette} animate showNumber />
      <p className="side-outcome" role="status">{hit ? result.payout ? st('youWin', { amount: chips(result.payout) }) : coin('right') : coin('wrong')}</p>
    </>}
    {forChips && <fieldset className="bet-picker" disabled={disabled}><legend>{st('bet')}</legend>
      {denominations.map(amount => <label key={amount} className={denomination === amount ? 'chosen' : ''}>
        <input type="radio" name={group} checked={denomination === amount} disabled={amount > balance} onChange={() => {
          if ((amount === 0) !== (denomination === 0)) setPlaced([]);
          setDenomination(amount);
        }} />{amount === 0 ? coin('noStake') : amount}</label>)}
    </fieldset>}
    <p className="hint">{t(activeStake ? 'place' : 'free')}</p>
    <div className="roulette-number-board" role="group" aria-label={t('board')}>
      {Array.from({ length: ROULETTE_POCKETS }, (_, value) => square(value))}
    </div>
    <div className="roulette-outside">{ROULETTE_PICKS.map(square)}</div>
    <div className="roulette-controls">
      {forChips && <span>{t('total', { amount: chips(total) })}</span>}
      <button type="button" className="ghost small-button" disabled={disabled || placed.length === 0} onClick={() => setPlaced(entries => entries.slice(0, -1))}>{t('undo')}</button>
      <button type="button" className="primary" disabled={busy || (!retry && (placed.length === 0 || total > balance && total > 0))}
        onClick={() => void spin(retry ?? { roundId: newId(), bets: [...totals].map(([guess, bet]) => ({ guess, bet })) })}>{retry ? wheel('retry') : st('spin')}</button>
    </div>
    {error && <p role="alert" className="error">{error}</p>}
    <small className="hint">{t('odds')}</small>
  </div>;
}
