import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AwardMilliSchema, ChoiceOptionSchema, GameKeySchema, InputSchema, isMinigameKey, MINIGAMES, parseMinigameSettings, PresentationSchema, StageDurationSchema, TEAM_MINIGAMES, type MinigameKey, type MinigameSettings } from '@party/contracts';
import { allStages, graphIssues } from './graph.js';
import { GameError } from './errors.js';

const scoring = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }).strict(),
  z.object({ kind: z.literal('correct-choice'), correctChoiceKey: GameKeySchema, awardMilli: AwardMilliSchema }).strict(),
  // All or nothing: the award is given only for the exact order.
  z.object({ kind: z.literal('correct-order'), correctOrder: z.array(GameKeySchema).min(2).max(8), awardMilli: AwardMilliSchema }).strict(),
]);
// How teams are made: a number of balanced teams, or exact sizes where one team
// may take "the rest" (1 vs 3, 2 vs 2, 1 vs everyone…). Players beyond the fixed
// sizes sit the round out unless a team takes the rest.
const SplitSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('count'), teams: z.number().int().min(2).max(12) }).strict(),
  z.object({ kind: z.literal('sizes'), sizes: z.array(z.union([z.number().int().min(1).max(50), z.literal('rest')])).min(2).max(12) }).strict()
    .refine(split => split.sizes.filter(size => size === 'rest').length <= 1, 'At most one team takes the rest'),
]);
export const FormationSchema = z.object({
  split: SplitSchema, formation: z.enum(['random', 'host', 'players']),
  names: z.array(z.string().trim().min(1).max(30)).max(12).optional(),
}).strict().superRefine((form, ctx) => {
  if (form.names && (form.names.length < teamCount(form) || new Set(form.names.map(name => name.toLowerCase())).size !== form.names.length)) ctx.addIssue({ code: 'custom', message: 'Give every team a unique name' });
});
export type Formation = z.infer<typeof FormationSchema>;
export const teamCount = (form: Pick<Formation, 'split'>) => form.split.kind === 'count' ? form.split.teams : form.split.sizes.length;
export const PlaySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('solo') }).strict(),
  z.object({ kind: z.literal('teams'),
    lineup: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('game') }).strict(),
      // Teams for this round only; afterwards the game's own teams apply again.
      z.object({ kind: z.literal('round'), form: FormationSchema }).strict(),
      // Makes new game teams from here on, with a rule for their scores.
      z.object({ kind: z.literal('reform'), form: FormationSchema, carryover: z.enum(['keep', 'fresh', 'members']) }).strict(),
    ]),
    answers: z.enum(['everyone', 'captain']), points: z.enum(['team', 'members', 'both']),
  }).strict(),
]);
export type Play = z.infer<typeof PlaySchema>;
const RoutePolicySchema = z.enum(['host', 'default', 'random']);
const RouteCountsSchema = z.enum(['live', 'reveal', 'never']);
// `presentation`: this scene's own texts, look and animations on top of the game's.
const look = { presentation: PresentationSchema.optional() };
const common = { key: GameKeySchema, prompt: z.string().trim().min(1).max(2000), durationMs: StageDurationSchema.nullable(), play: PlaySchema.optional(), ...look };
const stageSchema = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('collect'), input: InputSchema, scoring }).strict(),
  z.object({ ...common, kind: z.literal('challenge'), maxAwardMilli: AwardMilliSchema }).strict(),
  // Players vote for one answer from an earlier text or upload round. Each vote gives its author points.
  z.object({ ...common, kind: z.literal('vote'), source: z.object({ nodeKey: GameKeySchema, stageKey: GameKeySchema }).strict(), awardPerVoteMilli: AwardMilliSchema }).strict(),
  // Show-only scenes: no answers, no points, no team play. The host continues
  // whenever they like; an optional countdown only informs the room.
  // An info scene (cutscene, rules, announcement): a title and text on every screen.
  z.object({ ...look, key: GameKeySchema, kind: z.literal('info'), title: z.string().trim().min(1).max(120), prompt: z.string().trim().min(1).max(2000), durationMs: StageDurationSchema.nullable() }).strict(),
  // A scoreboard scene: the standings of players, the game's teams, or both.
  z.object({ ...look, key: GameKeySchema, kind: z.literal('scoreboard'), prompt: z.string().trim().min(1).max(2000), show: z.enum(['players', 'teams', 'both']), durationMs: StageDurationSchema.nullable() }).strict(),
  // A minigame from the catalog. `game` may still be a placeholder name, which
  // keeps the game a draft until a minigame is chosen. `settings` must fit the
  // minigame (checked below); left out, the minigame's defaults apply.
  // `placementMilli`: points for 1st, 2nd, 3rd… (shared on a tie). `teamResult`:
  // how members' results make a team's result. All optional, so placeholder
  // scenes saved earlier keep their hash.
  z.object({ ...common, kind: z.literal('minigame'), game: z.string().trim().min(1).max(64), settings: z.record(z.string(), z.json()).optional(),
    placementMilli: z.array(AwardMilliSchema).min(1).max(12).optional(), teamResult: z.enum(['best', 'average', 'total']).optional() }).strict(),
  // Format 2: the party picks one route. It is the only stage of its node, each
  // option is connected by one edge naming it, and it never awards points. It
  // has no `play`: who decides is part of `decide`.
  z.object({ ...look, key: GameKeySchema, kind: z.literal('route'), prompt: z.string().trim().min(1).max(2000), durationMs: StageDurationSchema.nullable(),
    options: z.array(ChoiceOptionSchema).min(2).max(6)
      .refine(options => new Set(options.map(option => option.key)).size === options.length && new Set(options.map(option => option.label.trim().toLowerCase())).size === options.length, 'Route options must be unique'),
    decide: z.discriminatedUnion('method', [
      z.object({ method: z.literal('host') }).strict(),
      // `tie`/`noVotes`: the host decides, the default route is taken, or a recorded random pick.
      // `counts`: when phones and the shared screen see vote counts.
      z.object({ method: z.literal('players'), tie: RoutePolicySchema, noVotes: RoutePolicySchema, counts: RouteCountsSchema }).strict(),
      z.object({ method: z.literal('captains'), tie: RoutePolicySchema, noVotes: RoutePolicySchema, counts: RouteCountsSchema }).strict(),
    ]),
    defaultOptionKey: GameKeySchema.optional(),
  }).strict(),
]);
// Authoritative definitions stay server-only. Shared contracts expose safe views,
// never future stages, correct answers, or scoring implementation.
export const GameDefinitionSchema = z.object({
  // Format 2 adds route choices; a format 1 definition parses exactly as before.
  formatVersion: z.union([z.literal(1), z.literal(2)]), title: z.string().trim().min(1).max(160), startNodeKey: GameKeySchema,
  // Game-wide defaults; a stage's own `play` overrides `play` for that round.
  teams: FormationSchema.optional(), play: PlaySchema.optional(),
  // The game's texts, look and animations; defaults fill in anything left out.
  presentation: PresentationSchema.optional(),
  nodes: z.array(z.object({ key: GameKeySchema, stages: z.array(stageSchema).min(1).max(20) }).strict()).min(1).max(100),
  // `option` names the route option an edge belongs to (format 2 choice nodes only).
  edges: z.array(z.object({ key: GameKeySchema, from: GameKeySchema, to: GameKeySchema, option: GameKeySchema.optional() }).strict()).max(300),
}).strict().superRefine((definition, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  const keys = new Set(definition.nodes.map(node => node.key));
  if (keys.size !== definition.nodes.length) fail('Duplicate node key');
  if (!keys.has(definition.startNodeKey)) fail('Missing start node');
  if (new Set(definition.edges.map(edge => edge.key)).size !== definition.edges.length) fail('Duplicate edge key');
  for (const edge of definition.edges) if (!keys.has(edge.from) || !keys.has(edge.to)) fail('Missing edge endpoint');
  let count = 0;
  for (const node of definition.nodes) {
    count += node.stages.length;
    if (new Set(node.stages.map(stage => stage.key)).size !== node.stages.length) fail('Duplicate stage key');
    for (const stage of node.stages) {
      if (stage.kind === 'collect' && stage.scoring.kind === 'correct-choice') {
        const rule = stage.scoring;
        if (stage.input.kind !== 'choice' || !stage.input.options.some(option => option.key === rule.correctChoiceKey)) fail('Invalid correct choice');
      }
      // Pass the pencil is drawn by teams: it needs team play, from the round or the game.
      if (stage.kind === 'minigame' && TEAM_MINIGAMES.includes(stage.game as MinigameKey) && (stage.play ?? definition.play ?? { kind: 'solo' }).kind !== 'teams') ctx.addIssue({ code: 'custom', message: 'This minigame needs teams', path: ['nodes', definition.nodes.indexOf(node), 'stages', node.stages.indexOf(stage)] });
      if (stage.kind === 'minigame' && isMinigameKey(stage.game) && !parseMinigameSettings(stage.game, stage.settings)) ctx.addIssue({ code: 'custom', message: 'Minigame settings are not valid', path: ['nodes', definition.nodes.indexOf(node), 'stages', node.stages.indexOf(stage)] });
      if (stage.kind === 'collect' && stage.scoring.kind === 'correct-order') {
        const rule = stage.scoring; const keys = stage.input.kind === 'order' ? stage.input.items.map(item => item.key) : [];
        if (keys.length !== rule.correctOrder.length || new Set(rule.correctOrder).size !== keys.length || !keys.every(key => rule.correctOrder.includes(key))) fail('Invalid correct order');
      }
    }
  }
  if (count > 200) fail('Too many stages');
  if (!keys.has(definition.startNodeKey) || definition.edges.some(edge => !keys.has(edge.from) || !keys.has(edge.to))) return;
  for (const issue of graphIssues(definition)) {
    const index = issue.nodeKey ? definition.nodes.findIndex(node => node.key === issue.nodeKey) : -1;
    ctx.addIssue({ code: 'custom', message: issue.message, ...(index >= 0 ? { path: ['nodes', index] } : {}) });
  }
});
export type GameDefinition = z.infer<typeof GameDefinitionSchema>;
export type StageDefinition = GameDefinition['nodes'][number]['stages'][number];

export function parseDefinition(value: unknown): GameDefinition {
  const parsed = GameDefinitionSchema.safeParse(value);
  if (!parsed.success) throw new GameError('INVALID_DEFINITION');
  return parsed.data;
}

export function assertExecutable(definition: GameDefinition): void {
  // Asset validation for drawings is a separate planned slice.
  if (unplayable(definition).length) throw new GameError('UNSUPPORTED_FEATURE');
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function contentHash(value: unknown): string { return createHash('sha256').update(canonicalJson(value)).digest('hex'); }

/** True when a later vote stage shows this stage's answers, so they must stay anonymous for now. */
export function isVoteSource(definition: GameDefinition, nodeKey: string, stageKey: string): boolean {
  return allStages(definition).some(({ stage }) => stage.kind === 'vote' && stage.source.nodeKey === nodeKey && stage.source.stageKey === stageKey);
}

/** The round's play: its own setting, else the game default, else solo. */
/** Scenes that only show something: no answers, no play settings, the host moves on. */
export const isShowOnly = (stage: StageDefinition) => stage.kind === 'info' || stage.kind === 'scoreboard';
/** Stages that can be authored but not played yet, with where they are. */
export const unplayable = (definition: GameDefinition) => allStages(definition).filter(({ stage }) => stage.kind === 'minigame' && !isMinigameKey(stage.game));
export type MinigameStage = Extract<StageDefinition, { kind: 'minigame' }>;
/** A playable minigame scene's rules, with defaults filled in. */
export function minigameRules(stage: MinigameStage): { game: MinigameKey; settings: MinigameSettings; placementMilli: string[]; teamResult: 'best' | 'average' | 'total' } {
  if (!isMinigameKey(stage.game)) throw new GameError('UNSUPPORTED_FEATURE');
  const settings = parseMinigameSettings(stage.game, stage.settings);
  if (!settings) throw new GameError('INVALID_DEFINITION');
  return { game: stage.game, settings, placementMilli: stage.placementMilli ?? ['10000', '6000', '3000'], teamResult: stage.teamResult ?? 'average' };
}
export { MINIGAMES };
export function effectivePlay(definition: GameDefinition, stage: StageDefinition): Play {
  if (stage.kind === 'route' || stage.kind === 'info' || stage.kind === 'scoreboard') throw new GameError('INVALID_STATE');
  return stage.play ?? definition.play ?? { kind: 'solo' };
}
