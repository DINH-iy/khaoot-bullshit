import { describe, expect, it, vi } from 'vitest';
import { arrowMenuActions, sceneMenuActions, type SceneMenuFacts, type SceneMenuHandlers } from '../../src/editor/flow/scene-menu.js';
import { defaultZoomShortcuts } from '../../src/editor/flow/zoom-shortcuts.js';

const handlers = (): SceneMenuHandlers => ({ open: vi.fn(), startHere: vi.fn(), duplicate: vi.fn(), copy: vi.fn(), paste: vi.fn(), replace: vi.fn(), savePrefab: vi.fn(), group: vi.fn(), ungroup: vi.fn(), remove: vi.fn() });
const facts = (overrides: Partial<SceneMenuFacts> = {}): SceneMenuFacts => ({ count: 1, isStart: false, readOnly: false, canPaste: false, oneGroup: false, anyGrouped: false, ...overrides });
const labels = (overrides: Partial<SceneMenuFacts> = {}) => sceneMenuActions(facts(overrides), handlers(), defaultZoomShortcuts).map(action => action.label);

describe('scene right-click menu', () => {
  it('offers one scene the scene panel actions, with Delete last, in red, below a line', () => {
    const actions = sceneMenuActions(facts(), handlers(), defaultZoomShortcuts);
    expect(actions.map(action => action.label)).toEqual(['Open scene', 'Start the game here', 'Duplicate', 'Copy', 'Replace scene type…', 'Save as prefab…', 'Delete scene…']);
    expect(actions.at(-1)).toMatchObject({ danger: true, separated: true });
    expect(actions.slice(0, -1).some(action => action.danger)).toBe(false);
  });

  it('leaves out Start here on the start scene, and offers Paste only when something is copied', () => {
    expect(labels({ isStart: true })).not.toContain('Start the game here');
    expect(labels()).not.toContain('Paste');
    expect(labels({ canPaste: true })).toContain('Paste');
  });

  it('acts on several scenes together, grouping only what is not one group yet', () => {
    expect(labels({ count: 3 })).toEqual(['Duplicate 3 scenes', 'Copy', 'Group', 'Save as prefab…', 'Delete 3 scenes…']);
    expect(labels({ count: 3, oneGroup: true, anyGrouped: true })).toEqual(['Duplicate 3 scenes', 'Copy', 'Ungroup', 'Save as prefab…', 'Delete 3 scenes…']);
  });

  it('only opens the scene while viewing, and changes nothing', () => {
    const on = handlers(); const actions = sceneMenuActions(facts({ readOnly: true, canPaste: true }), on, defaultZoomShortcuts);
    expect(actions.map(action => action.label)).toEqual(['View scene']);
    actions[0]!.onSelect(); expect(on.open).toHaveBeenCalledOnce();
    expect(sceneMenuActions(facts({ readOnly: true, count: 2 }), on, defaultZoomShortcuts)).toEqual([]);
  });

  it('shows the shortcuts the editor uses, including a custom one', () => {
    const custom = { ...defaultZoomShortcuts, edits: { duplicate: '3' as const } };
    const actions = sceneMenuActions(facts(), handlers(), custom);
    expect(actions.find(action => action.label === 'Duplicate')?.shortcut).toBe('Alt + Shift + 3');
    expect(actions.find(action => action.label === 'Delete scene…')?.shortcut).toBe('Delete');
  });
});

describe('arrow right-click menu', () => {
  const on = () => ({ addHere: vi.fn(), straighten: vi.fn(), remove: vi.fn() });
  it('adds a scene on the arrow, straightens it only when it bends, and removes it last, in red', () => {
    const plain = arrowMenuActions({ readOnly: false, bent: false }, on());
    expect(plain.map(action => action.label)).toEqual(['Add a scene on this arrow', 'Remove this connection']);
    expect(plain.at(-1)).toMatchObject({ danger: true, separated: true });
    expect(arrowMenuActions({ readOnly: false, bent: true }, on()).map(action => action.label)).toEqual(['Add a scene on this arrow', 'Straighten', 'Remove this connection']);
  });
  it('offers nothing while viewing', () => {
    expect(arrowMenuActions({ readOnly: true, bent: true }, on())).toEqual([]);
  });
});
