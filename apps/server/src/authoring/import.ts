import { CARRYOVERS, BUILTIN_SOUNDS, MAX_OWN_REACTIONS, MAX_SOUNDS, HEX_COLOR, IdleCloseMinutesSchema, pointsAtStake } from '@party/contracts';
import { DEFAULT_TEAM_NAMES, HEAD_TO_HEAD_GAMES, HEAD_TO_HEAD_KEYS, isMinigameKey, MAX_OPEN_INVITES, MINIGAME_KEYS, MINIGAME_SCORING_KINDS, MINIGAME_TIEBREAKS, MINIGAMES, TEAM_MINIGAMES, type MinigameKey, SceneMediaSchema, SceneMusicSchema, GameMusicSchema } from '@party/contracts';
// Text import. Accepts the exact game format, or a simpler one written for
// people and AI assistants (documented in apps/web/src/hosting/ai-guide.ts):
// seconds instead of milliseconds, points as plain numbers, answers as plain
// words, `type` instead of the internal kind/input, `correct` by label, `next`
// and route `to` instead of an edge list. Anything missing gets a sensible
// default. The result is an ordinary draft: problems are listed, never fatal.

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : fallback;
/** A wheel's own colours from the text: 2 to 8 valid "#rrggbb" (or see-through "#rrggbbaa") values, or nothing. */
function wheelColors(raw: unknown): { colors?: string[] } {
  const colors = Array.isArray(raw) ? raw.map(entry => String(entry).trim().toLowerCase()).filter(entry => HEX_COLOR.test(entry)).slice(0, 8) : [];
  return colors.length >= 2 ? { colors } : {};
}

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
  route: 'route', choose: 'route', 'party-choice': 'route', branch: 'route', scoreboard: 'scoreboard', results: 'scoreboard', standings: 'scoreboard', minigame: 'minigame', duel: 'duel', versus: 'duel', 'head-to-head': 'duel', drawing: 'drawing', draw: 'drawing', sketch: 'drawing',
  teams: 'teams', 'pick-teams': 'teams', 'make-teams': 'teams', 'minigame-draw': 'minigame-draw', 'random-minigame': 'minigame-draw', 'minigame-lottery': 'minigame-draw' };

/**
 * Points by place in the simple format: `places: [10, 6, 3]` (points for 1st, 2nd, 3rd),
 * or `places: { total: 30, places: 3, curve: "even" }` (split by the server; curve even, steep or equal).
 * An exact places object (with `kind`) passes through; the definition check validates it.
 */
function placesFrom(raw: Json): Json {
  const value = raw['places'];
  if (Array.isArray(value)) { const points = value.map(entry => milli(entry)).filter(entry => entry !== undefined).slice(0, 12); return points.length ? { places: { kind: 'list', pointsMilli: points } } : {}; }
  if (!isObject(value)) return {};
  if (typeof value['kind'] === 'string') return { places: value };
  const total = milli(value['total']); const count = Math.round(Number(value['places'] ?? value['count']));
  if (!total || !Number.isFinite(count)) return {};
  const curve = ['even', 'steep', 'equal'].includes(text(value['curve'])) ? text(value['curve']) : 'even';
  return { places: { kind: 'split', totalMilli: total, places: Math.max(1, Math.min(12, count)), curve } };
}

/** One stage in the simple format (with `type`) becomes an exact stage. Exact stages (with `kind`) pass through. */
function stageFrom(raw: Json, key: string): Json {
  if (typeof raw['kind'] === 'string' && !('type' in raw)) return { key, ...raw };
  const type = TYPES[text(raw['type']).toLowerCase()] ?? (Array.isArray(raw['answers'] ?? raw['options']) ? 'quiz' : 'info');
  const prompt = text(raw['prompt'] ?? raw['question'] ?? raw['text'] ?? raw['title'], 'Untitled');
  const durationMs = seconds(raw);
  // `"inTeams": true` is short for playing the round in the teams made by the last Pick teams scene.
  const play = isObject(raw['play']) ? { play: raw['play'] } : raw['inTeams'] === true ? { play: { kind: 'teams', lineup: { kind: 'game' }, answers: raw['captain'] === true ? 'captain' : 'everyone', points: 'both' } } : {};
  const stage = stageOfType(raw, key, type, prompt, durationMs, play);
  // A scene can have its own look (texts, style, animations); the definition check validates it.
  // `spin`: the name of a wheel of fortune the host spins on this scene.
  const spun = typeof raw['spin'] === 'string' && raw['spin'].trim() ? { spin: { wheel: slug(raw['spin'], 'wheel') } } : isObject(raw['spin']) ? { spin: raw['spin'] } : {};
  const explain = introFrom(raw, stage);
  // `media`: a library item ({ id, kind }), including imported tracks and trimmed clips, as exported games carry it.
  // An AI cannot upload one: the author adds it in the editor afterwards. Anything else is left out.
  const media = SceneMediaSchema.safeParse(raw['media']);
  // `music`: what the scene does with the game's music; "keep", "quiet" and "stop" can be written as text, a song of its own only from the library.
  const music = SceneMusicSchema.safeParse(typeof raw['music'] === 'string' ? { mode: raw['music'] } : raw['music']);
  const extras = { ...spun, ...explain, ...Object.fromEntries(['resultCards', 'countdownSeconds', 'voteMode', 'voteLimit'].filter(field => raw[field] !== undefined).map(field => [field, raw[field]])), ...(raw['mediaLayout'] !== undefined ? { mediaLayout: raw['mediaLayout'] } : {}), ...(raw['youtube'] !== undefined ? { youtube: raw['youtube'] } : {}), ...(raw['translations'] !== undefined ? { translations: raw['translations'] } : {}), ...(raw['wheelClear'] === true ? { wheelClear: true } : {}), ...(media.success ? { media: media.data } : {}), ...(music.success ? { music: music.data } : {}) };
  return isObject(raw['look'] ?? raw['presentation']) ? { ...stage, ...extras, presentation: raw['look'] ?? raw['presentation'] } : { ...stage, ...extras };
}
/**
 * The intro before a round. `explain`: true (a minigame's standard “how to play”), the scene's own explanation,
 * or { text, points, picture, screenOnly }. `"showPoints": true` alone makes an intro that shows the points.
 * A round that earns points shows them in its intro unless `points` (or `showPoints`) is false.
 */
function introFrom(raw: Json, stage: Json): Json {
  const given = raw['explain']; const shown = raw['showPoints'];
  const stake = pointsAtStake(stage);
  // `showPoints` alone on a round without points would make an empty intro: left out.
  const written = isObject(given) ? given : typeof given === 'string' ? { text: given } : given === true || (shown === true && stake) ? {} : null;
  if (!written) return {};
  const intro: Json = {};
  const words = text(written['text']).slice(0, 1000); if (words) intro['text'] = words;
  if (written['points'] !== false && shown !== false && stake) intro['points'] = true;
  const picture = SceneMediaSchema.safeParse(written['picture']); if (picture.success && picture.data.kind === 'image') intro['picture'] = picture.data;
  if (written['screenOnly'] === true) intro['screenOnly'] = true;
  return { explain: intro };
}
/**
 * Points on a writing, upload or drawing round: `"maxPoints"` (and optionally `"places"`) means the host
 * gives points after the answers are shown; without them the round gives none (it can then be voted on).
 */
function judgedFrom(raw: Json): Json {
  const max = raw['maxPoints'] !== undefined ? milli(raw['maxPoints']) : undefined;
  const placed = raw['places'] !== undefined ? placesFrom(raw) : {};
  if ((!max || max === '0') && !('places' in placed)) return { kind: 'none' };
  return { kind: 'judged', maxAwardMilli: max ?? '0', ...placed };
}
function stageOfType(raw: Json, key: string, type: string, prompt: string, durationMs: ReturnType<typeof seconds>, play: Json): Json {
  switch (type) {
    case 'info': return { key, kind: 'info', title: text(raw['title'], prompt).slice(0, 120), prompt: text(raw['text'] ?? raw['prompt'], prompt), durationMs };
    // Pick teams: `"teams": 3` (equal teams, default 2) or a full `form`; `"how"`: random, host or players (default players).
    case 'teams': {
      const how = ['random', 'skill', 'host', 'players'].includes(text(raw['how'] ?? raw['formation'])) ? text(raw['how'] ?? raw['formation']) : 'players';
      const count = Math.max(2, Math.min(12, Math.round(Number(raw['teams']) || 2)));
      return { key, kind: 'teams', prompt: text(raw['title'] ?? raw['prompt'], 'Pick your teams'), durationMs: null, form: isObject(raw['form']) ? raw['form'] : { split: { kind: 'count', teams: count }, formation: how, ...(text(raw['colors']) === 'teams' ? { colors: 'teams' } : {}),
          // `"captains": "elected"`: each team votes for its captain (`true`: the host assigns them, or at random).
          ...(raw['captains'] === 'elected' ? { captainPick: 'elected' } : {}),
          // `names`: the teams' own names, one per team (the standard colour names fill any missing ones).
          ...(Array.isArray(raw['names']) && raw['names'].length ? { names: Array.from({ length: count }, (_, index) => text((raw['names'] as unknown[])[index]).slice(0, 30) || DEFAULT_TEAM_NAMES[index]!) } : {}) },
        ...(raw['captains'] === true || raw['captains'] === 'elected' ? { captains: true } : {}),
        // `scores`: the team scores when teams are made again (a later Pick teams scene). Standard: "fresh".
        ...((CARRYOVERS as readonly string[]).includes(text(raw['scores'])) && text(raw['scores']) !== 'fresh' ? { carryover: text(raw['scores']) } : {}) };
    }
    case 'scoreboard': return { key, kind: 'scoreboard', prompt: text(raw['title'] ?? raw['prompt'], 'Standings'), show: ['players', 'teams', 'both'].includes(text(raw['show'])) ? text(raw['show']) : 'players', durationMs };
    case 'minigame': {
      // `game` by key or by name ("Tap race"); unknown names stay a placeholder to choose in the editor.
      const keyOf = (value: unknown) => { const name = text(value).toLowerCase().trim().replace(/\s+/g, '-'); return MINIGAME_KEYS.find(entry => entry === name || MINIGAMES[entry].name.toLowerCase().replace(/\s+/g, '-') === name); };
      // `draw`: a minigame draw in this one scene, 2 to 8 games, each a name or { "game", "seconds", "settings" }; one is drawn when the scene starts.
      const drawn = Array.isArray(raw['draw']) ? raw['draw'].flatMap(entry => {
        const item: Json = isObject(entry) ? entry : { game: entry }; const drawnGame = keyOf(item['game']); if (!drawnGame) return [];
        return [{ game: drawnGame, ...(isObject(item['settings']) ? { settings: item['settings'] } : {}), durationMs: seconds(item) ?? MINIGAMES[drawnGame].defaultSeconds * 1000 }];
      }).slice(0, 8) : [];
      const draw = drawn.length >= 2 ? { draw: drawn } : {};
      const wanted = text(raw['game']).toLowerCase().trim().replace(/\s+/g, '-');
      const game = drawn.length >= 2 ? drawn[0]!.game : keyOf(raw['game']) ?? (wanted || 'to-be-chosen');
      const known = isMinigameKey(game);
      const points = Array.isArray(raw['points']) ? raw['points'].map(entry => milli(entry)).filter(entry => entry !== undefined).slice(0, 12) : [];
      const teamResult = ['best', 'average', 'total'].includes(text(raw['teamResult'])) ? { teamResult: text(raw['teamResult']) } : {};
      // `tiebreak`: "faster" (who locked in first wins a tie) or "shared" (equal results share the place).
      const tiebreak = (MINIGAME_TIEBREAKS as readonly string[]).includes(text(raw['tiebreak'])) ? { tiebreak: text(raw['tiebreak']) } : {};
      // `scoring`: { "kind": "within" or "scale", "distance": in the game's unit, "points": 10 } gives points by closeness instead of by place.
      const closeness = isObject(raw['scoring']) && (MINIGAME_SCORING_KINDS as readonly string[]).includes(text(raw['scoring']['kind'])) && typeof raw['scoring']['distance'] === 'number'
        ? { scoring: { kind: text(raw['scoring']['kind']), distance: Math.round(raw['scoring']['distance']), pointsMilli: milli(raw['scoring']['points'] ?? 10) ?? '10000' } } : {};
      // A step game in a team round: how the team decides ("anyone", "vote", "captain") and the seconds per vote.
      const decide = ['anyone', 'vote', 'captain'].includes(text(raw['decide'])) ? { decide: text(raw['decide']) } : {};
      const voteSeconds = raw['voteSeconds'] !== undefined ? { voteSeconds: Math.round(Math.min(120, Math.max(5, Number(raw['voteSeconds']) || 20))) } : {};
      // Drive the bus: `"sips": [1, 2, 3, 4]` for the four rounds.
      const busSips = Array.isArray(raw['sips']) && raw['sips'].length === 4 ? raw['sips'].map(entry => Math.round(Math.min(20, Math.max(0, Number(entry) || 0)))) : null;
      const sips = game === 'bus' && (busSips || raw['rainbow'] === false) ? { settings: { sips: busSips ?? [1, 2, 3, 4], ...(raw['rainbow'] === false ? { rainbow: false } : {}) } } : {};
      // Heads or Tails: `"flip": "host"` waits for the host to flip the coin once the guesses are in.
      const coinFlip = game === 'heads-or-tails' && text(raw['flip']) === 'host' ? { settings: { ...(isObject(raw['settings']) ? raw['settings'] : {}), flip: 'host' } } : {};
      // Galgje: `"words": ["fiets", "molen"]` (one drawn per round), `"lives": 7`, `"wordLanguage": "nl"` for the built-in list.
      const own = isObject(raw['settings']) ? raw['settings'] : {};
      const hangman = game === 'hangman' ? { settings: { ...own, lives: Math.round(Math.min(12, Math.max(3, Number(raw['lives'] ?? own['lives']) || 7))),
        ...(Array.isArray(raw['words']) ? { words: raw['words'].map(entry => text(entry)).filter(Boolean).slice(0, 200) } : {}),
        ...(['en', 'nl', 'de', 'ro'].includes(text(raw['wordLanguage'])) ? { wordLanguage: text(raw['wordLanguage']) } : {}) } } : {};
      // Undercover: `"pairs": [["coffee", "tea"]]`, `"undercovers"`, `"mrWhite"`, `"turnSeconds"`, `"voteSeconds"`, `"wordLanguage"`; the rest from the standard settings.
      const count = (value: unknown, min: number, max: number) => value === undefined ? undefined : Math.round(Math.min(max, Math.max(min, Number(value) || min)));
      const undercover = game === 'undercover' ? { settings: { ...MINIGAMES.undercover.defaults, ...own,
        ...(count(raw['undercovers'], 1, 3) === undefined ? {} : { undercovers: count(raw['undercovers'], 1, 3) }), ...(typeof raw['mrWhite'] === 'boolean' ? { mrWhite: raw['mrWhite'] } : {}),
        ...(count(raw['turnSeconds'], 10, 120) === undefined ? {} : { turnSeconds: count(raw['turnSeconds'], 10, 120) }), ...(count(raw['voteSeconds'], 15, 180) === undefined ? {} : { voteSeconds: count(raw['voteSeconds'], 15, 180) }),
        ...(Array.isArray(raw['pairs']) ? { pairs: raw['pairs'].filter(Array.isArray).map(pair => (pair as unknown[]).slice(0, 2).map(entry => text(entry).slice(0, 30))).slice(0, 100) } : {}),
        ...(['en', 'nl', 'de', 'ro'].includes(text(raw['wordLanguage'])) ? { wordLanguage: text(raw['wordLanguage']) } : {}) } } : {};
      return { key, kind: 'minigame', prompt, game: game.slice(0, 64), durationMs: durationMs ?? (known ? MINIGAMES[game].defaultSeconds * 1000 : null),
        ...(isObject(raw['settings']) ? { settings: raw['settings'] } : {}), ...sips, ...coinFlip, ...hangman, ...undercover, ...(raw['places'] !== undefined ? placesFrom(raw) : points.length ? { placementMilli: points } : {}), ...teamResult, ...tiebreak, ...closeness, ...decide, ...voteSeconds, ...play, ...draw };
    }
    case 'duel': {
      // `pick`: "random" or "host". `game`: a head-to-head game played on the two phones (by key or name), else the host names the winner.
      const wanted = text(raw['game']).toLowerCase().trim().replace(/\s+/g, '-');
      const game = HEAD_TO_HEAD_KEYS.find(entry => entry === wanted || HEAD_TO_HEAD_GAMES[entry].name.toLowerCase().replace(/\s+/g, '-') === wanted);
      const points = raw['places'] !== undefined ? placesFrom(raw) : raw['points'] !== undefined ? { places: { kind: 'list', pointsMilli: [milli(raw['points']) ?? '10000'] } } : {};
      const pick = ['host', 'teams'].includes(text(raw['pick'])) ? text(raw['pick']) : 'random';
      return { key, kind: 'duel', prompt, durationMs: durationMs ?? 30_000, pick, betMilli: milli(raw['betPoints'] ?? 1) ?? '1000', ...points,
        ...(game === 'eight-ball' && raw['matchSeconds'] !== undefined ? { matchSeconds: Number(raw['matchSeconds']) } : {}),
        ...(game ? { contest: { kind: 'game', game, ...(isObject(raw['settings']) ? { settings: raw['settings'] } : {}) } } : {}) };
    }
    case 'challenge': return { key, kind: 'challenge', prompt, durationMs, maxAwardMilli: milli(raw['maxPoints'] ?? raw['points'] ?? 10) ?? '10000', ...placesFrom(raw), ...play };
    case 'drawing': return { key, kind: 'collect', prompt, durationMs: durationMs ?? 60_000, input: { kind: 'drawing', maxStrokes: 400, ...(raw['blind'] === true ? { blind: true } : {}) }, scoring: judgedFrom(raw), ...play };
    case 'writing': return { key, kind: 'collect', prompt, durationMs: durationMs ?? 60_000, input: { kind: 'text', maxLength: Math.max(1, Math.min(2000, Number(raw['maxLength']) || 240)) }, scoring: judgedFrom(raw), ...play };
    case 'upload': {
      const accept = (Array.isArray(raw['accept']) ? raw['accept'] : ['image', 'gif']).map(entry => text(entry).toLowerCase().replace(/s$/, '').replace('picture', 'image').replace('photo', 'image')).filter(entry => ['image', 'gif', 'video'].includes(entry));
      return { key, kind: 'collect', prompt, durationMs: durationMs ?? 90_000, input: { kind: 'media', accept: accept.length ? [...new Set(accept)] : ['image'] }, scoring: judgedFrom(raw), ...play };
    }
    case 'order': {
      const items = options(raw['items'] ?? raw['answers'] ?? raw['options'], 'item');
      const points = milli(raw['points'] ?? 10);
      return { key, kind: 'collect', prompt, durationMs, input: { kind: 'order', items },
        scoring: points && (points !== '0' || raw['places'] !== undefined) ? { kind: 'correct-order', correctOrder: items.map(item => item.key), awardMilli: points, ...placesFrom(raw) } : { kind: 'none' }, ...play };
    }
    case 'vote': return { key, kind: 'vote', prompt, durationMs, source: raw['source'] ?? { nodeKey: text(raw['votesOn'] ?? raw['on']), stageKey: '' }, awardPerVoteMilli: milli(raw['pointsPerVote'] ?? raw['points'] ?? 5) ?? '5000', ...placesFrom(raw), ...play };
    case 'minigame-draw': case 'route': {
      // A minigame draw is a party choice that a recorded random draw decides: no timer unless `seconds` is given (then it draws itself).
      const routes = options(raw['options'] ?? raw['routes'] ?? raw['games'], 'route');
      const method = type === 'minigame-draw' ? 'draw' : ['players', 'captains', 'host', 'draw'].includes(text(raw['decidedBy'] ?? raw['decide'])) ? text(raw['decidedBy'] ?? raw['decide']) : 'players';
      if (method === 'draw') return { key, kind: 'route', prompt, durationMs: durationMs ?? null, options: routes, decide: { method } };
      return { key, kind: 'route', prompt, durationMs: method === 'host' ? null : durationMs ?? 20_000, options: routes,
        decide: method === 'host' ? { method } : { method, tie: text(raw['onTie']) === 'host' ? 'host' : 'random', noVotes: text(raw['whenNobodyVotes']) === 'host' ? 'host' : 'random', counts: ['live', 'reveal', 'never'].includes(text(raw['showCounts'])) ? text(raw['showCounts']) : 'reveal' } };
    }
    default: { // quiz or poll
      const answers = options(raw['answers'] ?? raw['options'], 'answer');
      const correct = findKey(answers, raw['correct'] ?? raw['answer']);
      return { key, kind: 'collect', prompt, durationMs: durationMs ?? 20_000, input: { kind: 'choice', layout: text(raw['layout']) === 'list' ? 'list' : 'tiles', options: answers },
        scoring: correct && type !== 'poll' ? { kind: 'correct-choice', correctChoiceKey: correct, awardMilli: milli(raw['points'] ?? 10) ?? '10000', ...placesFrom(raw) } : { kind: 'none' }, ...play };
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
  // A team minigame not played in the game's teams (`"inTeams"`) gets teams of two for that round only, as in the editor;
  // so a minigame draw may include team games.
  if ((raw['play'] as Json | undefined)?.['kind'] !== 'teams') for (const node of nodes) for (const stage of node.stages) {
    if (stage['kind'] === 'minigame' && TEAM_MINIGAMES.includes(text(stage['game']) as MinigameKey) && !stage['play'])
      stage['play'] = { kind: 'teams', lineup: { kind: 'round', form: { split: { kind: 'count', teams: 2 }, formation: 'random' } }, answers: 'everyone', points: 'members' };
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
        const listed = node.original['options'] ?? node.original['routes'] ?? node.original['games'];
        const given = Array.isArray(listed) ? listed as unknown[] : [];
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
    ...(isObject(raw['teams']) ? { teams: raw['teams'] } : {}), ...(isObject(raw['play']) ? { play: raw['play'] } : {}), ...(isObject(raw['look'] ?? raw['presentation']) ? { presentation: raw['look'] ?? raw['presentation'] } : {}),
    // Wheels of fortune: `{ "title": "Forfeits", "entries": ["Sing", "Dance"], "removePicked": true, "spinSeconds": 5 }`; awards: `"awards": ["winner", "mostWrong"]`.
    ...(Array.isArray(raw['wheels']) ? { wheels: raw['wheels'].filter(isObject).slice(0, 10).map((wheel, index) => ({ key: slug(text(wheel['title'] ?? wheel['key']), `wheel-${index + 1}`), title: text(wheel['title'], `Wheel ${index + 1}`).slice(0, 80),
      entries: options(wheel['entries'], 'entry'), removePicked: wheel['removePicked'] !== false, spinSeconds: Math.max(2, Math.min(15, Math.round(Number(wheel['spinSeconds']) || 5))),
      // Its own slice colours ("#rrggbb"), when given; otherwise the game's answer colours.
      ...wheelColors(wheel['colors']) })) } : {}),
    // Awards: names (["winner", "mostWrong"]) or, for an own title or a scene, objects such as
    // { "award": "scene", "scene": "karaoke", "title": "Karaoke champion" }; a list with any object becomes the own list.
    ...(Array.isArray(raw['awards']) ? { finale: raw['awards'].some(isObject)
      ? { awards: raw['awards'].map(entry => isObject(entry)
        ? { rule: text(entry['award'] ?? entry['rule']), ...(entry['title'] ? { title: text(entry['title']).slice(0, 60) } : {}), ...(keyFor(entry['scene']) ? { nodeKey: keyFor(entry['scene']) } : {}) }
        : { rule: text(entry) }) }
      : { stats: raw['awards'].map(entry => text(entry)) } } : isObject(raw['finale']) ? { finale: raw['finale'] } : {}),
    // Side games on the phones are on unless switched off; chips only with an explicit true.
    ...(raw['sideGames'] === false ? { sideGames: false } : {}), ...(raw['chips'] === true ? { chips: true } : {}),
    ...(raw['autoRevealSeconds'] !== undefined ? { autoRevealSeconds: raw['autoRevealSeconds'] } : {}),
    ...(raw['phoneEffects'] === true ? { phoneEffects: true } : {}),
    ...(raw['birthdayVote'] === true ? { birthdayVote: true } : {}),
    // The host's quick time button in seconds (default 30).
    ...(IdleCloseMinutesSchema.safeParse(raw['idleCloseMinutes']).success ? { idleCloseMinutes: raw['idleCloseMinutes'] } : {}),
    ...(Number.isFinite(Number(raw['quickTime'])) && raw['quickTime'] !== undefined ? { quickTimeSeconds: Math.max(5, Math.min(600, Math.round(Number(raw['quickTime'])))) } : {}),
    // `music`: a background playlist of library songs, as exported games carry it (an AI cannot upload songs).
    ...(GameMusicSchema.safeParse(raw['music']).success ? { music: raw['music'] } : {}),
    // The game's starting room settings: `"room": { "showScores": false, "autoCloseSeconds": 5 }` (see roomSettings).
    ...(isObject(raw['room']) && Object.keys(roomSettings(raw['room'])).length ? { room: roomSettings(raw['room']) } : {}),
    // The game's own reactions (emoji or short texts) and its soundboard (built-in sound names).
    ...(Array.isArray(raw['ownReactions']) ? (() => { const own = raw['ownReactions'].map(entry => text(entry).trim()).filter(entry => entry && entry.length <= 16).slice(0, MAX_OWN_REACTIONS)
      .map(entry => ({ kind: /\p{L}/u.test(entry) ? 'text' : 'emoji', text: entry })); return own.length ? { ownReactions: own } : {}; })() : {}),
    ...(Array.isArray(raw['soundboard']) ? (() => { const sounds = [...new Set(raw['soundboard'].map(entry => text(entry)).filter(entry => (BUILTIN_SOUNDS as readonly string[]).includes(entry)))].slice(0, MAX_SOUNDS)
      .map(name => ({ kind: 'builtin', name })); return sounds.length ? { soundboard: sounds } : {}; })() : {}),
    // Open challenge invites per player at once (default 3).
    ...(Number.isFinite(Number(raw['openInvites'])) && raw['openInvites'] !== undefined ? { openInvites: Math.max(1, Math.min(MAX_OPEN_INVITES, Math.round(Number(raw['openInvites'])))) } : {}),
    nodes: nodes.map(node => ({ key: node.key, stages: node.stages })), edges,
  };
  return definition;
}

/** A game's starting room settings from an import: switches only as true/false, numbers rounded into range, anything else left out. */
function roomSettings(raw: Record<string, unknown>) {
  const flag = (key: string) => typeof raw[key] === 'boolean' ? { [key]: raw[key] } : {};
  const number = (key: string, min: number, max: number) => raw[key] !== undefined && raw[key] !== null && Number.isFinite(Number(raw[key])) ? { [key]: Math.max(min, Math.min(max, Math.round(Number(raw[key])))) } : {};
  return { ...flag('showScores'), ...flag('reactions'), ...number('reactionLimit', 1, 30), ...flag('soundboard'), ...flag('eventSounds'), ...flag('breakVotes'), ...number('breakPercent', 10, 100), ...flag('autoClose'), ...number('autoCloseSeconds', 1, 30) };
}
