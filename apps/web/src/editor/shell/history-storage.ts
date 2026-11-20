import type { Snapshot } from '../live/document.js';

export interface HistoryStep { before: Snapshot; after: Snapshot; label: string; at: number }
export interface EditHistory { undo: HistoryStep[]; redo: HistoryStep[] }
export const HISTORY_LIMIT = 100;
const MAX_BYTES = 900_000;
const keyOf = (identity: string, gameId: string) => `party.editor.history.v1:${identity}:${gameId}`;
const snapshot = (value: Snapshot | undefined) => Array.isArray(value?.definition?.nodes)
  && Array.isArray(value.definition.edges) && value.positions !== null && typeof value.positions === 'object';
const valid = (step: HistoryStep) => step && snapshot(step.before) && snapshot(step.after) && typeof step.label === 'string' && Number.isFinite(step.at);

export function readEditHistory(identity: string, gameId: string): EditHistory {
  try {
    const saved = JSON.parse(localStorage.getItem(keyOf(identity, gameId)) ?? 'null') as EditHistory | null;
    if (saved && Array.isArray(saved.undo) && Array.isArray(saved.redo)) {
      return { undo: saved.undo.slice(-HISTORY_LIMIT).filter(valid), redo: saved.redo.slice(-HISTORY_LIMIT).filter(valid) };
    }
  } catch { /* The browser can disable storage. */ }
  return { undo: [], redo: [] };
}

/** Save nearest undo/redo steps first. A large draft retains fewer steps. */
export function writeEditHistory(identity: string, gameId: string, history: EditHistory) {
  const { undo, redo } = history;
  const saved = { undo: [] as string[], redo: [] as string[] };
  let remaining = MAX_BYTES;
  for (let distance = 1; distance <= Math.max(undo.length, redo.length); distance++) {
    let wrote = false;
    for (const direction of ['undo', 'redo'] as const) {
      const step = history[direction].at(-distance);
      if (!step || saved[direction].length !== distance - 1) continue;
      const entry = JSON.stringify(step);
      if (entry.length + 1 > remaining) continue;
      saved[direction].push(entry);
      remaining -= entry.length + 1;
      wrote = true;
    }
    if (!wrote) break;
  }
  try {
    const key = keyOf(identity, gameId);
    if (!saved.undo.length && !saved.redo.length) localStorage.removeItem(key);
    else localStorage.setItem(key, `{"undo":[${saved.undo.reverse().join(',')}],"redo":[${saved.redo.reverse().join(',')}]}`);
  } catch { /* In-memory undo and redo continue when storage is full or disabled. */ }
}
