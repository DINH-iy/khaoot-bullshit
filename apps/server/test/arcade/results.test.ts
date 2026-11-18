import { describe, expect, it } from 'vitest';
import { MINIGAME_KEYS, TEAM_MINIGAMES, type SessionView } from '@party/contracts';
import { arcadeDefinition, arcadeRoundFits } from '../../src/arcade/definition.js';
import { roundResults } from '../../src/arcade/results.js';
import { assertExecutable } from '../../src/game/definition.js';

const ids = { a: '00000000-0000-4000-8000-00000000000a', b: '00000000-0000-4000-8000-00000000000b', c: '00000000-0000-4000-8000-00000000000c', red: '00000000-0000-4000-8000-0000000000e1', blue: '00000000-0000-4000-8000-0000000000e2' };
const seats = [{ memberId: 'm-a', playerId: ids.a, personId: 'p-a' }, { memberId: 'm-b', playerId: ids.b, personId: null }, { memberId: 'm-c', playerId: ids.c, personId: null }];
const viewWith = (stage: Record<string, unknown>) => ({ stage }) as unknown as SessionView;

describe('arcade rounds', () => {
  it('makes a playable one-scene game of every minigame, alone where possible and in teams', () => {
    for (const game of MINIGAME_KEYS) {
      expect(arcadeRoundFits(game, null)).toBe(!TEAM_MINIGAMES.includes(game));
      if (arcadeRoundFits(game, null)) expect(() => assertExecutable(arcadeDefinition(game, null))).not.toThrow();
      for (const formation of ['random', 'players'] as const) expect(() => assertExecutable(arcadeDefinition(game, { count: 2, formation }))).not.toThrow();
    }
  });

  it('records nothing for a round whose results were never shown', () => {
    expect(roundResults(viewWith({ reveal: null, teams: null }), 'tap-race', seats)).toEqual([]);
  });

  it('takes each player’s own place and points alone, with a comparable best only for ranked results', () => {
    const view = viewWith({ teams: null, reveal: { teamAwards: [], awards: [{ playerId: ids.a, amountMilli: '10000' }, { playerId: ids.b, amountMilli: '6000' }],
      answer: { kind: 'minigame', game: 'tap-race', doorsMilli: null, entries: [{ playerId: ids.a, teamId: null, value: 70, place: 1 }, { playerId: ids.b, teamId: null, value: 50, place: 2 }] } } });
    expect(roundResults(view, 'tap-race', seats)).toEqual([
      { memberId: 'm-a', personId: 'p-a', place: 1, pointsMilli: 10000n, value: 70, bestKey: -70 },
      { memberId: 'm-b', personId: null, place: 2, pointsMilli: 6000n, value: 50, bestKey: -50 },
      // Did not play: a round played, nothing more.
      { memberId: 'm-c', personId: null, place: null, pointsMilli: 0n, value: null, bestKey: null }]);
  });

  it('gives team members their team’s place and keeps team rounds out of the best results', () => {
    const view = viewWith({ teams: { forming: false, teams: [{ teamId: ids.red, memberIds: [ids.a, ids.b] }, { teamId: ids.blue, memberIds: [ids.c] }] },
      reveal: { teamAwards: [], awards: [{ playerId: ids.a, amountMilli: '10000' }, { playerId: ids.b, amountMilli: '10000' }],
        answer: { kind: 'minigame', game: 'reaction', doorsMilli: null, entries: [
          { playerId: null, teamId: ids.blue, value: 300, place: 2 }, { playerId: null, teamId: ids.red, value: 250, place: 1 },
          { playerId: ids.a, teamId: ids.red, value: 250, place: null }, { playerId: ids.c, teamId: ids.blue, value: 300, place: null }] } } });
    expect(roundResults(view, 'reaction', seats)).toEqual([
      { memberId: 'm-a', personId: 'p-a', place: 1, pointsMilli: 10000n, value: 250, bestKey: null },
      { memberId: 'm-b', personId: null, place: 1, pointsMilli: 10000n, value: null, bestKey: null },
      { memberId: 'm-c', personId: null, place: 2, pointsMilli: 0n, value: 300, bestKey: null }]);
  });
});
