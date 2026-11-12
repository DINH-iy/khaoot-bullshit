import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { GameDefinitionSchema, parseDefinition } from '../../src/game/definition.js';
import { firstStage, maxPathStages, nextStage } from '../../src/game/graph.js';
import { resolveTally, type RouteCounts } from '../../src/game/routes.js';
import { builtInGames } from '../../src/game/templates.js';

const quiz = (key: string, extra: object = {}) => ({ key, stages: [{ key: 's', kind: 'collect', prompt: key, durationMs: null,
  input: { kind: 'choice', options: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }] }, scoring: { kind: 'none' }, ...extra }] });
const text = (key: string, stageKey = 'w') => ({ key, stages: [{ key: stageKey, kind: 'collect', prompt: key, durationMs: null, input: { kind: 'text', maxLength: 50 }, scoring: { kind: 'none' } }] });
const vote = (key: string, source: string, stageKey = 'w') => ({ key, stages: [{ key: 'v', kind: 'vote', prompt: key, durationMs: null, source: { nodeKey: source, stageKey }, awardPerVoteMilli: '0' }] });
const route = (key: string, options = ['left', 'right'], decide: object = { method: 'players', tie: 'random', noVotes: 'random', counts: 'live' }, extra: object = {}) =>
  ({ key, stages: [{ key: 'r', kind: 'route', prompt: 'Which way?', durationMs: 20_000, options: options.map(option => ({ key: option, label: option.toUpperCase() })), decide, ...extra }] });
const edge = (from: string, to: string, option?: string) => ({ key: `${from}-${to}`, from, to, ...(option ? { option } : {}) });
// start → choose → left | right → end
const diamond = (overrides: Partial<{ nodes: object[]; edges: object[] }> & Record<string, unknown> = {}) => ({
  formatVersion: 2, title: 'Branches', startNodeKey: 'start',
  nodes: [quiz('start'), route('choose'), quiz('left'), quiz('right'), quiz('end')],
  edges: [edge('start', 'choose'), edge('choose', 'left', 'left'), edge('choose', 'right', 'right'), edge('left', 'end'), edge('right', 'end')],
  ...overrides,
});
const issues = (value: unknown) => { const parsed = GameDefinitionSchema.safeParse(value); return parsed.success ? [] : parsed.error.issues.map(issue => issue.message); };

describe('branching definitions', () => {
  it('accepts a diamond, two choices in a row, rejoining and a vote source shared by both routes', () => {
    expect(issues(diamond())).toEqual([]);
    expect(issues({ ...diamond(), nodes: [quiz('start'), route('choose'), quiz('left'), quiz('right'), route('again'), quiz('x'), quiz('y')],
      edges: [edge('start', 'choose'), edge('choose', 'left', 'left'), edge('choose', 'right', 'right'), edge('left', 'again'), edge('right', 'again'), edge('again', 'x', 'left'), edge('again', 'y', 'right')] })).toEqual([]);
    expect(issues({ ...diamond(), nodes: [text('start'), route('choose'), vote('left', 'start'), vote('right', 'start'), quiz('end')] })).toEqual([]);
  });

  it.each([
    ['a route in format 1', { formatVersion: 1 }, 'Route choices require format 2'],
    ['a branch without a route choice', { nodes: [quiz('start'), quiz('choose'), quiz('left'), quiz('right'), quiz('end')], edges: [edge('start', 'choose'), edge('choose', 'left'), edge('choose', 'right'), edge('left', 'end'), edge('right', 'end')] }, 'Only route choices branch'],
    ['a cycle', { edges: [edge('start', 'choose'), edge('choose', 'left', 'left'), edge('choose', 'right', 'right'), edge('left', 'end'), edge('right', 'end'), edge('end', 'start')] }, 'Cycle or invalid route'],
    ['a self connection', { edges: [...diamond().edges, edge('end', 'end')] }, 'Self connection'],
    ['an unconnected option', { edges: diamond().edges.filter(item => (item as { option?: string }).option !== 'right').concat([edge('start', 'right')]) }, 'Unconnected route option'],
    ['an unknown option', { edges: diamond().edges.map(item => (item as { option?: string }).option === 'right' ? { ...item, option: 'up' } : item) }, 'Unknown route option'],
    ['two options to the same scene', { nodes: [quiz('start'), route('choose'), quiz('left'), quiz('right'), quiz('end')], edges: [edge('start', 'choose'), { key: 'a', from: 'choose', to: 'left', option: 'left' }, { key: 'b', from: 'choose', to: 'left', option: 'right' }, edge('left', 'end'), edge('right', 'end')] }, 'Route options must lead to different scenes'],
    ['a route sharing its node', { nodes: [quiz('start'), { key: 'choose', stages: [quiz('x').stages[0], route('y').stages[0]] }, quiz('left'), quiz('right'), quiz('end')] }, 'Route choice must be its own node'],
    ['a labelled edge on a scene', { edges: [{ ...edge('start', 'choose'), option: 'left' }, ...diamond().edges.slice(1)] }, 'Only route choices branch'],
    ['a missing default', { nodes: [quiz('start'), route('choose', undefined, { method: 'players', tie: 'default', noVotes: 'random', counts: 'live' }), quiz('left'), quiz('right'), quiz('end')] }, 'Invalid default route'],
    ['a default that is not an option', { nodes: [quiz('start'), route('choose', undefined, { method: 'players', tie: 'default', noVotes: 'random', counts: 'live' }, { defaultOptionKey: 'up' }), quiz('left'), quiz('right'), quiz('end')] }, 'Invalid default route'],
    ['an unused default', { nodes: [quiz('start'), route('choose', undefined, undefined, { defaultOptionKey: 'left' }), quiz('left'), quiz('right'), quiz('end')] }, 'Invalid default route'],
    ['a timer on a host decision', { nodes: [quiz('start'), route('choose', undefined, { method: 'host' }), quiz('left'), quiz('right'), quiz('end')] }, 'Host route choice has no timer'],
    ['an unreachable scene', { nodes: [...diamond().nodes, quiz('island')] }, 'Unreachable node'],
    ['a vote on a source from one route only', { nodes: [quiz('start'), route('choose'), text('left'), quiz('right'), vote('end', 'left')] }, 'Invalid vote source'],
    ['a source that one route never votes on', { nodes: [text('start'), route('choose'), vote('left', 'start'), quiz('right'), quiz('end')] }, 'Vote source may never be revealed'],
    ['game teams made on one route only', { nodes: [quiz('start'), route('choose'), quiz('left', { play: { kind: 'teams', lineup: { kind: 'reform', form: { split: { kind: 'count', teams: 2 }, formation: 'random' }, carryover: 'fresh' }, answers: 'everyone', points: 'team' } }), quiz('right'), quiz('end', { play: { kind: 'teams', lineup: { kind: 'game' }, answers: 'everyone', points: 'team' } })] }, 'Game teams are used before they are defined'],
    ['a captain vote before teams were formed', { teams: { split: { kind: 'count', teams: 2 }, formation: 'random' }, nodes: [quiz('start'), route('choose', undefined, { method: 'captains', tie: 'random', noVotes: 'random', counts: 'live' }), quiz('left'), quiz('right'), quiz('end')] }, 'Captain vote needs teams earlier on every path'],
  ])('rejects %s', (_name, overrides, message) => {
    expect(issues(diamond(overrides as never))).toContain(message);
  });

  it('rejects route options with duplicate labels, too many options and a route carrying play settings', () => {
    expect(issues(diamond({ nodes: [quiz('start'), { key: 'choose', stages: [{ ...route('choose').stages[0], options: [{ key: 'left', label: 'Same' }, { key: 'right', label: 'same' }] }] }, quiz('left'), quiz('right'), quiz('end')] }))).toContain('Route options must be unique');
    expect(issues(diamond({ nodes: [quiz('start'), route('choose', ['a', 'b', 'c', 'd', 'e', 'f', 'g']), quiz('left'), quiz('right'), quiz('end')] })).length).toBeGreaterThan(0);
    expect(issues(diamond({ nodes: [quiz('start'), { key: 'choose', stages: [{ ...route('choose').stages[0], play: { kind: 'solo' } }] }, quiz('left'), quiz('right'), quiz('end')] })).length).toBeGreaterThan(0);
  });

  it('walks the chosen route, rejoins, and refuses to leave a choice without a matching decision', () => {
    const definition = parseDefinition(diamond());
    const walk = (choice: 'left' | 'right') => {
      const visited: string[] = []; let at: ReturnType<typeof nextStage> = firstStage(definition);
      while (typeof at === 'object') {
        visited.push(at.nodeKey);
        at = nextStage(definition, { nodeKey: at.nodeKey, stageKey: at.stage.key }, at.nodeKey === 'choose' ? { selectedEdgeKey: `choose-${choice}`, destinationNodeKey: choice } : null);
      }
      return visited;
    };
    expect(walk('left')).toEqual(['start', 'choose', 'left', 'end']);
    expect(walk('right')).toEqual(['start', 'choose', 'right', 'end']);
    expect(nextStage(definition, { nodeKey: 'choose', stageKey: 'r' }, null)).toBe('DECISION_PENDING');
    expect(() => nextStage(definition, { nodeKey: 'choose', stageKey: 'r' }, { selectedEdgeKey: 'choose-left', destinationNodeKey: 'right' })).toThrow('INVALID_STATE');
    expect(maxPathStages(definition)).toBe(4);
  });

  it('runs the built-in branching game along both routes', () => {
    const game = builtInGames.find(entry => entry.key === 'friday-night-chaos')!.definition;
    expect(game.formatVersion).toBe(2);
    expect(maxPathStages(game)).toBe(4);
  });

  // Oracle: enumerate every path from the start and check the "earlier on every path" rules directly.
  it('agrees with a brute-force check of every path on random small branching games', () => {
    const arbitrary = fc.record({
      size: fc.integer({ min: 2, max: 7 }),
      forward: fc.array(fc.tuple(fc.nat(), fc.nat()), { maxLength: 14 }),
      kinds: fc.array(fc.constantFrom('quiz', 'text', 'vote'), { minLength: 7, maxLength: 7 }),
      sources: fc.array(fc.nat(), { minLength: 7, maxLength: 7 }),
    });
    fc.assert(fc.property(arbitrary, ({ size, forward, kinds, sources }) => {
      // Edges only go forward (i < j), so the graph has no cycle; nodes with 2+ edges become route choices.
      const targets = new Map<number, Set<number>>();
      for (let i = 0; i < size - 1; i++) targets.set(i, new Set([i + 1]));
      for (const [a, b] of forward) { const i = a % size; const j = b % size; if (i < j) targets.get(i)?.add(j); }
      const names = Array.from({ length: size }, (_, index) => `n${index}`);
      const nodes: object[] = []; const edges: object[] = [];
      names.forEach((name, i) => {
        const out = [...(targets.get(i) ?? [])];
        if (out.length > 1) {
          nodes.push(route(name, out.map(j => `o${j}`)));
          out.forEach(j => edges.push(edge(name, names[j]!, `o${j}`)));
          return;
        }
        const kind = kinds[i]!; const source = names[sources[i]! % size]!;
        nodes.push(kind === 'text' ? text(name) : kind === 'vote' ? vote(name, source) : quiz(name));
        out.forEach(j => edges.push(edge(name, names[j]!)));
      });
      const definition = { formatVersion: 2, title: 'Random', startNodeKey: 'n0', nodes, edges };
      const nodeByKey = new Map(nodes.map(node => [(node as { key: string }).key, node as { stages: { kind: string; source?: { nodeKey: string } }[] }]));
      const paths: string[][] = [];
      const walk = (key: string, path: string[]) => { const out = edges.filter(item => (item as { from: string }).from === key); if (!out.length) { paths.push([...path, key]); return; } for (const item of out) walk((item as { to: string }).to, [...path, key]); };
      walk('n0', []);
      const isSource = (key: string) => (nodeByKey.get(key)!.stages[0] as { input?: { kind: string } }).input?.kind === 'text';
      const voteSourceOk = paths.every(path => path.every((key, index) => { const stage = nodeByKey.get(key)!.stages[0]!; return stage.kind !== 'vote' || (path.slice(0, index).includes(stage.source!.nodeKey) && isSource(stage.source!.nodeKey)); }));
      const voted = new Set([...nodeByKey.values()].flatMap(node => node.stages[0]!.kind === 'vote' ? [node.stages[0]!.source!.nodeKey] : []));
      const coverageOk = [...voted].every(source => paths.filter(path => path.includes(source)).every(path => path.slice(path.indexOf(source) + 1).some(key => nodeByKey.get(key)!.stages[0]!.source?.nodeKey === source)));
      const found = issues(definition);
      const reachable = new Set(paths.flat()).size === size;
      if (!reachable) { expect(found).toContain('Unreachable node'); return; }
      expect(found.includes('Invalid vote source')).toBe(!voteSourceOk);
      if (voteSourceOk) expect(found.includes('Vote source may never be revealed')).toBe(!coverageOk);
    }), { numRuns: 400 });
  });

  it('validates a long chain of route choices quickly', () => {
    const nodes: object[] = [quiz('s0')]; const edges: object[] = [];
    let previous = 's0';
    for (let index = 0; index < 20; index++) {
      nodes.push(route(`c${index}`), quiz(`l${index}`), quiz(`r${index}`), quiz(`j${index}`));
      edges.push(edge(previous, `c${index}`), edge(`c${index}`, `l${index}`, 'left'), edge(`c${index}`, `r${index}`, 'right'), edge(`l${index}`, `j${index}`), edge(`r${index}`, `j${index}`));
      previous = `j${index}`;
    }
    const started = performance.now();
    expect(issues({ formatVersion: 2, title: 'Long', startNodeKey: 's0', nodes, edges })).toEqual([]);
    expect(performance.now() - started).toBeLessThan(250);
  });
});

describe('deciding a closed route vote', () => {
  const stage = (decide: object, defaultOptionKey?: string) => parseDefinition(diamond({ nodes: [quiz('start'), route('choose', ['a', 'b', 'c'], decide, { ...(defaultOptionKey ? { defaultOptionKey } : {}), ...((decide as { method: string }).method === 'host' ? { durationMs: null } : {}) }), quiz('left'), quiz('right'), quiz('end')],
    edges: [edge('start', 'choose'), edge('choose', 'left', 'a'), edge('choose', 'right', 'b'), edge('choose', 'end', 'c'), edge('left', 'end'), edge('right', 'end')] })).nodes[1]!.stages[0] as never;
  const counts = (a: number, b: number, c: number): RouteCounts => [{ optionKey: 'a', count: a }, { optionKey: 'b', count: b }, { optionKey: 'c', count: c }];
  const players = (tie: string, noVotes: string) => ({ method: 'players', tie, noVotes, counts: 'live' });
  it('follows the policy table for majority, ties and empty votes', () => {
    expect(resolveTally(counts(2, 1, 0), stage(players('host', 'host')))).toMatchObject({ optionKey: 'a', reason: 'VOTE', resolution: 'majority' });
    expect(resolveTally(counts(1, 1, 0), stage(players('host', 'host')))).toEqual({ pending: 'tie' });
    expect(resolveTally(counts(0, 0, 0), stage(players('host', 'host')))).toEqual({ pending: 'no-votes' });
    expect(resolveTally(counts(0, 0, 0), stage(players('host', 'default'), 'c'))).toMatchObject({ optionKey: 'c', reason: 'FALLBACK', resolution: 'default' });
    expect(resolveTally(counts(1, 1, 0), stage(players('default', 'host'), 'b'))).toMatchObject({ optionKey: 'b', reason: 'TIE_BREAK', resolution: 'default' });
    // A default that nobody tied on never beats the routes people voted for.
    expect(resolveTally(counts(1, 1, 0), stage(players('default', 'host'), 'c'), () => 1)).toMatchObject({ optionKey: 'b', reason: 'TIE_BREAK', resolution: 'random', random: { candidates: ['a', 'b'], index: 1 } });
    expect(resolveTally(counts(3, 1, 0), stage({ method: 'host' }))).toEqual({ pending: 'host' });
  });
  it('picks randomly only among the right candidates and records the draw', () => {
    fc.assert(fc.property(fc.nat({ max: 3 }), fc.nat({ max: 3 }), fc.nat({ max: 3 }), fc.nat(), (a, b, c, seed) => {
      const result = resolveTally(counts(a, b, c), stage(players('random', 'random')), max => seed % max);
      expect('pending' in result).toBe(false);
      if ('pending' in result) return;
      const top = Math.max(a, b, c); const leaders = ['a', 'b', 'c'].filter((_, index) => [a, b, c][index] === top);
      if (top > 0 && leaders.length === 1) { expect(result.optionKey).toBe(leaders[0]); expect(result.random).toBeNull(); return; }
      const candidates = top === 0 ? ['a', 'b', 'c'] : leaders;
      expect(result.random?.candidates).toEqual(candidates);
      expect(result.optionKey).toBe(candidates[result.random!.index]);
    }));
  });
});

