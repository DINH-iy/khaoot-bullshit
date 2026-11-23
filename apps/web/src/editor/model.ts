import { HOSTED_POOL_TEXTS } from '../head-to-head/eight-ball/hosted.text.js';
import { HEAD_TO_HEAD_KEYS, isHeadToHeadKey, isMinigameKey, MINIGAME_KEYS, MINIGAMES, TEAM_MINIGAMES, type MinigameKey, type PrefabContent } from '@party/contracts';
import { translate } from '../i18n/texts.js';
import { LANGUAGES, type Language } from '../i18n/language.js';
import { isDefaultGraphQuestion } from '../minigames/draw-the-graph/graph-question.js';
import { GRAPH_TEXTS } from '../minigames/draw-the-graph/graph.text.js';
import { MODEL_TEXTS } from './model.text.js';
import { CATALOG_TEXTS } from '../presentation/catalog.text.js';
import { gameDescription, gameName } from '../presentation/catalog.text.js';

// Texts in the editor's current language (read when used, so a switch shows at the next draw).
const t = (key: keyof typeof MODEL_TEXTS.en, values?: Record<string, string | number>) => translate(MODEL_TEXTS, key, values);
const LANGS = Object.keys(LANGUAGES) as Language[];
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
/** From one column of scenes to the next when tidying (a card and the gap after it). */
export const COLUMN_STEP = CARD_WIDTH + GRID * 4;
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
/** The path and its edit handles share the same axis-aligned segments. */
export function routeSegments(from: Point, to: Point, bends: Point[] = [], sourceBottom = from.y + 120): Point[][] {
  if (!bends.length && to.x <= from.x) {
    const targetTop = to.y - PORT_Y;
    const lane = snap(targetTop > sourceBottom ? (sourceBottom + targetTop) / 2 : Math.max(sourceBottom, to.y + 120) + GRID * 2);
    const exit = snap(from.x + GRID * 2);
    const entry = snap(to.x - GRID * 2);
    return [[from, { x: exit, y: from.y }, { x: exit, y: lane }, { x: entry, y: lane }, { x: entry, y: to.y }, to]];
  }
  return [from, ...bends].map((start, index) => {
    const end = bends[index] ?? to;
    if (start.y === end.y) {
      if (end.x >= start.x || (index !== 0 && index !== bends.length)) return [start, end];
      const exit = index === 0 ? snap(start.x + GRID * 2) : start.x;
      const entry = index === bends.length ? snap(end.x - GRID * 2) : end.x;
      const y = snap(start.y + GRID * 2);
      return [start, { x: exit, y: start.y }, { x: exit, y }, { x: entry, y }, { x: entry, y: end.y }, end];
    }
    const middle = snap((start.x + end.x) / 2);
    const x = index === bends.length && end.x <= start.x ? snap(end.x - GRID * 2)
      : index === 0 && end.x <= start.x ? snap(start.x + GRID * 2)
      : end.x > start.x && (middle <= start.x || middle >= end.x) ? (start.x + end.x) / 2 : middle;
    return [start, { x, y: start.y }, { x, y: end.y }, end];
  });
}

export function routedPath(segments: Point[][]): string {
  const points = segments.flatMap((points, index) => index ? points.slice(1) : points)
    .filter((point, index, all) => index === 0 || point.x !== all[index - 1]!.x || point.y !== all[index - 1]!.y);
  return points.map(({ x, y }, index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ');
}

/** A point a fraction along an orthogonal path, measured by length. */
export function pointOnRoute(segments: Point[][], fraction: number): Point {
  const parts = segments.flatMap(points => points.slice(1).map((end, index) => {
    const start = points[index]!;
    return { start, end, length: Math.abs(end.x - start.x) + Math.abs(end.y - start.y) };
  })).filter(part => part.length > 0);
  let distance = parts.reduce((sum, part) => sum + part.length, 0) * fraction;
  for (const { start, end, length } of parts) {
    if (distance <= length) return { x: start.x + (end.x - start.x) * distance / length, y: start.y + (end.y - start.y) * distance / length };
    distance -= length;
  }
  return segments.at(-1)!.at(-1)!;
}

// ---------- scene types ----------
export type SceneType = 'intro' | 'info' | 'quiz' | 'writing' | 'upload' | 'drawing' | 'order' | 'challenge' | 'vote' | 'route' | 'teams' | 'scoreboard' | 'minigame' | 'duel' | 'wheel' | 'draw';
// `name` and `hint` are read in the current language each time.
export const SCENE_TYPES: { type: SceneType; name: string; icon: string; hint: string }[] = [
  { type: 'intro', icon: 'start', get name() { return t('tIntro'); }, get hint() { return t('hIntro'); } },
  { type: 'info', icon: 'info', get name() { return t('tInfo'); }, get hint() { return t('hInfo'); } },
  { type: 'quiz', icon: 'quiz', get name() { return t('tQuiz'); }, get hint() { return t('hQuiz'); } },
  { type: 'writing', icon: 'writing', get name() { return t('tWriting'); }, get hint() { return t('hWriting'); } },
  { type: 'upload', icon: 'upload', get name() { return t('tUpload'); }, get hint() { return t('hUpload'); } },
  { type: 'drawing', icon: 'drawing', get name() { return t('tDrawing'); }, get hint() { return t('hDrawing'); } },
  { type: 'order', icon: 'order', get name() { return t('tOrder'); }, get hint() { return t('hOrder'); } },
  { type: 'challenge', icon: 'challenge', get name() { return t('tChallenge'); }, get hint() { return t('hChallenge'); } },
  { type: 'vote', icon: 'vote', get name() { return t('tVote'); }, get hint() { return t('hVote'); } },
  { type: 'route', icon: 'route', get name() { return t('tRoute'); }, get hint() { return t('hRoute'); } },
  { type: 'teams', icon: 'teams', get name() { return t('tTeams'); }, get hint() { return t('hTeams'); } },
  { type: 'scoreboard', icon: 'scoreboard', get name() { return t('tScoreboard'); }, get hint() { return t('hScoreboard'); } },
  { type: 'minigame', icon: 'minigame', get name() { return t('tMinigame'); }, get hint() { return t('hMinigame'); } },
  { type: 'draw', icon: 'draw', get name() { return t('tDraw'); }, get hint() { return t('hDraw'); } },
  { type: 'duel', icon: 'duel', get name() { return t('tDuel'); }, get hint() { return t('hDuel'); } },
  { type: 'wheel', icon: 'wheel', get name() { return t('tWheel'); }, get hint() { return t('hWheel'); } },
];
/** The add menu's tabs: every scene type is in exactly one group. */
export const SCENE_GROUPS: { key: string; name: string; types: SceneType[] }[] = [
  { key: 'rounds', get name() { return t('gRounds'); }, types: ['quiz', 'writing', 'upload', 'drawing', 'order', 'challenge', 'vote'] },
  { key: 'games', get name() { return t('gGames'); }, types: ['minigame', 'draw', 'duel', 'wheel'] },
  { key: 'between', get name() { return t('gBetween'); }, types: ['intro', 'info', 'scoreboard', 'route', 'teams'] },
];
/** A Wheel of fortune scene: a show scene whose purpose is spinning one of the game's wheels. */
export const isWheelScene = (stage: Stage | undefined) => stage?.kind === 'info' && Boolean((stage['spin'] as { wheel?: string } | undefined)?.wheel);
/** A Minigame draw scene: a party choice that a random draw decides; each route is one minigame's scene. */
export const isDrawScene = (stage: Stage | undefined) => stage?.kind === 'route' && (stage['decide'] as { method?: string } | undefined)?.method === 'draw';
/** The minigames a new draw starts with: quick ones for any group, no teams needed. */
export const DRAW_START: MinigameKey[] = ['tap-race', 'reaction', 'stop-clock'];
const wheelEntries = () => (['w1', 'w2', 'w3', 'w4', 'w5', 'w6'] as const).map(key => t(key));
/**
 * The kinds within a scene type, offered in a second menu after picking the type:
 * only where the kind is a different game or a starting text. Everything that is
 * a setting (quiz layout, scoreboard, upload types, drawing blind, who decides a
 * party choice) is added with a default and changed in the scene's own panel.
 */
export interface SceneVariant { key: string; name: string; hint: string }
export const SCENE_VARIANTS: Partial<Record<SceneType, SceneVariant[]>> = {
  minigame: MINIGAME_KEYS.map(key => ({ key, get name() { return gameName(key); }, get hint() { return gameDescription(key); } })),
  // How a duel is won: any contest in the room (the host names the winner), or a head-to-head game on the two phones.
  duel: [{ key: 'host', get name() { return t('vHost'); }, get hint() { return t('vHostHint'); } },
    ...HEAD_TO_HEAD_KEYS.map(key => ({ key, get name() { return gameName(key); }, get hint() { return t('vOnPhones', { description: gameDescription(key).toLowerCase() }); } }))],
};
/** Round-only teams of two, for a team minigame in a game without teams; the host can change it. */
export const ROUND_TEAMS_PLAY = { kind: 'teams', lineup: { kind: 'round', form: { split: { kind: 'count', teams: 2 }, formation: 'random' } }, answers: 'everyone', points: 'members' } as const;
export const WRITING_STARTERS = [
  { key: 'joke', get name() { return t('vJoke'); }, get prompt() { return t('pJoke'); } },
  { key: 'caption', get name() { return t('vCaption'); }, get prompt() { return t('pCaption'); } },
  { key: 'excuse', get name() { return t('vExcuse'); }, get prompt() { return t('pExcuse'); } },
];
const minigamePrompt = (game: MinigameKey) => game === 'draw-the-graph' ? translate(GRAPH_TEXTS, 'sampleQuestion') : `${gameName(game)}!`;
/** A minigame scene for one game, with its own timer; a team game gets round-only teams unless the game already plays in teams. */
export function minigameStage(game: MinigameKey, definition: Definition): Stage {
  const stage: Stage = { key: 'main', kind: 'minigame', prompt: minigamePrompt(game), game, durationMs: MINIGAMES[game].defaultSeconds * 1000 };
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
  // The old game's standard title in any language counts as untouched.
  if (!stage.prompt || (old === 'draw-the-graph' ? isDefaultGraphQuestion(stage.prompt)
    : isMinigameKey(old) && LANGS.some(language => stage.prompt === `${translate(CATALOG_TEXTS, old, undefined, language)}!`))) copy.prompt = minigamePrompt(game);
  if (TEAM_MINIGAMES.includes(game) && (copy['play'] as { kind?: string } | undefined)?.kind !== 'teams' && (definition['play'] as { kind?: string } | undefined)?.kind !== 'teams') copy['play'] = structuredClone(ROUND_TEAMS_PLAY);
  return copy;
}
// The standard question in every language, so switching the contest still recognises (and replaces) an untouched one.
const duelPrompt = (contest: { kind?: string; game?: string } | undefined) => contest?.kind === 'game' && isHeadToHeadKey(contest.game) ? t('pDuelGame', { game: gameName(contest.game) }) : t('pDuelHost');
const isStandardDuelPrompt = (prompt: string, contest: { kind?: string; game?: string } | undefined) => LANGS.some(language => prompt === (contest?.kind === 'game' && isHeadToHeadKey(contest.game)
  ? translate(MODEL_TEXTS, 'pDuelGame', { game: translate(CATALOG_TEXTS, contest.game, undefined, language) }, language) : translate(MODEL_TEXTS, 'pDuelHost', undefined, language)));
/** Switches how a duel is won: 'host' (any contest the host judges) or a head-to-head game; the question follows when it was still the standard one. */
export function withDuelContest(stage: Stage, choice: string): Stage {
  const old = stage['contest'] as { kind?: string; game?: string } | undefined;
  const contest = isHeadToHeadKey(choice) ? { kind: 'game', game: choice } : { kind: 'host' };
  const next = { ...stage, contest, ...(stage['pick'] === 'teams' && choice !== 'eight-ball' ? { pick: 'random' } : {}),
    ...(!stage.prompt || isStandardDuelPrompt(stage.prompt, old) ? { prompt: duelPrompt(contest) } : {}) } as Stage;
  if (choice !== 'eight-ball') delete next['matchSeconds'];
  return next;
}
/** A new scene's first part: the type's standard start, adjusted for the chosen kind (variant). */
export function newStage(type: SceneType, definition: Definition, variant?: string): Stage {
  const stage = baseStage(type, definition);
  if (type === 'minigame' && variant && isMinigameKey(variant)) return minigameStage(variant, definition);
  if (type === 'duel' && variant && isHeadToHeadKey(variant)) return withDuelContest(stage, variant);
  return stage;
}
function baseStage(type: SceneType, definition: Definition): Stage {
  switch (type) {
    case 'intro': return { key: 'main', kind: 'info', title: definition.title.slice(0, 120), prompt: t('nIntro'), durationMs: null };
    case 'info': return { key: 'main', kind: 'info', title: t('nInfoTitle'), prompt: t('nInfo'), durationMs: null };
    case 'quiz': return { key: 'main', kind: 'collect', prompt: t('nQuiz'), durationMs: 20_000,
      input: { kind: 'choice', layout: 'tiles', options: [{ key: 'a', label: t('answerA') }, { key: 'b', label: t('answerB') }] },
      scoring: { kind: 'correct-choice', correctChoiceKey: 'a', awardMilli: '10000' } };
    case 'writing': return { key: 'main', kind: 'collect', prompt: t('nWriting'), durationMs: 60_000, input: { kind: 'text', maxLength: 240 }, scoring: { kind: 'none' } };
    case 'drawing': return { key: 'main', kind: 'collect', prompt: t('nDrawing'), durationMs: 60_000, input: { kind: 'drawing', maxStrokes: 400 }, scoring: { kind: 'none' } };
    case 'upload': return { key: 'main', kind: 'collect', prompt: t('nUpload'), durationMs: 90_000, input: { kind: 'media', accept: ['image', 'gif'] }, scoring: { kind: 'none' } };
    case 'challenge': return { key: 'main', kind: 'challenge', prompt: t('nChallenge'), durationMs: null, maxAwardMilli: '10000' };
    case 'vote': {
      const source = definition.nodes.flatMap(node => node.stages.filter(isVotable).map(stage => ({ nodeKey: node.key, stageKey: stage.key })))[0];
      return { key: 'main', kind: 'vote', prompt: t('nVote'), durationMs: 45_000, source: source ?? { nodeKey: 'choose', stageKey: 'main' }, awardPerVoteMilli: '5000' };
    }
    case 'route': return { key: 'main', kind: 'route', prompt: t('nRoute'), durationMs: 20_000,
      options: [{ key: 'left', label: t('left') }, { key: 'right', label: t('right') }], decide: { method: 'players', tie: 'random', noVotes: 'random', counts: 'reveal' } };
    // Each option names a minigame; addDrawGames gives each its own connected minigame scene.
    case 'draw': return { key: 'main', kind: 'route', prompt: t('nDraw'), durationMs: null, options: DRAW_START.map(game => ({ key: game, label: gameName(game) })), decide: { method: 'draw' } };
    case 'scoreboard': return { key: 'main', kind: 'scoreboard', prompt: t('nScoreboard'), show: 'players', durationMs: null };
    case 'teams': return { key: 'main', kind: 'teams', prompt: t('nTeams'), durationMs: null, form: { split: { kind: 'count', teams: 2 }, formation: 'players' } };
    case 'order': return { key: 'main', kind: 'collect', prompt: t('nOrder'), durationMs: 30_000,
      input: { kind: 'order', items: [{ key: 'first', label: t('first') }, { key: 'second', label: t('second') }, { key: 'third', label: t('third') }] },
      scoring: { kind: 'correct-order', correctOrder: ['first', 'second', 'third'], awardMilli: '10000' } };
    case 'minigame': return { key: 'main', kind: 'minigame', prompt: t('nTapRace'), game: 'tap-race', durationMs: MINIGAMES['tap-race'].defaultSeconds * 1000 };
    // The timer is the betting time.
    // The wheel itself is added to the game by addScene; this is the scene that spins it.
    case 'wheel': return { key: 'main', kind: 'info', title: t('tWheel'), prompt: t('nWheel'), durationMs: null };
    case 'duel': return { key: 'main', kind: 'duel', prompt: t('pDuelHost'), durationMs: 30_000, pick: 'random', places: { kind: 'list', pointsMilli: ['10000'] }, betMilli: '1000' };
  }
}
// A quiz question's kind: its layout, or the True/False answers (always shown as tiles).
type QuizInput = { options?: Option[]; layout?: string };
export const QUIZ_KINDS = [{ value: 'tiles', get label() { return t('qTiles'); } }, { value: 'list', get label() { return t('qList'); } }, { value: 'true-false', get label() { return t('qTrueFalse'); } }] as const;
type QuizKind = typeof QUIZ_KINDS[number]['value'];
const trueFalse = (): Option[] => [{ key: 'true', label: t('yes') }, { key: 'false', label: t('no') }];
const isTrueFalse = (input: QuizInput) => input.options?.length === 2 && input.options[0]!.key === 'true' && input.options[1]!.key === 'false';
export const quizKind = (input: QuizInput): QuizKind => isTrueFalse(input) ? 'true-false' : input.layout === 'tiles' ? 'tiles' : 'list';
/** Changes a quiz question's kind. Leaving True or false starts again from two empty answers; the question text stays. */
export function withQuizKind(stage: Stage, kind: QuizKind): Stage {
  const input = stage['input'] as QuizInput & Record<string, unknown>; const scoring = stage['scoring'] as { kind?: string } & Record<string, unknown> | undefined;
  const options = kind === 'true-false' ? trueFalse() : isTrueFalse(input) ? [{ key: 'a', label: t('answerA') }, { key: 'b', label: t('answerB') }] : input.options;
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
const KIND_LABEL: Record<string, keyof typeof MODEL_TEXTS.en> = { draw: 'kDraw', info: 'kInfo', route: 'kRoute', challenge: 'kChallenge', vote: 'kVote', scoreboard: 'kScoreboard', minigame: 'kMinigame', duel: 'kDuel', teams: 'kTeams' };
function stageLabel(stage: Stage): string {
  if (isDrawScene(stage)) return t('kDraw');
  if (stage.kind !== 'collect') return KIND_LABEL[stage.kind] ? t(KIND_LABEL[stage.kind]!) : stage.kind;
  const input = (stage['input'] as { kind?: string } | undefined)?.kind;
  return t(input === 'choice' ? 'kQuiz' : input === 'order' ? 'kOrdering' : input === 'media' ? 'kUpload' : input === 'text' ? 'kWriting' : input === 'drawing' ? 'kDrawing' : 'kQuestion');
}
const seconds = (stage: Stage, short = false) => typeof stage.durationMs === 'number' ? t(short ? 'sec' : 'seconds', { count: Math.round(stage.durationMs / 1000) }) : null;
function stageLine(stage: Stage): string {
  const timer = seconds(stage);
  if (isWheelScene(stage)) return t('spins');
  if (stage.kind === 'info') return [seconds(stage, true), t('continues')].filter(Boolean).join(' · ');
  if (isDrawScene(stage)) return [t('drawLine', { count: ((stage['options'] as unknown[] | undefined) ?? []).length }), timer].filter(Boolean).join(' · ');
  if (stage.kind === 'route') {
    const method = (stage['decide'] as { method?: string } | undefined)?.method;
    return [t(method === 'host' ? 'hostDecides' : method === 'captains' ? 'captainsVote' : 'everyoneVotes'), timer].filter(Boolean).join(' · ');
  }
  if (stage.kind === 'challenge') return t('hostJudges');
  if (stage.kind === 'teams') {
    const form = stage['form'] as { split?: { kind?: string; teams?: number; sizes?: unknown[] }; formation?: string } | undefined;
    const count = t('teamsN', { count: form?.split?.kind === 'count' ? Number(form.split.teams) : form?.split?.sizes?.length ?? 2 });
    return [count, t(form?.formation === 'players' ? 'playersChoose' : form?.formation === 'host' ? 'hostDecidesLower' : 'atRandom')].join(' · ');
  }
  if (stage.kind === 'scoreboard') return t('scoreboard');
  if (stage.kind === 'minigame') { const game = String(stage['game']); return [isMinigameKey(game) ? gameName(game) : t('chooseMinigame'), timer].filter(Boolean).join(' · '); }
  if (stage.kind === 'vote') return [t('voteOnAnswers'), timer].filter(Boolean).join(' · ');
  if (stage.kind === 'duel') { const contest = stage['contest'] as { kind?: string; game?: string } | undefined; return [contest?.kind === 'game' && isHeadToHeadKey(contest.game) ? gameName(contest.game) : t('hostNamesWinner'), stage['pick'] === 'teams' ? translate(HOSTED_POOL_TEXTS, 'teams') : t(stage['pick'] === 'host' ? 'hostPicks' : 'randomPair'), timer && stage['pick'] !== 'teams' ? t('toBet', { time: timer }) : null].filter(Boolean).join(' · '); }
  const input = stage['input'] as { kind?: string; options?: unknown[] } | undefined;
  return [stageLabel(stage), input?.kind === 'choice' ? t('optionsN', { count: input.options?.length ?? 0 }) : null, timer].filter(Boolean).join(' · ');
}
/** What a scene card shows: a type label, a title and a one-line summary, as in the reference. */
export function cardText(definition: Definition, node: Node) {
  const first = node.stages[0]!;
  const incoming = definition.edges.filter(edge => edge.to === node.key);
  const viaOption = incoming.length === 1 && incoming[0]!.option ? optionsOf(definition.nodes.find(other => other.key === incoming[0]!.from)).find(option => option.key === incoming[0]!.option) : undefined;
  const base = viaOption ? t('routeLabel', { option: viaOption.label }) : isWheelScene(first) ? t('tWheel') : stageLabel(first);
  const label = incoming.length > 1 ? t('rejoin', { kind: stageLabel(first) }) : base;
  // An info card shows its title in the strip and its text below, like a slide.
  const title = first.prompt ?? node.key;
  const banner = first.kind === 'info' ? String(first.title ?? '') : null;
  const line = node.stages.length > 1 ? t('partsN', { count: node.stages.length, line: stageLine(first) }) : stageLine(first);
  return { label, title: String(title), banner, line, kind: isWheelScene(first) ? 'wheel' : isDrawScene(first) ? 'draw' : first.kind, input: (first['input'] as { kind?: string } | undefined)?.kind ?? null };
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
  // a short one stays on one row. The arrow from the end of a row runs back to the start of the next .
  // Each row is only as tall as its own tallest column, with a gap the arrows back can run through.
  const count = Math.max(...columns.keys()) + 1; const step = COLUMN_STEP; const rowGap = GRID * 4; const rowHeight = tallest + rowGap;
  const perRow = oneRow || count <= 6 ? count : [...Array(count).keys()].map(index => index + 1).filter(size => size >= 4)
    .reduce((best, size) => Math.abs((size * step) / (Math.ceil(count / size) * rowHeight) - 1.6) < Math.abs((best * step) / (Math.ceil(count / best) * rowHeight) - 1.6) ? size : best, count);
  const rows = Math.ceil(count / perRow); const rowTallest = Array.from({ length: rows }, () => 0);
  for (const [column, nodes] of columns) { const row = Math.floor(column / perRow); rowTallest[row] = Math.max(rowTallest[row]!, heightOf(nodes)); }
  const rowTop = rowTallest.reduce<number[]>((tops, _height, row) => [...tops, row ? tops[row - 1]! + rowTallest[row - 1]! + rowGap : 0], []);
  const positions: Positions = {};
  for (const [column, nodes] of columns) {
    const row = Math.floor(column / perRow); const place = column % perRow;
    let y = snap(rowTop[row]! + (rowTallest[row]! - heightOf(nodes)) / 2);
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
    cursor += direction === 'row' ? COLUMN_STEP : snap((node ? cardHeight(node) : 192) + GRID * 2);
  }
  return next;
}
/** The positions without any bend points: every arrow takes its default route. */
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
  const key = uniqueKey(type === 'route' ? 'choice' : type === 'draw' ? 'draw' : 'scene', definition.nodes.map(node => node.key));
  if (type === 'wheel') {
    // Each wheel scene gets a wheel of its own (at most ten in a game; after that it shares the last).
    const wheels = (definition['wheels'] as { key: string }[] | undefined) ?? [];
    const wheel = wheels.length >= 10 ? null : { key: uniqueKey('wheel', wheels.map(entry => entry.key)), title: t('wheelN', { number: wheels.length + 1 }), removePicked: false, spinSeconds: 6,
      entries: wheelEntries().map((label, index) => ({ key: `entry-${index + 1}`, label })) };
    const node: Node = { key, stages: [{ ...newStage(type, definition), spin: { wheel: wheel?.key ?? wheels.at(-1)!.key } }] };
    return { key, definition: { ...definition, ...(wheel ? { wheels: [...wheels, wheel] } : {}), nodes: [...definition.nodes, node] } };
  }
  const node: Node = { key, stages: [newStage(type, definition, variant)] };
  return { key, definition: { ...definition, ...(type === 'route' || type === 'draw' ? { formatVersion: 2 } : {}), nodes: [...definition.nodes, node] } };
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
/** The minigame an option of a draw stands for: its connected minigame scene's game, else the game its label names. */
export function drawGameOf(definition: Definition, nodeKey: string, option: Option): MinigameKey | null {
  const to = definition.edges.find(edge => edge.from === nodeKey && edge.option === option.key)?.to;
  const game = String(definition.nodes.find(node => node.key === to)?.stages[0]?.['game'] ?? '');
  if (isMinigameKey(game)) return game;
  return MINIGAME_KEYS.find(key => LANGS.some(language => translate(CATALOG_TEXTS, key, undefined, language) === option.label)) ?? null;
}
/**
 * Gives every unconnected game of a draw its own minigame scene, connected to it.
 * Returns the new scenes' keys, so the canvas can place them beside the draw.
 */
export function addDrawGames(definition: Definition, nodeKey: string): { definition: Definition; keys: string[] } {
  let next = definition; const keys: string[] = [];
  for (const option of optionsOf(definition.nodes.find(node => node.key === nodeKey))) {
    if (next.edges.some(edge => edge.from === nodeKey && edge.option === option.key)) continue;
    const game = drawGameOf(next, nodeKey, option); if (!game) continue;
    const added = addConnectedScene(next, 'minigame', nodeKey, option.key, game);
    next = added.definition; keys.push(added.key);
  }
  return { definition: next, keys };
}
/**
 * Changes which minigame an option of a draw stands for: its label follows, and so does its
 * connected minigame scene when only this option leads there (another scene is left alone).
 */
export function withDrawGame(definition: Definition, nodeKey: string, optionKey: string, game: MinigameKey): Definition {
  const options = optionsOf(definition.nodes.find(node => node.key === nodeKey));
  let next = setRouteOptions(definition, nodeKey, options.map(option => option.key === optionKey ? { ...option, label: gameName(game) } : option));
  const to = next.edges.find(edge => edge.from === nodeKey && edge.option === optionKey)?.to;
  const target = next.nodes.find(node => node.key === to);
  if (target && target.stages.length === 1 && target.stages[0]!.kind === 'minigame' && next.edges.filter(edge => edge.to === target.key).length === 1)
    next = updateStage(next, target.key, 0, stage => withMinigame(stage, game, next));
  return next;
}
/** Adds a scene and connects an output to it in one step. */
export function addConnectedScene(definition: Definition, type: SceneType, from: string, option: string | undefined, variant?: string): { definition: Definition; key: string } {
  const added = addScene(definition, type, variant);
  return { key: added.key, definition: connect(added.definition, from, option, added.key) };
}

/** Insert a team setup on every edge entering the round, including when it is the first scene. */
export function insertTeamsBefore(definition: Definition, nodeKey: string): { definition: Definition; key: string } {
  const added = addScene(definition, 'teams');
  return { key: added.key, definition: connect({
    ...added.definition,
    startNodeKey: definition.startNodeKey === nodeKey ? added.key : definition.startNodeKey,
    edges: definition.edges.map(edge => edge.to === nodeKey ? { ...edge, to: added.key } : edge),
  }, added.key, undefined, nodeKey) };
}

/**
 * Adds a scene on an arrow: the arrow now leads to the new scene, and the new
 * scene leads on to where the arrow went (a new party choice's first route does).
 * So whatever is added (a wheel, a cutscene, a scoreboard…) plays right there.
 */
export function insertOnEdge(definition: Definition, edgeKey: string, type: SceneType, variant?: string): { definition: Definition; key: string; games?: string[] } | null {
  const edge = definition.edges.find(entry => entry.key === edgeKey); if (!edge) return null;
  const added = addScene(definition, type, variant);
  let next: Definition = { ...added.definition, edges: added.definition.edges.map(entry => entry.key === edgeKey ? { ...entry, to: added.key } : entry) };
  if (type === 'draw') {
    // A minigame draw: each game gets its own scene, and each of those leads on to where the arrow went.
    const games = addDrawGames(next, added.key); next = games.definition;
    for (const key of games.keys) next = connect(next, key, undefined, edge.to);
    return { definition: next, key: added.key, games: games.keys };
  }
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
    nodes = [{ key: added, stages: [{ key: 'main', kind: 'teams', prompt: t('nTeams'), durationMs: null, form: teams, ...(captains ? { captains: true } : {}) }] }, ...nodes];
    edges = [{ key: uniqueKey('edge', edges.map(edge => edge.key)), from: added, to: startNodeKey }, ...edges];
    startNodeKey = added;
  }
  return { definition: { ...rest, startNodeKey, nodes, edges } as Definition, added };
}
