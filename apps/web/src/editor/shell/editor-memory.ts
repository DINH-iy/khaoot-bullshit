// Where you were in a game's editor, so coming back opens the same place: the editor tab,
// the selected scenes, the open panel and the part of Look & feel. Kept in this browser
// only (a convenience: without storage the editor simply opens as new).
export type EditorTab = 'flow' | 'scene' | 'look';
export type EditorPanel = 'settings' | 'invite' | 'export' | null;
export interface EditorMemory { view?: EditorTab; selected?: string[]; panel?: EditorPanel; lookSection?: string }

const key = (gameId: string) => `party-editor-place:${gameId}`;

export function readMemory(gameId: string): EditorMemory {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key(gameId)) ?? '{}');
    if (!saved || typeof saved !== 'object') return {};
    const memory = saved as Record<string, unknown>;
    return {
      ...(['flow', 'scene', 'look'].includes(memory['view'] as string) ? { view: memory['view'] as EditorTab } : {}),
      ...(Array.isArray(memory['selected']) ? { selected: (memory['selected'] as unknown[]).filter((entry): entry is string => typeof entry === 'string').slice(0, 200) } : {}),
      ...(['settings', 'invite', 'export'].includes(memory['panel'] as string) ? { panel: memory['panel'] as EditorPanel } : {}),
      ...(typeof memory['lookSection'] === 'string' ? { lookSection: memory['lookSection'] } : {}),
    };
  } catch { return {}; }
}

export function rememberPlace(gameId: string, patch: EditorMemory) {
  try { localStorage.setItem(key(gameId), JSON.stringify({ ...readMemory(gameId), ...patch })); } catch { /* storage blocked: not remembered */ }
}
