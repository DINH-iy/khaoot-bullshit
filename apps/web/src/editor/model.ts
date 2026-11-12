// Flow editor model: pure functions over a game draft. The server validates
// every save; this only keeps edits well formed and the canvas snappy.

export interface Option { key: string; label: string }
export type Stage = Record<string, unknown> & { key: string; kind: string; prompt?: string; title?: string; durationMs?: number | null };
export interface Node { key: string; stages: Stage[] }
export interface Edge { key: string; from: string; to: string; option?: string }
export interface Definition extends Record<string, unknown> { formatVersion: number; title: string; startNodeKey: string; nodes: Node[]; edges: Edge[] }
export interface Point { x: number; y: number }
export type Positions = Record<string, Point>;

// Card geometry, in canvas units. Ports sit at fixed offsets so lines line up exactly.
export const GRID = 24;
export const CARD_WIDTH = 264;
export const PORT_Y = 72;
export const OPTION_GAP = 32;
// A party choice lists its routes as rows under the title, each with its own output port.
export const ROUTE_FIRST = 160;
export const SNAP_RADIUS = 56;
const ALIGN = 12;
export const isRoute = (node: Node | undefined) => node?.stages.length === 1 && node.stages[0]!.kind === 'route';
export const optionsOf = (node: Node | undefined): Option[] => isRoute(node) ? (node!.stages[0]!['options'] as Option[] | undefined) ?? [] : [];
export const cardHeight = (node: Node) => isRoute(node) ? ROUTE_FIRST + Math.max(0, optionsOf(node).length - 1) * OPTION_GAP + 32 : 168;
export const inputPort = (position: Point): Point => ({ x: position.x, y: position.y + PORT_Y });
export function outputPort(node: Node, position: Point, option?: string): Point {
  if (!isRoute(node)) return { x: position.x + CARD_WIDTH, y: position.y + PORT_Y };
  const index = Math.max(0, optionsOf(node).findIndex(entry => entry.key === option));
  return { x: position.x + CARD_WIDTH, y: position.y + ROUTE_FIRST + index * OPTION_GAP };
}
/** A smooth curve from an output port to an input port, as in the reference. */
export function curve(from: Point, to: Point): string {
  const bend = Math.max(48, Math.abs(to.x - from.x) / 2);
  return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`;
}

/** A point a fraction `t` along the curve: where an arrow's grab handle sits, so arrows into the same scene get separate handles. */
export function pointOnCurve(from: Point, to: Point, t: number): Point {
  const bend = Math.max(48, Math.abs(to.x - from.x) / 2);
  const p1 = { x: from.x + bend, y: from.y }; const p2 = { x: to.x - bend, y: to.y }; const u = 1 - t;
  return { x: u ** 3 * from.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t ** 3 * to.x, y: u ** 3 * from.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t ** 3 * to.y };
}

// ---------- scene types ----------
export type SceneType = 'info' | 'quiz' | 'writing' | 'upload' | 'order' | 'challenge' | 'vote' | 'route' | 'scoreboard' | 'minigame';
export const SCENE_TYPES: { type: SceneType; name: string; icon: string; hint: string }[] = [
  { type: 'info', name: 'Cutscene or info', icon: 'info', hint: 'Text on every screen' },
  { type: 'quiz', name: 'Quiz question', icon: 'quiz', hint: 'Tiles or a list, one correct answer' },
  { type: 'writing', name: 'Writing round', icon: 'writing', hint: 'Jokes, captions, excuses' },
  { type: 'upload', name: 'Picture or video round', icon: 'upload', hint: 'Photos, GIFs, short videos' },
  { type: 'order', name: 'Put in order', icon: 'order', hint: 'Arrange items correctly' },
  { type: 'challenge', name: 'Host-judged challenge', icon: 'challenge', hint: 'The host gives points' },
  { type: 'vote', name: 'Vote on answers', icon: 'vote', hint: 'Vote for a writing or upload round' },
  { type: 'route', name: 'Party choice', icon: 'route', hint: 'Branch into routes' },
  { type: 'scoreboard', name: 'Scoreboard', icon: 'scoreboard', hint: 'Show the standings' },
  { type: 'minigame', name: 'Minigame', icon: 'minigame', hint: 'Placeholder until minigames exist' },
];
export function newStage(type: SceneType, definition: Definition): Stage {
  switch (type) {
    case 'info': return { key: 'main', kind: 'info', title: 'New scene', prompt: 'Text shown on every screen.', durationMs: null };
    case 'quiz': return { key: 'main', kind: 'collect', prompt: 'Your question?', durationMs: 20_000,
      input: { kind: 'choice', layout: 'tiles', options: [{ key: 'a', label: 'Answer A' }, { key: 'b', label: 'Answer B' }] },
      scoring: { kind: 'correct-choice', correctChoiceKey: 'a', awardMilli: '10000' } };
    case 'writing': return { key: 'main', kind: 'collect', prompt: 'Write your answer.', durationMs: 60_000, input: { kind: 'text', maxLength: 240 }, scoring: { kind: 'none' } };
    case 'upload': return { key: 'main', kind: 'collect', prompt: 'Upload a picture or GIF.', durationMs: 90_000, input: { kind: 'media', accept: ['image', 'gif'] }, scoring: { kind: 'none' } };
    case 'challenge': return { key: 'main', kind: 'challenge', prompt: 'Describe the challenge. The host judges.', durationMs: null, maxAwardMilli: '10000' };
    case 'vote': {
      const source = definition.nodes.flatMap(node => node.stages.filter(isVotable).map(stage => ({ nodeKey: node.key, stageKey: stage.key })))[0];
      return { key: 'main', kind: 'vote', prompt: 'Vote for the best answer. Not your own.', durationMs: 45_000, source: source ?? { nodeKey: 'choose', stageKey: 'main' }, awardPerVoteMilli: '5000' };
    }
    case 'route': return { key: 'main', kind: 'route', prompt: 'Choose your route!', durationMs: 20_000,
      options: [{ key: 'left', label: 'Left' }, { key: 'right', label: 'Right' }], decide: { method: 'players', tie: 'random', noVotes: 'random', counts: 'reveal' } };
    case 'scoreboard': return { key: 'main', kind: 'scoreboard', prompt: 'Standings', show: 'players', durationMs: null };
    case 'order': return { key: 'main', kind: 'collect', prompt: 'Put these in the right order.', durationMs: 30_000,
      input: { kind: 'order', items: [{ key: 'first', label: 'First' }, { key: 'second', label: 'Second' }, { key: 'third', label: 'Third' }] },
      scoring: { kind: 'correct-order', correctOrder: ['first', 'second', 'third'], awardMilli: '10000' } };
    case 'minigame': return { key: 'main', kind: 'minigame', prompt: 'Describe the minigame you have in mind.', game: 'to-be-chosen', durationMs: 60_000 };
  }
}
export const isVotable = (stage: Stage) => stage.kind === 'collect' && ['text', 'media'].includes((stage['input'] as { kind?: string } | undefined)?.kind ?? '') && (stage['scoring'] as { kind?: string } | undefined)?.kind === 'none';
export function uniqueKey(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken); let index = 1;
  while (used.has(`${prefix}-${index}`)) index++;
  return `${prefix}-${index}`;
}

// ---------- card text ----------
const KIND_LABEL: Record<string, string> = { info: 'Cutscene', route: 'Party choice', challenge: 'Challenge', vote: 'Vote', scoreboard: 'Results', minigame: 'Minigame' };
function stageLabel(stage: Stage): string {
  if (stage.kind !== 'collect') return KIND_LABEL[stage.kind] ?? stage.kind;
  const input = (stage['input'] as { kind?: string } | undefined)?.kind;
  return input === 'choice' ? 'Quiz' : input === 'order' ? 'Ordering' : input === 'media' ? 'Upload' : input === 'text' ? 'Writing' : 'Question';
}
const seconds = (stage: Stage) => typeof stage.durationMs === 'number' ? `${Math.round(stage.durationMs / 1000)} seconds` : null;
function stageLine(stage: Stage): string {
  const timer = seconds(stage);
  if (stage.kind === 'info') return [timer?.replace(' seconds', ' sec'), 'Host continues'].filter(Boolean).join(' · ');
  if (stage.kind === 'route') {
    const method = (stage['decide'] as { method?: string } | undefined)?.method;
    return [method === 'host' ? 'Host decides' : method === 'captains' ? 'Captains vote' : 'Everyone votes', timer].filter(Boolean).join(' · ');
  }
  if (stage.kind === 'challenge') return 'Challenge · Host judges';
  if (stage.kind === 'scoreboard') return 'Scoreboard';
  if (stage.kind === 'minigame') return ['Placeholder', timer].filter(Boolean).join(' · ');
  if (stage.kind === 'vote') return ['Vote on answers', timer].filter(Boolean).join(' · ');
  const input = stage['input'] as { kind?: string; options?: unknown[] } | undefined;
  return [stageLabel(stage), input?.kind === 'choice' ? `${input.options?.length ?? 0} options` : null, timer].filter(Boolean).join(' · ');
}
/** What a scene card shows: a type label, a title and a one-line summary, as in the reference. */
export function cardText(definition: Definition, node: Node) {
  const first = node.stages[0]!;
  const incoming = definition.edges.filter(edge => edge.to === node.key);
  const viaOption = incoming.length === 1 && incoming[0]!.option ? optionsOf(definition.nodes.find(other => other.key === incoming[0]!.from)).find(option => option.key === incoming[0]!.option) : undefined;
  const base = viaOption ? `${viaOption.label} route` : stageLabel(first);
  const label = incoming.length > 1 ? `Rejoin · ${stageLabel(first)}` : base;
  // An info card shows its title in the strip and its text below, like a slide.
  const title = first.prompt ?? node.key;
  const banner = first.kind === 'info' ? String(first.title ?? '') : null;
  const line = node.stages.length > 1 ? `${node.stages.length} parts · ${stageLine(first)}` : stageLine(first);
  return { label, title: String(title), banner, line, kind: first.kind, input: (first['input'] as { kind?: string } | undefined)?.kind ?? null };
}

// ---------- layout and snapping ----------
/** Columns by depth from the start, rows in definition order: a tidy first layout for games without one. */
export function autoLayout(definition: Definition): Positions {
  const depth = new Map<string, number>([[definition.startNodeKey, 0]]);
  for (let pass = 0; pass < definition.nodes.length; pass++) {
    for (const edge of definition.edges) {
      const from = depth.get(edge.from);
      if (from !== undefined && (depth.get(edge.to) ?? -1) < from + 1 && from + 1 < definition.nodes.length) depth.set(edge.to, from + 1);
    }
  }
  const columns = new Map<number, Node[]>();
  for (const node of definition.nodes) { const column = depth.get(node.key) ?? 0; columns.set(column, [...(columns.get(column) ?? []), node]); }
  const tallest = Math.max(...[...columns.values()].map(nodes => nodes.reduce((sum, node) => sum + cardHeight(node) + GRID * 2, 0)));
  const positions: Positions = {};
  for (const [column, nodes] of columns) {
    const height = nodes.reduce((sum, node) => sum + cardHeight(node) + GRID * 2, 0);
    let y = snap((tallest - height) / 2);
    for (const node of nodes) { positions[node.key] = { x: column * (CARD_WIDTH + GRID * 6), y }; y += snap(cardHeight(node) + GRID * 2); }
  }
  return positions;
}
export const snap = (value: number) => Math.round(value / GRID) * GRID;
export interface Guides { x: number | null; y: number | null }
/**
 * Where a dragged card lands. In order of preference: level with the output port
 * that feeds it (a straight line), aligned with another card's edge, else the grid.
 */
export function snapCard(definition: Definition, positions: Positions, key: string, raw: Point): { point: Point; guides: Guides } {
  let x = snap(raw.x); let y = snap(raw.y); const guides: Guides = { x: null, y: null };
  const others = Object.entries(positions).filter(([other]) => other !== key);
  let bestX = ALIGN;
  for (const [, position] of others) if (Math.abs(raw.x - position.x) < bestX) { bestX = Math.abs(raw.x - position.x); x = position.x; guides.x = position.x; }
  let bestY = ALIGN + 4;
  for (const edge of definition.edges.filter(candidate => candidate.to === key)) {
    const from = positions[edge.from]; const node = definition.nodes.find(candidate => candidate.key === edge.from);
    if (!from || !node) continue;
    const port = outputPort(node, from, edge.option);
    const distance = Math.abs(raw.y + PORT_Y - port.y);
    if (distance < bestY) { bestY = distance; y = port.y - PORT_Y; guides.y = port.y; }
  }
  if (guides.y === null) {
    let bestTop = ALIGN;
    for (const [, position] of others) if (Math.abs(raw.y - position.y) < bestTop) { bestTop = Math.abs(raw.y - position.y); y = position.y; guides.y = position.y; }
  }
  return { point: { x, y }, guides };
}

// ---------- connections ----------
function reaches(definition: Definition, from: string, to: string): boolean {
  const queue = [from]; const seen = new Set<string>();
  while (queue.length) {
    const key = queue.shift()!; if (key === to) return true; if (seen.has(key)) continue; seen.add(key);
    for (const edge of definition.edges) if (edge.from === key) queue.push(edge.to);
  }
  return false;
}
export type ConnectProblem = 'self' | 'circle' | 'same-scene' | null;
/** Why a connection from `from` (option) to `to` is not allowed, or null. */
export function connectProblem(definition: Definition, from: string, option: string | undefined, to: string): ConnectProblem {
  if (from === to) return 'self';
  if (reaches(definition, to, from)) return 'circle';
  if (option && definition.edges.some(edge => edge.from === from && edge.option !== option && edge.to === to)) return 'same-scene';
  return null;
}
/** Connects an output to a scene. Each output has one connection, so this replaces the old one. */
export function connect(definition: Definition, from: string, option: string | undefined, to: string): Definition {
  if (connectProblem(definition, from, option, to)) return definition;
  const kept = definition.edges.filter(edge => !(edge.from === from && (option ? edge.option === option : true)));
  const key = uniqueKey(`${from}-to-${to}`.slice(0, 50), definition.edges.map(edge => edge.key));
  return { ...definition, ...(option ? { formatVersion: 2 } : {}), edges: [...kept, { key, from, to, ...(option ? { option } : {}) }] };
}
export const disconnect = (definition: Definition, edgeKey: string): Definition => ({ ...definition, edges: definition.edges.filter(edge => edge.key !== edgeKey) });

// ---------- scenes ----------
export function addScene(definition: Definition, type: SceneType): { definition: Definition; key: string } {
  const key = uniqueKey(type === 'route' ? 'choice' : 'scene', definition.nodes.map(node => node.key));
  const node: Node = { key, stages: [newStage(type, definition)] };
  return { key, definition: { ...definition, ...(type === 'route' ? { formatVersion: 2 } : {}), nodes: [...definition.nodes, node] } };
}
export function deleteScene(definition: Definition, key: string): Definition {
  const nodes = definition.nodes.filter(node => node.key !== key);
  const edges = definition.edges.filter(edge => edge.from !== key && edge.to !== key);
  // If the start scene goes, the first scene nothing leads to becomes the start.
  const start = definition.startNodeKey !== key ? definition.startNodeKey : nodes.find(node => !edges.some(edge => edge.to === node.key))?.key ?? nodes[0]?.key ?? key;
  return { ...definition, nodes, edges, startNodeKey: start };
}
export function updateStage(definition: Definition, nodeKey: string, index: number, change: (stage: Stage) => Stage): Definition {
  return { ...definition, nodes: definition.nodes.map(node => node.key !== nodeKey ? node : { ...node, stages: node.stages.map((stage, position) => position === index ? change(stage) : stage) }) };
}
/** Removing a route option also removes its connection. */
export function setRouteOptions(definition: Definition, nodeKey: string, options: Option[]): Definition {
  const keys = new Set(options.map(option => option.key));
  const updated = updateStage(definition, nodeKey, 0, stage => {
    const fallback = stage['defaultOptionKey'];
    const next: Stage = { ...stage, options };
    if (typeof fallback === 'string' && !keys.has(fallback)) delete next['defaultOptionKey'];
    return next;
  });
  return { ...updated, edges: updated.edges.filter(edge => edge.from !== nodeKey || !edge.option || keys.has(edge.option)) };
}

/** Moves a dropped card down the grid until it no longer overlaps another card. */
export function freeSpot(definition: Definition, positions: Positions, key: string, point: Point): Point {
  const node = definition.nodes.find(candidate => candidate.key === key); if (!node) return point;
  const height = cardHeight(node); let { x, y } = point;
  const overlaps = () => definition.nodes.some(other => {
    const at = positions[other.key]; if (other.key === key || !at) return false;
    return x < at.x + CARD_WIDTH + GRID && x + CARD_WIDTH + GRID > at.x && y < at.y + cardHeight(other) + GRID && y + height + GRID > at.y;
  });
  for (let step = 0; step < 200 && overlaps(); step++) y += GRID;
  return { x, y };
}
/** Adds a scene and connects an output to it in one step. */
export function addConnectedScene(definition: Definition, type: SceneType, from: string, option: string | undefined): { definition: Definition; key: string } {
  const added = addScene(definition, type);
  return { key: added.key, definition: connect(added.definition, from, option, added.key) };
}

/**
 * Pastes scenes from `source` (this game or another) into `target`, with the
 * connections between them (not those to outside scenes), under new names and
 * shifted by `offset`. A vote that points at a pasted round points at the copy.
 */
export function pasteScenes(target: Definition, targetPositions: Positions, source: Definition, sourcePositions: Positions, keys: string[], offset: Point): { definition: Definition; positions: Positions; keys: string[] } {
  const chosen = new Set(keys); const taken = new Set(target.nodes.map(node => node.key)); const renamed = new Map<string, string>();
  for (const key of keys) { const next = uniqueKey(key.replace(/-copy(-\d+)?$/, '').slice(0, 50) + '-copy', taken); taken.add(next); renamed.set(key, next); }
  const copies: Node[] = source.nodes.filter(node => chosen.has(node.key)).map(node => ({ key: renamed.get(node.key)!, stages: node.stages.map(stage => {
    const from = stage['source'] as { nodeKey: string; stageKey: string } | undefined;
    return structuredClone(from && renamed.has(from.nodeKey) ? { ...stage, source: { ...from, nodeKey: renamed.get(from.nodeKey)! } } : stage);
  }) }));
  const edgeKeys = new Set(target.edges.map(edge => edge.key));
  const edges: Edge[] = source.edges.filter(edge => chosen.has(edge.from) && chosen.has(edge.to)).map(edge => {
    const key = uniqueKey(`${renamed.get(edge.from)}-to-${renamed.get(edge.to)}`.slice(0, 50), edgeKeys); edgeKeys.add(key);
    return { ...edge, key, from: renamed.get(edge.from)!, to: renamed.get(edge.to)! };
  });
  const placed = { ...targetPositions };
  keys.forEach((key, index) => { const at = sourcePositions[key] ?? { x: index * (CARD_WIDTH + GRID * 2), y: 0 }; placed[renamed.get(key)!] = { x: snap(at.x + offset.x), y: snap(at.y + offset.y) }; });
  const usesRoutes = copies.some(isRoute) || edges.some(edge => edge.option);
  const definition = { ...target, ...(usesRoutes ? { formatVersion: 2 } : {}), nodes: [...target.nodes, ...copies], edges: [...target.edges, ...edges] };
  return { definition, positions: placed, keys: keys.map(key => renamed.get(key)!) };
}
/** Copies scenes within the same game, a little lower and to the right. */
export const duplicateScenes = (definition: Definition, positions: Positions, keys: string[], offset: Point = { x: GRID * 2, y: GRID * 2 }) => pasteScenes(definition, positions, definition, positions, keys, offset);
