import { StoredGraphsSchema, HostNotesSchema, AutoRevealSecondsSchema, ColorSchema, GameRoomSettingsSchema, pointsAtStake, IdleCloseMinutesSchema, PoolMatchSecondsSchema, ResultCardsSchema, VotingModeSchema, MAX_BALLOT_SELECTIONS } from '@party/contracts';
import { configuredPlacePoints, minigamePlacePoints, SlideImagesSchema } from '@party/contracts';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { CARRYOVERS, MAX_OWN_REACTIONS, MAX_SOUNDS, OwnReactionSchema, SoundSchema, CAPTAIN_PICKS, SOLO_MINIGAMES, HeadToHeadKeySchema, parseHeadToHeadSettings, AwardMilliSchema, ChoiceOptionSchema, FINALE_STATS, GameKeySchema, InputSchema, isMinigameKey, MINIGAMES, parseMinigameSettings, PlacesSchema, PresentationSchema, MediaLayoutSchema, YouTubeClipSchema, SceneMediaSchema, SceneTranslationsSchema, ScenePromptSchema, SceneTextBoxesSchema, SceneTextStyleSchema, SceneTitleSchema, SceneMusicSchema, GameMusicSchema, StageDurationSchema, TEAM_MINIGAMES, type MinigameKey, type MinigameSettings, AWARD_RULES, CLAP_END_MS, TEAM_DECIDES, type TeamDecides, MAX_OPEN_INVITES, MINIGAME_TIEBREAKS, minigameTiebreak, type MinigameTiebreak, MinigameScoringSchema, minigameScoring, type MinigameScoring } from '@party/contracts';
import { allStages, graphIssues } from './graph.js';
import { GameError } from './errors.js';

// `places` (optional everywhere, so earlier definitions keep their hash): extra points
// by place. Quiz and ordering: the fastest correct answers. Votes: the most-voted answers.
// Challenges: the places the host gives. Minigames: their result (instead of `placementMilli`).
const scoring = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }).strict(),
  z.object({ kind: z.literal('correct-choice'), correctChoiceKey: GameKeySchema, awardMilli: AwardMilliSchema, places: PlacesSchema.optional() }).strict(),
  // All or nothing: the award is given only for the exact order.
  z.object({ kind: z.literal('correct-order'), correctOrder: z.array(GameKeySchema).min(2).max(8), awardMilli: AwardMilliSchema, places: PlacesSchema.optional() }).strict(),
  // Writing, upload and drawing rounds: after the reveal the host gives each player (or team) up to the
  // maximum, or a place's points, as in a challenge. Such a round cannot also be voted on.
  z.object({ kind: z.literal('judged'), maxAwardMilli: AwardMilliSchema, places: PlacesSchema.optional() }).strict(),
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
  split: SplitSchema, formation: z.enum(['random', 'skill', 'host', 'players']),
  names: z.array(z.string().trim().min(1).max(30)).max(12).optional(),
  // Who picks the team colours while teams are made: the host (left out), or each team for itself (the host still can).
  colors: z.enum(['host', 'teams']).optional(),
  // How captains are picked when the teams have captains: assigned (left out: the host picks, else one at random) or elected by their teammates.
  captainPick: z.enum(CAPTAIN_PICKS).optional(),
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
      z.object({ kind: z.literal('reform'), form: FormationSchema, carryover: z.enum(CARRYOVERS) }).strict(),
    ]),
    answers: z.enum(['everyone', 'captain']), points: z.enum(['team', 'members', 'both']),
  }).strict(),
]);
export type Play = z.infer<typeof PlaySchema>;
const RoutePolicySchema = z.enum(['host', 'default', 'random']);
const RouteCountsSchema = z.enum(['live', 'reveal', 'never']);
// `presentation`: this scene's own texts, look and animations on top of the game's.
// A wheel of fortune: its entries, whether a picked entry leaves the wheel, how long it spins, and optionally
// its own slice colours (otherwise the game's answer colours).
export const WheelSchema = z.object({
  key: GameKeySchema, title: z.string().trim().min(1).max(80),
  entries: z.array(z.object({ key: GameKeySchema, label: z.string().trim().min(1).max(80) }).strict()).min(2).max(40)
    .refine(entries => new Set(entries.map(entry => entry.key)).size === entries.length, 'Wheel entries must be unique'),
  removePicked: z.boolean(), spinSeconds: z.number().int().min(2).max(15),
  colors: z.array(ColorSchema).min(2).max(8).optional(),
}).strict();
// Every scene may carry its own look, a wheel to spin there (`spin`), or hide the last wheel result from here on (`wheelClear`).
// All optional, so earlier definitions keep their hash.
// `media`: a picture, video or song from the media library shown with the scene's text (optional; earlier definitions keep their hash).
// `music`: what the scene does with the game's music (keep it, its own song, quieter, silent).
const look = { slideImages: SlideImagesSchema.optional(), hostNotes: HostNotesSchema.optional(), textBoxes: SceneTextBoxesSchema.optional(), textBoxPhoneColumns: z.boolean().optional(), promptStyle: SceneTextStyleSchema.optional(), mediaLayout: MediaLayoutSchema.optional(), youtube: YouTubeClipSchema.optional(), translations: SceneTranslationsSchema.optional(), media: SceneMediaSchema.optional(), music: SceneMusicSchema.optional(), presentation: PresentationSchema.omit({ phoneMenuIcons: true }).optional(), spin: z.object({ wheel: GameKeySchema }).strict().optional(), wheelClear: z.boolean().optional(),
  // An intro shown before the scene starts, until the host continues. No `text`: a minigame's “how to play”.
  // `points`: also show the points at stake (worked out from the scene's scoring). `picture`: a picture from the
  // media library. `screenOnly`: only the shared screen shows it; phones wait without “Got it”.
  explain: z.object({ text: z.string().trim().min(1).max(1000).optional(), points: z.boolean().optional(), picture: SceneMediaSchema.optional(), screenOnly: z.boolean().optional() }).strict().optional() };
const common = { key: GameKeySchema, prompt: ScenePromptSchema, durationMs: StageDurationSchema.nullable(), play: PlaySchema.optional(), resultCards: ResultCardsSchema.optional(), countdownSeconds: z.number().int().min(0).max(15).optional(), ...look };
const stageSchema = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('collect'), input: InputSchema, scoring }).strict(),
  z.object({ ...common, kind: z.literal('challenge'), maxAwardMilli: AwardMilliSchema, places: PlacesSchema.optional() }).strict(),
  // Players vote for one answer from an earlier text or upload round. Each vote gives its author points.
  z.object({ ...common, kind: z.literal('vote'), voteMode: VotingModeSchema.optional(), voteLimit: z.number().int().min(2).max(MAX_BALLOT_SELECTIONS).optional(), source: z.object({ nodeKey: GameKeySchema, stageKey: GameKeySchema }).strict(), awardPerVoteMilli: AwardMilliSchema, places: PlacesSchema.optional() }).strict(),
  // Show-only scenes: no answers, no points, no team play. The host continues
  // whenever they like; an optional countdown only informs the room.
  // An info scene (cutscene, rules, announcement): a title and text on every screen.
  z.object({ ...look, titleStyle: SceneTextStyleSchema.optional(), key: GameKeySchema, kind: z.literal('info'), title: SceneTitleSchema, prompt: ScenePromptSchema, durationMs: StageDurationSchema.nullable() }).strict(),
  // A scoreboard scene: the standings of players, the game's teams, or both.
  z.object({ ...look, key: GameKeySchema, kind: z.literal('scoreboard'), prompt: ScenePromptSchema, show: z.enum(['players', 'teams', 'both']), durationMs: StageDurationSchema.nullable() }).strict(),
  // A minigame from the catalog. `game` may still be a placeholder name, which
  // keeps the game a draft until a minigame is chosen. `settings` must fit the
  // minigame (checked below); left out, the minigame's defaults apply.
  // `placementMilli`: points for 1st, 2nd, 3rd… (shared on a tie). `teamResult`:
  // how members' results make a team's result. All optional, so placeholder
  // scenes saved earlier keep their hash.
  z.object({ ...common, kind: z.literal('minigame'), game: z.string().trim().min(1).max(64), settings: z.record(z.string(), z.json()).optional(),
    placementMilli: z.array(AwardMilliSchema).min(1).max(12).optional(), places: PlacesSchema.optional(), teamResult: z.enum(['best', 'average', 'total']).optional(),
    // `tiebreak`: how equal results are settled, for minigames that allow speed to settle them (the game's standard when left out).
    tiebreak: z.enum(MINIGAME_TIEBREAKS).optional(),
    // `scoring`: points by closeness (close enough, or a sliding scale) instead of by place, for target minigames.
    scoring: MinigameScoringSchema.optional(),
    // Step games in a team round: how a team decides each move, and the seconds for a team vote.
    decide: z.enum(TEAM_DECIDES).optional(), voteSeconds: z.number().int().min(5).max(120).optional(),
    // `draw`: a minigame draw in one scene. When the scene opens the server draws one of these games (with its own
    // settings and time) and the scene plays it; `game` is then the first of them. Left out: the scene plays `game`.
    draw: z.array(z.object({ game: z.string().trim().min(1).max(64), settings: z.record(z.string(), z.json()).optional(), durationMs: StageDurationSchema.nullable().optional() }).strict()).min(2).max(8).optional() }).strict(),
  // A duel: two players (picked at random or by the host) face off in the room while everyone
  // else bets on the winner; the host taps the winner. `places`: 1st for the winner, 2nd for the
  // loser (left out: 10 points for the winner). `betMilli`: for every right bet. The timer is the
  // voting time. Pool can use representatives from two existing teams and skip voting.
  z.object({ ...look, key: GameKeySchema, kind: z.literal('duel'), prompt: ScenePromptSchema, durationMs: StageDurationSchema.nullable(),
    pick: z.enum(['random', 'host', 'teams']), places: PlacesSchema.optional(), betMilli: AwardMilliSchema, matchSeconds: PoolMatchSecondsSchema.optional(),
    // How it is won (left out: the host names the winner). `game`: a head-to-head game on the two phones, with its settings.
    contest: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('host') }).strict(),
      z.object({ kind: z.literal('game'), game: HeadToHeadKeySchema, settings: z.record(z.string(), z.json()).optional() }).strict(),
    ]).optional() }).strict(),
  // Pick teams: the teams are made here (`form`) and the rounds after it play in them (a round's `play` of the game's
  // teams) until the next Pick teams scene. The host sees the proposal, can change it (also add or remove teams) and
  // confirms; then moves on. `carryover`: the team scores when teams are made again. `captains`: each team gets a captain.
  z.object({ ...look, key: GameKeySchema, kind: z.literal('teams'), prompt: ScenePromptSchema, durationMs: z.null(),
    form: FormationSchema, carryover: z.enum(CARRYOVERS).optional(), captains: z.boolean().optional() }).strict(),
  // Format 2: the party picks one route. It is the only stage of its node, each
  // option is connected by one edge naming it, and it never awards points. It
  // has no `play`: who decides is part of `decide`.
  z.object({ ...look, key: GameKeySchema, kind: z.literal('route'), prompt: ScenePromptSchema, durationMs: StageDurationSchema.nullable(),
    options: z.array(ChoiceOptionSchema).min(2).max(8)
      .refine(options => new Set(options.map(option => option.key)).size === options.length && new Set(options.map(option => option.label.trim().toLowerCase())).size === options.length, 'Route options must be unique'),
    decide: z.discriminatedUnion('method', [
      z.object({ method: z.literal('host') }).strict(),
      // `tie`/`noVotes`: the host decides, the default route is taken, or a recorded random pick.
      // `counts`: when phones and the shared screen see vote counts.
      z.object({ method: z.literal('players'), tie: RoutePolicySchema, noVotes: RoutePolicySchema, counts: RouteCountsSchema }).strict(),
      z.object({ method: z.literal('captains'), tie: RoutePolicySchema, noVotes: RoutePolicySchema, counts: RouteCountsSchema }).strict(),
      // A minigame draw: nobody votes; the host draws (or the timer does) and the server picks one route at random, recorded once.
      z.object({ method: z.literal('draw') }).strict(),
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
  // Wheels of fortune that scenes can spin, and the statistics of the end-of-game show (left out: the standard set; empty: no show).
  wheels: z.array(WheelSchema).max(10).optional(), finale: z.object({
    stats: z.array(z.enum(FINALE_STATS)).max(FINALE_STATS.length).optional(),
    // The author's own list (used instead of `stats`): each award a rule, an optional own title, and for "scene" the scene it is about.
    awards: z.array(z.object({ rule: z.enum(AWARD_RULES), title: z.string().trim().min(1).max(60).optional(), nodeKey: GameKeySchema.optional() }).strict()).max(16).optional(),
  }).strict().optional(),
  // What a room of this game starts with on the phones: side games (challenges between players; left out: on) and
  // chips (slot machine, blackjack, packs and stakes; left out: off). The host can switch both in the room.
  sideGames: z.boolean().optional(), chips: z.boolean().optional(),
  // Challenges a player may have waiting for an answer at once (left out: 3). The host can change it in the room.
  openInvites: z.number().int().min(1).max(MAX_OPEN_INVITES).optional(),
  // The host's quick time button (+30 s by default): how many seconds it adds to a round.
  birthdayVote: z.boolean().optional(),
  phoneEffects: z.boolean().optional(),
  autoRevealSeconds: AutoRevealSecondsSchema.optional(),
  idleCloseMinutes: IdleCloseMinutesSchema.optional(),
  quickTimeSeconds: z.number().int().min(5).max(600).optional(),
  // The game's own starting room settings (scores, reactions, break votes, closing a round); see GameRoomSettingsSchema.
  room: GameRoomSettingsSchema.optional(),
  // The game's own reactions (emoji, short texts, pictures from the media library) and its soundboard (see party-extras.ts).
  ownReactions: z.array(OwnReactionSchema).max(MAX_OWN_REACTIONS).optional(), soundboard: z.array(SoundSchema).max(MAX_SOUNDS).optional(),
  // The background playlist (songs from the media library), from the lobby on. Left out: no music.
  music: GameMusicSchema.optional(),
  graphLibrary: StoredGraphsSchema.optional(),
  nodes: z.array(z.object({ key: GameKeySchema, stages: z.array(stageSchema).min(1).max(20) }).strict()).min(1).max(100),
  // `option` names the route option an edge belongs to (format 2 choice nodes only).
  edges: z.array(z.object({ key: GameKeySchema, from: GameKeySchema, to: GameKeySchema, option: GameKeySchema.optional() }).strict()).max(300),
}).strict().superRefine((definition, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  const keys = new Set(definition.nodes.map(node => node.key));
  if (keys.size !== definition.nodes.length) fail('Duplicate node key');
  if (!keys.has(definition.startNodeKey)) fail('Missing start node');
  if (new Set(definition.edges.map(edge => edge.key)).size !== definition.edges.length) fail('Duplicate edge key');
  const wheels = new Set((definition.wheels ?? []).map(wheel => wheel.key));
  if (wheels.size !== (definition.wheels ?? []).length) fail('Duplicate wheel');
  for (const edge of definition.edges) if (!keys.has(edge.from) || !keys.has(edge.to)) fail('Missing edge endpoint');
  let count = 0;
  for (const award of definition.finale?.awards ?? []) {
    if (award.rule === 'scene' && !definition.nodes.some(node => node.key === award.nodeKey)) ctx.addIssue({ code: 'custom', message: 'An award is about a scene that does not exist', path: ['finale'] });
  }
  for (const [nodeIndex, node] of definition.nodes.entries()) {
    count += node.stages.length;
    // Problems of one scene (or one part) carry its path: each is counted and shown on its own scene, never merged with another's.
    const at = (message: string, stageIndex?: number) => ctx.addIssue({ code: 'custom', message, path: stageIndex === undefined ? ['nodes', nodeIndex] : ['nodes', nodeIndex, 'stages', stageIndex] });
    if (new Set(node.stages.map(stage => stage.key)).size !== node.stages.length) at('Duplicate stage key');
    for (const [stageIndex, stage] of node.stages.entries()) {
      if ('countdownSeconds' in stage && stage.countdownSeconds !== undefined && stage.kind !== 'minigame' && !(stage.kind === 'collect' && stage.input.kind === 'drawing')) at('A countdown requires a drawing round or minigame', stageIndex);
      if ('resultCards' in stage && stage.resultCards !== undefined && stage.kind !== 'vote' && !(stage.kind === 'collect' && (stage.input.kind === 'media' || stage.input.kind === 'drawing'))) at('Result cards require a vote, drawing or upload round', stageIndex);
      if (stage.youtube && stage.media) at('Choose either a YouTube clip or a library file for this scene', stageIndex);
      if (stage.media?.crop && stage.media.kind !== 'image') at('Only pictures can be cropped', stageIndex);
      if (stage.media?.trim && stage.media.kind === 'image') at('Only video or audio can be cut', stageIndex);
      if (stage.media?.waveform !== undefined && stage.media.kind !== 'audio') at('Only songs can show a waveform', stageIndex);
      if (stage.youtube && !['collect', 'challenge', 'info'].includes(stage.kind)) at('This scene cannot play a YouTube clip', stageIndex);
      if (stage.kind === 'collect' && stage.scoring.kind === 'correct-choice') {
        const rule = stage.scoring;
        if (stage.input.kind !== 'choice' || !stage.input.options.some(option => option.key === rule.correctChoiceKey)) at('Invalid correct choice', stageIndex);
      }
      // Only a minigame has a standard explanation (its “how to play”); other scenes need their own text.
      if (stage.explain?.picture && stage.explain.picture.kind !== 'image') ctx.addIssue({ code: 'custom', message: 'The intro can only show a picture', path: ['nodes', definition.nodes.indexOf(node), 'stages', node.stages.indexOf(stage)] });
      if (stage.explain && !stage.explain.text && !stage.explain.picture && !(stage.explain.points && pointsAtStake(stage)) && stage.kind !== 'minigame') ctx.addIssue({ code: 'custom', message: 'Write the explanation for this scene, show its points or a picture, or switch it off', path: ['nodes', definition.nodes.indexOf(node), 'stages', node.stages.indexOf(stage)] });
      if (stage.spin && !wheels.has(stage.spin.wheel)) ctx.addIssue({ code: 'custom', message: 'This scene spins a wheel that does not exist', path: ['nodes', definition.nodes.indexOf(node), 'stages', node.stages.indexOf(stage)] });
      // Pass the pencil is drawn by teams: it needs team play, from the round or the game.
      if (stage.kind === 'minigame' && TEAM_MINIGAMES.includes(stage.game as MinigameKey) && (stage.play ?? definition.play ?? { kind: 'solo' }).kind !== 'teams') ctx.addIssue({ code: 'custom', message: 'This minigame needs teams', path: ['nodes', definition.nodes.indexOf(node), 'stages', node.stages.indexOf(stage)] });
      if (stage.kind === 'duel' && stage.contest?.kind === 'game' && !parseHeadToHeadSettings(stage.contest.game, stage.contest.settings)) ctx.addIssue({ code: 'custom', message: 'Duel game settings are not valid', path: ['nodes', definition.nodes.indexOf(node), 'stages', node.stages.indexOf(stage)] });
      if (stage.kind === 'duel' && stage.pick === 'teams' && (stage.contest?.kind !== 'game' || stage.contest.game !== 'eight-ball')) ctx.addIssue({ code: 'custom', message: 'Team representatives are available for 8-ball pool', path: ['nodes', definition.nodes.indexOf(node), 'stages', node.stages.indexOf(stage)] });
      if (stage.kind === 'duel' && stage.matchSeconds !== undefined && (stage.contest?.kind !== 'game' || stage.contest.game !== 'eight-ball')) ctx.addIssue({ code: 'custom', message: 'The match clock is available for 8-ball pool', path: ['nodes', definition.nodes.indexOf(node), 'stages', node.stages.indexOf(stage), 'matchSeconds'] });
      // A draw in one scene: every game in it must be playable here, as if the scene were that game.
      if (stage.kind === 'minigame' && stage.draw) {
        const games = stage.draw.map(entry => entry.game);
        if (new Set(games).size !== games.length) ctx.addIssue({ code: 'custom', message: 'A game is in the draw more than once', path: ['nodes', definition.nodes.indexOf(node), 'stages', node.stages.indexOf(stage), 'draw'] });
        stage.draw.forEach((entry, position) => {
          const at = ['nodes', definition.nodes.indexOf(node), 'stages', node.stages.indexOf(stage), 'draw', position];
          if (!isMinigameKey(entry.game)) { ctx.addIssue({ code: 'custom', message: `“${entry.game}” is not a minigame`, path: at }); return; }
          if (!parseMinigameSettings(entry.game, entry.settings)) ctx.addIssue({ code: 'custom', message: 'Minigame settings are not valid', path: at });
          if (TEAM_MINIGAMES.includes(entry.game) && (stage.play ?? definition.play ?? { kind: 'solo' }).kind !== 'teams') ctx.addIssue({ code: 'custom', message: `${MINIGAMES[entry.game].name} needs teams: play this scene in teams, or take it out of the draw`, path: at });
          const ms = entry.durationMs === undefined ? stage.durationMs : entry.durationMs;
          if (entry.game === 'clap-beat' && ms !== null && ms < CLAP_END_MS) ctx.addIssue({ code: 'custom', message: `Clap the beat needs at least ${Math.ceil(CLAP_END_MS / 1000)} seconds`, path: at });
        });
      }
      if (stage.kind === 'minigame' && stage.places && stage.placementMilli) ctx.addIssue({ code: 'custom', message: 'Give the minigame either points per place or places, not both', path: ['nodes', definition.nodes.indexOf(node), 'stages', node.stages.indexOf(stage)] });
      if (stage.kind === 'minigame' && stage.game === 'clap-beat' && stage.durationMs !== null && stage.durationMs < CLAP_END_MS) {
        ctx.addIssue({ code: 'custom', message: 'Clap the beat needs at least 9 seconds', path: ['nodes', definition.nodes.indexOf(node), 'stages', node.stages.indexOf(stage), 'durationMs'] });
      }
      if (stage.kind === 'minigame' && isMinigameKey(stage.game) && stage.scoring && !minigameScoring(stage.game, stage.scoring)) ctx.addIssue({ code: 'custom', message: MINIGAMES[stage.game].closeness ? 'The distance is too far for this minigame' : 'This minigame gives points by place only', path: ['nodes', definition.nodes.indexOf(node), 'stages', node.stages.indexOf(stage), 'scoring'] });
      if (stage.kind === 'minigame' && isMinigameKey(stage.game) && !parseMinigameSettings(stage.game, stage.settings)) ctx.addIssue({ code: 'custom', message: 'Minigame settings are not valid', path: ['nodes', definition.nodes.indexOf(node), 'stages', node.stages.indexOf(stage)] });
      if (stage.kind === 'collect' && stage.scoring.kind === 'judged' && !['text', 'media', 'drawing'].includes(stage.input.kind)) at('Only open rounds are judged', stageIndex);
      if (stage.kind === 'collect' && stage.scoring.kind === 'correct-order') {
        const rule = stage.scoring; const keys = stage.input.kind === 'order' ? stage.input.items.map(item => item.key) : [];
        if (keys.length !== rule.correctOrder.length || new Set(rule.correctOrder).size !== keys.length || !keys.every(key => rule.correctOrder.includes(key))) at('Invalid correct order', stageIndex);
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
/**
 * A minigame draw's scene as drawn: the drawn game with its own settings and time (the scene's time when it has none),
 * everything else (points, teams, look) from the scene. Every rule of a running stage reads this, never the draw itself.
 */
export function drawnStage(stage: MinigameStage, index: number): MinigameStage {
  const entry = stage.draw?.[index];
  if (!entry) return stage;
  const { draw: _draw, settings: _settings, ...rest } = stage;
  return { ...rest, game: entry.game, ...(entry.settings ? { settings: entry.settings } : {}), durationMs: entry.durationMs === undefined ? stage.durationMs : entry.durationMs };
}
/** A playable minigame scene's rules, with defaults filled in. */
export function minigameRules(stage: MinigameStage): { game: MinigameKey; settings: MinigameSettings; placementMilli: string[]; teamResult: 'best' | 'average' | 'total'; tiebreak: MinigameTiebreak; scoring: MinigameScoring | null; decide: TeamDecides; voteSeconds: number } {
  if (!isMinigameKey(stage.game)) throw new GameError('UNSUPPORTED_FEATURE');
  const settings = parseMinigameSettings(stage.game, stage.settings);
  if (!settings) throw new GameError('INVALID_DEFINITION');
  // Closeness scoring gives equal results equal points, so the tie rule (which settles places) applies to points by place only.
  const scoring = minigameScoring(stage.game, stage.scoring);
  return { game: stage.game, settings, placementMilli: minigamePlacePoints(stage), teamResult: stage.teamResult ?? 'average',
    scoring, tiebreak: scoring ? 'shared' : minigameTiebreak(stage.game, stage.tiebreak),
    decide: stage.decide ?? 'anyone', voteSeconds: stage.voteSeconds ?? 20 };
}
export { MINIGAMES };
export function effectivePlay(definition: GameDefinition, stage: StageDefinition): Play {
  if (stage.kind === 'route' || stage.kind === 'info' || stage.kind === 'scoreboard' || stage.kind === 'duel' || stage.kind === 'teams') throw new GameError('INVALID_STATE');
  // Some minigames are always played alone (each player for themselves), also in a team game.
  if (stage.kind === 'minigame' && (SOLO_MINIGAMES as readonly string[]).includes(stage.game)) return { kind: 'solo' };
  return stage.play ?? definition.play ?? { kind: 'solo' };
}
/** Points by place for a stage that has them (fastest correct, most votes, host places), or null. */
/** Whether the host judges this stage (a challenge, or a writing, upload or drawing round with host points), and its maximum. */
export function judging(stage: StageDefinition): { maxAwardMilli: string } | null {
  if (stage.kind === 'challenge') return { maxAwardMilli: stage.maxAwardMilli };
  if (stage.kind === 'collect' && stage.scoring.kind === 'judged') return { maxAwardMilli: stage.scoring.maxAwardMilli };
  return null;
}
export function stagePlaces(stage: StageDefinition): string[] | null {
  return configuredPlacePoints(stage);
}
