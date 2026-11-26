import type { MenuAction } from '../controls/action-menu.js';
import { translate } from '../../i18n/texts.js';
import { FLOW_TEXTS } from './flow.text.js';
import { editingLabel, modLabel, type ZoomShortcuts } from './zoom-shortcuts.js';

const t = (key: keyof typeof FLOW_TEXTS.en, values?: Record<string, string | number>) => translate(FLOW_TEXTS, key, values);

/** What the right-clicked scenes are: one scene, or several (a selection or a group), and what can be done with them. */
export interface SceneMenuFacts { count: number; isStart: boolean; readOnly: boolean; canPaste: boolean; oneGroup: boolean; anyGrouped: boolean; openInFlow?: string }
export interface SceneMenuHandlers { open: () => void; startHere: () => void; duplicate: () => void; copy: () => void; paste: () => void; replace: () => void; savePrefab: () => void; rename?: () => void; colour?: () => void; group?: () => void; ungroup?: () => void; remove: () => void }

/**
 * The right-click menu on a scene card. One scene: Open, Start here, Duplicate, Copy, Paste, Replace, Save as prefab
 * and, below a line, Delete. Several: Duplicate, Copy, Paste, Group or Ungroup, Save as prefab, then Delete. The same
 * actions as the scene panel, with the same shortcuts. Viewing (read-only) only opens the scene.
 */
export function sceneMenuActions(facts: SceneMenuFacts, on: SceneMenuHandlers, shortcuts?: ZoomShortcuts): MenuAction[] {
  const single = facts.count === 1;
  const open = facts.openInFlow ? { label: facts.openInFlow, icon: 'route', onSelect: on.open }
    : { label: t(facts.readOnly ? 'menuView' : 'menuOpen'), icon: facts.readOnly ? 'eye' : 'next', onSelect: on.open };
  if (facts.readOnly) return single ? [open] : [];
  const edits = shortcuts?.edits;
  const key = (name: 'duplicate' | 'copy' | 'paste' | 'remove') => edits
    ? { shortcut: name === 'remove' && !edits.remove ? 'Delete' : editingLabel(name, edits[name]) } : {};
  return [
    ...(single ? [open] : []),
    ...(on.rename ? [{ label: t('renameGroup'), icon: 'edit', onSelect: on.rename }] : []),
    ...(on.colour ? [{ label: t('groupColour'), icon: 'drawing', onSelect: on.colour }] : []),
    ...(single && !facts.isStart ? [{ label: t('menuStart'), icon: 'start', onSelect: on.startHere }] : []),
    { label: single ? t('menuDuplicate') : t('duplicateN', { count: facts.count }), icon: 'copy', ...key('duplicate'), onSelect: on.duplicate },
    { label: t('menuCopy'), icon: 'clipboard', ...key('copy'), onSelect: on.copy },
    ...(facts.canPaste ? [{ label: t('menuPaste'), icon: 'paste', ...key('paste'), onSelect: on.paste }] : []),
    ...(!single && !facts.oneGroup && on.group ? [{ label: t('groupThese'), icon: 'group', shortcut: `${modLabel} + G`, onSelect: on.group }] : []),
    ...(!single && facts.anyGrouped && on.ungroup ? [{ label: t('ungroup'), icon: 'ungroup', shortcut: `${modLabel} + Shift + G`, onSelect: on.ungroup }] : []),
    ...(single ? [{ label: t('menuReplace'), icon: 'edit', onSelect: on.replace }] : []),
    { label: t('menuPrefab'), icon: 'prefab', onSelect: on.savePrefab },
    { label: single ? t('menuDelete') : t('menuDeleteN', { count: facts.count }), icon: 'trash', danger: true, separated: true, ...key('remove'), onSelect: on.remove },
  ];
}

/** The right-click menu on an arrow: the same actions as its toolbar. Nothing while viewing. */
export function arrowMenuActions(facts: { readOnly: boolean; bent: boolean }, on: { addHere: () => void; straighten: () => void; remove: () => void }): MenuAction[] {
  if (facts.readOnly) return [];
  return [
    { label: t('addOnArrow'), icon: 'plus', onSelect: on.addHere },
    ...(facts.bent ? [{ label: t('straighten'), icon: 'straighten', onSelect: on.straighten }] : []),
    { label: t('removeConnection'), icon: 'trash', danger: true, separated: true, shortcut: 'Delete', onSelect: on.remove },
  ];
}
