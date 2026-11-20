import { useState } from 'react';
import { BETS, BlackjackResultSchema, cardRank, cardSuit, type BlackjackView } from '@party/contracts';
import { newId } from '../room/api.js';
import { chips, sideApi, sideProblem, st } from './side-api.js';

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];
const OUTCOMES = { blackjack: 'oBlackjack', win: 'oWin', push: 'oPush', lose: 'oLose', bust: 'oBust' } as const satisfies Record<NonNullable<BlackjackView['outcome']>, string>;

function Card({ card }: { card: number | null }) {
  if (card === null) return <span className="card back" role="img" aria-label={st('hiddenCard')} />;
  const suit = cardSuit(card);
  return <span className={`card${suit === 1 || suit === 2 ? ' red' : ''}`} role="img" aria-label={st('card', { rank: st('ranks').split('|')[cardRank(card)] ?? '', suit: st('suits').split('|')[suit] ?? '' })}>
    <span aria-hidden="true">{RANKS[cardRank(card)]}{SUITS[suit]}</span></span>;
}

/** Blackjack against the dealer. A hand left open (a round started) is picked up again later. Without chips it is played for fun. */
export function Blackjack({ sessionId, balance, onBalance, onHand, open, chips: forChips }: { sessionId: string; balance: number; onBalance: (balance: number) => void; onHand: (hand: BlackjackView) => void; open: BlackjackView | null; chips: boolean }) {
  const [bet, setBet] = useState<typeof BETS[number]>(10);
  const [hand, setHand] = useState<BlackjackView | null>(open); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const send = async (path: string, body: unknown) => {
    setBusy(true); setError('');
    try { const result = BlackjackResultSchema.parse(await sideApi(sessionId, path, body)); setHand(result.hand); onHand(result.hand); onBalance(result.balance); }
    catch (cause) { setError(sideProblem(cause)); } finally { setBusy(false); }
  };
  const playing = hand && hand.outcome === null;
  return <div className="side-game blackjack">
    {hand ? <div className="table">
      <div className="hand"><p>{st('dealer')} {hand.dealerTotal !== null && <strong>{hand.dealerTotal}</strong>}</p><div className="cards">{hand.dealer.map((card, index) => <Card key={index} card={card} />)}</div></div>
      <div className="hand"><p>{st('you')} <strong>{hand.playerTotal}</strong></p><div className="cards">{hand.player.map((card, index) => <Card key={index} card={card} />)}</div></div>
    </div> : <p className="side-outcome">{st('bjIntro')}</p>}
    <p className="side-outcome" role="status">{hand?.outcome ? `${st(hand.outcome === 'push' && !hand.bet ? 'draw' : OUTCOMES[hand.outcome])}${hand.payout ? st('youGet', { amount: chips(hand.payout) }) : ''}` : hand?.bet ? st('betIs', { amount: chips(hand.bet) }) : ''}</p>
    {error && <p role="alert" className="error">{error}</p>}
    {playing ? <div className="side-actions">
      <button type="button" className="primary" disabled={busy} onClick={() => void send('/blackjack/move', { roundId: hand.roundId, step: hand.step, move: 'hit' })}>{st('hit')}</button>
      <button type="button" disabled={busy} onClick={() => void send('/blackjack/move', { roundId: hand.roundId, step: hand.step, move: 'stand' })}>{st('stand')}</button>
      {hand.canDouble && <button type="button" disabled={busy} onClick={() => void send('/blackjack/move', { roundId: hand.roundId, step: hand.step, move: 'double' })}>{st('double')}</button>}
    </div> : <>
      {forChips && <fieldset className="bet-picker"><legend>{st('bet')}</legend>
        {BETS.map(amount => <label key={amount} className={bet === amount ? 'chosen' : ''}><input type="radio" name="blackjack-bet" checked={bet === amount} onChange={() => setBet(amount)} />{amount}</label>)}
      </fieldset>}
      <button type="button" className="primary big" disabled={busy || (forChips && balance < bet)} onClick={() => void send('/blackjack', { roundId: newId(), bet })}>{forChips ? st('dealFor', { amount: chips(bet) }) : st('deal')}</button>
    </>}
  </div>;
}
