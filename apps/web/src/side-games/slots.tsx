import { useState } from 'react';
import { BETS, SLOT_SYMBOLS, SlotResultSchema, TWO_CHERRIES_PAYS, type SlotResult } from '@party/contracts';
import { newId } from '../network/api.js';
import { calm, chips, sideApi, sideProblem } from './side-api.js';

const emoji = (key: string) => SLOT_SYMBOLS.find(symbol => symbol.key === key)?.emoji ?? '❔';
const name = (key: string) => SLOT_SYMBOLS.find(symbol => symbol.key === key)?.key ?? key;

/** Slot machine: choose a bet, spin; the server spins the reels and pays. */
export function Slots({ sessionId, balance, onBalance }: { sessionId: string; balance: number; onBalance: (balance: number) => void }) {
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
  const won = result && result.payout > 0;
  return <div className="side-game slots">
    <div className={`reels${spinning ? ' spinning' : ''}`} role="img" aria-label={result && !spinning ? `Reels: ${result.reels.map(name).join(', ')}` : 'Reels'}>
      {[0, 1, 2].map(index => <span key={index} className="reel" aria-hidden="true">{spinning ? '🎰' : result ? emoji(result.reels[index]!) : '7️⃣'}</span>)}
    </div>
    <p className="side-outcome" role="status">{spinning ? 'Spinning…' : !result ? 'Line up three of a kind.' : won ? `You win ${chips(result.payout)}!` : 'No luck this time.'}</p>
    <fieldset className="bet-picker"><legend>Bet</legend>
      {BETS.map(amount => <label key={amount} className={bet === amount ? 'chosen' : ''}><input type="radio" name="slot-bet" checked={bet === amount} onChange={() => setBet(amount)} />{amount}</label>)}
    </fieldset>
    {error && <p role="alert" className="error">{error}</p>}
    <button type="button" className="primary big" disabled={spinning || balance < bet} onClick={() => void spin()}>Spin for {chips(bet)}</button>
    <details className="odds"><summary>What pays</summary>
      <ul>{SLOT_SYMBOLS.map(symbol => <li key={symbol.key}><span aria-hidden="true">{symbol.emoji.repeat(3)}</span> <span className="visually-hidden">three {symbol.key}</span> pays {symbol.pays}× your bet</li>)}
        <li><span aria-hidden="true">🍒🍒</span><span className="visually-hidden">two cherries</span> anywhere gives your bet back{TWO_CHERRIES_PAYS === 1 ? '' : ` ×${TWO_CHERRIES_PAYS}`}</li></ul>
      <p>On average the machine pays back about 94 of every 100 chips bet.</p>
    </details>
  </div>;
}
