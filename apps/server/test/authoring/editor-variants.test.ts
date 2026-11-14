import { describe, expect, it } from 'vitest';
import { inspectDefinition } from '../../src/authoring/drafts.js';
// The editor's own model: what it adds must be what the server accepts.
import { addConnectedScene, insertOnEdge, SCENE_TYPES, SCENE_VARIANTS, type Definition } from '../../../web/src/editor/model.js';

const blank = (): Definition => ({ formatVersion: 2, title: 'Variants', startNodeKey: 'welcome',
  nodes: [{ key: 'welcome', stages: [{ key: 'intro', kind: 'info', title: 'Hi', prompt: 'Welcome!', durationMs: null }] }], edges: [] });

describe('every kind in the add menu', () => {
  const choices = SCENE_TYPES.flatMap(type => (SCENE_VARIANTS[type.type] ?? [{ key: undefined }]).map(variant => ({ type: type.type, variant: variant.key })));
  it.each(choices)('adds a scene the server accepts: $type $variant', ({ type, variant }) => {
    let definition = blank();
    // A vote needs an open round to vote on; scoreboards per team need a team game.
    if (type === 'vote') definition = addConnectedScene(definition, 'writing', 'welcome', undefined).definition;
    if (type === 'scoreboard' && variant !== 'players') definition = { ...definition, play: { kind: 'teams', lineup: { kind: 'game', form: { split: { kind: 'count', teams: 2 }, formation: 'random' } }, answers: 'everyone', points: 'members' } };
    const from = definition.nodes.at(-1)!.key;
    const added = addConnectedScene(definition, type, from, undefined, variant);
    const issues = inspectDefinition(added.definition).issues.filter(issue => issue.nodeKey === added.key);
    // A new party choice's routes still need somewhere to go: the only thing allowed to be left to do.
    expect(issues.map(issue => issue.message).filter(message => !(type === 'route' && message === 'A route option is not connected to a scene yet.'))).toEqual([]);
  });
});

describe('adding a scene on an arrow', () => {
  it.each(SCENE_TYPES.map(type => type.type).filter(type => type !== 'vote'))('puts a %s between the two scenes, and the game stays valid', type => {
    const start = addConnectedScene(blank(), 'info', 'welcome', undefined).definition;
    const edge = start.edges[0]!;
    const inserted = insertOnEdge(start, edge.key, type)!;
    // welcome → new scene → the scene the arrow went to.
    expect(inserted.definition.edges.find(entry => entry.key === edge.key)!.to).toBe(inserted.key);
    expect(inserted.definition.edges.some(entry => entry.from === inserted.key && entry.to === edge.to)).toBe(true);
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
