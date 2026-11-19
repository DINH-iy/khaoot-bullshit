import { useState } from 'react';
import { BETS, SLOT_SYMBOLS, SlotResultSchema, TWO_CHERRIES_PAYS, slotMultiplier, type SlotResult } from '@party/contracts';
import { newId } from '../room/api.js';
import { calm, chips, sideApi, sideProblem, st } from './side-api.js';

const emoji = (key: string) => SLOT_SYMBOLS.find(symbol => symbol.key === key)?.emoji ?? '❔';
const name = (key: string) => { const index = SLOT_SYMBOLS.findIndex(symbol => symbol.key === key); return st('symbols').split('|')[index] ?? key; };

/** What the slot machine pays (shown in the side games' (i) while the slot machine is open). */
export function SlotPays() {
  return <ul className="slot-pays">{SLOT_SYMBOLS.map(symbol => <li key={symbol.key}><span aria-hidden="true">{symbol.emoji.repeat(3)}</span><span className="visually-hidden">{st('three', { symbol: name(symbol.key) })}</span><strong>×{symbol.pays}</strong></li>)}
    <li><span aria-hidden="true">🍒🍒</span><span className="visually-hidden">{st('twoCherries')}</span><strong>{TWO_CHERRIES_PAYS === 1 ? st('betBack') : `×${TWO_CHERRIES_PAYS}`}</strong></li></ul>;
}

/** Slot machine: choose a bet, spin; the server spins the reels and pays. Without chips (`chips` false) it just spins for fun. */
export function Slots({ sessionId, balance, onBalance, chips: forChips }: { sessionId: string; balance: number; onBalance: (balance: number) => void; chips: boolean }) {
  const [bet, setBet] = useState<typeof BETS[number]>(10);
  const [result, setResult] = useState<SlotResult>(); const [spinning, setSpinning] = useState(false); const [error, setError] = useState('');
  const spin = async () => {
    setSpinning(true); setError('');
    const started = Date.now();
    try {
      const outcome = SlotResultSchema.parse(await sideApi(sessionId, '/slots', { roundId: newId(), bet }));
      // Let the reels turn for a moment; the result is already decided.
      if (!calm()) await new Promise(resolve => setTimeout(resolve, Math.max(0, 900 - (Date.now() - started))));
      setResult(outcome); onBalance(outcome.balance);
    } catch (cause) { setError(sideProblem(cause)); } finally { setSpinning(false); }
  };
  const won = result && (forChips ? result.payout > 0 : slotMultiplier(result.reels) > 0);
  return <div className="side-game slots">
    <div className={`reels${spinning ? ' spinning' : ''}`} role="img" aria-label={result && !spinning ? st('reelsNamed', { list: result.reels.map(name).join(', ') }) : st('reels')}>
      {[0, 1, 2].map(index => <span key={index} className="reel" aria-hidden="true">{spinning ? '🎰' : result ? emoji(result.reels[index]!) : '7️⃣'}</span>)}
    </div>
    <p className="side-outcome" role="status">{spinning ? st('spinning') : !result ? st('lineUp') : won ? (forChips ? st('youWin', { amount: chips(result.payout) }) : st('winner', { times: slotMultiplier(result.reels) })) : st('noLuck')}</p>
    {forChips && <fieldset className="bet-picker"><legend>{st('bet')}</legend>
      {BETS.map(amount => <label key={amount} className={bet === amount ? 'chosen' : ''}><input type="radio" name="slot-bet" checked={bet === amount} onChange={() => setBet(amount)} />{amount}</label>)}
    </fieldset>}
    {error && <p role="alert" className="error">{error}</p>}
    <button type="button" className="primary big" disabled={spinning || (forChips && balance < bet)} onClick={() => void spin()}>{forChips ? st('spinFor', { amount: chips(bet) }) : st('spin')}</button>
  </div>;
}
