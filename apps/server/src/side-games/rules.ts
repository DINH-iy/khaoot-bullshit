import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { handTotal, PACK_ITEMS, PACK_SIZE, RARITIES, SLOT_SYMBOLS, SLOT_WEIGHT_TOTAL, slotMultiplier, type BlackjackView, type SlotSymbol } from '@party/contracts';

// Every bit of chance in the side games is drawn here, on the server, with a
// cryptographic random source. `draw` is replaceable only so tests can fix outcomes.
export type Draw = (below: number) => number;
const secure: Draw = below => randomInt(below);

function weighted<T>(items: readonly T[], weight: (item: T) => number, draw: Draw): T {
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  let at = draw(total);
  for (const item of items) { at -= weight(item); if (at < 0) return item; }
  return items[items.length - 1]!;
}

export function spinReels(draw: Draw = secure): SlotSymbol[] {
  return [0, 1, 2].map(() => weighted(SLOT_SYMBOLS, symbol => symbol.weight, draw).key);
}
/** Expected return of one spin per chip bet (1 = all back on average); checked by tests. */
export function slotReturn(): number {
  let expected = 0; const chance = (key: SlotSymbol) => SLOT_SYMBOLS.find(symbol => symbol.key === key)!.weight / SLOT_WEIGHT_TOTAL;
  for (const a of SLOT_SYMBOLS) for (const b of SLOT_SYMBOLS) for (const c of SLOT_SYMBOLS)
    expected += chance(a.key) * chance(b.key) * chance(c.key) * slotMultiplier([a.key, b.key, c.key]);
  return expected;
}

export function openPack(draw: Draw = secure): string[] {
  return Array.from({ length: PACK_SIZE }, () => {
    const rarity = weighted(RARITIES, entry => entry.percent, draw).key;
    const choices = PACK_ITEMS.filter(item => item.rarity === rarity);
    return choices[draw(choices.length)]!.key;
  });
}

// Blackjack. Cards come from an endless shuffled shoe (every card drawn fresh),
// so nothing about future cards is stored. The dealer's hidden card lives only in
// the server-side state until the hand ends.
export const HandStateSchema = z.object({ player: z.array(z.number().int().min(0).max(51)), dealer: z.array(z.number().int().min(0).max(51)), doubled: z.boolean() }).strict();
export type HandState = z.infer<typeof HandStateSchema>;
export type Outcome = NonNullable<BlackjackView['outcome']>;
const card = (draw: Draw) => draw(52);
const natural = (cards: number[]) => cards.length === 2 && handTotal(cards).total === 21;

export function deal(draw: Draw = secure): HandState {
  return { player: [card(draw), card(draw)], dealer: [card(draw), card(draw)], doubled: false };
}
/** The dealer draws to 17 or more (standing on soft 17). */
function dealerPlays(state: HandState, draw: Draw): HandState {
  const dealer = [...state.dealer];
  while (handTotal(dealer).total < 17) dealer.push(card(draw));
  return { ...state, dealer };
}
/** The result of a finished hand, or null while the player is still to act. */
export function outcomeOf(state: HandState, standing: boolean): Outcome | null {
  const player = handTotal(state.player).total;
  if (natural(state.player) || natural(state.dealer)) {
    if (natural(state.player) && natural(state.dealer)) return 'push';
    return natural(state.player) ? 'blackjack' : 'lose';
  }
  if (player > 21) return 'bust';
  if (!standing) return null;
  const dealer = handTotal(state.dealer).total;
  return dealer > 21 || player > dealer ? 'win' : player === dealer ? 'push' : 'lose';
}
/** Chips returned for a finished hand: 3 to 2 for blackjack, 1 to 1 for a win, the bet back on a push. */
export function payoutFor(outcome: Outcome | null, bet: number): number {
  return outcome === 'blackjack' ? Math.floor(bet * 2.5) : outcome === 'win' ? bet * 2 : outcome === 'push' ? bet : 0;
}
/** Applies a move. Standing (or doubling) lets the dealer play; the hand then ends. */
export function move(state: HandState, action: 'hit' | 'stand' | 'double', draw: Draw = secure): { state: HandState; outcome: Outcome | null } {
  if (action === 'stand') { const done = dealerPlays(state, draw); return { state: done, outcome: outcomeOf(done, true) }; }
  const next: HandState = { ...state, player: [...state.player, card(draw)], doubled: state.doubled || action === 'double' };
  if (action === 'hit' && handTotal(next.player).total < 21) return { state: next, outcome: null };
  // Busted hands end at once; 21, or a double, stands.
  if (handTotal(next.player).total > 21) return { state: next, outcome: 'bust' };
  const done = dealerPlays(next, draw); return { state: done, outcome: outcomeOf(done, true) };
}
/** What the phone may see: the dealer's second card stays hidden while the hand is open. */
export function handView(round: { id: string; step: number; bet: number; payout: number }, state: HandState, outcome: Outcome | null, canAfford: boolean): BlackjackView {
  const open = outcome === null;
  return {
    roundId: round.id, step: round.step, bet: round.bet, player: state.player,
    dealer: open ? [state.dealer[0]!, null] : state.dealer,
    playerTotal: handTotal(state.player).total, dealerTotal: open ? null : handTotal(state.dealer).total,
    outcome, payout: round.payout, canDouble: open && state.player.length === 2 && !state.doubled && canAfford,
  };
}
