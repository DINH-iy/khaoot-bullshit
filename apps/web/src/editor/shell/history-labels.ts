import type { Definition, Positions } from '../model.js';
import { isBendKey } from '../model.js';

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
  if (added.length) return added.length === 1 ? `Added ${name(after.definition, added[0]!.key)}` : `Added ${added.length} scenes`;
  if (removed.length) return removed.length === 1 ? `Removed ${name(before.definition, removed[0]!.key)}` : `Removed ${removed.length} scenes`;
  const changed = after.definition.nodes.filter(node => json(node) !== json(was.get(node.key)));
  if (changed.length) return changed.length === 1 ? `Changed ${name(after.definition, changed[0]!.key)}` : `Changed ${changed.length} scenes`;
  if (json(before.definition.edges) !== json(after.definition.edges)) return 'Changed the connections';
  if (before.definition.startNodeKey !== after.definition.startNodeKey) return `Starts at ${name(after.definition, after.definition.startNodeKey)}`;
  if (before.definition.title !== after.definition.title) return `Renamed the game to “${after.definition.title.slice(0, 40)}”`;
  if (json(before.definition['presentation']) !== json(after.definition['presentation'])) return 'Changed the look';
  if (json(before.definition) !== json(after.definition)) return 'Changed the game settings';
  // Only the map: cards moved, or arrows bent or straightened.
  const keys = new Set([...Object.keys(before.positions), ...Object.keys(after.positions)]);
  const moved = [...keys].filter(key => !isBendKey(key) && json(before.positions[key]) !== json(after.positions[key]));
  if (moved.length) return moved.length === 1 ? `Moved ${name(after.definition, moved[0]!)}` : `Moved ${moved.length} scenes`;
  return [...keys].some(isBendKey) ? 'Bent or straightened arrows' : 'Changed the map';
}
