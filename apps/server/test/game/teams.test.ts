import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { randomAssignment, route, type TeamContext } from '../../src/game/teams.js';

const ids = (count: number) => Array.from({ length: count }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
const sizesOf = (assignment: Record<string, number | null>, teams: number) => Array.from({ length: teams }, (_, index) => Object.values(assignment).filter(team => team === index).length);

describe('random team splits', () => {
  it('balances a team count to within one player and places everyone', () => {
    fc.assert(fc.property(fc.integer({ min: 2, max: 12 }), fc.integer({ min: 0, max: 60 }), (teams, players) => {
      const assignment = randomAssignment(Array.from({ length: teams }, (_, index) => ({ name: `T${index}`, targetSize: null })), ids(players), true);
      const sizes = sizesOf(assignment, teams);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(players);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    }));
  });
  it('fills fixed sizes first, gives the rest to the "rest" team, and otherwise sits the extras out', () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 1, max: 6 }), { minLength: 1, maxLength: 5 }), fc.boolean(), fc.integer({ min: 0, max: 30 }), (fixed, withRest, players) => {
      const teams = [...fixed.map(size => ({ name: 'x', targetSize: size })), ...(withRest ? [{ name: 'rest', targetSize: null }] : [])];
      const assignment = randomAssignment(teams, ids(players), false);
      const sizes = sizesOf(assignment, teams.length);
      fixed.forEach((size, index) => expect(sizes[index]).toBeLessThanOrEqual(size));
      const placedFixed = sizes.slice(0, fixed.length).reduce((a, b) => a + b, 0);
      expect(placedFixed).toBe(Math.min(players, fixed.reduce((a, b) => a + b, 0)));
      const sittingOut = Object.values(assignment).filter(team => team === null).length;
      expect(withRest ? sittingOut : sizes.reduce((a, b) => a + b, 0) + sittingOut).toBe(withRest ? 0 : players);
    }));
  });
});

describe('where team points go', () => {
  const [a, b, c] = ids(3) as [string, string, string];
  const context = (points: TeamContext['points']): TeamContext => ({ lineupId: 'lineup', answers: 'captain', points, teamOf: new Map([[a, 'red'], [b, 'red'], [c, 'blue']]), members: new Map([['red', [a, b]], ['blue', [c]]]), captainOf: new Map() });
  const base = { amountMilli: 1000n, stageRunId: 'stage', awardKey: 'k', reason: 'r' };
  it('routes a team answer to the team, each member, or both, with unique keys', () => {
    expect(route(base, { teamId: 'red' }, context('team')).map(award => [award.teamId, award.playerId])).toEqual([['red', undefined]]);
    expect(route(base, { teamId: 'red' }, context('members')).map(award => award.playerId)).toEqual([a, b]);
    const both = route(base, { teamId: 'red' }, context('both'));
    expect(both).toHaveLength(3); expect(new Set(both.map(award => award.awardKey)).size).toBe(3);
  });
  it('routes a member answer to that member and their team, and solo answers to the player alone', () => {
    expect(route(base, { playerId: c }, context('both')).map(award => [award.teamId, award.playerId])).toEqual([['blue', undefined], [undefined, c]]);
    expect(route(base, { playerId: a }, null)).toEqual([{ ...base, playerId: a }]);
    expect(route({ ...base, amountMilli: 0n }, { teamId: 'red' }, context('both'))).toEqual([]);
  });
});
