import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { assertExecutable, canonicalJson, contentHash, parseDefinition } from '../../src/game/definition.js';
import { firstStage, nextStage } from '../../src/game/graph.js';
import { preparedGame } from '../../src/game/prepared-game.js';

describe('server-only game definitions', () => {
  it('follows graph connections rather than node array order', () => {
    const shuffled = parseDefinition({ ...preparedGame, nodes: [...preparedGame.nodes].reverse() });
    const visited: string[] = []; let at: ReturnType<typeof nextStage> = firstStage(shuffled);
    while (typeof at === 'object') { visited.push(at.nodeKey); at = nextStage(shuffled, { nodeKey: at.nodeKey, stageKey: at.stage.key }, null); }
    expect(visited).toEqual(['quiz', 'challenge', 'joke']); expect(at).toBe('END');
  });
  it('rejects cycles, missing endpoints, unreachable nodes and ambiguous routes', () => {
    for (const edges of [[], [...preparedGame.edges, { key: 'loop', from: 'joke', to: 'quiz' }], [{ key: 'missing', from: 'quiz', to: 'absent' }], [...preparedGame.edges, { key: 'branch', from: 'quiz', to: 'joke' }]]) {
      expect(() => parseDefinition({ ...preparedGame, edges })).toThrow('INVALID_DEFINITION');
    }
    expect(() => parseDefinition({ ...preparedGame, nodes: [...preparedGame.nodes, preparedGame.nodes[0]] })).toThrow('INVALID_DEFINITION');
  });
  it('accepts points by closeness only for target minigames, within what they can measure', () => {
    const withMinigame = (stage: Record<string, unknown>) => { const game = structuredClone(preparedGame) as unknown as { nodes: { stages: Record<string, unknown>[] }[] };
      game.nodes[0]!.stages[0] = { key: 'play', kind: 'minigame', prompt: 'Play', durationMs: 20_000, ...stage }; return () => parseDefinition(game); };
    expect(withMinigame({ game: 'cut-the-line', scoring: { kind: 'scale', distance: 20, pointsMilli: '10000' } })).not.toThrow();
    expect(withMinigame({ game: 'cut-the-line', scoring: { kind: 'within', distance: 101, pointsMilli: '10000' } })).toThrow('INVALID_DEFINITION');
    expect(withMinigame({ game: 'tap-race', settings: { seconds: 10 }, scoring: { kind: 'within', distance: 5, pointsMilli: '10000' } })).toThrow('INVALID_DEFINITION');
  });
  it('accepts a minigame draw in one scene only when every game in it can be played there', () => {
    const withMinigame = (stage: Record<string, unknown>) => { const game = structuredClone(preparedGame) as unknown as { nodes: { stages: Record<string, unknown>[] }[] };
      game.nodes[0]!.stages[0] = { key: 'play', kind: 'minigame', prompt: 'Play', durationMs: 20_000, game: 'reaction', ...stage }; return () => parseDefinition(game); };
    expect(withMinigame({ draw: [{ game: 'reaction' }, { game: 'tap-race', settings: { seconds: 10 }, durationMs: 30_000 }] })).not.toThrow();
    expect(withMinigame({ draw: [{ game: 'reaction' }] })).toThrow('INVALID_DEFINITION'); // a draw needs two games
    expect(withMinigame({ draw: [{ game: 'reaction' }, { game: 'reaction' }] })).toThrow('INVALID_DEFINITION'); // each once
    expect(withMinigame({ draw: [{ game: 'reaction' }, { game: 'quidditch' }] })).toThrow('INVALID_DEFINITION');
    expect(withMinigame({ draw: [{ game: 'reaction' }, { game: 'tap-race', settings: { seconds: 999 } }] })).toThrow('INVALID_DEFINITION');
    expect(withMinigame({ draw: [{ game: 'reaction' }, { game: 'bus' }] })).toThrow('INVALID_DEFINITION'); // a team game, solo scene
    expect(withMinigame({ draw: [{ game: 'reaction' }, { game: 'clap-beat', durationMs: 2000 }] })).toThrow('INVALID_DEFINITION');
  });

  it('validates secret scoring, runs timed stages and drawing rounds, and fails closed on an unchosen minigame', () => {
    const game = structuredClone(preparedGame);
    const stage = game.nodes[0]!.stages[0]!;
    if (stage.kind !== 'collect') throw new Error('Fixture');
    stage.scoring = { kind: 'correct-choice', correctChoiceKey: 'missing', awardMilli: '1000' };
    expect(() => parseDefinition(game)).toThrow('INVALID_DEFINITION');
    stage.scoring = { kind: 'none' };
    for (const durationMs of [999, 3_600_001, 1500.5]) { stage.durationMs = durationMs; expect(() => parseDefinition(game)).toThrow('INVALID_DEFINITION'); }
    stage.durationMs = 1000;
    expect(() => assertExecutable(parseDefinition(game))).not.toThrow();
    stage.input = { kind: 'drawing', maxStrokes: 100, blind: true };
    expect(() => assertExecutable(parseDefinition(game))).not.toThrow();
    game.nodes[0]!.stages[0] = { key: stage.key, kind: 'minigame', prompt: 'Later', game: 'to-be-chosen', durationMs: null };
    expect(() => assertExecutable(parseDefinition(game))).toThrow('UNSUPPORTED_FEATURE');
  });
  it('validates ordering rounds and keeps old definitions without a layout hashing the same', () => {
    const order = (correctOrder: string[], items = ['a', 'b', 'c']) => ({ formatVersion: 1, title: 'Order', startNodeKey: 'n', edges: [], nodes: [{ key: 'n', stages: [{ key: 's', kind: 'collect', prompt: 'Sort', durationMs: null,
      input: { kind: 'order', items: items.map(key => ({ key, label: key })) }, scoring: { kind: 'correct-order', correctOrder, awardMilli: '1000' } }] }] });
    expect(() => parseDefinition(order(['c', 'a', 'b']))).not.toThrow();
    for (const wrong of [['a', 'b'], ['a', 'b', 'b'], ['a', 'b', 'x'], ['a', 'b', 'c', 'd']]) expect(() => parseDefinition(order(wrong))).toThrow('INVALID_DEFINITION');
    expect(() => parseDefinition(order(['a', 'a'], ['a', 'a']))).toThrow('INVALID_DEFINITION');
    // Adding the optional layout must not change what an already published game parses to.
    expect(contentHash(parseDefinition(structuredClone(preparedGame)))).toBe(contentHash(preparedGame));
    expect(JSON.stringify(parseDefinition(structuredClone(preparedGame)))).not.toContain('layout');
  });
  it('hashes equivalent parsed command objects independently of property order', () => {
    fc.assert(fc.property(fc.string({ maxLength: 100 }), fc.integer(), (text, revision) => {
      expect(contentHash({ revision, value: { text, kind: 'text' } })).toBe(contentHash({ value: { kind: 'text', text }, revision }));
      expect(canonicalJson({ text })).not.toBe(canonicalJson({ text: text + 'x' }));
    }));
  });
});

describe('show-only scenes', () => {
  const base = { formatVersion: 1, title: 'Show', startNodeKey: 'n', edges: [] };
  const info = { key: 'intro', kind: 'info', title: 'FRIDAY NIGHT.', prompt: 'Welcome', durationMs: 30_000 };
  const board = { key: 'board', kind: 'scoreboard', prompt: 'Standings', show: 'both', durationMs: null };
  it('accepts info and scoreboard scenes, and refuses answers, scoring or play settings on them', () => {
    expect(() => parseDefinition({ ...base, nodes: [{ key: 'n', stages: [info, board] }] })).not.toThrow();
    for (const extra of [{ play: { kind: 'solo' } }, { input: { kind: 'text', maxLength: 5 } }, { scoring: { kind: 'none' } }]) {
      expect(() => parseDefinition({ ...base, nodes: [{ key: 'n', stages: [{ ...info, ...extra }] }] })).toThrow('INVALID_DEFINITION');
    }
    expect(() => parseDefinition({ ...base, nodes: [{ key: 'n', stages: [{ ...board, show: 'everyone' }] }] })).toThrow('INVALID_DEFINITION');
    expect(() => parseDefinition({ ...base, nodes: [{ key: 'n', stages: [{ ...info, title: '' }] }] })).toThrow('INVALID_DEFINITION');
  });
});
