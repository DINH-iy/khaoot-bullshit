import type { GameDefinition, StageDefinition } from './definition.js';
import { GameError } from './errors.js';

// The game's flow as a graph. Format 1 is a single line of nodes. Format 2 adds
// route choices: a node whose only stage is a `route` stage, with one outgoing
// edge per option (the edge names its `option`). Routes may rejoin; cycles are
// never allowed, so every node runs at most once per session and every path ends.
// Pure functions only: shared by validation, the runtime and the future builder.
type Edge = GameDefinition['edges'][number];
type Node = GameDefinition['nodes'][number];
export type RouteStage = Extract<StageDefinition, { kind: 'route' }>;
export interface Located { nodeKey: string; stage: StageDefinition; index: number }

const nodeOf = (definition: GameDefinition, key: string): Node | undefined => definition.nodes.find(node => node.key === key);
export const outgoing = (definition: GameDefinition, nodeKey: string): Edge[] => definition.edges.filter(edge => edge.from === nodeKey);
const playOf = (definition: GameDefinition, stage: StageDefinition) => stage.kind === 'route' || stage.kind === 'info' || stage.kind === 'scoreboard' ? null : stage.play ?? definition.play ?? { kind: 'solo' as const };

/** Every stage of every node, in definition order (not a route). */
export const allStages = (definition: GameDefinition) => definition.nodes.flatMap(node => node.stages.map((stage, index) => ({ nodeKey: node.key, stage, index })));
export function locateStage(definition: GameDefinition, nodeKey: string, stageKey: string): Located | null {
  const node = nodeOf(definition, nodeKey); const index = node ? node.stages.findIndex(stage => stage.key === stageKey) : -1;
  return node && index >= 0 ? { nodeKey, stage: node.stages[index]!, index } : null;
}
export function firstStage(definition: GameDefinition): Located {
  const node = nodeOf(definition, definition.startNodeKey); if (!node) throw new GameError('INVALID_DEFINITION');
  return { nodeKey: node.key, stage: node.stages[0]!, index: 0 };
}
/** The edge a route option leads along. */
export const routeEdge = (definition: GameDefinition, nodeKey: string, optionKey: string): Edge | null => outgoing(definition, nodeKey).find(edge => edge.option === optionKey) ?? null;

/**
 * The stage after `at`: the next one in its node, else the first stage of the
 * next node. Leaving a route choice needs its recorded decision, which must
 * still match the definition. Returns 'END' when the game is over.
 */
export function nextStage(definition: GameDefinition, at: { nodeKey: string; stageKey: string }, decision: { selectedEdgeKey: string; destinationNodeKey: string } | null): Located | 'END' | 'DECISION_PENDING' {
  const here = locateStage(definition, at.nodeKey, at.stageKey); if (!here) throw new GameError('INVALID_STATE');
  const node = nodeOf(definition, at.nodeKey)!;
  if (here.index + 1 < node.stages.length) return { nodeKey: node.key, stage: node.stages[here.index + 1]!, index: here.index + 1 };
  const edges = outgoing(definition, node.key);
  let edge: Edge | undefined;
  if (here.stage.kind === 'route') {
    if (!decision) return 'DECISION_PENDING';
    edge = edges.find(candidate => candidate.key === decision.selectedEdgeKey);
    if (!edge || edge.to !== decision.destinationNodeKey) throw new GameError('INVALID_STATE');
  } else {
    if (edges.length > 1) throw new GameError('INVALID_STATE');
    edge = edges[0];
  }
  if (!edge) return 'END';
  const target = nodeOf(definition, edge.to); if (!target) throw new GameError('INVALID_STATE');
  return { nodeKey: target.key, stage: target.stages[0]!, index: 0 };
}

/** Topological order of all nodes, or null when there is a cycle. */
export function topologicalOrder(definition: GameDefinition): string[] | null {
  const indegree = new Map(definition.nodes.map(node => [node.key, 0]));
  for (const edge of definition.edges) if (indegree.has(edge.to) && indegree.has(edge.from)) indegree.set(edge.to, indegree.get(edge.to)! + 1);
  const ready = definition.nodes.filter(node => indegree.get(node.key) === 0).map(node => node.key); const order: string[] = [];
  while (ready.length) {
    const key = ready.shift()!; order.push(key);
    for (const edge of outgoing(definition, key)) if (indegree.has(edge.to)) { indegree.set(edge.to, indegree.get(edge.to)! - 1); if (indegree.get(edge.to) === 0) ready.push(edge.to); }
  }
  return order.length === definition.nodes.length ? order : null;
}
/** The most stages any single play-through can have. */
export function maxPathStages(definition: GameDefinition): number {
  const order = topologicalOrder(definition); if (!order) return 0;
  const best = new Map<string, number>();
  for (const key of [...order].reverse()) best.set(key, (nodeOf(definition, key)?.stages.length ?? 0) + Math.max(0, ...outgoing(definition, key).map(edge => best.get(edge.to) ?? 0)));
  return best.get(definition.startNodeKey) ?? 0;
}

/**
 * Every reason a definition cannot run, as messages for the builder. Rules that
 * must hold "earlier on the route" are checked on every possible path, using
 * forward passes in topological order instead of listing paths.
 */
export interface GraphIssue { message: string; nodeKey?: string }
export function graphIssues(definition: GameDefinition): GraphIssue[] {
  const issues = new Map<string, GraphIssue>();
  // `nodeKey` lets the builder show the message on the scene it concerns.
  const fail = (message: string, nodeKey?: string) => { const issue = nodeKey ? { message, nodeKey } : { message }; issues.set(`${message}|${nodeKey ?? ''}`, issue); };
  const keys = new Set(definition.nodes.map(node => node.key));
  const v2 = definition.formatVersion === 2;
  const pairs = new Set<string>();
  for (const edge of definition.edges) {
    if (edge.from === edge.to) fail('Self connection', edge.from);
    const pair = `${edge.from}->${edge.to}`; if (pairs.has(pair)) fail('Duplicate connection', edge.from); pairs.add(pair);
  }
  let routes = 0;
  for (const node of definition.nodes) {
    const edges = outgoing(definition, node.key); const route = node.stages.find(stage => stage.kind === 'route');
    if (!v2) {
      if (route || edges.some(edge => edge.option !== undefined)) fail('Route choices require format 2', node.key);
      if (edges.length > 1) fail('Branching requires a later definition format', node.key);
      continue;
    }
    if (!route) {
      if (edges.length > 1 || edges.some(edge => edge.option !== undefined)) fail('Only route choices branch', node.key);
      continue;
    }
    routes++;
    if (node.stages.length !== 1 || route.kind !== 'route') { fail('Route choice must be its own node', node.key); continue; }
    const options = route.options.map(option => option.key);
    if (edges.some(edge => edge.option === undefined)) fail('Unconnected route option', node.key);
    const connected = edges.map(edge => edge.option).filter(option => option !== undefined);
    if (connected.some(option => !options.includes(option))) fail('Unknown route option', node.key);
    if (new Set(connected).size !== connected.length) fail('Duplicate route option', node.key);
    if (options.some(option => !connected.includes(option))) fail('Unconnected route option', node.key);
    if (new Set(edges.map(edge => edge.to)).size !== edges.length) fail('Route options must lead to different scenes', node.key);
    const usesDefault = route.decide.method !== 'host' && (route.decide.tie === 'default' || route.decide.noVotes === 'default');
    if (usesDefault !== (route.defaultOptionKey !== undefined) || (route.defaultOptionKey !== undefined && !options.includes(route.defaultOptionKey))) fail('Invalid default route', node.key);
    if (route.decide.method === 'host' && route.durationMs !== null) fail('Host route choice has no timer', node.key);
  }
  if (routes > 20) fail('Too many route choices');
  if (!v2 && definition.edges.length > 99) fail('Too many connections');

  const order = topologicalOrder(definition);
  if (!order) { fail('Cycle or invalid route'); return [...issues.values()]; }
  const reached = new Set<string>(); const queue = keys.has(definition.startNodeKey) ? [definition.startNodeKey] : [];
  while (queue.length) { const key = queue.shift()!; if (reached.has(key)) continue; reached.add(key); for (const edge of outgoing(definition, key)) queue.push(edge.to); }
  if (reached.size !== keys.size) { for (const key of keys) if (!reached.has(key)) fail('Unreachable node', key); return [...issues.values()]; }

  const predecessors = (key: string) => definition.edges.filter(edge => edge.to === key && keys.has(edge.from)).map(edge => edge.from);
  const stagesById = new Map(allStages(definition).map(entry => [`${entry.nodeKey}/${entry.stage.key}`, entry.stage]));
  // Forward pass: which stages have certainly run, whether game teams are defined, and whether a lineup was formed.
  const after = new Map<string, { seen: Set<string>; teams: boolean; formed: boolean }>();
  for (const key of order) {
    const before = predecessors(key).map(from => after.get(from)!);
    const seen = key === definition.startNodeKey ? new Set<string>() : new Set([...before[0]!.seen].filter(id => before.every(state => state.seen.has(id))));
    let teams = key === definition.startNodeKey ? Boolean(definition.teams) : before.every(state => state.teams);
    let formed = key === definition.startNodeKey ? false : before.every(state => state.formed);
    for (const stage of nodeOf(definition, key)!.stages) {
      if (stage.kind === 'vote') {
        const id = `${stage.source.nodeKey}/${stage.source.stageKey}`; const source = stagesById.get(id);
        if (!seen.has(id) || !source || source.kind !== 'collect' || !['text', 'media', 'drawing'].includes(source.input.kind) || source.scoring.kind !== 'none') fail('Invalid vote source', key);
      }
      const play = playOf(definition, stage);
      if (play?.kind === 'teams' && play.lineup.kind === 'reform') { teams = true; formed = true; }
      if (play?.kind === 'teams' && play.lineup.kind === 'game') { if (!teams) fail('Game teams are used before they are defined', key); formed = true; }
      if (stage.kind === 'route' && stage.decide.method === 'captains') {
        if (!teams) fail('Game teams are used before they are defined', key);
        if (!formed) fail('Captain vote needs teams earlier on every path', key);
      }
      seen.add(`${key}/${stage.key}`);
    }
    after.set(key, { seen, teams, formed });
  }
  // A vote source stays anonymous until its vote, so every path from it must reach that vote.
  const sources = new Set(allStages(definition).flatMap(({ stage }) => stage.kind === 'vote' ? [`${stage.source.nodeKey}/${stage.source.stageKey}`] : []));
  for (const id of sources) {
    const [sourceNode, sourceStage] = id.split('/') as [string, string];
    const votesIn = (key: string, fromIndex: number) => nodeOf(definition, key)!.stages.slice(fromIndex).some(stage => stage.kind === 'vote' && `${stage.source.nodeKey}/${stage.source.stageKey}` === id);
    const covered = new Map<string, boolean>();
    for (const key of [...order].reverse()) {
      const next = outgoing(definition, key).map(edge => covered.get(edge.to) ?? false);
      covered.set(key, votesIn(key, 0) || (next.length > 0 && next.every(Boolean)));
    }
    const index = nodeOf(definition, sourceNode)?.stages.findIndex(stage => stage.key === sourceStage) ?? -1;
    const next = outgoing(definition, sourceNode).map(edge => covered.get(edge.to) ?? false);
    if (index >= 0 && !(votesIn(sourceNode, index + 1) || (next.length > 0 && next.every(Boolean)))) fail('Vote source may never be revealed', sourceNode);
  }
  return [...issues.values()];
}
