export const zoomKeys = ['1', '2', '3', '4', '5'] as const;
type ZoomKey = typeof zoomKeys[number];
export type ZoomShortcuts = { all: ZoomKey; selection: ZoomKey };
export const defaultZoomShortcuts: ZoomShortcuts = { all: '1', selection: '2' };
const storageKey = 'party-editor-zoom-shortcuts';

export function readZoomShortcuts(): ZoomShortcuts {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
    if (zoomKeys.includes(saved.all) && zoomKeys.includes(saved.selection) && saved.all !== saved.selection) return saved;
  } catch { /* Use the defaults if storage is unavailable. */ }
  return defaultZoomShortcuts;
}

export function rememberZoomShortcuts(shortcuts: ZoomShortcuts) {
  try { localStorage.setItem(storageKey, JSON.stringify(shortcuts)); } catch { /* In-memory settings still apply. */ }
}
