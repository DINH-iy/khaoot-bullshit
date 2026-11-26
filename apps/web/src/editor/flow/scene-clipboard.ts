import type { Definition, Positions } from '../model.js';

interface SceneClip { keys: string[]; from: Definition; positions: Positions; game: string | null }
const CLIP = 'party-editor-clipboard';

export function copyScenesToClipboard(definition: Definition, positions: Positions, keys: string[], game: string | null): boolean {
  const selected = new Set(keys);
  const from = {
    ...definition,
    nodes: definition.nodes.filter(node => selected.has(node.key)),
    edges: definition.edges.filter(edge => selected.has(edge.from) && selected.has(edge.to)),
  };
  const clip: SceneClip = { keys, from, positions: Object.fromEntries(keys.map(key => [key, positions[key]!])), game };
  try { localStorage.setItem(CLIP, JSON.stringify(clip)); return true; } catch { return false; }
}

export function readSceneClipboard(): SceneClip | null {
  try {
    const value = JSON.parse(localStorage.getItem(CLIP) ?? 'null') as SceneClip | null;
    return value && Array.isArray(value.keys) && value.from && Array.isArray(value.from.nodes) ? value : null;
  } catch { return null; }
}
