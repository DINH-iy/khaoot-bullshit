import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { duplicateScenes, pasteScenes, addScene, pointOnCurve, SCENE_TYPES, addConnectedScene, autoLayout, CARD_WIDTH, cardHeight, curve, connect, connectProblem, deleteScene, freeSpot, GRID, inputPort, outputPort, PORT_Y, quizKind, SCENE_GROUPS, setRouteOptions, snapCard, withDuelContest, withMinigame, withQuizKind, type Definition, type Stage } from '../../src/editor/model.js';

const scene = (key: string) => ({ key, stages: [{ key: 'main', kind: 'info', title: key, prompt: key, durationMs: null }] });
const choice = (key: string) => ({ key, stages: [{ key: 'main', kind: 'route', prompt: 'Which way?', durationMs: null, options: [{ key: 'left', label: 'Left' }, { key: 'right', label: 'Right' }], decide: { method: 'host' } }] });
const game = (): Definition => ({ formatVersion: 2, title: 'T', startNodeKey: 'a', nodes: [scene('a'), choice('b'), scene('c'), scene('d')],
  edges: [{ key: 'ab', from: 'a', to: 'b' }, { key: 'bc', from: 'b', to: 'c', option: 'left' }] });

describe('editor snapping', () => {
  it('lands cards on the grid', () => {
    fc.assert(fc.property(fc.integer({ min: -2000, max: 2000 }), fc.integer({ min: -2000, max: 2000 }), (x, y) => {
      const { point } = snapCard(game(), { z: { x: 5000, y: 5000 } }, 'a', { x, y });
      expect(point.x % GRID === 0 && point.y % GRID === 0).toBe(true);
    }));
  });
  it('pulls a card level with the port that feeds it, so the line runs straight', () => {
    const definition = game(); const positions = { a: { x: 0, y: 0 }, b: { x: 360, y: 0 }, c: { x: 720, y: 300 } };
    const port = outputPort(definition.nodes[1]!, positions.b, 'left');
    const { point, guides } = snapCard(definition, positions, 'c', { x: 720, y: port.y - PORT_Y + 9 });
    expect(inputPort(point).y).toBe(port.y); expect(guides.y).toBe(port.y);
  });
  it('aligns with another card’s left edge when close', () => {
    const { point, guides } = snapCard(game(), { a: { x: 0, y: 0 }, d: { x: 480, y: 600 } }, 'c', { x: 489, y: 300 });
    expect(point.x).toBe(480); expect(guides.x).toBe(480);
  });
  it('moves a dropped card off any card it would overlap', () => {
    const definition = game(); const positions = { a: { x: 0, y: 0 }, c: { x: 0, y: 0 } };
    const spot = freeSpot(definition, positions, 'c', { x: 0, y: 0 });
    expect(spot.y).toBeGreaterThanOrEqual(cardHeight(definition.nodes[0]!) + GRID);
  });
  it('lays out every scene on the grid without overlaps', () => {
    const definition = game(); const positions = autoLayout(definition);
    const keys = Object.keys(positions); expect(keys.sort()).toEqual(['a', 'b', 'c', 'd']);
    for (const [i, a] of keys.entries()) for (const b of keys.slice(i + 1)) {
      const p = positions[a]!; const q = positions[b]!;
      const apart = p.x + CARD_WIDTH <= q.x || q.x + CARD_WIDTH <= p.x || p.y + 300 <= q.y || q.y + 300 <= p.y || p.x !== q.x;
      expect(apart || Math.abs(p.y - q.y) >= 168).toBe(true);
    }
  });
});

describe('editor connections', () => {
  it('gives each output one connection, replacing the old one', () => {
    const next = connect(game(), 'a', undefined, 'd');
    expect(next.edges.filter(edge => edge.from === 'a').map(edge => edge.to)).toEqual(['d']);
    const routed = connect(next, 'b', 'right', 'd');
    expect(routed.edges.filter(edge => edge.from === 'b').map(edge => [edge.option, edge.to]).sort()).toEqual([['left', 'c'], ['right', 'd']]);
  });
  it('refuses circles, self-connections and two options to the same scene', () => {
    const definition = game();
    expect(connectProblem(definition, 'c', undefined, 'a')).toBe('circle');
    expect(connectProblem(definition, 'c', undefined, 'c')).toBe('self');
    expect(connectProblem(definition, 'b', 'right', 'c')).toBe('same-scene');
    expect(connect(definition, 'c', undefined, 'a')).toBe(definition);
  });
  it('removes a route option’s connection with the option, and keeps a start scene when deleting', () => {
    const definition = connect(game(), 'b', 'right', 'd');
    const fewer = setRouteOptions(definition, 'b', [{ key: 'left', label: 'Left' }]);
    expect(fewer.edges.some(edge => edge.option === 'right')).toBe(false);
    const withoutStart = deleteScene(definition, 'a');
    expect(withoutStart.startNodeKey).toBe('b'); expect(withoutStart.edges.some(edge => edge.from === 'a' || edge.to === 'a')).toBe(false);
  });
  it('adds a scene already connected, switching older games to the branching format when needed', () => {
    const old = { ...game(), formatVersion: 1, nodes: [scene('a')], edges: [] };
    const added = addConnectedScene(old, 'route', 'a', undefined);
    expect(added.definition.formatVersion).toBe(2);
    expect(added.definition.edges).toEqual([expect.objectContaining({ from: 'a', to: added.key })]);
  });
});

describe('editor scene types and arrow handles', () => {
  it('offers every scene type, each with a valid starting part', () => {
    for (const { type } of SCENE_TYPES) {
      const { definition, key } = addScene(game(), type);
      const node = definition.nodes.find(candidate => candidate.key === key)!;
      expect(node.stages).toHaveLength(1); expect(typeof node.stages[0]!.kind).toBe('string');
    }
  });
  it('places an arrow handle on its own curve, so two arrows into one scene get separate handles', () => {
    const end = { x: 500, y: 100 };
    const a = pointOnCurve({ x: 0, y: 0 }, end, 0.82); const b = pointOnCurve({ x: 0, y: 300 }, end, 0.82);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(20);
    expect(pointOnCurve({ x: 0, y: 0 }, end, 1)).toEqual(end);
  });
});

describe('copying scenes', () => {
  const writing = (key: string) => ({ key, stages: [{ key: 'main', kind: 'collect', prompt: 'Joke', durationMs: null, input: { kind: 'text', maxLength: 50 }, scoring: { kind: 'none' } }] });
  const vote = (key: string, source: string) => ({ key, stages: [{ key: 'main', kind: 'vote', prompt: 'Vote', durationMs: null, source: { nodeKey: source, stageKey: 'main' }, awardPerVoteMilli: '0' }] });
  const base = (): Definition => ({ formatVersion: 1, title: 'C', startNodeKey: 'a', nodes: [scene('a'), writing('w'), vote('v', 'w')], edges: [{ key: 'aw', from: 'a', to: 'w' }, { key: 'wv', from: 'w', to: 'v' }] });
  const at = { a: { x: 0, y: 0 }, w: { x: 360, y: 0 }, v: { x: 720, y: 0 } };
  it('duplicates scenes with the connections between them, renames them, and points copied votes at the copied round', () => {
    const result = duplicateScenes(base(), at, ['w', 'v']);
    expect(result.keys).toEqual(['w-copy-1', 'v-copy-1']);
    expect(result.definition.edges.filter(edge => edge.from.endsWith('copy-1'))).toEqual([expect.objectContaining({ from: 'w-copy-1', to: 'v-copy-1' })]);
    expect(result.definition.edges.some(edge => edge.from === 'a' && edge.to === 'w-copy-1')).toBe(false);
    expect(result.definition.nodes.find(node => node.key === 'v-copy-1')!.stages[0]!['source']).toEqual({ nodeKey: 'w-copy-1', stageKey: 'main' });
    expect(result.positions['w-copy-1']).toEqual({ x: 360 + GRID * 2, y: GRID * 2 });
    // Copying a copy does not stack suffixes.
    expect(duplicateScenes(result.definition, result.positions, ['w-copy-1']).keys).toEqual(['w-copy-2']);
  });
  it('pastes into another game without clashing names, keeping a vote that points outside the copy as it was', () => {
    const other: Definition = { formatVersion: 1, title: 'O', startNodeKey: 'w', nodes: [writing('w')], edges: [] };
    const result = pasteScenes(other, { w: { x: 0, y: 0 } }, base(), at, ['v'], { x: 0, y: 0 });
    expect(result.definition.nodes.map(node => node.key)).toEqual(['w', 'v-copy-1']);
    expect(result.definition.nodes[1]!.stages[0]!['source']).toEqual({ nodeKey: 'w', stageKey: 'main' });
    const routed = pasteScenes(other, {}, game(), {}, ['b', 'c'], { x: 0, y: 0 });
    expect(routed.definition.formatVersion).toBe(2);
  });
});

describe('a quiz question’s kind', () => {
  const quiz = (): Stage => addScene({ formatVersion: 2, title: 'T', startNodeKey: 'a', nodes: [scene('a')], edges: [] }, 'quiz').definition.nodes[1]!.stages[0]!;
  it('starts as big tiles and switches layout without touching the answers', () => {
    const stage = quiz(); expect(quizKind(stage['input'] as never)).toBe('tiles');
    const list = withQuizKind(stage, 'list');
    expect(quizKind(list['input'] as never)).toBe('list'); expect((list['input'] as { options: unknown })['options']).toEqual((stage['input'] as { options: unknown })['options']);
  });
  it('true or false sets the two answers, and leaving it starts from fresh answers with a valid correct one', () => {
    const trueFalse = withQuizKind(withQuizKind(quiz(), 'list'), 'true-false');
    expect(quizKind(trueFalse['input'] as never)).toBe('true-false');
    expect(trueFalse['scoring']).toMatchObject({ correctChoiceKey: 'true' });
    const back = withQuizKind(trueFalse, 'list');
    const options = (back['input'] as { options: { key: string }[] }).options;
    expect(quizKind(back['input'] as never)).toBe('list');
    expect(options.map(option => option.key)).toContain((back['scoring'] as { correctChoiceKey: string }).correctChoiceKey);
  });
});

describe('the add menu’s tabs', () => {
  it('put every scene type in exactly one tab', () => {
    const grouped = SCENE_GROUPS.flatMap(group => group.types);
    expect([...grouped].sort()).toEqual(SCENE_TYPES.map(type => type.type).sort());
  });
});

describe('changing the game of a minigame or duel', () => {
  const blank = (): Definition => ({ formatVersion: 2, title: 'T', startNodeKey: 'a', nodes: [scene('a')], edges: [] });
  it('follows with the standard title, but keeps one the author wrote', () => {
    const definition = blank(); const tap = addScene(definition, 'minigame', 'tap-race').definition.nodes[1]!.stages[0]!;
    expect(withMinigame(tap, 'reaction', definition).prompt).toBe('Reaction duel!');
    expect(withMinigame({ ...tap, prompt: 'Fastest thumbs win' }, 'reaction', definition).prompt).toBe('Fastest thumbs win');
  });
  it('starts from the new minigame’s own settings and timer', () => {
    const definition = blank(); const tap = { ...addScene(definition, 'minigame', 'tap-race').definition.nodes[1]!.stages[0]!, settings: { raceMs: 5000 }, durationMs: 99_000 };
    const next = withMinigame(tap, 'stop-clock', definition);
    expect(next['settings']).toBeUndefined(); expect(next.durationMs).not.toBe(99_000);
  });
  it('a duel follows the way it is won, keeping a question the author wrote', () => {
    const duel = addScene(blank(), 'duel').definition.nodes[1]!.stages[0]!;
    const chess = withDuelContest(duel, 'chess');
    expect(chess['contest']).toEqual({ kind: 'game', game: 'chess' }); expect(chess.prompt).toBe('Chess duel! Who wins?');
    expect(withDuelContest(chess, 'host')['contest']).toEqual({ kind: 'host' });
    expect(withDuelContest({ ...chess, prompt: 'Loser buys the next round' }, 'tictactoe').prompt).toBe('Loser buys the next round');
  });
});

describe('tidying a long game', () => {
  const line = (count: number): Definition => ({ formatVersion: 2, title: 'Long', startNodeKey: 's0',
    nodes: Array.from({ length: count }, (_, index) => scene(`s${index}`)), edges: Array.from({ length: count - 1 }, (_, index) => ({ key: `e${index}`, from: `s${index}`, to: `s${index + 1}` })) });
  const box = (definition: Definition) => { const all = Object.values(autoLayout(definition)); return { width: Math.max(...all.map(point => point.x)) + CARD_WIDTH, height: Math.max(...all.map(point => point.y)) + 192, rows: new Set(all.map(point => point.y)).size }; };
  it('wraps into rows that keep the game about screen-shaped, without overlapping cards', () => {
    const definition = line(24); const positions = autoLayout(definition); const { width, height, rows } = box(definition);
    expect(rows).toBeGreaterThan(1);
    expect(width / height).toBeGreaterThan(1); expect(width / height).toBeLessThan(3);
    const spots = Object.values(positions).map(point => `${point.x},${point.y}`); expect(new Set(spots).size).toBe(spots.length);
  });
  it('keeps a short game on one row', () => {
    expect(box(line(5)).rows).toBe(1);
  });
  it('runs an arrow into the next row along the gap between the rows', () => {
    expect(curve({ x: 1500, y: 100 }, { x: 0, y: 600 })).toContain('L 0 350');
    expect(pointOnCurve({ x: 1500, y: 100 }, { x: 0, y: 600 }, 0.5)).toEqual({ x: 750, y: 350 });
  });
});
