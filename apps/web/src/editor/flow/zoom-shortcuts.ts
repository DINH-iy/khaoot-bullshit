export const zoomKeys = ['1', '2', '3', '4', '5'] as const;
type ZoomKey = typeof zoomKeys[number];
export const arrangementKeys = ['H', 'J', 'K', 'L', 'R', 'V'] as const;
type ArrangementKey = typeof arrangementKeys[number];
export const editingActions = ['undo', 'redo', 'selectAll', 'copy', 'paste', 'duplicate', 'remove', 'help'] as const;
export type EditingAction = typeof editingActions[number];
export const shortcutDigits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
type ShortcutDigit = typeof shortcutDigits[number];
export const modLabel = /Mac|iPhone|iPad/.test(typeof navigator === 'undefined' ? '' : navigator.platform) ? '⌘' : 'Ctrl';
const defaultLabels: Record<EditingAction, string> = {
  undo: `${modLabel} + Z`, redo: `${modLabel} + Shift + Z`, selectAll: `${modLabel} + A`,
  copy: `${modLabel} + C`, paste: `${modLabel} + V`, duplicate: `${modLabel} + D`, remove: 'Delete / Backspace', help: '?',
};

export type ZoomShortcuts = { all: ZoomKey; selection: ZoomKey; tidy: ArrangementKey; row: ArrangementKey; column: ArrangementKey; edits: Partial<Record<EditingAction, ShortcutDigit>> };
export const defaultZoomShortcuts: ZoomShortcuts = { all: '1', selection: '2', tidy: 'L', row: 'H', column: 'V', edits: {} };
const storageKey = 'party-editor-zoom-shortcuts';

export function readZoomShortcuts(): ZoomShortcuts {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
    const next: ZoomShortcuts = { ...defaultZoomShortcuts, edits: {} };
    if (zoomKeys.includes(saved.all) && zoomKeys.includes(saved.selection) && saved.all !== saved.selection) {
      next.all = saved.all;
      next.selection = saved.selection;
    }
    if (arrangementKeys.includes(saved.tidy)) next.tidy = saved.tidy;
    if (arrangementKeys.includes(saved.row) && arrangementKeys.includes(saved.column) && saved.row !== saved.column) {
      next.row = saved.row;
      next.column = saved.column;
    }
    const used = new Set<ShortcutDigit>();
    for (const action of editingActions) {
      const value = saved.edits?.[action] as ShortcutDigit;
      if (shortcutDigits.includes(value) && !used.has(value)) {
        next.edits[action] = value;
        used.add(value);
      }
    }
    return next;
  } catch { /* Use the defaults if storage is unavailable. */ }
  return defaultZoomShortcuts;
}

export function rememberZoomShortcuts(shortcuts: ZoomShortcuts) {
  try { localStorage.setItem(storageKey, JSON.stringify(shortcuts)); } catch { /* In-memory settings still apply. */ }
}

export const editingLabel = (action: EditingAction, digit?: ShortcutDigit) => digit ? `Alt + Shift + ${digit}` : defaultLabels[action];

export function editingAction(event: KeyboardEvent, shortcuts: ZoomShortcuts): EditingAction | undefined {
  if (event.defaultPrevented || event.repeat || event.isComposing) return;
  const mod = event.ctrlKey || event.metaKey;
  if (event.altKey) {
    if (!mod && event.shiftKey) return editingActions.find(action => {
      const digit = shortcuts.edits[action];
      return digit && event.code === `Digit${digit}`;
    });
    return;
  }
  const key = event.key.toLowerCase();
  let action: EditingAction | undefined;
  if (!mod && key === '?') action = 'help';
  else if (!mod && !event.shiftKey && (key === 'delete' || key === 'backspace')) action = 'remove';
  else if (mod && key === 'z') action = event.shiftKey ? 'redo' : 'undo';
  else if (mod && !event.shiftKey) {
    const defaults: Record<string, EditingAction> = { y: 'redo', a: 'selectAll', c: 'copy', v: 'paste', d: 'duplicate' };
    action = defaults[key];
  }
  return action && !shortcuts.edits[action] ? action : undefined;
}
