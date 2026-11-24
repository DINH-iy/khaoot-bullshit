import { describe, expect, it } from 'vitest';
import { anyGrouped, grouped, groupsIn, isOneGroup, ungrouped, withWholeGroups } from '../../src/editor/flow/groups.js';
import { autoLayout, deleteScene, lineUp, snapCard, type Definition, type Positions } from '../../src/editor/model.js';
import { toDoc } from '../../src/editor/live/document.js';
import { describeStep } from '../../src/editor/shell/history-labels.js';

const scene = (key: string) => ({ key, stages: [{ key: 'main', kind: 'info', title: key, prompt: key, durationMs: null }] });
const game = (keys = ['draw', 'quiz', 'race', 'other']): Definition => ({ formatVersion: 2, title: 'T', startNodeKey: keys[0]!, nodes: keys.map(scene), edges: [] });

describe('flow groups', () => {
  it('selects a whole group from any of its scenes, and only scenes still in the game', () => {
    const definition = game(); const positions = grouped(autoLayout(definition), ['draw', 'quiz', 'race']);
    expect(withWholeGroups(definition, positions, ['quiz']).sort()).toEqual(['draw', 'quiz', 'race']);
    expect(withWholeGroups(definition, positions, ['other'])).toEqual(['other']);
    expect(isOneGroup(definition, positions, ['race', 'draw', 'quiz'])).toBe(true);
    expect(isOneGroup(definition, positions, ['race', 'draw'])).toBe(false);
    // A deleted scene leaves its group; a group of one is no group.
    const smaller = deleteScene(deleteScene(definition, 'quiz'), 'race');
    expect(groupsIn(smaller, positions).size).toBe(0);
    expect(withWholeGroups(smaller, positions, ['draw'])).toEqual(['draw']);
  });

  it('moves scenes into a new group out of their old one, and ungroups them', () => {
    const definition = game(); const first = grouped(autoLayout(definition), ['draw', 'quiz']);
    const second = grouped(first, ['quiz', 'race', 'other']);
    expect([...groupsIn(definition, second).values()].map(members => members.sort())).toEqual([['other', 'quiz', 'race']]);
    expect(anyGrouped(definition, second, ['draw'])).toBe(false);
    const apart = ungrouped(second, ['quiz', 'race', 'other']);
    expect(groupsIn(definition, apart).size).toBe(0);
    // Fewer than two scenes is not a group.
    expect(grouped(apart, ['draw'])).toBe(apart);
  });

  it('keeps groups out of the card layout: snapping, lining up and the saved draft', () => {
    const definition = game(); const positions: Positions = grouped({ draw: { x: 300, y: 300 }, quiz: { x: 900, y: 900 }, race: { x: 1500, y: 300 }, other: { x: 2100, y: 900 } }, ['draw', 'quiz']);
    // A group entry (x = its number) never acts as a card to align with.
    expect(snapCard(definition, positions, 'race', { x: 6, y: 0 }).guides.x).toBeNull();
    expect(Object.keys(lineUp(definition, positions, ['draw', 'quiz', 'group--draw'], 'row')).filter(key => key.startsWith('group--')).sort()).toEqual(['group--draw', 'group--quiz']);
    const saved = toDoc({ definition: deleteScene(definition, 'quiz'), positions }).editor!.positions!;
    expect(saved['group--draw']).toEqual(positions['group--draw']);
    expect(saved['group--quiz']).toBeUndefined();
  });

  it('names a grouping step in the history', () => {
    const definition = game(); const before = autoLayout(definition);
    expect(describeStep({ definition, positions: before }, { definition, positions: grouped(before, ['draw', 'quiz']) })).toBe('Grouped or ungrouped scenes');
  });
});
