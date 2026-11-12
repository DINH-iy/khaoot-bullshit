// Text import. Accepts the exact game format, or a simpler one written for
// people and AI assistants (documented in apps/web/src/hosting/ai-guide.ts):
// seconds instead of milliseconds, points as plain numbers, answers as plain
// words, `type` instead of the internal kind/input, `correct` by label, `next`
// and route `to` instead of an edge list. Anything missing gets a sensible
// default. The result is an ordinary draft: problems are listed, never fatal.

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : fallback;
export function slug(value: string, fallback: string): string {
  const cleaned = value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return /^[a-z]/.test(cleaned) ? cleaned : `${fallback}${cleaned ? `-${cleaned}` : ''}`.slice(0, 48);
}
function unique(base: string, taken: Set<string>): string {
  let key = base; let index = 2;
  while (taken.has(key)) key = `${base}-${index++}`;
  taken.add(key); return key;
}
const milli = (points: unknown) => { const value = Number(points); return Number.isFinite(value) && value >= 0 ? String(Math.round(value * 1000)) : undefined; };
const seconds = (stage: Json) => {
  if ('durationMs' in stage) return stage['durationMs'] ?? null;
  const value = Number(stage['seconds'] ?? stage['timer'] ?? stage['time']);
  return Number.isFinite(value) && value > 0 ? Math.round(value) * 1000 : null;
};
/** Plain words or {key,label} objects become options with keys. */
function options(value: unknown, prefix: string): { key: string; label: string }[] {
  const taken = new Set<string>();
  return (Array.isArray(value) ? value : []).map((entry, index) => {
    const label = isObject(entry) ? text(entry['label'] ?? entry['text'] ?? entry['name']) : text(entry);
    const key = isObject(entry) && typeof entry['key'] === 'string' ? entry['key'] : slug(label, `${prefix}${index + 1}`);
    return { key: unique(key, taken), label: label || `Option ${index + 1}` };
  });
}
const findKey = (list: { key: string; label: string }[], wanted: unknown) => {
  const value = text(wanted).toLowerCase();
  return list.find(entry => entry.key.toLowerCase() === value || entry.label.toLowerCase() === value)?.key;
};

const TYPES: Record<string, string> = { cutscene: 'info', info: 'info', text: 'info', quiz: 'quiz', question: 'quiz', choice: 'quiz', poll: 'poll', writing: 'writing', write: 'writing', joke: 'writing', caption: 'writing',
  upload: 'upload', picture: 'upload', photo: 'upload', video: 'upload', order: 'order', ordering: 'order', challenge: 'challenge', vote: 'vote', voting: 'vote',
  route: 'route', choose: 'route', 'party-choice': 'route', branch: 'route', scoreboard: 'scoreboard', results: 'scoreboard', standings: 'scoreboard', minigame: 'minigame' };

/** One stage in the simple format (with `type`) becomes an exact stage. Exact stages (with `kind`) pass through. */
function stageFrom(raw: Json, key: string): Json {
  if (typeof raw['kind'] === 'string' && !('type' in raw)) return { key, ...raw };
  const type = TYPES[text(raw['type']).toLowerCase()] ?? (Array.isArray(raw['answers'] ?? raw['options']) ? 'quiz' : 'info');
  const prompt = text(raw['prompt'] ?? raw['question'] ?? raw['text'] ?? raw['title'], 'Untitled');
  const durationMs = seconds(raw);
  const play = isObject(raw['play']) ? { play: raw['play'] } : {};
  switch (type) {
    case 'info': return { key, kind: 'info', title: text(raw['title'], prompt).slice(0, 120), prompt: text(raw['text'] ?? raw['prompt'], prompt), durationMs };
    case 'scoreboard': return { key, kind: 'scoreboard', prompt: text(raw['title'] ?? raw['prompt'], 'Standings'), show: ['players', 'teams', 'both'].includes(text(raw['show'])) ? text(raw['show']) : 'players', durationMs };
    case 'minigame': return { key, kind: 'minigame', prompt, game: text(raw['game'], 'to-be-chosen'), durationMs };
    case 'challenge': return { key, kind: 'challenge', prompt, durationMs, maxAwardMilli: milli(raw['maxPoints'] ?? raw['points'] ?? 10) ?? '10000', ...play };
    case 'writing': return { key, kind: 'collect', prompt, durationMs: durationMs ?? 60_000, input: { kind: 'text', maxLength: Math.max(1, Math.min(2000, Number(raw['maxLength']) || 240)) }, scoring: { kind: 'none' }, ...play };
    case 'upload': {
      const accept = (Array.isArray(raw['accept']) ? raw['accept'] : ['image', 'gif']).map(entry => text(entry).toLowerCase().replace(/s$/, '').replace('picture', 'image').replace('photo', 'image')).filter(entry => ['image', 'gif', 'video'].includes(entry));
      return { key, kind: 'collect', prompt, durationMs: durationMs ?? 90_000, input: { kind: 'media', accept: accept.length ? [...new Set(accept)] : ['image'] }, scoring: { kind: 'none' }, ...play };
    }
    case 'order': {
      const items = options(raw['items'] ?? raw['answers'] ?? raw['options'], 'item');
      const points = milli(raw['points'] ?? 10);
      return { key, kind: 'collect', prompt, durationMs, input: { kind: 'order', items },
        scoring: points && points !== '0' ? { kind: 'correct-order', correctOrder: items.map(item => item.key), awardMilli: points } : { kind: 'none' }, ...play };
    }
    case 'vote': return { key, kind: 'vote', prompt, durationMs, source: raw['source'] ?? { nodeKey: text(raw['votesOn'] ?? raw['on']), stageKey: '' }, awardPerVoteMilli: milli(raw['pointsPerVote'] ?? raw['points'] ?? 5) ?? '5000', ...play };
    case 'route': {
      const routes = options(raw['options'] ?? raw['routes'], 'route');
      const method = ['players', 'captains', 'host'].includes(text(raw['decidedBy'] ?? raw['decide'])) ? text(raw['decidedBy'] ?? raw['decide']) : 'players';
      return { key, kind: 'route', prompt, durationMs: method === 'host' ? null : durationMs ?? 20_000, options: routes,
        decide: method === 'host' ? { method } : { method, tie: text(raw['onTie']) === 'host' ? 'host' : 'random', noVotes: text(raw['whenNobodyVotes']) === 'host' ? 'host' : 'random', counts: ['live', 'reveal', 'never'].includes(text(raw['showCounts'])) ? text(raw['showCounts']) : 'reveal' } };
    }
    default: { // quiz or poll
      const answers = options(raw['answers'] ?? raw['options'], 'answer');
      const correct = findKey(answers, raw['correct'] ?? raw['answer']);
      return { key, kind: 'collect', prompt, durationMs: durationMs ?? 20_000, input: { kind: 'choice', layout: text(raw['layout']) === 'list' ? 'list' : 'tiles', options: answers },
        scoring: correct && type !== 'poll' ? { kind: 'correct-choice', correctChoiceKey: correct, awardMilli: milli(raw['points'] ?? 10) ?? '10000' } : { kind: 'none' }, ...play };
    }
  }
}

/** Reads pasted text (JSON, possibly inside ```json fences) and returns a draft definition, or null when it is not JSON at all. */
/** The JSON inside pasted text: the whole text, or the first ```json block an AI wrapped it in. */
export function parseText(input: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(input);
  try { return JSON.parse((fenced ? fenced[1]! : input).trim()); } catch { return undefined; }
}
export function importDefinition(input: string): Json | null {
  let raw = parseText(input);
  if (isObject(raw) && isObject(raw['game'])) raw = raw['game'];
  if (!isObject(raw)) return null;
  const takenNodes = new Set<string>();
  const sourceNodes = Array.isArray(raw['nodes'] ?? raw['scenes']) ? (raw['nodes'] ?? raw['scenes']) as unknown[] : [];
  // A node is { key?, stages: [...] }, or one stage written directly.
  const nodes = sourceNodes.filter(isObject).map((node, index) => {
    const stagesRaw = Array.isArray(node['stages'] ?? node['parts']) ? (node['stages'] ?? node['parts']) as unknown[] : [node];
    const label = text(node['key'] ?? node['id'] ?? node['name'] ?? node['title'] ?? node['prompt'] ?? node['question']);
    const key = unique(typeof node['key'] === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(node['key']) ? node['key'] : slug(label, `scene-${index + 1}`), takenNodes);
    const takenStages = new Set<string>();
    const stages = stagesRaw.filter(isObject).map((stage, position) => stageFrom(stage, unique(typeof stage['key'] === 'string' ? stage['key'] : position === 0 ? 'main' : `part-${position + 1}`, takenStages)));
    return { key, original: node, stages };
  });
  const keyFor = (reference: unknown) => {
    const wanted = text(reference).toLowerCase(); if (!wanted) return undefined;
    return nodes.find(node => node.key.toLowerCase() === wanted || text(node.original['id'] ?? node.original['name'] ?? node.original['key']).toLowerCase() === wanted)?.key ?? slug(wanted, 'scene');
  };
  // Votes may name the scene they vote on; the round is that scene's first writing or upload part.
  for (const node of nodes) for (const stage of node.stages) {
    if (stage['kind'] !== 'vote' || !isObject(stage['source']) || text(stage['source']['stageKey'])) continue;
    const target = nodes.find(candidate => candidate.key === keyFor((stage['source'] as Json)['nodeKey']));
    const round = target?.stages.find(candidate => candidate['kind'] === 'collect' && ['text', 'media'].includes(text((candidate['input'] as Json | undefined)?.['kind'])));
    stage['source'] = { nodeKey: target?.key ?? text((stage['source'] as Json)['nodeKey'], 'missing'), stageKey: text(round?.['key'], 'main') };
  }
  let edges: Json[] = [];
  const takenEdges = new Set<string>();
  const edge = (from: string, to: string, option?: string) => edges.push({ key: unique(slug(`${from}-to-${to}`, 'edge'), takenEdges), from, to, ...(option ? { option } : {}) });
  if (Array.isArray(raw['edges'])) {
    edges = (raw['edges'] as unknown[]).filter(isObject).map(entry => ({ ...entry, key: unique(typeof entry['key'] === 'string' ? entry['key'] : slug(`${text(entry['from'])}-to-${text(entry['to'])}`, 'edge'), takenEdges) }));
  } else {
    // Connections from `next` and route options' `to`; scenes with neither continue to the following scene.
    nodes.forEach((node, index) => {
      const route = node.stages.length === 1 && node.stages[0]!['kind'] === 'route' ? node.stages[0]! : null;
      if (route) {
        const given = Array.isArray(node.original['options'] ?? node.original['routes']) ? (node.original['options'] ?? node.original['routes']) as unknown[] : [];
        (route['options'] as { key: string }[]).forEach((option, position) => { const to = keyFor(isObject(given[position]) ? (given[position] as Json)['to'] ?? (given[position] as Json)['next'] : undefined); if (to) edge(node.key, to, option.key); });
        return;
      }
      const next = node.original['next'];
      if (next === null || next === false || text(next).toLowerCase() === 'end') return;
      const to = keyFor(next) ?? nodes[index + 1]?.key;
      if (to) edge(node.key, to);
    });
  }
  const usesRoutes = nodes.some(node => node.stages.some(stage => stage['kind'] === 'route'));
  const definition: Json = {
    formatVersion: raw['formatVersion'] === 1 && !usesRoutes ? 1 : 2,
    title: text(raw['title'], 'Imported game').slice(0, 160) || 'Imported game',
    startNodeKey: keyFor(raw['startNodeKey'] ?? raw['start']) ?? nodes[0]?.key ?? 'start',
    ...(isObject(raw['teams']) ? { teams: raw['teams'] } : {}), ...(isObject(raw['play']) ? { play: raw['play'] } : {}),
    nodes: nodes.map(node => ({ key: node.key, stages: node.stages })), edges,
  };
  return definition;
}
