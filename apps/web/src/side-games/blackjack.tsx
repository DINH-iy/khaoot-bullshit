import { useState } from 'react';
import { BETS, BlackjackResultSchema, cardRank, cardSuit, type BlackjackView } from '@party/contracts';
import { newId } from '../network/api.js';
import { chips, sideApi, sideProblem } from './side-api.js';

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_NAMES = ['ace', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'jack', 'queen', 'king'];
const SUITS = ['♠', '♥', '♦', '♣']; const SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'];
const OUTCOMES: Record<NonNullable<BlackjackView['outcome']>, string> = { blackjack: 'Blackjack!', win: 'You win!', push: 'A draw: your bet comes back.', lose: 'The dealer wins.', bust: 'Bust: over 21.' };

function Card({ card }: { card: number | null }) {
  if (card === null) return <span className="card back" role="img" aria-label="hidden card" />;
  const suit = cardSuit(card);
  return <span className={`card${suit === 1 || suit === 2 ? ' red' : ''}`} role="img" aria-label={`${RANK_NAMES[cardRank(card)]} of ${SUIT_NAMES[suit]}`}>
    <span aria-hidden="true">{RANKS[cardRank(card)]}{SUITS[suit]}</span></span>;
}

/** Blackjack against the dealer. A hand left open (a round started) is picked up again later. */
export function Blackjack({ sessionId, balance, onBalance, open }: { sessionId: string; balance: number; onBalance: (balance: number) => void; open: BlackjackView | null }) {
  const [bet, setBet] = useState<typeof BETS[number]>(10);
  const [hand, setHand] = useState<BlackjackView | null>(open); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const send = async (path: string, body: unknown) => {
    setBusy(true); setError('');
    try { const result = BlackjackResultSchema.parse(await sideApi(sessionId, path, body)); setHand(result.hand); onBalance(result.balance); }
    catch (cause) { setError(sideProblem(cause)); } finally { setBusy(false); }
  };
  const playing = hand && hand.outcome === null;
  return <div className="side-game blackjack">
    {hand ? <div className="table">
      <div className="hand"><p>Dealer {hand.dealerTotal !== null && <strong>{hand.dealerTotal}</strong>}</p><div className="cards">{hand.dealer.map((card, index) => <Card key={index} card={card} />)}</div></div>
      <div className="hand"><p>You <strong>{hand.playerTotal}</strong></p><div className="cards">{hand.player.map((card, index) => <Card key={index} card={card} />)}</div></div>
    </div> : <p className="side-outcome">Get closer to 21 than the dealer without going over. Blackjack pays 3 to 2.</p>}
    <p className="side-outcome" role="status">{hand?.outcome ? `${OUTCOMES[hand.outcome]}${hand.payout ? ` You get ${chips(hand.payout)}.` : ''}` : hand ? `Bet: ${chips(hand.bet)}` : ''}</p>
    {error && <p role="alert" className="error">{error}</p>}
    {playing ? <div className="side-actions">
      <button type="button" className="primary" disabled={busy} onClick={() => void send('/blackjack/move', { roundId: hand.roundId, step: hand.step, move: 'hit' })}>Hit</button>
      <button type="button" disabled={busy} onClick={() => void send('/blackjack/move', { roundId: hand.roundId, step: hand.step, move: 'stand' })}>Stand</button>
      {hand.canDouble && <button type="button" disabled={busy} onClick={() => void send('/blackjack/move', { roundId: hand.roundId, step: hand.step, move: 'double' })}>Double</button>}
    </div> : <>
      <fieldset className="bet-picker"><legend>Bet</legend>
        {BETS.map(amount => <label key={amount} className={bet === amount ? 'chosen' : ''}><input type="radio" name="blackjack-bet" checked={bet === amount} onChange={() => setBet(amount)} />{amount}</label>)}
      </fieldset>
      <button type="button" className="primary big" disabled={busy || balance < bet} onClick={() => void send('/blackjack', { roundId: newId(), bet })}>Deal for {chips(bet)}</button>
    </>}
  </div>;
}
