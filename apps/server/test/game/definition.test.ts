import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { assertExecutable, canonicalJson, contentHash, executionStages, parseDefinition } from '../../src/game/definition.js';
import { preparedGame } from '../../src/game/prepared-game.js';

describe('server-only game definitions', () => {
  it('follows graph connections rather than node array order', () => {
    const shuffled = parseDefinition({ ...preparedGame, nodes: [...preparedGame.nodes].reverse() });
    expect(executionStages(shuffled).map(entry => entry.nodeKey)).toEqual(['quiz', 'challenge', 'joke']);
  });
  it('rejects cycles, missing endpoints, unreachable nodes and ambiguous routes', () => {
    for (const edges of [[], [...preparedGame.edges, { key: 'loop', from: 'joke', to: 'quiz' }], [{ key: 'missing', from: 'quiz', to: 'absent' }], [...preparedGame.edges, { key: 'branch', from: 'quiz', to: 'joke' }]]) {
      expect(() => parseDefinition({ ...preparedGame, edges })).toThrow('INVALID_DEFINITION');
    }
    expect(() => parseDefinition({ ...preparedGame, nodes: [...preparedGame.nodes, preparedGame.nodes[0]] })).toThrow('INVALID_DEFINITION');
  });
  it('validates secret scoring and fails closed on not-yet-supported timed/drawing execution', () => {
    const game = structuredClone(preparedGame);
    const stage = game.nodes[0]!.stages[0]!;
    if (stage.kind !== 'collect') throw new Error('Fixture');
    stage.scoring = { kind: 'correct-choice', correctChoiceKey: 'missing', awardMilli: '1000' };
    expect(() => parseDefinition(game)).toThrow('INVALID_DEFINITION');
    stage.scoring = { kind: 'none' };
    stage.durationMs = 1000;
    expect(() => assertExecutable(parseDefinition(game))).toThrow('UNSUPPORTED_FEATURE');
    stage.durationMs = null;
    stage.input = { kind: 'drawing', maxStrokes: 100 };
    expect(() => assertExecutable(parseDefinition(game))).toThrow('UNSUPPORTED_FEATURE');
  });
  it('hashes equivalent parsed command objects independently of property order', () => {
    fc.assert(fc.property(fc.string({ maxLength: 100 }), fc.integer(), (text, revision) => {
      expect(contentHash({ revision, value: { text, kind: 'text' } })).toBe(contentHash({ value: { kind: 'text', text }, revision }));
      expect(canonicalJson({ text })).not.toBe(canonicalJson({ text: text + 'x' }));
    }));
  });
});
