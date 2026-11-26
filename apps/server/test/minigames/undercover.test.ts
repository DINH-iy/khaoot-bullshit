import { describe, expect, it } from 'vitest';
import { MINIGAMES, undercoverGuessMatches, type UndercoverSettings } from '@party/contracts';
import { activeIds, dealUndercover, undercoverMove, undercoverOwn, undercoverView, undercoverWinners, type UndercoverTable } from '../../src/minigames/undercover/rules.js';
import { GameError } from '../../src/game/errors.js';

const now = new Date('2026-11-25T10:00:00.000Z');
const later = (seconds: number) => new Date(now.getTime() + seconds * 1000);
const ids = Array.from({ length: 6 }, (_, index) => `20000000-0000-4000-8000-00000000000${index + 1}`);
const settings = (extra: Partial<UndercoverSettings> = {}): UndercoverSettings => ({ ...(MINIGAMES.undercover.defaults as UndercoverSettings), pairs: [['coffee', 'tea']], ...extra });
// A fixed table: roles by place in the speaking order (players not listed are civilians).
function table(players: number, roles: ('civilian' | 'undercover' | 'white')[]): UndercoverTable {
  const order = ids.slice(0, players);
  return { words: ['coffee', 'tea'], roles: Object.fromEntries(order.map((id, index) => [id, roles[index] ?? 'civilian'])), order, out: [], round: 1, phase: 'clues', turn: 0,
    turnEndsAt: later(30).toISOString(), votes: {}, voteEndsAt: null, last: null, guesserId: null, guessEndsAt: null, winner: null, tooFew: false };
}
const refused = (run: () => unknown, code: string) => { try { run(); } catch (error) { return error instanceof GameError && error.code === code; } return false; };
/** Everyone still in gives their clue in turn. */
function clues(start: UndercoverTable, at = now) {
  let state = start;
  for (const id of activeIds(start)) state = undercoverMove(state, settings(), { action: 'clued', round: state.round }, id, at);
  return state;
}
const vote = (state: UndercoverTable, voter: string, target: string) => undercoverMove(state, settings(), { action: 'vote', round: state.round, playerId: target }, voter, now);

describe('Undercover / Mr. White', () => {
  it('deals fewer impostors than civilians, Mr. White only from 5 players and never first to speak; with 2 players there is no game', () => {
    let seed = 0; const random = (max: number) => (seed++ * 7) % max;
    for (const count of [3, 4, 5, 6]) {
      const dealt = dealUndercover(settings({ undercovers: 3 }), ids.slice(0, count), now, random);
      const roles = Object.values(dealt.roles);
      const impostors = roles.filter(role => role !== 'civilian').length;
      expect(roles.filter(role => role === 'white')).toHaveLength(count >= 5 ? 1 : 0);
      expect(roles.filter(role => role === 'undercover').length).toBeGreaterThanOrEqual(1);
      expect(impostors, `${count} players`).toBeLessThan(count - impostors);
      expect(dealt.roles[dealt.order[0]!]).not.toBe('white');
      expect(dealt.words.sort()).toEqual(['coffee', 'tea']);
    }
    expect(dealUndercover(settings(), ids.slice(0, 2), now, () => 0)).toMatchObject({ tooFew: true, phase: 'done', winner: null });
  });

  it('takes clues in turn; anyone moves on once a turn is over, the host at any time; a late tap from the round before is refused', () => {
    const start = table(4, ['civilian', 'undercover']);
    expect(refused(() => undercoverMove(start, settings(), { action: 'clued', round: 1 }, ids[1]!, now), 'INELIGIBLE')).toBe(true);
    expect(refused(() => undercoverMove(start, settings(), { action: 'next', round: 1 }, ids[1]!, now), 'INVALID_STATE')).toBe(true);
    const skipped = undercoverMove(start, settings(), { action: 'next', round: 1 }, ids[1]!, later(31));
    expect(undercoverView(skipped).speakerId).toBe(ids[1]);
    expect(undercoverView(undercoverMove(skipped, settings(), { action: 'next', round: 1 }, null, now)).speakerId).toBe(ids[2]);
    expect(clues(start).phase).toBe('vote');
    expect(refused(() => undercoverMove(clues(start), settings(), { action: 'clued', round: 2 }, ids[0]!, now), 'INVALID_STATE')).toBe(true);
  });

  it('votes: never yourself; a tie goes to a re-vote, a tie again sends nobody out; the most votes is out with their role shown; the civilians win once every impostor is out', () => {
    let state = clues(table(4, ['civilian', 'undercover']));
    expect(refused(() => vote(state, ids[0]!, ids[0]!), 'INVALID_SUBMISSION')).toBe(true);
    state = vote(vote(state, ids[0]!, ids[1]!), ids[1]!, ids[0]!);
    expect(undercoverView(state).voters).toEqual([ids[0], ids[1]]);
    state = vote(vote(state, ids[2]!, ids[3]!), ids[3]!, ids[2]!); // all voted: 1 each, a tie
    expect(state).toMatchObject({ round: 1, phase: 'vote', votes: {}, out: [], runoff: ids.slice(0, 4) });
    expect(undercoverView(state).runoff).toEqual(ids.slice(0, 4));
    state = vote(vote(state, ids[0]!, ids[1]!), ids[1]!, ids[0]!);
    state = vote(vote(state, ids[2]!, ids[3]!), ids[3]!, ids[2]!); // the re-vote ties too: nobody is out
    expect(state).toMatchObject({ round: 2, phase: 'clues', out: [] });
    expect(state.runoff).toBeUndefined();
    expect(state.last?.outId).toBeNull();
    state = clues(state);
    for (const voter of [0, 2, 3]) state = vote(state, ids[voter]!, ids[1]!);
    state = vote(state, ids[1]!, ids[0]!);
    expect(undercoverView(state).out).toEqual([{ playerId: ids[1], role: 'undercover', round: 2 }]);
    expect(state).toMatchObject({ phase: 'done', winner: 'civilians' });
    expect([...undercoverWinners(state)].sort()).toEqual([ids[0], ids[2], ids[3]].sort());
  });

  it('a re-vote is only between the tied players, and decides who is out', () => {
    let state = clues(table(5, ['civilian', 'undercover']));
    // 2 votes for player 1, 2 for player 2, 1 for player 3: a tie between 1 and 2.
    for (const [voter, target] of [[0, 1], [3, 1], [1, 2], [4, 2], [2, 3]] as const) state = vote(state, ids[voter]!, ids[target]!);
    expect(state).toMatchObject({ phase: 'vote', runoff: [ids[1], ids[2]] });
    expect(state.last).toMatchObject({ round: 1, outId: null });
    expect(refused(() => vote(state, ids[0]!, ids[3]!), 'INVALID_SUBMISSION')).toBe(true);
    // The tied players vote too (for the other one).
    for (const [voter, target] of [[0, 1], [1, 2], [2, 1], [3, 1], [4, 2]] as const) state = vote(state, ids[voter]!, ids[target]!);
    expect(undercoverView(state).out).toEqual([{ playerId: ids[1], role: 'undercover', round: 1 }]);
    expect(state.runoff).toBeUndefined();
  });

  it('the impostors win when they are as many as the civilians left', () => {
    let state = clues(table(4, ['civilian', 'undercover']));
    for (const voter of [0, 1, 3]) state = vote(state, ids[voter]!, ids[2]!);
    state = vote(state, ids[2]!, ids[1]!);
    expect(state).toMatchObject({ round: 2, phase: 'clues' });
    state = clues(state);
    for (const voter of [0, 1]) state = vote(state, ids[voter]!, ids[3]!);
    state = vote(state, ids[3]!, ids[1]!);
    expect(state).toMatchObject({ phase: 'done', winner: 'impostors' });
    expect([...undercoverWinners(state)]).toEqual([ids[1]]);
  });

  it('a voted-out Mr. White guesses the civilians’ word: right wins alone, wrong (or time up) plays on', () => {
    const out = () => { let state = clues(table(5, ['white', 'undercover'])); for (const voter of [1, 2, 3, 4]) state = vote(state, ids[voter]!, ids[0]!); return vote(state, ids[0]!, ids[1]!); };
    expect(out()).toMatchObject({ phase: 'guess', guesserId: ids[0] });
    expect(refused(() => undercoverMove(out(), settings(), { action: 'guess', round: 1, guess: 'coffee' }, ids[1]!, now), 'INELIGIBLE')).toBe(true);
    const right = undercoverMove(out(), settings(), { action: 'guess', round: 1, guess: ' Coffee! ' }, ids[0]!, now);
    expect(right).toMatchObject({ phase: 'done', winner: 'white', guess: ' Coffee! ' });
    expect([...undercoverWinners(right)]).toEqual([ids[0]]);
    expect(undercoverMove(out(), settings(), { action: 'guess', round: 1, guess: 'tea' }, ids[0]!, now)).toMatchObject({ phase: 'clues', round: 2, winner: null });
    expect(undercoverMove(out(), settings(), { action: 'next', round: 1 }, ids[3]!, later(31))).toMatchObject({ phase: 'clues', round: 2 });
    expect(undercoverGuessMatches('Café', 'cafe')).toBe(true);
  });

  it('shows each phone only its own word, and the screens no word nor the role of anyone still in', () => {
    const start = table(4, ['white', 'undercover']);
    expect(undercoverOwn(start, ids[0]!)).toEqual({ word: null, vote: null });
    expect(undercoverOwn(start, ids[1]!)?.word).toBe('tea');
    expect(undercoverOwn(start, ids[2]!)?.word).toBe('coffee');
    const shown = JSON.stringify(undercoverView(start));
    expect(shown).not.toMatch(/coffee|tea|white|undercover|civilian/);
  });
});
