// Three-way merge of plain JSON, used when several people edit one game and
// for undo. `base` is what both sides started from. Whatever only one side
// changed is kept; where both changed the same thing, `ours` wins.
//
// Objects merge field by field. Lists whose items all carry a unique `key`
// (scenes, parts, connections, answer options) merge item by item, so one
// person can add a scene while another edits or removes a different one.
// Other lists and plain values count as one thing.

type Json = unknown;
const isObject = (value: Json): value is Record<string, Json> => value !== null && typeof value === 'object' && !Array.isArray(value);

export function same(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((item, index) => same(item, b[index]));
  if (!isObject(a) || !isObject(b)) return false;
  const keys = Object.keys(a).filter(key => a[key] !== undefined);
  return keys.length === Object.keys(b).filter(key => b[key] !== undefined).length && keys.every(key => same(a[key], b[key]));
}

/** The items by key, or null when this is not a list of uniquely keyed items. */
function keyed(value: Json): Map<string, Json> | null {
  if (!Array.isArray(value)) return null;
  const items = new Map<string, Json>();
  for (const item of value) {
    const key = isObject(item) ? item['key'] : undefined;
    if (typeof key !== 'string' || items.has(key)) return null;
    items.set(key, item);
  }
  return items;
}

/** A missing field or list item is `undefined`. */
export function merge3(base: Json, ours: Json, theirs: Json): Json {
  if (same(ours, theirs) || same(base, theirs)) return ours;
  if (same(base, ours)) return theirs;
  if (isObject(base) && isObject(ours) && isObject(theirs)) {
    const merged: Record<string, Json> = {};
    for (const key of new Set([...Object.keys(ours), ...Object.keys(theirs)])) {
      const value = merge3(base[key], ours[key], theirs[key]);
      if (value !== undefined) merged[key] = value;
    }
    return merged;
  }
  const b = keyed(base); const o = keyed(ours); const t = keyed(theirs);
  return b && o && t ? mergeLists(b, o, t) : ours;
}

function mergeLists(base: Map<string, Json>, ours: Map<string, Json>, theirs: Map<string, Json>): Json[] {
  const merged = new Map<string, Json>();
  for (const key of new Set([...ours.keys(), ...theirs.keys()])) {
    const value = merge3(base.get(key), ours.get(key), theirs.get(key));
    if (value !== undefined) merged.set(key, value);
  }
  // Order: ours, unless only they moved things around. The other side's new items go after their neighbour there.
  const shared = (list: Map<string, Json>) => [...list.keys()].filter(key => base.has(key) && ours.has(key) && theirs.has(key)).join('\u0000');
  const [lead, follow] = shared(theirs) !== shared(base) && shared(ours) === shared(base) ? [theirs, ours] : [ours, theirs];
  const order = [...lead.keys()].filter(key => merged.has(key));
  const followed = [...follow.keys()];
  followed.forEach((key, index) => {
    if (!merged.has(key) || lead.has(key)) return;
    let after = -1;
    for (let earlier = index - 1; earlier >= 0 && after < 0; earlier--) after = order.indexOf(followed[earlier]!);
    order.splice(after + 1, 0, key);
  });
  return order.map(key => merged.get(key));
}
