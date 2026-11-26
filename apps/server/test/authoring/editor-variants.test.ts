import { describe, expect, it } from 'vitest';
import { inspectDefinition } from '../../src/authoring/drafts.js';
// The editor's own model: what it adds must be what the server accepts.
import { HEAD_TO_HEAD_KEYS, MINIGAME_KEYS } from '@party/contracts';
import { addConnectedScene, addDrawGames, DRAW_START, insertOnEdge, optionsOf, withDrawGame, setRouteOptions, QUIZ_KINDS, SCENE_TYPES, SCENE_VARIANTS, updateStage, withDuelContest, withMinigame, withQuizKind, type Definition } from '../../../web/src/editor/model.js';

const blank = (): Definition => ({ formatVersion: 2, title: 'Variants', startNodeKey: 'welcome',
  nodes: [{ key: 'welcome', stages: [{ key: 'intro', kind: 'info', title: 'Hi', prompt: 'Welcome!', durationMs: null }] }], edges: [] });

describe('every kind in the add menu', () => {
  const choices = SCENE_TYPES.flatMap(type => (SCENE_VARIANTS[type.type] ?? [{ key: undefined }]).map(variant => ({ type: type.type, variant: variant.key })));
  it.each(choices)('adds a scene the server accepts: $type $variant', ({ type, variant }) => {
    let definition = blank();
    // A vote needs an open round to vote on.
    if (type === 'vote') definition = addConnectedScene(definition, 'writing', 'welcome', undefined).definition;
    const from = definition.nodes.at(-1)!.key;
    const added = addConnectedScene(definition, type, from, undefined, variant);
    // A routed draw comes with a scene per game, as the canvas adds it.
    if (type === 'draw-routes') added.definition = addDrawGames(added.definition, added.key).definition;
    const issues = inspectDefinition(added.definition).issues.filter(issue => issue.nodeKey === added.key);
    // A new party choice's routes still need somewhere to go: the only thing allowed to be left to do.
    expect(issues.map(issue => issue.message).filter(message => !(type === 'route' && message === 'A route option is not connected to a scene yet.'))).toEqual([]);
  });
});

// Kinds that are settings in the scene's panel instead of a second menu.
describe('kinds chosen in the scene panel', () => {
  it.each(QUIZ_KINDS.flatMap(from => QUIZ_KINDS.map(to => ({ from: from.value, to: to.value }))))('a quiz question switched from $from to $to stays valid', ({ from, to }) => {
    const added = addConnectedScene(blank(), 'quiz', 'welcome', undefined);
    const switched = updateStage(updateStage(added.definition, added.key, 0, stage => withQuizKind(stage, from)), added.key, 0, stage => withQuizKind(stage, to));
    expect(inspectDefinition(switched).issues).toEqual([]);
  });
  it.each(MINIGAME_KEYS.flatMap(from => MINIGAME_KEYS.map(to => ({ from, to }))))('a minigame changed from $from to $to stays valid', ({ from, to }) => {
    const added = addConnectedScene(blank(), 'minigame', 'welcome', undefined, from);
    const switched = updateStage(added.definition, added.key, 0, stage => withMinigame(stage, to, added.definition));
    expect(inspectDefinition(switched).issues).toEqual([]);
  });
  it.each(['host', ...HEAD_TO_HEAD_KEYS].flatMap(from => ['host', ...HEAD_TO_HEAD_KEYS].map(to => ({ from, to }))))('a duel changed from $from to $to stays valid', ({ from, to }) => {
    const added = addConnectedScene(blank(), 'duel', 'welcome', undefined, from);
    const switched = updateStage(added.definition, added.key, 0, stage => withDuelContest(stage, to));
    expect(inspectDefinition(switched).issues).toEqual([]);
  });
  it.each(['players', 'teams', 'both'])('a scoreboard showing %s is accepted in a game with a Pick teams scene', show => {
    const teams = addConnectedScene(blank(), 'teams', 'welcome', undefined);
    const board = addConnectedScene(teams.definition, 'scoreboard', teams.key, undefined);
    const definition = updateStage(board.definition, board.key, 0, stage => ({ ...stage, show }));
    expect(inspectDefinition(definition).issues).toEqual([]);
  });
});

describe('adding a scene on an arrow', () => {
  it.each(SCENE_TYPES.map(type => type.type).filter(type => type !== 'vote'))('puts a %s between the two scenes, and the game stays valid', type => {
    const start = addConnectedScene(blank(), 'info', 'welcome', undefined).definition;
    const edge = start.edges[0]!;
    const inserted = insertOnEdge(start, edge.key, type)!;
    // welcome → new scene → the scene the arrow went to.
    expect(inserted.definition.edges.find(entry => entry.key === edge.key)!.to).toBe(inserted.key);
    // Only a routed draw goes through a separate scene for each game.
    const leads = type === 'draw-routes' ? inserted.games!.map(key => ({ from: key })) : [{ from: inserted.key }];
    for (const { from } of leads) expect(inserted.definition.edges.some(entry => entry.from === from && entry.to === edge.to)).toBe(true);
    if (type === 'draw-routes') expect(inserted.definition.edges.filter(entry => entry.from === inserted.key).map(entry => entry.to)).toEqual(inserted.games);
    const issues = inspectDefinition(inserted.definition).issues.map(issue => issue.message);
    expect(issues.filter(message => !(type === 'route' && message === 'A route option is not connected to a scene yet.'))).toEqual([]);
  });
  it('gives a wheel scene a wheel of its own, spun on that scene', () => {
    const added = addConnectedScene(blank(), 'wheel', 'welcome', undefined);
    const wheels = added.definition['wheels'] as { key: string; entries: unknown[] }[];
    expect(wheels).toHaveLength(1); expect(wheels[0]!.entries.length).toBeGreaterThanOrEqual(2);
    expect(added.definition.nodes.find(node => node.key === added.key)!.stages[0]).toMatchObject({ kind: 'info', spin: { wheel: wheels[0]!.key } });
  });
});

describe('a party choice with many routes', () => {
  const withRoutes = (count: number) => {
    const added = addConnectedScene(blank(), 'route', 'welcome', undefined);
    return setRouteOptions(added.definition, added.key, Array.from({ length: count }, (_, index) => ({ key: `r${index}`, label: `Route ${index + 1}` })));
  };
  it('accepts up to 8 routes', () => {
    expect(inspectDefinition(withRoutes(8)).issues.filter(issue => issue.message !== 'A route option is not connected to a scene yet.')).toEqual([]);
  });
  it('refuses a 9th', () => {
    expect(inspectDefinition(withRoutes(9)).issues.filter(issue => issue.message !== 'A route option is not connected to a scene yet.').length).toBeGreaterThan(0);
  });
});

describe('a minigame draw', () => {
  const drawn = () => { const added = addConnectedScene(blank(), 'draw-routes', 'welcome', undefined); return { key: added.key, definition: addDrawGames(added.definition, added.key) }; };
  it('starts with a minigame scene for each of its games', () => {
    const { key, definition } = drawn();
    const games = definition.definition.edges.filter(edge => edge.from === key).map(edge => definition.definition.nodes.find(node => node.key === edge.to)!.stages[0]!['game']);
    expect(games).toEqual(DRAW_START);
    expect(inspectDefinition(definition.definition).issues).toEqual([]);
  });
  it.each(MINIGAME_KEYS)('switching a game to %s switches its scene too, and the game stays valid (team games get teams for that round)', game => {
    const { key, definition } = drawn();
    const option = optionsOf(definition.definition.nodes.find(node => node.key === key))[0]!;
    if (DRAW_START.includes(game) && game !== option.key) return; // a game already in the draw is not offered twice
    const switched = withDrawGame(definition.definition, key, option.key, game);
    const target = switched.edges.find(edge => edge.from === key && edge.option === option.key)!.to;
    expect(switched.nodes.find(node => node.key === target)!.stages[0]).toMatchObject({ kind: 'minigame', game });
    expect(inspectDefinition(switched).issues).toEqual([]);
  });
});
