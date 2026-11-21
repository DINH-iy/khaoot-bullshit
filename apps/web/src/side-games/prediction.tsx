import { useId, useState } from 'react';
import { BETS, CoinResultSchema, NetworkErrorCodeSchema, type CoinResult, type CoinSide } from '@party/contracts';
import { useTexts } from '../i18n/texts.js';
import { CoinChoices, CoinReveal } from '../minigames/heads-or-tails/coin.js';
import { COIN_TEXTS } from '../minigames/heads-or-tails/coin.text.js';
import { newId } from '../room/api.js';
import { chips, sideApi, sideProblem, st } from './side-api.js';

const stakes = [0, ...BETS] as const;
type FlipRequest = { roundId: string; bet: typeof stakes[number]; guess: CoinSide };

export function SoloCoin({ sessionId, balance, onBalance, forChips }: {
  sessionId: string; balance: number; onBalance: (balance: number) => void; forChips: boolean;
}) {
  const t = useTexts(COIN_TEXTS);
  const group = useId();
  const [bet, setBet] = useState<FlipRequest['bet']>(0);
  const [result, setResult] = useState<CoinResult>();
  const [retry, setRetry] = useState<FlipRequest>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function flip(request: FlipRequest) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const next = CoinResultSchema.parse(await sideApi(sessionId, '/heads-or-tails', request));
      setResult(next);
      onBalance(next.balance);
      setRetry(undefined);
    } catch (cause) {
      const code = NetworkErrorCodeSchema.safeParse(cause instanceof Error ? cause.message : null);
      // When delivery is uncertain, retry the same flip and stake.
      setRetry(!code.success || code.data === 'GAME_UNAVAILABLE' ? request : undefined);
      setError(sideProblem(cause));
    } finally {
      setBusy(false);
    }
  }

  const pick = (guess: CoinSide) => void flip({ roundId: newId(), guess, bet: forChips ? bet : 0 });
  const won = result && result.guess === result.coin;
  return <div className="side-game solo-coin">
    {result && <>
      <CoinReveal key={result.roundId} coin={result.coin} animate />
      <p key={result.roundId} className="side-outcome" role="status">{won
        ? result.bet ? st('youWin', { amount: chips(result.payout) }) : t('right')
        : t('wrong')}</p>
    </>}
    {forChips && <>
      <fieldset className="bet-picker" disabled={busy || Boolean(retry)}><legend>{st('bet')}</legend>
        {stakes.map(amount => <label key={amount} className={bet === amount ? 'chosen' : ''}>
          <input type="radio" name={group} checked={bet === amount} disabled={amount > balance}
            onChange={() => setBet(amount)} />{amount === 0 ? t('noStake') : amount}
        </label>)}
      </fieldset>
      <small>{t('evenMoney')}</small>
    </>}
    <CoinChoices disabled={busy || Boolean(retry) || (forChips && bet > balance)} onPick={pick} />
    {error && <p role="alert" className="error">{error}</p>}
    {retry && <button type="button" className="primary" disabled={busy} onClick={() => void flip(retry)}>{t('retry')}</button>}
  </div>;
}
