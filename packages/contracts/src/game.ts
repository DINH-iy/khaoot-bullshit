import { z } from 'zod';
import { HeadToHeadKeySchema, HeadToHeadMoveSchema, HeadToHeadViewSchema } from './head-to-head.js';
import { PresentationSchema, ThemeSchema, AnimationChoiceSchema } from './presentation.js';
import { MinigameRevealSchema, MinigameValueSchema, PublicMinigameSchema } from './minigames.js';
import { PlayerLookSchema } from './players.js';
import { DrawingSchema } from './drawing.js';
import { PublicMusicSchema, PublicSceneMediaSchema } from './media.js';

export const GameKeySchema = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
export const GameIdSchema = z.string().uuid().transform(value => value.toLowerCase());
export const RevisionSchema = z.number().int().min(0).max(2_147_483_646);
// Public JSON represents exact fixed-point points as decimal integer strings.
// Stage time limits and host adjustments share one bound: one second to one hour.
export const StageDurationSchema = z.number().int().min(1000).max(3_600_000);
export const AwardMilliSchema = z.string().regex(/^(0|[1-9][0-9]{0,11})$/);
// Host score corrections may be negative, never zero.
export const AdjustmentMilliSchema = z.string().regex(/^-?[1-9][0-9]{0,11}$/);
/**
 * Points by place: a list (1st, 2nd, 3rd…), or a total the server splits over a
 * number of places. `curve`: `even` steps down evenly (3, 2, 1 parts), `steep`
 * halves each place (4, 2, 1), `equal` gives every place the same. Equal
 * results share a place and each get its points.
 */
export const PlacesSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('list'), pointsMilli: z.array(AwardMilliSchema).min(1).max(12) }).strict(),
  z.object({ kind: z.literal('split'), totalMilli: AwardMilliSchema, places: z.number().int().min(1).max(12), curve: z.enum(['even', 'steep', 'equal']) }).strict(),
]);
export type Places = z.infer<typeof PlacesSchema>;
/**
 * The points for 1st, 2nd, 3rd… A split total is shared by weight, in whole
 * points when the total is a whole number of points; whatever does not divide
 * goes to 1st place, so the parts always add up to the total.
 */
export function placePoints(places: Places): string[] {
  if (places.kind === 'list') return places.pointsMilli;
  const count = places.places; const total = BigInt(places.totalMilli);
  const weights = Array.from({ length: count }, (_, index) => places.curve === 'equal' ? 1n : places.curve === 'steep' ? 1n << BigInt(count - 1 - index) : BigInt(count - index));
  const sum = weights.reduce((a, b) => a + b, 0n);
  const unit = total % 1000n === 0n ? 1000n : 1n;
  const shares = weights.map(weight => total * weight / sum / unit * unit);
  shares[0]! += total - shares.reduce((a, b) => a + b, 0n);
  return shares.map(String);
}
export const MediaKindSchema = z.enum(['image', 'gif', 'video']);
export type MediaKind = z.infer<typeof MediaKindSchema>;
export const ChoiceOptionSchema = z.object({ key: GameKeySchema, label: z.string().trim().min(1).max(240) }).strict();
export const InputSchema = z.discriminatedUnion('kind', [
  // `layout` is how the phone presents the options: a compact list or large
  // pressable tiles. Optional so existing saved definitions keep their hash.
  z.object({ kind: z.literal('choice'), options: z.array(ChoiceOptionSchema).min(2).max(12), layout: z.enum(['list', 'tiles']).optional() }).strict().refine(
    input => new Set(input.options.map(option => option.key)).size === input.options.length, 'Choice keys must be unique',
  ),
  // The player arranges every item into an order.
  z.object({ kind: z.literal('order'), items: z.array(ChoiceOptionSchema).min(2).max(8) }).strict().refine(
    input => new Set(input.items.map(item => item.key)).size === input.items.length, 'Item keys must be unique',
  ),
  z.object({ kind: z.literal('text'), maxLength: z.number().int().min(1).max(2000) }).strict(),
  // The player uploads one picture, GIF or video; each round lists what it accepts.
  z.object({ kind: z.literal('media'), accept: z.array(MediaKindSchema).min(1).max(3) }).strict().refine(input => new Set(input.accept).size === input.accept.length, 'Accepted media kinds must be unique'),
  // The player draws (strokes, see drawing.ts). `blind`: the player cannot see their own drawing until it is sent.
  // `start`: a doodle everyone gets to finish. Both optional, so earlier definitions keep their hash.
  z.object({ kind: z.literal('drawing'), maxStrokes: z.number().int().min(1).max(600), blind: z.boolean().optional(), start: DrawingSchema.optional() }).strict(),
]);
export const SubmissionValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('choice'), choiceKey: GameKeySchema }).strict(),
  z.object({ kind: z.literal('order'), keys: z.array(GameKeySchema).min(2).max(8) }).strict(),
  z.object({ kind: z.literal('text'), text: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ kind: z.literal('drawing'), assetId: GameIdSchema }).strict(),
  z.object({ kind: z.literal('media'), assetId: GameIdSchema }).strict(),
  // A vote names one entry of the ballot shown for this stage.
  z.object({ kind: z.literal('vote'), submissionId: GameIdSchema }).strict(),
  // A minigame result, measured on the phone and checked by the server.
  MinigameValueSchema,
  // A bet in a duel: the duelist this player thinks will win.
  z.object({ kind: z.literal('bet'), playerId: GameIdSchema }).strict(),
]);
export type SubmissionValue = z.infer<typeof SubmissionValueSchema>;

const envelope = { formatVersion: z.literal(1), commandId: GameIdSchema, sessionId: GameIdSchema };
const hostEnvelope = { ...envelope, expectedRevision: RevisionSchema };
export const GameCommandSchema = z.discriminatedUnion('type', [
  z.object({ ...hostEnvelope, type: z.literal('session.create'), expectedRevision: z.literal(0), gameVersionId: GameIdSchema, mode: z.enum(['LIVE', 'REHEARSAL']) }).strict(),
  z.object({ ...hostEnvelope, type: z.literal('session.start') }).strict(),
  z.object({ ...hostEnvelope, type: z.literal('session.pause') }).strict(),
  z.object({ ...hostEnvelope, type: z.literal('session.resume') }).strict(),
  z.object({ ...hostEnvelope, type: z.literal('stage.close'), stageRunId: GameIdSchema }).strict(),
  z.object({ ...hostEnvelope, type: z.literal('stage.advance'), stageRunId: GameIdSchema }).strict(),
  z.object({ ...hostEnvelope, type: z.literal('stage.judge'), stageRunId: GameIdSchema, playerId: GameIdSchema, amountMilli: AwardMilliSchema }).strict(),
  // The host stays in control of a running clock: add time, replace the remaining
  // time, or remove the limit. Allowed while the room is running or paused.
  z.object({ ...hostEnvelope, type: z.literal('stage.timer'), stageRunId: GameIdSchema, change: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('add'), ms: StageDurationSchema }).strict(),
    z.object({ kind: z.literal('set'), ms: StageDurationSchema }).strict(),
    z.object({ kind: z.literal('clear') }).strict(),
  ]) }).strict(),
  z.object({ ...hostEnvelope, type: z.literal('stage.reopen'), stageRunId: GameIdSchema, durationMs: StageDurationSchema.nullable() }).strict(),
  // Shows the closed stage's answer, awards and updated scores to everyone.
  z.object({ ...hostEnvelope, type: z.literal('stage.reveal'), stageRunId: GameIdSchema }).strict(),
  // A correction is a new ledger entry; earlier awards and judgments are never edited.
  z.object({ ...hostEnvelope, type: z.literal('score.adjust'), playerId: GameIdSchema, amountMilli: AdjustmentMilliSchema, reason: z.string().trim().min(1).max(120) }).strict(),
  // Team forming before a team round starts. The host can always change the
  // proposal; players may pick a team only when the round lets them choose.
  z.object({ ...hostEnvelope, type: z.literal('teams.shuffle'), stageRunId: GameIdSchema }).strict(),
  z.object({ ...hostEnvelope, type: z.literal('teams.assign'), stageRunId: GameIdSchema, playerId: GameIdSchema, teamIndex: z.number().int().min(0).max(11).nullable() }).strict(),
  z.object({ ...hostEnvelope, type: z.literal('teams.captain'), stageRunId: GameIdSchema, playerId: GameIdSchema }).strict(),
  z.object({ ...hostEnvelope, type: z.literal('teams.confirm'), stageRunId: GameIdSchema }).strict(),
  // A scene that explains itself first: the host starts it once everyone has read it (players tap “Got it”).
  z.object({ ...hostEnvelope, type: z.literal('stage.explained'), stageRunId: GameIdSchema }).strict(),
  z.object({ ...envelope, type: z.literal('stage.understood'), stageRunId: GameIdSchema }).strict(),
  // The host adds a team (up to 12) or removes one; a removed team's players become unassigned.
  z.object({ ...hostEnvelope, type: z.literal('teams.add'), stageRunId: GameIdSchema }).strict(),
  z.object({ ...hostEnvelope, type: z.literal('teams.remove'), stageRunId: GameIdSchema, teamIndex: z.number().int().min(0).max(11) }).strict(),
  z.object({ ...envelope, type: z.literal('teams.choose'), stageRunId: GameIdSchema, teamIndex: z.number().int().min(0).max(11) }).strict(),
  // In a team round the host judges each team.
  z.object({ ...hostEnvelope, type: z.literal('stage.judgeTeam'), stageRunId: GameIdSchema, teamId: GameIdSchema, amountMilli: AwardMilliSchema }).strict(),
  // The host picks a route at any time before one is recorded: while voting
  // (which closes the vote), on a tie, or when nobody voted. Final once recorded.
  z.object({ ...hostEnvelope, type: z.literal('route.decide'), stageRunId: GameIdSchema, optionKey: GameKeySchema }).strict(),
  // Closes a stage whose server deadline has passed. Valid only after that
  // deadline, so it carries no revision and cannot end a stage early.
  z.object({ ...envelope, type: z.literal('stage.timeout'), stageRunId: GameIdSchema }).strict(),
  // Concurrent players do not depend on a global session revision. The stage ID
  // binds the answer to its original stage, including after a reconnect.
  z.object({ ...envelope, type: z.literal('submission.submit'), stageRunId: GameIdSchema, value: SubmissionValueSchema }).strict(),
  // A player changes their own look (character parts only), at any time.
  z.object({ ...envelope, type: z.literal('player.look'), look: PlayerLookSchema }).strict(),
  // The host takes away a player's photo or drawn picture (the character stays).
  z.object({ ...hostEnvelope, type: z.literal('player.removePicture'), playerId: GameIdSchema }).strict(),
  // The host spins the wheel of fortune set on this scene (again, if they like); the server picks the entry.
  z.object({ ...hostEnvelope, type: z.literal('wheel.spin'), stageRunId: GameIdSchema }).strict(),
  // A duel: the host picks the two duelists (when the scene lets the host pick, or again before anyone bets),
  // and later the winner, which pays the winner, the loser's place and every right bet at once.
  z.object({ ...hostEnvelope, type: z.literal('duel.pick'), stageRunId: GameIdSchema, playerIds: z.tuple([GameIdSchema, GameIdSchema]) }).strict(),
  z.object({ ...hostEnvelope, type: z.literal('duel.decide'), stageRunId: GameIdSchema, winnerId: GameIdSchema }).strict(),
  // A duel played as a head-to-head game: the duelists' moves (once betting has closed), or giving up.
  z.object({ ...envelope, type: z.literal('duel.move'), stageRunId: GameIdSchema, move: HeadToHeadMoveSchema }).strict(),
  z.object({ ...envelope, type: z.literal('duel.resign'), stageRunId: GameIdSchema }).strict(),
  // One turn of a relay drawing (Pass the pencil): the strokes this player added in turn `turn`.
  z.object({ ...envelope, type: z.literal('minigame.part'), stageRunId: GameIdSchema, turn: z.number().int().min(0).max(63), assetId: GameIdSchema }).strict(),
  // A team step game (Drive the bus…): a move for the team's step `step`. Applied at once, or in a team vote a member's vote;
  // `decide`: count the votes cast so far now (only someone who voted).
  z.object({ ...envelope, type: z.literal('minigame.move'), stageRunId: GameIdSchema, step: z.number().int().min(0).max(63), option: z.string().min(1).max(40), decide: z.literal(true).optional() }).strict(),
  // A team vote's time ran out (sent by the server's timer), or the host decides it now: the votes cast decide.
  z.object({ ...envelope, type: z.literal('minigame.decide'), stageRunId: GameIdSchema, side: z.string().min(1).max(80), step: z.number().int().min(0).max(63), now: z.literal(true).optional() }).strict(),
]);
export type GameCommand = z.infer<typeof GameCommandSchema>;
/** Commands a player may send; every other command is the host's. */
export const PLAYER_COMMANDS: readonly GameCommand['type'][] = ['submission.submit', 'teams.choose', 'stage.understood', 'player.look', 'minigame.part', 'minigame.move', 'duel.move', 'duel.resign'];
export const CommandReceiptSchema = z.object({
  formatVersion: z.literal(1), commandId: GameIdSchema, sessionId: GameIdSchema,
  revision: RevisionSchema, type: z.enum(GameCommandSchema.options.map(option => option.shape.type.value)),
  stageRunId: GameIdSchema.nullable(), submissionId: GameIdSchema.nullable(),
}).strict();
export type CommandReceipt = z.infer<typeof CommandReceiptSchema>;

export const GameErrorCodeSchema = z.enum([
  'INVALID_COMMAND', 'INVALID_DEFINITION', 'UNSUPPORTED_FEATURE', 'FORBIDDEN', 'NOT_FOUND',
  'REVISION_CONFLICT', 'COMMAND_KEY_REUSED', 'INVALID_STATE', 'INELIGIBLE',
  'ALREADY_SUBMITTED', 'ALREADY_JUDGED', 'INVALID_SUBMISSION', 'GAME_UNAVAILABLE', 'TOO_LATE', 'ALREADY_DECIDED', 'DECISION_PENDING',
]);
export type GameErrorCode = z.infer<typeof GameErrorCodeSchema>;

const SignedMilliSchema = z.string().regex(/^-?(0|[1-9][0-9]*)$/);
// Present only after the host reveals a closed stage.
export const StageRevealSchema = z.object({
  answer: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('choice'), correctChoiceKey: GameKeySchema.nullable(), counts: z.array(z.object({ choiceKey: GameKeySchema, count: z.number().int().min(0) }).strict()) }).strict(),
    z.object({ kind: z.literal('order'), correctOrder: z.array(GameKeySchema).nullable() }).strict(),
    // Uploaded answers are shown to everyone once revealed.
    z.object({ kind: z.literal('vote'), entries: z.array(z.object({ submissionId: GameIdSchema, playerId: GameIdSchema.nullable(), teamId: GameIdSchema.nullable(), votes: z.number().int().min(0) }).strict()) }).strict(),
    z.object({ kind: z.literal('media'), entries: z.array(z.object({ playerId: GameIdSchema, assetId: GameIdSchema, mediaKind: MediaKindSchema }).strict()) }).strict(),
    MinigameRevealSchema,
    z.object({ kind: z.literal('drawing'), entries: z.array(z.object({ playerId: GameIdSchema.nullable(), teamId: GameIdSchema.nullable(), assetId: GameIdSchema }).strict()) }).strict(),
  ]).nullable(),
  awards: z.array(z.object({ playerId: GameIdSchema, amountMilli: SignedMilliSchema }).strict()),
  teamAwards: z.array(z.object({ teamId: GameIdSchema, amountMilli: SignedMilliSchema }).strict()),
}).strict();
// One entry players can vote for. Authors stay hidden until the vote is revealed;
// `own` only tells a player which entry is theirs.
export const BallotEntrySchema = z.object({
  submissionId: GameIdSchema, own: z.boolean(),
  content: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('text'), text: z.string().max(2000) }).strict(),
    z.object({ kind: z.literal('media'), assetId: GameIdSchema, mediaKind: MediaKindSchema }).strict(),
    z.object({ kind: z.literal('drawing'), assetId: GameIdSchema }).strict(),
  ]),
}).strict();
// The teams of a team round. While `forming`, teams are a proposal (no team IDs
// yet) that the host confirms; afterwards they are the round's fixed lineup.
export const StageTeamsSchema = z.object({
  forming: z.boolean(), formation: z.enum(['random', 'host', 'players']), scope: z.enum(['game', 'round']),
  answers: z.enum(['everyone', 'captain']), points: z.enum(['team', 'members', 'both']),
  teams: z.array(z.object({ index: z.number().int().min(0), name: z.string().min(1).max(30), teamId: GameIdSchema.nullable(), targetSize: z.number().int().min(1).nullable(),
    memberIds: z.array(GameIdSchema), captainId: GameIdSchema.nullable() }).strict()),
  unassignedIds: z.array(GameIdSchema), ownTeamIndex: z.number().int().min(0).nullable(),
}).strict();
// A route choice as a screen sees it. Never contains where routes lead, later
// scenes or the tie rules. Players see counts only as the game allows, and the
// decision only once the host announces it; the host sees everything at once.
export const PublicRouteSchema = z.object({
  method: z.enum(['players', 'captains', 'host']), options: z.array(ChoiceOptionSchema).min(2).max(8), canVote: z.boolean(),
  counts: z.array(z.object({ optionKey: GameKeySchema, count: z.number().int().min(0) }).strict()).nullable(),
  pending: z.enum(['tie', 'no-votes', 'host']).nullable(), leaders: z.array(GameKeySchema).nullable(),
  decision: z.object({ optionKey: GameKeySchema, reason: z.enum(['vote', 'host', 'tie-break', 'fallback']), resolution: z.enum(['majority', 'host', 'default', 'random']) }).strict().nullable(),
}).strict();
// A duel as screens see it: the two duelists (null until picked), the bets on each
// (live, for everyone), the points at stake and, once decided, the winner.
export const PublicDuelSchema = z.object({
  duelistIds: z.tuple([GameIdSchema, GameIdSchema]).nullable(), pick: z.enum(['random', 'host']),
  bets: z.array(z.object({ playerId: GameIdSchema, count: z.number().int().min(0) }).strict()),
  placesMilli: z.array(AwardMilliSchema), betMilli: AwardMilliSchema, winnerId: GameIdSchema.nullable(),
  // How the duel is won: the host names the winner, or a head-to-head game on the duelists' phones (its board as this viewer sees it).
  contest: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('host') }).strict(),
    z.object({ kind: z.literal('game'), game: HeadToHeadKeySchema, view: HeadToHeadViewSchema.nullable() }).strict(),
  ]),
}).strict();
export const PublicStageSchema = z.object({
  id: GameIdSchema, nodeKey: GameKeySchema, stageKey: GameKeySchema,
  kind: z.enum(['collect', 'challenge', 'vote', 'route', 'info', 'scoreboard', 'minigame', 'duel', 'teams']), prompt: z.string().min(1).max(2000),
  input: InputSchema.nullable(), status: z.enum(['ACTIVE', 'CLOSED', 'VOID']),
  // Server clock. A running timed stage has deadlineAt; a paused one keeps the
  // frozen remainder instead. Both are null when the stage has no time limit.
  deadlineAt: z.string().datetime().nullable(), pausedRemainingMs: z.number().int().min(0).nullable(),
  // Progress is public; what was answered is not.
  submittedCount: z.number().int().min(0), eligibleCount: z.number().int().min(0),
  // `placesMilli`: points for 1st, 2nd… when the challenge pays by place (the host picks each player's place).
  challenge: z.object({ maxAwardMilli: AwardMilliSchema, placesMilli: z.array(AwardMilliSchema).nullable(), judgedPlayerIds: z.array(GameIdSchema), judgedTeamIds: z.array(GameIdSchema) }).strict().nullable(),
  teams: StageTeamsSchema.nullable(),
  // Shown before the round starts, until the host continues: the scene's own text (null: the minigame's standard
  // “how to play” from the game's texts) and who has tapped “Got it”.
  explain: z.object({ text: z.string().max(1000).nullable(), readyIds: z.array(GameIdSchema) }).strict().nullable(),
  route: PublicRouteSchema.nullable(),
  // The scene's picture, video or song from the media library (absent in older views).
  media: PublicSceneMediaSchema.nullable().optional(),
  // Show-only scenes: an info scene's title, a scoreboard scene's standings selection.
  info: z.object({ title: z.string().min(1).max(120) }).strict().nullable(),
  scoreboard: z.object({ show: z.enum(['players', 'teams', 'both']) }).strict().nullable(),
  ballot: z.array(BallotEntrySchema).nullable(),
  minigame: PublicMinigameSchema.nullable(),
  duel: PublicDuelSchema.nullable(),
  // True when a later vote shows these answers without names; they are revealed by that vote.
  revealAfterVote: z.boolean(),
  revealed: z.boolean(), reveal: StageRevealSchema.nullable(),
}).strict();
/** Statistics for the end-of-game show; the author picks which ones appear and in which order. */
export const FINALE_STATS = ['winner', 'mostCorrect', 'mostWrong', 'fastest', 'slowest', 'mostVotes', 'minigameChamp', 'luckiest', 'mostReactions'] as const;
export type FinaleStat = typeof FINALE_STATS[number];
// Every rule an award can follow: the statistics above, the most points in one chosen scene, and the fewest points.
export const AWARD_RULES = [...FINALE_STATS, 'scene', 'fewest'] as const;
export type AwardRule = typeof AWARD_RULES[number];
// One award as the screens show it: its rule, the author's own title when given, the winners and their score.
export const FinaleSlideSchema = z.object({ stat: z.enum(AWARD_RULES), title: z.string().max(60).optional(), playerIds: z.array(GameIdSchema), value: z.string().max(60) }).strict();
// The wheel of fortune as screens see it: a spin on the current scene (with every entry, to draw the wheel),
// and the last result, which stays in a corner until the next spin or until a scene clears it.
export const WheelViewSchema = z.object({
  canSpin: z.boolean(),
  spin: z.object({ title: z.string(), entries: z.array(z.string()), index: z.number().int().min(0), label: z.string(), spunAt: z.string().datetime(), seconds: z.number().int(),
    colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(8).optional() }).strict().nullable(),
  current: z.object({ title: z.string(), label: z.string() }).strict().nullable(),
}).strict();
export const SessionViewSchema = z.object({
  formatVersion: z.literal(1), sessionId: GameIdSchema, revision: RevisionSchema,
  status: z.enum(['LOBBY', 'RUNNING', 'PAUSED', 'RECOVERING', 'FINISHED']),
  title: z.string().min(1).max(160), stage: PublicStageSchema.nullable(),
  // Lets a device show a countdown against the server clock, not its own.
  serverTime: z.string().datetime(),
  ownSubmission: z.object({ id: GameIdSchema, value: SubmissionValueSchema }).strict().nullable(),
  // Only revealed-stage scores and host corrections are visible; awards on an open or unrevealed stage are private.
  standings: z.array(z.object({ playerId: GameIdSchema, amountMilli: SignedMilliSchema }).strict()),
  // The look and texts for this moment: the game's, with the current scene's changes on top.
  presentation: z.object({ texts: z.record(z.string(), z.string()), animations: z.record(z.string(), AnimationChoiceSchema), themes: z.array(ThemeSchema).max(2) }).strict(),
  wheel: WheelViewSchema,
  // The room's music (absent in older views; null: the game has none).
  music: PublicMusicSchema.nullable().optional(),
  // Once the game is finished: the slides of the end-of-game show (empty when the author switched it off).
  awards: z.array(FinaleSlideSchema).nullable(),
  // Totals of the game's current teams, following that lineup's carryover rule.
  teamStandings: z.array(z.object({ teamId: GameIdSchema, name: z.string().min(1).max(60), memberIds: z.array(GameIdSchema), amountMilli: SignedMilliSchema }).strict()),
}).strict();
export type SessionView = z.infer<typeof SessionViewSchema>;

export const SessionChangedSchema = z.object({
  formatVersion: z.literal(1), type: z.literal('session.changed'), sessionId: GameIdSchema, revision: RevisionSchema,
}).strict();

export { PresentationSchema };
