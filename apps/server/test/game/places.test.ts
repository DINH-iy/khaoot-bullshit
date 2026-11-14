import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { placePoints, type Places } from '@party/contracts';
import { inspectDefinition } from '../../src/authoring/drafts.js';
import { minigameRules, stagePlaces } from '../../src/game/definition.js';

describe('points by place', () => {
  it('uses a list as written', () => {
    expect(placePoints({ kind: 'list', pointsMilli: ['10000', '6000', '3000'] })).toEqual(['10000', '6000', '3000']);
  });
  it('splits a total by the chosen curve, in whole points', () => {
    expect(placePoints({ kind: 'split', totalMilli: '60000', places: 3, curve: 'even' })).toEqual(['30000', '20000', '10000']);
    expect(placePoints({ kind: 'split', totalMilli: '70000', places: 3, curve: 'steep' })).toEqual(['40000', '20000', '10000']);
    expect(placePoints({ kind: 'split', totalMilli: '30000', places: 3, curve: 'equal' })).toEqual(['10000', '10000', '10000']);
    // What does not divide goes to 1st place.
    expect(placePoints({ kind: 'split', totalMilli: '10000', places: 3, curve: 'equal' })).toEqual(['4000', '3000', '3000']);
  });
  it('always adds up to the total, never gives a later place more than an earlier one, and is never negative', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 10_000_000 }), fc.integer({ min: 1, max: 12 }), fc.constantFrom('even', 'steep', 'equal'), (total, count, curve) => {
      const shares = placePoints({ kind: 'split', totalMilli: String(total), places: count, curve: curve as 'even' }).map(BigInt);
      expect(shares).toHaveLength(count);
      expect(shares.reduce((a, b) => a + b, 0n)).toBe(BigInt(total));
      shares.forEach((share, index) => { expect(share >= 0n).toBe(true); if (index) expect(share <= shares[index - 1]!).toBe(true); });
    }));
  });
});

const split: Places = { kind: 'split', totalMilli: '30000', places: 3, curve: 'even' };
const game = (stages: object[]) => ({ formatVersion: 2, title: 'Places', startNodeKey: 'write', edges: [],
  nodes: [{ key: 'write', stages: [{ key: 'joke', kind: 'collect', prompt: 'Write', durationMs: null, input: { kind: 'text', maxLength: 200 }, scoring: { kind: 'none' } }, ...stages] }] });
describe('scenes that pay by place', () => {
  it('are accepted on quiz, ordering, vote, challenge and minigame scenes', () => {
    const stages = [
      { key: 'quiz', kind: 'collect', prompt: 'Q', durationMs: null, input: { kind: 'choice', options: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }] }, scoring: { kind: 'correct-choice', correctChoiceKey: 'a', awardMilli: '0', places: split } },
      { key: 'order', kind: 'collect', prompt: 'O', durationMs: null, input: { kind: 'order', items: [{ key: 'x', label: 'X' }, { key: 'y', label: 'Y' }] }, scoring: { kind: 'correct-order', correctOrder: ['x', 'y'], awardMilli: '1000', places: { kind: 'list', pointsMilli: ['5000'] } } },
      { key: 'vote', kind: 'vote', prompt: 'V', durationMs: null, source: { nodeKey: 'write', stageKey: 'joke' }, awardPerVoteMilli: '0', places: split },
      { key: 'challenge', kind: 'challenge', prompt: 'C', durationMs: null, maxAwardMilli: '0', places: split },
      { key: 'game', kind: 'minigame', prompt: 'M', durationMs: 20000, game: 'tap-race', places: split },
    ];
    const inspected = inspectDefinition(game(stages));
    expect(inspected.issues).toEqual([]);
    const all = inspected.definition!.nodes[0]!.stages;
    expect(all.slice(1, 5).map(stagePlaces)).toEqual([['15000', '10000', '5000'], ['5000'], ['15000', '10000', '5000'], ['15000', '10000', '5000']]);
    expect(minigameRules(all[5] as Parameters<typeof minigameRules>[0]).placementMilli).toEqual(['15000', '10000', '5000']);
  });
  it('refuses a minigame with both kinds of place points, and places that are out of range', () => {
    const both = inspectDefinition(game([{ key: 'game', kind: 'minigame', prompt: 'M', durationMs: 20000, game: 'tap-race', places: split, placementMilli: ['1000'] }]));
    expect(both.issues.map(issue => issue.code)).toContain('Give the minigame either points per place or places, not both');
    expect(inspectDefinition(game([{ key: 'c', kind: 'challenge', prompt: 'C', durationMs: null, maxAwardMilli: '0', places: { ...split, places: 13 } }])).issues).not.toEqual([]);
    expect(inspectDefinition(game([{ key: 'c', kind: 'challenge', prompt: 'C', durationMs: null, maxAwardMilli: '0', places: { kind: 'list', pointsMilli: [] } }])).issues).not.toEqual([]);
  });
});
