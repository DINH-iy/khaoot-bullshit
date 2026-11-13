import { autoLayout, uniqueKey, type Definition, type Positions } from '../model.js';
import { merge3, same } from './merge.js';

// The editor's state (a game and where its cards sit) as the one document the
// server saves, and the rules for combining two people's versions of it.

export interface Snapshot { definition: Definition; positions: Positions }
/** A saved draft: the game with the card positions under `editor`. */
export type Doc = Definition & { editor?: { positions?: Positions } };

export function toDoc(snapshot: Snapshot): Doc {
  const keys = new Set(snapshot.definition.nodes.map(node => node.key));
  return { ...snapshot.definition, editor: { positions: Object.fromEntries(Object.entries(snapshot.positions).filter(([key]) => keys.has(key))) } };
}
export function fromDoc(doc: Doc): Snapshot {
  const { editor, ...game } = doc; const definition = game as Definition;
  return { definition, positions: { ...autoLayout(definition), ...(editor?.positions ?? {}) } };
}

/** Gives a scene another key everywhere it is used: connections, card position and votes on its rounds. */
function renameScene(doc: Doc, from: string, to: string): Doc {
  const positions = { ...(doc.editor?.positions ?? {}) };
  if (positions[from]) { positions[to] = positions[from]; delete positions[from]; }
  return { ...doc, startNodeKey: doc.startNodeKey === from ? to : doc.startNodeKey,
    nodes: doc.nodes.map(node => ({ ...node, key: node.key === from ? to : node.key, stages: node.stages.map(stage => {
      const source = stage['source'] as { nodeKey?: string } | undefined;
      return source?.nodeKey === from ? { ...stage, source: { ...source, nodeKey: to } } : stage;
    }) })),
    edges: doc.edges.map(edge => ({ ...edge, from: edge.from === from ? to : edge.from, to: edge.to === from ? to : edge.to })),
    editor: { ...doc.editor, positions } };
}

/**
 * Two people who each add a scene at the same moment both get, say, "scene-4".
 * Ours is renamed so that both scenes survive the merge.
 */
function keepBothNewScenes(base: Doc, ours: Doc, theirs: Doc): Doc {
  const known = new Set(base.nodes.map(node => node.key)); const added = new Map(theirs.nodes.filter(node => !known.has(node.key)).map(node => [node.key, node]));
  let result = ours;
  for (const node of ours.nodes) {
    const other = added.get(node.key); if (known.has(node.key) || !other || same(node, other)) continue;
    const taken = [...result.nodes, ...theirs.nodes].map(entry => entry.key);
    result = renameScene(result, node.key, uniqueKey(node.key.replace(/-\d+$/, '').slice(0, 50), taken));
  }
  return result;
}

/** Connections to a scene that one side removed meanwhile are dropped, as deleting a scene does. */
function dropCutConnections(doc: Doc, base: Doc): Doc {
  const keys = new Set(doc.nodes.map(node => node.key)); const before = new Set(base.nodes.map(node => node.key));
  const cut = (key: string) => !keys.has(key) && before.has(key);
  const edges = doc.edges.filter(edge => !cut(edge.from) && !cut(edge.to));
  return edges.length === doc.edges.length ? doc : { ...doc, edges };
}

const wellFormed = (doc: unknown): doc is Doc => Array.isArray((doc as Doc | null)?.nodes) && Array.isArray((doc as Doc).edges);

/**
 * Our version with the other side's changes since `base` worked in. Where
 * both changed the same field, ours stays.
 */
export function combine(base: Doc, ours: Doc, theirs: Doc): Doc {
  if (!wellFormed(base) || !wellFormed(ours) || !wellFormed(theirs)) return ours;
  const merged = merge3(base, keepBothNewScenes(base, ours, theirs), theirs);
  return wellFormed(merged) ? dropCutConnections(merged, base) : ours;
}
