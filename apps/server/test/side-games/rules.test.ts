import { describe, expect, it } from 'vitest';
import { handTotal, PACK_SIZE, slotMultiplier, type PackSetView } from '@party/contracts';
import { drawPack } from '../../src/side-games/pack-sets.js';
import { deal, handView, move, outcomeOf, payoutFor, slotReturn, spinReels, type Draw } from '../../src/side-games/rules.js';

// Cards: rank = card % 13 (0 ace … 9 ten, 12 king). A fixed sequence of draws makes a hand predictable.
const draws = (...values: number[]): Draw => { let at = 0; return () => { if (at >= values.length) throw new Error('No more prepared draws'); return values[at++]!; }; };
const ACE = 0, FIVE = 4, SIX = 5, SEVEN = 6, EIGHT = 7, NINE = 8, TEN = 9, KING = 12;

describe('slot machine', () => {
  it('returns less than is bet on average, but not absurdly little', () => {
    const expected = slotReturn();
    expect(expected).toBeGreaterThan(0.85); expect(expected).toBeLessThan(1);
    // The phone tells players "about 94 of every 100 chips"; this keeps that true.
    expect(Math.round(expected * 100)).toBe(94);
  });
  it('pays three of a kind and two cherries, nothing else', () => {
    expect(slotMultiplier(['seven', 'seven', 'seven'])).toBe(500);
    expect(slotMultiplier(['cherry', 'lemon', 'cherry'])).toBe(1);
    expect(slotMultiplier(['cherry', 'cherry', 'cherry'])).toBe(10);
    expect(slotMultiplier(['cherry', 'lemon', 'bell'])).toBe(0);
    expect(spinReels(draws(0, 99, 50))).toEqual(['cherry', 'seven', 'lemon']);
  });
});

describe('packs', () => {
  const item = (key: string, rarity: 'common' | 'rare' | 'epic' | 'legendary') => ({ key, name: key, emoji: '', image: null, rarity, flavor: '', retired: false });
  const set: PackSetView = { id: '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e01', name: 'Test', price: 100, sale: null, chances: { common: 70, rare: 22, epic: 7, legendary: 1 }, godPackOdds: 500,
    items: [item('c1', 'common'), item('c2', 'common'), item('r1', 'rare'), item('l1', 'legendary')] };
  it('draws the right number of items by the set\'s chances', () => {
    // 1 of 500 is not a god pack; then 99 of 100 is in the legendary 1 %, 0 is common, 70 is rare.
    const { items, god } = drawPack(set, draws(1, 99, 0, 0, 1, 70, 0, 0, 0));
    expect(god).toBe(false); expect(items).toHaveLength(PACK_SIZE);
    expect(items).toEqual(['l1', 'c2', 'r1', 'c1']);
  });
  it('falls back to the nearest rarity the set has, and uses the owner\'s chances', () => {
    // The set has no epic items: an epic draw becomes the nearest rarer one first (legendary).
    expect(drawPack(set, draws(1, 95, 0, 0, 0, 0, 0, 0, 0)).items[0]).toBe('l1');
    const allRare = { ...set, chances: { common: 0, rare: 100, epic: 0, legendary: 0 }, godPackOdds: 0 };
    expect(drawPack(allRare, draws(0, 0, 50, 0, 99, 0, 10, 0)).items).toEqual(['r1', 'r1', 'r1', 'r1']);
  });
  it('makes a god pack 1 in godPackOdds: epic or legendary only, the last legendary', () => {
    const rich = { ...set, items: [...set.items, item('e1', 'epic')] };
    const { items, god } = drawPack(rich, draws(0, 1, 0, 0, 0, 1, 0, 0));
    expect(god).toBe(true); expect(items).toEqual(['e1', 'l1', 'e1', 'l1']);
  });
});

describe('blackjack', () => {
  it('counts aces as 1 or 11', () => {
    expect(handTotal([ACE, KING])).toEqual({ total: 21, soft: true });
    expect(handTotal([ACE, ACE, NINE])).toEqual({ total: 21, soft: true });
    expect(handTotal([ACE, NINE, FIVE])).toEqual({ total: 15, soft: false });
  });
  it('settles naturals at once: 3 to 2 for the player, a push when both have one', () => {
    expect(outcomeOf({ player: [ACE, KING], dealer: [NINE, SEVEN], doubled: false }, false)).toBe('blackjack');
    expect(payoutFor('blackjack', 25)).toBe(62);
    expect(outcomeOf({ player: [ACE, KING], dealer: [ACE, TEN], doubled: false }, false)).toBe('push');
    expect(outcomeOf({ player: [NINE, SEVEN], dealer: [ACE, TEN], doubled: false }, false)).toBe('lose');
    expect(outcomeOf({ player: [NINE, SEVEN], dealer: [TEN, SEVEN], doubled: false }, false)).toBeNull();
  });
  it('lets the dealer draw to 17 when the player stands, and pays a win 1 to 1', () => {
    const hand = deal(draws(TEN, EIGHT, TEN, SIX)); // player 18, dealer 16
    const done = move(hand, 'stand', draws(FIVE)); // dealer 21
    expect(done.state.dealer).toHaveLength(3); expect(done.outcome).toBe('lose');
    const won = move(hand, 'stand', draws(KING)); // dealer busts with 26
    expect(won.outcome).toBe('win'); expect(payoutFor(won.outcome, 50)).toBe(100);
    expect(payoutFor('push', 50)).toBe(50); expect(payoutFor('lose', 50)).toBe(0); expect(payoutFor('bust', 50)).toBe(0);
  });
  it('ends a busted hand without the dealer playing, and a double takes exactly one card', () => {
    const hand = deal(draws(TEN, SIX, TEN, SEVEN));
    const bust = move(hand, 'hit', draws(KING));
    expect(bust.outcome).toBe('bust'); expect(bust.state.dealer).toHaveLength(2);
    const doubled = move(hand, 'double', draws(FIVE));
    expect(doubled.state.player).toHaveLength(3); expect(doubled.state.doubled).toBe(true); expect(doubled.outcome).toBe('win');
  });
  it('never shows the dealer’s hidden card while the hand is open', () => {
    const state = { player: [TEN, SIX], dealer: [NINE, SEVEN], doubled: false };
    const open = handView({ id: '00000000-0000-4000-8000-000000000000', step: 0, bet: 10, payout: 0 }, state, null, true);
    expect(open.dealer).toEqual([NINE, null]); expect(open.dealerTotal).toBeNull(); expect(open.canDouble).toBe(true);
    expect(JSON.stringify(open)).not.toContain(`${SEVEN}]`);
    const closed = handView({ id: '00000000-0000-4000-8000-000000000000', step: 1, bet: 10, payout: 0 }, state, 'lose', true);
    expect(closed.dealer).toEqual([NINE, SEVEN]); expect(closed.canDouble).toBe(false);
  });
});
