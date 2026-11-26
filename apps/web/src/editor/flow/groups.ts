import { CARD_WIDTH, cardHeight, GROUP, isGroupKey, optionsOf, type Definition, type Positions } from '../model.js';

// Groups on the Flow map: scenes that are selected and moved as one (a minigame draw and its games, a prefab…).
// Layout only, like bend points: each grouped scene has "group--<scene>" in the positions with its group's number
// as x, plus an optional name and colour. Saving, undo, live editing and export carry this editor layout.

/** Layout keys are at most 64 characters; a scene whose key leaves no room for the prefix stays ungrouped. */
const MAX_KEY = 64 - GROUP.length;
const groupKey = (scene: string) => `${GROUP}${scene}`;

/** Every group with two or more scenes still in the game, by number. */
export function groupsIn(definition: Definition, positions: Positions): Map<number, string[]> {
  const scenes = new Set(definition.nodes.map(node => node.key)); const groups = new Map<number, string[]>();
  for (const [key, point] of Object.entries(positions)) {
    const scene = key.slice(GROUP.length);
    if (!isGroupKey(key) || !scenes.has(scene) || !positions[scene]) continue;
    groups.set(point.x, [...(groups.get(point.x) ?? []), scene]);
  }
  for (const [id, members] of groups) if (members.length < 2) groups.delete(id);
  return groups;
}

/** The scenes with the rest of their groups added: clicking one scene of a group takes the whole group. */
export function withWholeGroups(definition: Definition, positions: Positions, keys: string[]): string[] {
  const groups = groupsIn(definition, positions); const out = new Set(keys);
  for (const key of keys) { const id = positions[groupKey(key)]?.x; if (id !== undefined) for (const member of groups.get(id) ?? []) out.add(member); }
  return [...out];
}

/** Whether these scenes are exactly one group. */
export function isOneGroup(definition: Definition, positions: Positions, keys: string[]): boolean {
  const id = positions[groupKey(keys[0] ?? '')]?.x; const members = id === undefined ? undefined : groupsIn(definition, positions).get(id);
  return Boolean(members && members.length === keys.length && keys.every(key => members.includes(key)));
}

/** Whether any of these scenes is in a group. */
export const anyGrouped = (definition: Definition, positions: Positions, keys: string[]) => {
  const grouped = new Set([...groupsIn(definition, positions).values()].flat()); return keys.some(key => grouped.has(key));
};

/** These scenes as one new group (taken out of the groups they were in). Fewer than two: nothing changes. */
export function grouped(positions: Positions, keys: string[], appearance: GroupAppearance = {}): Positions {
  const members = keys.filter(key => key.length <= MAX_KEY && positions[key]);
  if (members.length < 2) return positions;
  const used = Object.entries(positions).filter(([key]) => isGroupKey(key)).map(([, point]) => point.x);
  const id = Math.max(0, ...used) + 1; const next = ungrouped(positions, members);
  for (const key of members) next[groupKey(key)] = { x: id, y: 0, ...appearance };
  return next;
}

/** These scenes out of their groups. */
export function ungrouped(positions: Positions, keys: string[]): Positions {
  const next = { ...positions }; for (const key of keys) delete next[groupKey(key)]; return next;
}

type GroupAppearance = Pick<Positions[string], 'groupName' | 'groupColour'>;

export function groupAppearance(positions: Positions, members: string[]): GroupAppearance {
  const entries = members.map(member => positions[groupKey(member)]);
  return {
    groupName: entries.find(entry => entry?.groupName)?.groupName?.trim(),
    groupColour: entries.find(entry => entry?.groupColour)?.groupColour,
  };
}

/** Each member carries the appearance so it survives removing a member from the group. */
export function updateGroupAppearance(positions: Positions, members: string[], appearance: GroupAppearance): Positions {
  const next = { ...positions };
  for (const member of members) {
    const key = groupKey(member); const position = positions[key];
    if (position) next[key] = { ...position, ...appearance };
  }
  return next;
}

/** The frame drawn behind a group: around its cards, with room above for its name. */
export function groupFrame(definition: Definition, positions: Positions, members: string[]) {
  const nodes = definition.nodes.filter(node => members.includes(node.key) && positions[node.key]);
  const left = Math.min(...nodes.map(node => positions[node.key]!.x)); const top = Math.min(...nodes.map(node => positions[node.key]!.y));
  const right = Math.max(...nodes.map(node => positions[node.key]!.x + CARD_WIDTH)); const bottom = Math.max(...nodes.map(node => positions[node.key]!.y + cardHeight(node)));
  // Named after its first scene (top left): a draw names the group of its games.
  const first = [...nodes].sort((a, b) => positions[a.key]!.y - positions[b.key]!.y || positions[a.key]!.x - positions[b.key]!.x)[0]!;
  return { x: left - 16, y: top - 40, width: right - left + 32, height: bottom - top + 56, first: first.key };
}

export function groupView(definition: Definition, positions: Positions, members: string[]) {
  const frame = groupFrame(definition, positions, members);
  return {
    key: [...members].sort().join(','),
    members,
    frame,
    ...groupAppearance(positions, members),
    at: { x: frame.x + 16, y: frame.y + 40 },
  };
}

export type FlowGroup = ReturnType<typeof groupView>;

/** The visible connections of closed groups. Parallel routes to the same box share one line. */
export function collapsedConnections(definition: Definition, hidden: ReadonlyMap<string, FlowGroup>) {
  const links = new Map<string, { from: string; to: string; count: number; label: string | undefined; option: string | undefined }>();
  for (const edge of definition.edges) {
    const source = hidden.get(edge.from); const target = hidden.get(edge.to);
    if ((!source && !target) || (source && source === target)) continue;
    const from = source?.frame.first ?? edge.from; const to = target?.frame.first ?? edge.to;
    const key = `${from}:${to}`;
    const prior = links.get(key);
    if (prior) { prior.count++; continue; }
    const node = definition.nodes.find(entry => entry.key === edge.from);
    const label = edge.option ? optionsOf(node).find(option => option.key === edge.option)?.label : undefined;
    links.set(key, { from, to, count: 1, label, option: edge.option });
  }
  return links;
}
