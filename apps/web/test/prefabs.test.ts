import { describe, expect, it } from 'vitest';
import { PrefabContentSchema } from '@party/contracts';
import { insertPrefab, prefabFrom, type Definition } from '../src/editor/model.js';

const scene = (key: string) => ({ key, stages: [{ key: 'main', kind: 'info', title: key, prompt: key, durationMs: null }] });
const writing = (key: string) => ({ key, stages: [{ key: 'main', kind: 'collect', prompt: 'Write', durationMs: 60_000, input: { kind: 'text', maxLength: 240 }, scoring: { kind: 'none' } }] });
const vote = (key: string, on: string) => ({ key, stages: [{ key: 'main', kind: 'vote', prompt: 'Vote', durationMs: 45_000, source: { nodeKey: on, stageKey: 'main' }, awardPerVoteMilli: '5000' }] });
const game = (): Definition => ({ formatVersion: 2, title: 'Source', startNodeKey: 'intro',
  nodes: [scene('intro'), writing('write'), vote('ballot', 'write'), scene('outro')],
  edges: [{ key: 'e1', from: 'intro', to: 'write' }, { key: 'e2', from: 'write', to: 'ballot' }, { key: 'e3', from: 'ballot', to: 'outro' }] });
const positions = { intro: { x: 0, y: 0 }, write: { x: 360, y: 0 }, ballot: { x: 720, y: 48 }, outro: { x: 1080, y: 0 } };

describe('prefabs', () => {
  it('keep only the chosen scenes and the connections between them, in the shape the server accepts', () => {
    const content = prefabFrom(game(), positions, ['ballot', 'write']);
    expect(content.keys).toEqual(['write', 'ballot']);
    expect(content.edges).toEqual([{ key: 'e2', from: 'write', to: 'ballot' }]);
    expect(Object.keys(content.positions).sort()).toEqual(['ballot', 'write']);
    expect(PrefabContentSchema.parse(content)).toEqual(content);
  });
  it('refuse content whose connections leave the prefab', () => {
    const content = prefabFrom(game(), positions, ['write', 'ballot']);
    expect(PrefabContentSchema.safeParse({ ...content, edges: [...content.edges, { key: 'x', from: 'ballot', to: 'outro' }] }).success).toBe(false);
    expect(PrefabContentSchema.safeParse({ ...content, keys: ['write'] }).success).toBe(false);
  });
  it('insert under new names at the chosen spot, keeping a vote pointed at its own round', () => {
    const content = prefabFrom(game(), positions, ['write', 'ballot']);
    const target: Definition = { formatVersion: 2, title: 'Target', startNodeKey: 'write', nodes: [scene('write')], edges: [] };
    const result = insertPrefab(target, { write: { x: 0, y: 0 } }, content, { x: 480, y: 240 });
    expect(result.keys).toHaveLength(2); expect(result.keys).not.toContain('write');
    const [copyWrite, copyBallot] = result.keys as [string, string];
    expect(result.positions[copyWrite]).toEqual({ x: 480, y: 240 });
    expect(result.positions[copyBallot]).toEqual({ x: 840, y: 288 });
    const ballot = result.definition.nodes.find(node => node.key === copyBallot)!;
    expect(ballot.stages[0]!['source']).toEqual({ nodeKey: copyWrite, stageKey: 'main' });
    expect(result.definition.edges).toEqual([expect.objectContaining({ from: copyWrite, to: copyBallot })]);
    // The original scene is untouched.
    expect(result.definition.nodes[0]).toEqual(scene('write'));
  });
  it('connect the scene it was added after to the prefab’s first scene', () => {
    const content = prefabFrom(game(), positions, ['ballot', 'write']);
    const target: Definition = { formatVersion: 2, title: 'Target', startNodeKey: 'start', nodes: [scene('start')], edges: [] };
    const result = insertPrefab(target, { start: { x: 0, y: 0 } }, content, { x: 360, y: 0 }, { key: 'start', option: undefined });
    const entry = result.keys[content.keys.indexOf('write')];
    expect(result.definition.edges).toContainEqual(expect.objectContaining({ from: 'start', to: entry }));
  });
});
