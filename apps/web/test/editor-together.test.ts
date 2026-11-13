import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { merge3, same } from '../src/editor/live/merge.js';
import { combine, fromDoc, toDoc, type Doc } from '../src/editor/live/document.js';
import { addScene, connect, deleteScene, updateStage, type Definition } from '../src/editor/model.js';

const scene = (key: string, prompt = key) => ({ key, stages: [{ key: 'main', kind: 'info', title: key, prompt, durationMs: null }] });
const game = (): Doc => ({ formatVersion: 2, title: 'T', startNodeKey: 'a', nodes: [scene('a'), scene('b'), scene('c')],
  edges: [{ key: 'ab', from: 'a', to: 'b' }, { key: 'bc', from: 'b', to: 'c' }], editor: { positions: { a: { x: 0, y: 0 }, b: { x: 360, y: 0 }, c: { x: 720, y: 0 } } } });
const prompt = (doc: Definition, key: string, text: string) => updateStage(doc, key, 0, stage => ({ ...stage, prompt: text })) as Doc;
const promptOf = (doc: Doc, key: string) => doc.nodes.find(node => node.key === key)?.stages[0]?.prompt;

describe('merging two people’s edits', () => {
  it('keeps both when they changed different things, down to fields of the same scene', () => {
    const base = game();
    const ours = { ...prompt(base, 'a', 'Mine'), title: 'Our title' };
    const theirs = updateStage(prompt(base, 'b', 'Theirs'), 'a', 0, stage => ({ ...stage, durationMs: 5000 })) as Doc;
    const merged = combine(base, ours, theirs);
    expect(merged.title).toBe('Our title'); expect(promptOf(merged, 'a')).toBe('Mine'); expect(promptOf(merged, 'b')).toBe('Theirs');
    expect(merged.nodes[0]!.stages[0]!.durationMs).toBe(5000);
    // Both sides arrive at the same game, whoever merges.
    expect(same(combine(base, theirs, ours), merged)).toBe(true);
  });
  it('lets ours win only where both changed the very same field', () => {
    const base = game(); const merged = combine(base, prompt(base, 'a', 'Mine'), prompt({ ...base, title: 'Theirs' }, 'a', 'Theirs'));
    expect(promptOf(merged, 'a')).toBe('Mine'); expect(merged.title).toBe('Theirs');
  });
  it('adds, removes and moves scenes independently', () => {
    const base = game();
    const added = addScene(base, 'quiz'); const ours = { ...connect(added.definition, 'c', undefined, added.key), editor: { positions: { ...base.editor!.positions, [added.key]: { x: 1080, y: 0 } } } } as Doc;
    const theirs = { ...base, editor: { positions: { ...base.editor!.positions, b: { x: 360, y: 240 } } }, nodes: [base.nodes[1]!, base.nodes[0]!, base.nodes[2]!] } as Doc;
    const merged = combine(base, ours, theirs);
    expect(merged.nodes.map(node => node.key)).toEqual(['b', 'a', 'c', added.key]);
    expect(merged.edges).toHaveLength(3); expect(merged.editor!.positions).toMatchObject({ b: { x: 360, y: 240 }, [added.key]: { x: 1080, y: 0 } });
  });
  it('keeps both scenes when two people add one at the same moment', () => {
    const base = game(); const ours = addScene(base, 'quiz'); const theirs = addScene(base, 'drawing'); expect(ours.key).toBe(theirs.key);
    const merged = combine(base, connect(ours.definition, 'c', undefined, ours.key) as Doc, theirs.definition as Doc);
    expect(merged.nodes).toHaveLength(5); expect(new Set(merged.nodes.map(node => node.key)).size).toBe(5);
    const mine = merged.nodes.find(node => (node.stages[0]!['input'] as { kind?: string } | undefined)?.kind === 'choice')!;
    expect(mine.key).not.toBe(theirs.key); expect(merged.edges.find(edge => edge.from === 'c')?.to).toBe(mine.key);
  });
  it('drops a connection to a scene the other person removed, and keeps a scene we edited that they removed', () => {
    const base = { ...game(), edges: [{ key: 'ab', from: 'a', to: 'b' }] } as Doc;
    const merged = combine(base, connect(base, 'b', undefined, 'c') as Doc, deleteScene(base, 'c') as Doc);
    expect(merged.nodes.map(node => node.key)).toEqual(['a', 'b']); expect(merged.edges.map(edge => edge.key)).toEqual(['ab']);
    expect(combine(base, prompt(base, 'c', 'Still here'), deleteScene(base, 'c') as Doc).nodes).toHaveLength(3);
  });
  it('changes nothing when the other side changed nothing, and takes theirs when we changed nothing', () => {
    const json = fc.jsonValue({ maxDepth: 3 });
    fc.assert(fc.property(json, json, (base, other) => { expect(merge3(base, other, base)).toEqual(other); expect(merge3(base, base, other)).toEqual(other); expect(merge3(base, other, other)).toEqual(other); }));
  });
});

describe('undo next to someone else’s edits', () => {
  // As the editor does it: replay the step's own difference onto the game as it is now.
  const undo = (before: Doc, after: Doc, now: Doc) => combine(after, now, before);
  it('takes back only our own step', () => {
    const before = game(); const after = prompt(before, 'a', 'My change');
    const now = prompt(after, 'b', 'Their change');
    const undone = undo(before, after, now);
    expect(promptOf(undone, 'a')).toBe('a'); expect(promptOf(undone, 'b')).toBe('Their change');
    expect(same(combine(before, undone, after), now)).toBe(true); // redo
  });
  it('leaves a field alone once someone else has changed it since', () => {
    const before = game(); const after = prompt(before, 'a', 'Mine'); const now = prompt(after, 'a', 'Theirs, later');
    expect(promptOf(undo(before, after, now), 'a')).toBe('Theirs, later');
  });
  it('brings back a scene we deleted, with its connections and place, and keeps a scene of ours that others have edited', () => {
    const before = game(); const after = toDoc({ definition: deleteScene(before, 'b'), positions: before.editor!.positions! });
    const restored = undo(before, after, prompt(after, 'c', 'Edited meanwhile'));
    expect(restored.nodes.map(node => node.key)).toEqual(['a', 'b', 'c']); expect(restored.edges).toHaveLength(2);
    expect(restored.editor!.positions!['b']).toEqual({ x: 360, y: 0 }); expect(promptOf(restored, 'c')).toBe('Edited meanwhile');
    const added = addScene(before, 'quiz'); const withScene = added.definition as Doc;
    expect(undo(before, withScene, prompt(withScene, added.key, 'They improved it')).nodes).toHaveLength(4);
    expect(undo(before, withScene, withScene).nodes).toHaveLength(3);
  });
  it('is an exact undo when nobody else did anything', () => {
    const before = game(); const after = toDoc(fromDoc(prompt(deleteScene(before, 'c'), 'a', 'x') as Doc));
    expect(same(undo(before, after, after), before)).toBe(true);
  });
});
