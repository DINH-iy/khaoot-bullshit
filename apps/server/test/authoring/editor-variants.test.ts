import { describe, expect, it } from 'vitest';
import { inspectDefinition } from '../../src/authoring/drafts.js';
// The editor's own model: what it adds must be what the server accepts.
import { addConnectedScene, SCENE_TYPES, SCENE_VARIANTS, type Definition } from '../../../web/src/editor/model.js';

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
