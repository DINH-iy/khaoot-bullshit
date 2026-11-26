import type { Definition, Positions } from '../model.js';
import { isBendKey, isCardKey, isGroupKey } from '../model.js';
import { translate } from '../../i18n/texts.js';
import { SHELL_TEXTS } from './shell.text.js';

// Named in the language chosen when the edit was made.
const t = (key: keyof typeof SHELL_TEXTS.en, values?: Record<string, string | number>) => translate(SHELL_TEXTS, key, values);

/** A scene's name as the scene list shows it: a cutscene's title, else the question or instruction (shortened). */
export function sceneName(definition: Definition, key: string) {
  const stage = definition.nodes.find(node => node.key === key)?.stages[0] as Record<string, unknown> | undefined;
  const text = stage ? String((stage['kind'] === 'info' ? stage['title'] : stage['prompt']) ?? '').trim() : '';
  const name = text || key;
  return name.length > 40 ? `${name.slice(0, 38)}…` : name;
}

const json = (value: unknown) => JSON.stringify(value ?? null);

/**
 * One undo step in words, for the history list: what changed between the game before and after it
 * ("Added “Question 3”", "Changed “Which planet…”", "Moved 2 scenes"…). Worked out from the difference,
 * so every kind of edit gets a description without each screen having to name its edits.
 */
export function describeStep(before: { definition: Definition; positions: Positions }, after: { definition: Definition; positions: Positions }): string {
  const was = new Map(before.definition.nodes.map(node => [node.key, node])); const now = new Map(after.definition.nodes.map(node => [node.key, node]));
  const added = after.definition.nodes.filter(node => !was.has(node.key)); const removed = before.definition.nodes.filter(node => !now.has(node.key));
  const name = (definition: Definition, key: string) => `“${sceneName(definition, key)}”`;
  if (added.length) return added.length === 1 ? t('added', { scene: name(after.definition, added[0]!.key) }) : t('addedMany', { count: added.length });
  if (removed.length) return removed.length === 1 ? t('removed', { scene: name(before.definition, removed[0]!.key) }) : t('removedMany', { count: removed.length });
  const changed = after.definition.nodes.filter(node => json(node) !== json(was.get(node.key)));
  if (changed.length) return changed.length === 1 ? t('changed', { scene: name(after.definition, changed[0]!.key) }) : t('changedMany', { count: changed.length });
  if (json(before.definition.edges) !== json(after.definition.edges)) return t('changedConnections');
  if (before.definition.startNodeKey !== after.definition.startNodeKey) return t('startsAt', { scene: name(after.definition, after.definition.startNodeKey) });
  if (before.definition.title !== after.definition.title) return t('renamed', { title: after.definition.title.slice(0, 40) });
  if (json(before.definition['presentation']) !== json(after.definition['presentation'])) return t('changedLook');
  if (json(before.definition) !== json(after.definition)) return t('changedSettings');
  // Only the map: cards moved, or arrows bent or straightened.
  const keys = new Set([...Object.keys(before.positions), ...Object.keys(after.positions)]);
  if ([...keys].some(key => {
    const old = before.positions[key]; const next = after.positions[key];
    return isGroupKey(key) && old && next && old.x === next.x && old.groupName !== next.groupName;
  })) return t('renamedGroup');
  if ([...keys].some(key => {
    const old = before.positions[key]; const next = after.positions[key];
    return isGroupKey(key) && old && next && old.x === next.x && old.groupColour !== next.groupColour;
  })) return t('colouredGroup');
  if ([...keys].some(key => isGroupKey(key) && json(before.positions[key]) !== json(after.positions[key]))) return t('grouped');
  const moved = [...keys].filter(key => isCardKey(key) && json(before.positions[key]) !== json(after.positions[key]));
  if (moved.length) return moved.length === 1 ? t('moved', { scene: name(after.definition, moved[0]!) }) : t('movedMany', { count: moved.length });
  return t([...keys].some(isBendKey) ? 'bent' : 'changedMap');
}
