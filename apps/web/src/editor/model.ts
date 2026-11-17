import { HEAD_TO_HEAD_GAMES, HEAD_TO_HEAD_KEYS, isHeadToHeadKey, isMinigameKey, MINIGAME_KEYS, MINIGAMES, TEAM_MINIGAMES, type MinigameKey, type PrefabContent } from '@party/contracts';
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
export const cardHeight = (node: Node) => isRoute(node) ? ROUTE_FIRST + Math.max(0, optionsOf(node).length - 1) * OPTION_GAP + 32 : 192;
export const inputPort = (position: Point): Point => ({ x: position.x, y: position.y + PORT_Y });
export function outputPort(node: Node, position: Point, option?: string): Point {
  if (!isRoute(node)) return { x: position.x + CARD_WIDTH, y: position.y + PORT_Y };
  const index = Math.max(0, optionsOf(node).findIndex(entry => entry.key === option));
  return { x: position.x + CARD_WIDTH, y: position.y + ROUTE_FIRST + index * OPTION_GAP };
}
/** A smooth curve from an output port to an input port, as in the reference. */
export function curve(from: Point, to: Point): string {
  if (wrapsBack(from, to)) {
    // To a scene further left (the next row of a wrapped game): out to the right, along the gap between the rows, in from the left.
    const mid = returnY(from, to); const r = 72;
    return `M ${from.x} ${from.y} C ${from.x + r} ${from.y}, ${from.x + r} ${mid}, ${from.x} ${mid} L ${to.x} ${mid} C ${to.x - r} ${mid}, ${to.x - r} ${to.y}, ${to.x} ${to.y}`;
  }
  const bend = Math.max(48, Math.abs(to.x - from.x) / 2);
  return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`;
}
// An arrow wraps back when it goes clearly to the left (into the next row, or to a scene placed to the left).
const wrapsBack = (from: Point, to: Point) => to.x < from.x - CARD_WIDTH / 2;
// The height of the run between the rows: halfway, or just below the start when going up.
const returnY = (from: Point, to: Point) => to.y > from.y ? (from.y + to.y) / 2 : Math.max(from.y, to.y) + GRID * 4;

// ---------- bend points ----------
// An arrow's bend points (dragged by the author to lead it around something, while the scenes stay put).
// They are layout, kept with the card positions under "bend--<arrow>--<n>", so saving, undo, live editing
// and export carry them; code that treats positions as cards skips them (isBendKey).
export const BEND = 'bend--';
export const bendKey = (edge: string, index: number) => `${BEND}${edge}--${index}`;
export const isBendKey = (key: string) => key.startsWith(BEND);
export function bendsOf(positions: Positions, edge: string): Point[] {
  const points: Point[] = []; for (let index = 0; positions[bendKey(edge, index)]; index++) points.push(positions[bendKey(edge, index)]!);
  return points;
}
/** The positions with this arrow's bend points replaced (none: a plain curve again). */
export function withBends(positions: Positions, edge: string, points: Point[]): Positions {
  const next = Object.fromEntries(Object.entries(positions).filter(([key]) => !key.startsWith(`${BEND}${edge}--`)));
  points.forEach((point, index) => { next[bendKey(edge, index)] = point; });
  return next;
}
/**
 * An arrow's path: the usual curve, or with bend points a smooth line through them
 * (Catmull-Rom), still leaving the scene to the right and entering the next from the left.
 */
export function routedPath(from: Point, to: Point, bends: Point[]): string {
  if (!bends.length) return curve(from, to);
  const points = [from, ...bends, to]; const lead = 60;
  let path = `M ${from.x} ${from.y}`;
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index]!; const b = points[index + 1]!; const before = points[index - 1]; const after = points[index + 2];
    const c1 = index === 0 ? { x: a.x + lead, y: a.y } : { x: a.x + (b.x - before!.x) / 6, y: a.y + (b.y - before!.y) / 6 };
    const c2 = index === points.length - 2 ? { x: b.x - lead, y: b.y } : { x: b.x - (after!.x - a.x) / 6, y: b.y - (after!.y - a.y) / 6 };
    path += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`;
  }
  return path;
}
/** A point a fraction `t` along an arrow (with bend points: along the line through them, by length). */
export function pointOnRoute(from: Point, to: Point, bends: Point[], t: number): Point {
  if (!bends.length) return pointOnCurve(from, to, t);
  const points = [from, ...bends, to]; const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y));
  let left = lengths.reduce((sum, length) => sum + length, 0) * t;
  for (let index = 0; index < lengths.length; index++) {
    if (left <= lengths[index]! || index === lengths.length - 1) { const a = points[index]!; const b = points[index + 1]!; const f = lengths[index] ? Math.min(1, left / lengths[index]!) : 0; return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }; }
    left -= lengths[index]!;
  }
  return to;
}

/** A point a fraction `t` along the curve: where an arrow's grab handle sits, so arrows into the same scene get separate handles. */
export function pointOnCurve(from: Point, to: Point, t: number): Point {
  // On a wrapped arrow the handles sit on its long straight run.
  if (wrapsBack(from, to)) return { x: from.x + (to.x - from.x) * t, y: returnY(from, to) };
  const bend = Math.max(48, Math.abs(to.x - from.x) / 2);
  const p1 = { x: from.x + bend, y: from.y }; const p2 = { x: to.x - bend, y: to.y }; const u = 1 - t;
  return { x: u ** 3 * from.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t ** 3 * to.x, y: u ** 3 * from.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t ** 3 * to.y };
}

// ---------- scene types ----------
export type SceneType = 'info' | 'quiz' | 'writing' | 'upload' | 'drawing' | 'order' | 'challenge' | 'vote' | 'route' | 'teams' | 'scoreboard' | 'minigame' | 'duel' | 'wheel';
export const SCENE_TYPES: { type: SceneType; name: string; icon: string; hint: string }[] = [
  { type: 'info', name: 'Cutscene or info', icon: 'info', hint: 'Text on every screen' },
  { type: 'quiz', name: 'Quiz question', icon: 'quiz', hint: 'One correct answer; tiles, a list or true/false' },
  { type: 'writing', name: 'Writing round', icon: 'writing', hint: 'Jokes, captions, excuses' },
  { type: 'upload', name: 'Picture or video round', icon: 'upload', hint: 'Photos, GIFs, short videos' },
  { type: 'drawing', name: 'Drawing round', icon: 'drawing', hint: 'Draw on the phone, then vote' },
  { type: 'order', name: 'Put in order', icon: 'order', hint: 'Arrange items correctly' },
  { type: 'challenge', name: 'Host-judged challenge', icon: 'challenge', hint: 'The host gives points' },
  { type: 'vote', name: 'Vote on answers', icon: 'vote', hint: 'Vote for a writing or upload round' },
  { type: 'route', name: 'Party choice', icon: 'route', hint: 'Branch into routes' },
  { type: 'teams', name: 'Pick teams', icon: 'teams', hint: 'Make the teams; the rounds after it play in them' },
  { type: 'scoreboard', name: 'Scoreboard', icon: 'scoreboard', hint: 'Standings per player, per team or both' },
  { type: 'minigame', name: 'Minigame', icon: 'minigame', hint: 'Reaction, tap race, circles, Pass the pencil…' },
  { type: 'duel', name: 'Head-to-head duel', icon: 'duel', hint: 'Two players face off, everyone bets on the winner' },
  { type: 'wheel', name: 'Wheel of fortune', icon: 'wheel', hint: 'The host spins; the result stays on screen' },
];
/** The add menu's tabs: every scene type is in exactly one group. */
export const SCENE_GROUPS: { key: string; name: string; types: SceneType[] }[] = [
  { key: 'rounds', name: 'Rounds', types: ['quiz', 'writing', 'upload', 'drawing', 'order', 'challenge', 'vote'] },
  { key: 'games', name: 'Games', types: ['minigame', 'duel', 'wheel'] },
  { key: 'between', name: 'Between rounds', types: ['info', 'scoreboard', 'route', 'teams'] },
];
/** A Wheel of fortune scene: a show scene whose purpose is spinning one of the game's wheels. */
export const isWheelScene = (stage: Stage | undefined) => stage?.kind === 'info' && Boolean((stage['spin'] as { wheel?: string } | undefined)?.wheel);
const WHEEL_ENTRIES = ['Sing a song', 'Do 10 push-ups', 'Tell a joke', 'Swap seats', 'Everyone drinks', 'Pick someone'];
/**
 * The kinds within a scene type, offered in a second menu after picking the type:
 * only where the kind is a different game or a starting text. Everything that is
 * a setting (quiz layout, scoreboard, upload types, drawing blind, who decides a
 * party choice) is added with a default and changed in the scene's own panel.
 */
export interface SceneVariant { key: string; name: string; hint: string }
export const SCENE_VARIANTS: Partial<Record<SceneType, SceneVariant[]>> = {
  writing: [
    { key: 'free', name: 'Any question', hint: 'Players write an answer' },
    { key: 'joke', name: 'Finish the joke', hint: 'Players write the punchline' },
    { key: 'caption', name: 'Caption this', hint: 'A title for a situation' },
    { key: 'excuse', name: 'Best excuse', hint: 'Talk your way out of it' },
  ],
  minigame: MINIGAME_KEYS.map(key => ({ key, name: MINIGAMES[key].name, hint: MINIGAMES[key].description })),
  // How a duel is won: any contest in the room (the host names the winner), or a head-to-head game on the two phones.
  duel: [{ key: 'host', name: 'Any contest', hint: 'In the room: pool, a dance-off… the host names the winner' },
    ...HEAD_TO_HEAD_KEYS.map(key => ({ key, name: HEAD_TO_HEAD_GAMES[key].name, hint: `On the two phones: ${HEAD_TO_HEAD_GAMES[key].description.toLowerCase()}` }))],
};
/** Round-only teams of two, for a team minigame in a game without teams; the host can change it. */
export const ROUND_TEAMS_PLAY = { kind: 'teams', lineup: { kind: 'round', form: { split: { kind: 'count', teams: 2 }, formation: 'random' } }, answers: 'everyone', points: 'members' } as const;
const WRITING_PROMPTS: Record<string, string> = { joke: 'Finish the joke: why did the chicken join a band?', caption: 'Write a caption: your boss walks in during karaoke.', excuse: 'Give your best excuse: you are two hours late for dinner.' };
/** A minigame scene for one game, with its own timer; a team game gets round-only teams unless the game already plays in teams. */
export function minigameStage(game: MinigameKey, definition: Definition): Stage {
  const stage: Stage = { key: 'main', kind: 'minigame', prompt: `${MINIGAMES[game].name}!`, game, durationMs: MINIGAMES[game].defaultSeconds * 1000 };
  if (TEAM_MINIGAMES.includes(game) && (definition['play'] as { kind?: string } | undefined)?.kind !== 'teams') stage['play'] = structuredClone(ROUND_TEAMS_PLAY);
  return stage;
}
/**
 * Switches a minigame scene to another minigame: its own default settings and timer,
 * the title updated when it was still the old game's standard one, and round-only
 * teams for a team minigame in a game that does not play in teams.
 */
export function withMinigame(stage: Stage, game: MinigameKey, definition: Definition): Stage {
  const old = String(stage['game'] ?? '');
  const copy: Stage = { ...stage, game, durationMs: MINIGAMES[game].defaultSeconds * 1000 }; delete copy['settings'];
  if (!stage.prompt || (isMinigameKey(old) && stage.prompt === `${MINIGAMES[old].name}!`)) copy.prompt = `${MINIGAMES[game].name}!`;
  if (TEAM_MINIGAMES.includes(game) && (copy['play'] as { kind?: string } | undefined)?.kind !== 'teams' && (definition['play'] as { kind?: string } | undefined)?.kind !== 'teams') copy['play'] = structuredClone(ROUND_TEAMS_PLAY);
  return copy;
}
const DUEL_HOST_PROMPT = 'Rock, paper, scissors at the table: best of three!';
const duelPrompt = (contest: { kind?: string; game?: string } | undefined) => contest?.kind === 'game' && isHeadToHeadKey(contest.game) ? `${HEAD_TO_HEAD_GAMES[contest.game].name} duel! Who wins?` : DUEL_HOST_PROMPT;
/** Switches how a duel is won: 'host' (any contest the host judges) or a head-to-head game; the question follows when it was still the standard one. */
export function withDuelContest(stage: Stage, choice: string): Stage {
  const old = stage['contest'] as { kind?: string; game?: string } | undefined;
  const contest = isHeadToHeadKey(choice) ? { kind: 'game', game: choice } : { kind: 'host' };
  return { ...stage, contest, ...(!stage.prompt || stage.prompt === duelPrompt(old) ? { prompt: duelPrompt(contest) } : {}) };
}
/** A new scene's first part: the type's standard start, adjusted for the chosen kind (variant). */
export function newStage(type: SceneType, definition: Definition, variant?: string): Stage {
  const stage = baseStage(type, definition);
  if (type === 'writing' && variant && WRITING_PROMPTS[variant]) return { ...stage, prompt: WRITING_PROMPTS[variant] };
  if (type === 'minigame' && variant && isMinigameKey(variant)) return minigameStage(variant, definition);
  if (type === 'duel' && variant && isHeadToHeadKey(variant)) return withDuelContest(stage, variant);
  return stage;
}
function baseStage(type: SceneType, definition: Definition): Stage {
  switch (type) {
    case 'info': return { key: 'main', kind: 'info', title: 'New scene', prompt: 'Text shown on every screen.', durationMs: null };
    case 'quiz': return { key: 'main', kind: 'collect', prompt: 'Your question?', durationMs: 20_000,
      input: { kind: 'choice', layout: 'tiles', options: [{ key: 'a', label: 'Answer A' }, { key: 'b', label: 'Answer B' }] },
      scoring: { kind: 'correct-choice', correctChoiceKey: 'a', awardMilli: '10000' } };
    case 'writing': return { key: 'main', kind: 'collect', prompt: 'Write your answer.', durationMs: 60_000, input: { kind: 'text', maxLength: 240 }, scoring: { kind: 'none' } };
    case 'drawing': return { key: 'main', kind: 'collect', prompt: 'Draw a cat on a skateboard.', durationMs: 60_000, input: { kind: 'drawing', maxStrokes: 400 }, scoring: { kind: 'none' } };
    case 'upload': return { key: 'main', kind: 'collect', prompt: 'Upload a picture or GIF.', durationMs: 90_000, input: { kind: 'media', accept: ['image', 'gif'] }, scoring: { kind: 'none' } };
    case 'challenge': return { key: 'main', kind: 'challenge', prompt: 'Describe the challenge. The host judges.', durationMs: null, maxAwardMilli: '10000' };
    case 'vote': {
      const source = definition.nodes.flatMap(node => node.stages.filter(isVotable).map(stage => ({ nodeKey: node.key, stageKey: stage.key })))[0];
      return { key: 'main', kind: 'vote', prompt: 'Vote for the best answer. Not your own.', durationMs: 45_000, source: source ?? { nodeKey: 'choose', stageKey: 'main' }, awardPerVoteMilli: '5000' };
    }
    case 'route': return { key: 'main', kind: 'route', prompt: 'Choose your route!', durationMs: 20_000,
      options: [{ key: 'left', label: 'Left' }, { key: 'right', label: 'Right' }], decide: { method: 'players', tie: 'random', noVotes: 'random', counts: 'reveal' } };
    case 'scoreboard': return { key: 'main', kind: 'scoreboard', prompt: 'Standings', show: 'players', durationMs: null };
    case 'teams': return { key: 'main', kind: 'teams', prompt: 'Pick your teams', durationMs: null, form: { split: { kind: 'count', teams: 2 }, formation: 'players' } };
    case 'order': return { key: 'main', kind: 'collect', prompt: 'Put these in the right order.', durationMs: 30_000,
      input: { kind: 'order', items: [{ key: 'first', label: 'First' }, { key: 'second', label: 'Second' }, { key: 'third', label: 'Third' }] },
      scoring: { kind: 'correct-order', correctOrder: ['first', 'second', 'third'], awardMilli: '10000' } };
    case 'minigame': return { key: 'main', kind: 'minigame', prompt: 'Tap race!', game: 'tap-race', durationMs: MINIGAMES['tap-race'].defaultSeconds * 1000 };
    // The timer is the betting time.
    // The wheel itself is added to the game by addScene; this is the scene that spins it.
    case 'wheel': return { key: 'main', kind: 'info', title: 'Wheel of fortune', prompt: 'Spin the wheel!', durationMs: null };
    case 'duel': return { key: 'main', kind: 'duel', prompt: DUEL_HOST_PROMPT, durationMs: 30_000, pick: 'random', places: { kind: 'list', pointsMilli: ['10000'] }, betMilli: '1000' };
  }
}
// A quiz question's kind: its layout, or the True/False answers (always shown as tiles).
type QuizInput = { options?: Option[]; layout?: string };
export const QUIZ_KINDS = [{ value: 'tiles', label: 'Big tiles' }, { value: 'list', label: 'A list' }, { value: 'true-false', label: 'True or false' }] as const;
type QuizKind = typeof QUIZ_KINDS[number]['value'];
const TRUE_FALSE: Option[] = [{ key: 'true', label: 'True' }, { key: 'false', label: 'False' }];
const isTrueFalse = (input: QuizInput) => input.options?.length === 2 && input.options[0]!.key === 'true' && input.options[1]!.key === 'false';
export const quizKind = (input: QuizInput): QuizKind => isTrueFalse(input) ? 'true-false' : input.layout === 'tiles' ? 'tiles' : 'list';
/** Changes a quiz question's kind. Leaving True or false starts again from two empty answers; the question text stays. */
export function withQuizKind(stage: Stage, kind: QuizKind): Stage {
  const input = stage['input'] as QuizInput & Record<string, unknown>; const scoring = stage['scoring'] as { kind?: string } & Record<string, unknown> | undefined;
  const options = kind === 'true-false' ? TRUE_FALSE : isTrueFalse(input) ? [{ key: 'a', label: 'Answer A' }, { key: 'b', label: 'Answer B' }] : input.options;
  const correct = options !== input.options && scoring?.kind === 'correct-choice' ? { scoring: { ...scoring, correctChoiceKey: options![0]!.key } } : {};
  return { ...stage, ...correct, input: { ...input, options, layout: kind === 'list' ? 'list' : 'tiles' } };
}
export const isVotable = (stage: Stage) => stage.kind === 'collect' && ['text', 'media', 'drawing'].includes((stage['input'] as { kind?: string } | undefined)?.kind ?? '') && (stage['scoring'] as { kind?: string } | undefined)?.kind === 'none';
export function uniqueKey(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken); let index = 1;
  while (used.has(`${prefix}-${index}`)) index++;
  return `${prefix}-${index}`;
}

// ---------- card text ----------
const KIND_LABEL: Record<string, string> = { info: 'Cutscene', route: 'Party choice', challenge: 'Challenge', vote: 'Vote', scoreboard: 'Results', minigame: 'Minigame', duel: 'Duel', teams: 'Pick teams' };
function stageLabel(stage: Stage): string {
  if (stage.kind !== 'collect') return KIND_LABEL[stage.kind] ?? stage.kind;
  const input = (stage['input'] as { kind?: string } | undefined)?.kind;
  return input === 'choice' ? 'Quiz' : input === 'order' ? 'Ordering' : input === 'media' ? 'Upload' : input === 'text' ? 'Writing' : input === 'drawing' ? 'Drawing' : 'Question';
}
const seconds = (stage: Stage) => typeof stage.durationMs === 'number' ? `${Math.round(stage.durationMs / 1000)} seconds` : null;
function stageLine(stage: Stage): string {
  const timer = seconds(stage);
  if (isWheelScene(stage)) return 'The host spins the wheel';
  if (stage.kind === 'info') return [timer?.replace(' seconds', ' sec'), 'Host continues'].filter(Boolean).join(' · ');
  if (stage.kind === 'route') {
    const method = (stage['decide'] as { method?: string } | undefined)?.method;
    return [method === 'host' ? 'Host decides' : method === 'captains' ? 'Captains vote' : 'Everyone votes', timer].filter(Boolean).join(' · ');
  }
  if (stage.kind === 'challenge') return 'Challenge · Host judges';
  if (stage.kind === 'teams') {
    const form = stage['form'] as { split?: { kind?: string; teams?: number; sizes?: unknown[] }; formation?: string } | undefined;
    const count = form?.split?.kind === 'count' ? `${form.split.teams} teams` : `${form?.split?.sizes?.length ?? 2} teams`;
    return [count, form?.formation === 'players' ? 'players choose' : form?.formation === 'host' ? 'host decides' : 'at random'].join(' · ');
  }
  if (stage.kind === 'scoreboard') return 'Scoreboard';
  if (stage.kind === 'minigame') { const game = String(stage['game']); return [isMinigameKey(game) ? MINIGAMES[game].name : 'Choose a minigame', timer].filter(Boolean).join(' · '); }
  if (stage.kind === 'vote') return ['Vote on answers', timer].filter(Boolean).join(' · ');
  if (stage.kind === 'duel') { const contest = stage['contest'] as { kind?: string; game?: string } | undefined; return [contest?.kind === 'game' && isHeadToHeadKey(contest.game) ? HEAD_TO_HEAD_GAMES[contest.game].name : 'Host names the winner', stage['pick'] === 'host' ? 'host picks' : 'random pair', timer ? `${timer} to bet` : null].filter(Boolean).join(' · '); }
  const input = stage['input'] as { kind?: string; options?: unknown[] } | undefined;
  return [stageLabel(stage), input?.kind === 'choice' ? `${input.options?.length ?? 0} options` : null, timer].filter(Boolean).join(' · ');
}
/** What a scene card shows: a type label, a title and a one-line summary, as in the reference. */
export function cardText(definition: Definition, node: Node) {
  const first = node.stages[0]!;
  const incoming = definition.edges.filter(edge => edge.to === node.key);
  const viaOption = incoming.length === 1 && incoming[0]!.option ? optionsOf(definition.nodes.find(other => other.key === incoming[0]!.from)).find(option => option.key === incoming[0]!.option) : undefined;
  const base = viaOption ? `${viaOption.label} route` : isWheelScene(first) ? 'Wheel of fortune' : stageLabel(first);
  const label = incoming.length > 1 ? `Rejoin · ${stageLabel(first)}` : base;
  // An info card shows its title in the strip and its text below, like a slide.
  const title = first.prompt ?? node.key;
  const banner = first.kind === 'info' ? String(first.title ?? '') : null;
  const line = node.stages.length > 1 ? `${node.stages.length} parts · ${stageLine(first)}` : stageLine(first);
  return { label, title: String(title), banner, line, kind: isWheelScene(first) ? 'wheel' : first.kind, input: (first['input'] as { kind?: string } | undefined)?.kind ?? null };
}

// ---------- layout and snapping ----------
/** Columns by depth from the start, rows in definition order: a tidy first layout for games without one. `oneRow`: never wrap. */
export function autoLayout(definition: Definition, { oneRow = false }: { oneRow?: boolean } = {}): Positions {
  const depth = new Map<string, number>([[definition.startNodeKey, 0]]);
  for (let pass = 0; pass < definition.nodes.length; pass++) {
    for (const edge of definition.edges) {
      const from = depth.get(edge.from);
      if (from !== undefined && (depth.get(edge.to) ?? -1) < from + 1 && from + 1 < definition.nodes.length) depth.set(edge.to, from + 1);
    }
  }
  const columns = new Map<number, Node[]>();
  for (const node of definition.nodes) { const column = depth.get(node.key) ?? 0; columns.set(column, [...(columns.get(column) ?? []), node]); }
  const heightOf = (nodes: Node[]) => nodes.reduce((sum, node) => sum + cardHeight(node) + GRID * 2, 0);
  const tallest = Math.max(...[...columns.values()].map(heightOf));
  // A long game wraps into rows of columns, as many per row as keeps the whole game about screen-shaped (16:10);
  // a short one stays on one row. The arrow from the end of a row runs back to the start of the next (see `curve`).
  const count = Math.max(...columns.keys()) + 1; const step = CARD_WIDTH + GRID * 6; const rowHeight = tallest + GRID * 8;
  const perRow = oneRow || count <= 6 ? count : [...Array(count).keys()].map(index => index + 1).filter(size => size >= 4)
    .reduce((best, size) => Math.abs((size * step) / (Math.ceil(count / size) * rowHeight) - 1.6) < Math.abs((best * step) / (Math.ceil(count / best) * rowHeight) - 1.6) ? size : best, count);
  const positions: Positions = {};
  for (const [column, nodes] of columns) {
    const row = Math.floor(column / perRow); const place = column % perRow;
    let y = snap(row * rowHeight + (tallest - heightOf(nodes)) / 2);
    for (const node of nodes) { positions[node.key] = { x: place * step, y }; y += snap(cardHeight(node) + GRID * 2); }
  }
  return positions;
}
/**
 * Lines up scenes (at least two) in a row: level with the leftmost, in their left-to-right
 * order and spaced as Tidy up spaces them; or in a column: under the top one, left edges
 * level, in their top-to-bottom order. Other scenes and bend points stay where they are.
 */
export function lineUp(definition: Definition, positions: Positions, keys: string[], direction: 'row' | 'column'): Positions {
  const axis = direction === 'row' ? 'x' : 'y';
  const placed = keys.filter(key => positions[key] && !isBendKey(key)).sort((a, b) => positions[a]![axis] - positions[b]![axis]);
  if (placed.length < 2) return positions;
  const first = positions[placed[0]!]!; const next = { ...positions }; let cursor = first[axis];
  for (const key of placed) {
    next[key] = direction === 'row' ? { x: cursor, y: first.y } : { x: first.x, y: cursor };
    const node = definition.nodes.find(entry => entry.key === key);
    cursor += direction === 'row' ? CARD_WIDTH + GRID * 6 : snap((node ? cardHeight(node) : 192) + GRID * 2);
  }
  return next;
}
/** The positions without any bend points: every arrow a plain curve again. */
export const straightenAll = (positions: Positions): Positions => Object.fromEntries(Object.entries(positions).filter(([key]) => !isBendKey(key)));
export const snap = (value: number) => Math.round(value / GRID) * GRID;
export interface Guides { x: number | null; y: number | null }
/**
 * Where a dragged card lands. In order of preference: level with the output port
 * that feeds it (a straight line), aligned with another card's edge, else the grid.
 */
export function snapCard(definition: Definition, positions: Positions, key: string, raw: Point): { point: Point; guides: Guides } {
  let x = snap(raw.x); let y = snap(raw.y); const guides: Guides = { x: null, y: null };
  const others = Object.entries(positions).filter(([other]) => other !== key && !isBendKey(other));
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
export function addScene(definition: Definition, type: SceneType, variant?: string): { definition: Definition; key: string } {
  const key = uniqueKey(type === 'route' ? 'choice' : 'scene', definition.nodes.map(node => node.key));
  if (type === 'wheel') {
    // Each wheel scene gets a wheel of its own (at most ten in a game; after that it shares the last).
    const wheels = (definition['wheels'] as { key: string }[] | undefined) ?? [];
    const wheel = wheels.length >= 10 ? null : { key: uniqueKey('wheel', wheels.map(entry => entry.key)), title: `Wheel ${wheels.length + 1}`, removePicked: false, spinSeconds: 6,
      entries: WHEEL_ENTRIES.map((label, index) => ({ key: `entry-${index + 1}`, label })) };
    const node: Node = { key, stages: [{ ...newStage(type, definition), spin: { wheel: wheel?.key ?? wheels.at(-1)!.key } }] };
    return { key, definition: { ...definition, ...(wheel ? { wheels: [...wheels, wheel] } : {}), nodes: [...definition.nodes, node] } };
  }
  const node: Node = { key, stages: [newStage(type, definition, variant)] };
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
export function addConnectedScene(definition: Definition, type: SceneType, from: string, option: string | undefined, variant?: string): { definition: Definition; key: string } {
  const added = addScene(definition, type, variant);
  return { key: added.key, definition: connect(added.definition, from, option, added.key) };
}

/**
 * Adds a scene on an arrow: the arrow now leads to the new scene, and the new
 * scene leads on to where the arrow went (a new party choice's first route does).
 * So whatever is added (a wheel, a cutscene, a scoreboard…) plays right there.
 */
export function insertOnEdge(definition: Definition, edgeKey: string, type: SceneType, variant?: string): { definition: Definition; key: string } | null {
  const edge = definition.edges.find(entry => entry.key === edgeKey); if (!edge) return null;
  const added = addScene(definition, type, variant);
  let next: Definition = { ...added.definition, edges: added.definition.edges.map(entry => entry.key === edgeKey ? { ...entry, to: added.key } : entry) };
  const node = next.nodes.find(entry => entry.key === added.key)!;
  const first = isRoute(node) ? optionsOf(node)[0] : undefined;
  next = connect(next, added.key, first?.key, edge.to);
  return { definition: next, key: added.key };
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

/**
 * About how long the game takes: the rounds on the longest route, each with
 * its timer (a minute when it has none) and some time for results and talk.
 */
export function estimateMinutes(definition: Definition): number {
  const cost = (node: Node) => node.stages.reduce((sum, stage) => sum + (typeof stage.durationMs === 'number' ? stage.durationMs : 60_000) + 20_000, 0);
  const byKey = new Map(definition.nodes.map(node => [node.key, node])); const memo = new Map<string, number>(); const visiting = new Set<string>();
  const longest = (key: string): number => {
    const node = byKey.get(key); if (!node || visiting.has(key)) return 0; const known = memo.get(key); if (known !== undefined) return known;
    visiting.add(key); const next = Math.max(0, ...definition.edges.filter(edge => edge.from === key).map(edge => longest(edge.to))); visiting.delete(key);
    const total = cost(node) + next; memo.set(key, total); return total;
  };
  return Math.max(1, Math.round(longest(definition.startNodeKey) / 60_000));
}

// ---------- prefabs ----------
/** The selected scenes as a prefab: the scenes, the connections between them, and where their cards are. */
export function prefabFrom(definition: Definition, positions: Positions, keys: string[]): PrefabContent {
  const chosen = new Set(keys);
  return {
    nodes: structuredClone(definition.nodes.filter(node => chosen.has(node.key))) as PrefabContent['nodes'],
    edges: structuredClone(definition.edges.filter(edge => chosen.has(edge.from) && chosen.has(edge.to))),
    positions: Object.fromEntries(keys.filter(key => positions[key]).map(key => [key, positions[key]!])),
    keys: definition.nodes.filter(node => chosen.has(node.key)).map(node => node.key),
  };
}
/**
 * Inserts a prefab with its top-left card at `at`. When it is added after a scene
 * (`from`), that scene (or its route `option`) leads to the prefab's first scene:
 * the first one nothing inside the prefab leads to.
 */
export function insertPrefab(definition: Definition, positions: Positions, content: PrefabContent, at: Point, from?: { key: string; option: string | undefined }) {
  const placed = content.keys.map(key => content.positions[key]).filter((point): point is Point => Boolean(point));
  const origin = placed.length ? { x: Math.min(...placed.map(point => point.x)), y: Math.min(...placed.map(point => point.y)) } : { x: 0, y: 0 };
  const source: Definition = { formatVersion: 2, title: '', startNodeKey: content.keys[0]!, nodes: content.nodes as Node[], edges: content.edges as Edge[] };
  const pasted = pasteScenes(definition, positions, source, content.positions, content.keys, { x: at.x - origin.x, y: at.y - origin.y });
  const entryIndex = content.keys.findIndex(key => !content.edges.some(edge => edge.to === key));
  const entry = pasted.keys[Math.max(0, entryIndex)]!;
  return { ...pasted, definition: from ? connect(pasted.definition, from.key, from.option, entry) : pasted.definition };
}

// ---------- teams: from game settings to Pick teams scenes ----------
const PLAYABLE = ['collect', 'challenge', 'vote', 'minigame'];
/**
 * Games made before Pick teams scenes kept their teams in the game settings (`teams`) and could
 * default every round to team play (`play`). Opening such a game turns that into the new shape: a
 * Pick teams scene at the start with the same teams, and each round's own setting written out.
 * Returns null when there is nothing to convert. Rounds with teams of their own stay as they are.
 */
export function convertLegacyTeams(definition: Definition): { definition: Definition; added: string | null } | null {
  const teams = definition['teams']; const play = definition['play'] as { kind?: string; answers?: string } | undefined;
  if (!teams && !play) return null;
  const { teams: _teams, play: _play, ...rest } = definition;
  let nodes = definition.nodes.map(node => ({ ...node, stages: node.stages.map(stage => play && PLAYABLE.includes(stage.kind) && !stage['play'] ? { ...stage, play } : stage) }));
  let edges = definition.edges; let startNodeKey = definition.startNodeKey; let added: string | null = null;
  if (teams) {
    added = uniqueKey('pick-teams', nodes.map(node => node.key));
    const captains = nodes.some(node => node.stages.some(stage => (stage['play'] as { answers?: string } | undefined)?.answers === 'captain'));
    nodes = [{ key: added, stages: [{ key: 'main', kind: 'teams', prompt: 'Pick your teams', durationMs: null, form: teams, ...(captains ? { captains: true } : {}) }] }, ...nodes];
    edges = [{ key: uniqueKey('edge', edges.map(edge => edge.key)), from: added, to: startNodeKey }, ...edges];
    startNodeKey = added;
  }
  return { definition: { ...rest, startNodeKey, nodes, edges } as Definition, added };
}
