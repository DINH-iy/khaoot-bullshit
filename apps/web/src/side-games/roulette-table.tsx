import { useState } from 'react';
import {
  NetworkErrorCodeSchema, RouletteTableResultSchema, rouletteMatches, type RouletteTableResult, type RouletteTableSpin,
} from '@party/contracts';
import { useTexts } from '../i18n/texts.js';
import { COIN_TEXTS } from '../minigames/heads-or-tails/coin.text.js';
import { RouletteBoard, RouletteReveal, ROULETTE_TEXTS } from '../minigames/red-or-black-roulette/roulette.js';
import { newId } from '../room/api.js';
import { chips, sideApi, sideProblem, st } from './side-api.js';

/** Roulette on the phone, between rounds: the same table and wheel as the hosted round, with play chips as stakes. */
export function SoloRoulette({ sessionId, balance, onBalance, forChips }: {
  sessionId: string; balance: number; onBalance: (balance: number) => void; forChips: boolean;
}) {
  const coin = useTexts(COIN_TEXTS);
  const wheel = useTexts(ROULETTE_TEXTS);
  const [result, setResult] = useState<RouletteTableResult>();
  const [retry, setRetry] = useState<RouletteTableSpin>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function spin(request: RouletteTableSpin) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const next = RouletteTableResultSchema.parse(await sideApi(sessionId, '/roulette', request));
      setResult(next);
      onBalance(next.balance);
      setRetry(undefined);
    } catch (cause) {
      const code = NetworkErrorCodeSchema.safeParse(cause instanceof Error ? cause.message : null);
      setRetry(!code.success || code.data === 'GAME_UNAVAILABLE' ? request : undefined);
      setError(sideProblem(cause));
    } finally {
      setBusy(false);
    }
  }

  const hit = result?.bets.some(entry => rouletteMatches(result.roulette, entry.guess));
  return <div className="side-game roulette-side">
    {result && <>
      <RouletteReveal key={result.roundId} pocket={result.roulette} animate />
      <p className="side-outcome roulette-results-animated" role="status">{hit ? result.payout ? st('youWin', { amount: chips(result.payout) }) : coin('right') : coin('wrong')}</p>
    </>}
    {/* A fresh table after every spin. */}
    <RouletteBoard key={result?.roundId ?? 'first'} stakes={forChips} limit={balance} disabled={busy || Boolean(retry)}
      action={st('spin')} onSubmit={bets => void spin({ roundId: newId(), bets })} />
    {retry && <button type="button" className="primary" disabled={busy} onClick={() => void spin(retry)}>{wheel('retry')}</button>}
    {error && <p role="alert" className="error">{error}</p>}
    <small className="hint">{wheel('rules')}</small>
  </div>;
}
