import { z } from 'zod';
import { PresentationSchema, ThemeSchema, AnimationChoiceSchema } from './presentation.js';
import { MinigameRevealSchema, MinigameValueSchema, PublicMinigameSchema } from './minigames.js';
import { PlayerLookSchema } from './players.js';
import { DrawingSchema } from './drawing.js';

export const GameKeySchema = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
export const GameIdSchema = z.string().uuid().transform(value => value.toLowerCase());
export const RevisionSchema = z.number().int().min(0).max(2_147_483_646);
// Public JSON represents exact fixed-point points as decimal integer strings.
// Stage time limits and host adjustments share one bound: one second to one hour.
export const StageDurationSchema = z.number().int().min(1000).max(3_600_000);
export const AwardMilliSchema = z.string().regex(/^(0|[1-9][0-9]{0,11})$/);
// Host score corrections may be negative, never zero.
export const AdjustmentMilliSchema = z.string().regex(/^-?[1-9][0-9]{0,11}$/);
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
  // One turn of a relay drawing (Pass the pencil): the strokes this player added in turn `turn`.
  z.object({ ...envelope, type: z.literal('minigame.part'), stageRunId: GameIdSchema, turn: z.number().int().min(0).max(63), assetId: GameIdSchema }).strict(),
]);
export type GameCommand = z.infer<typeof GameCommandSchema>;
/** Commands a player may send; every other command is the host's. */
export const PLAYER_COMMANDS: readonly GameCommand['type'][] = ['submission.submit', 'teams.choose', 'player.look', 'minigame.part'];
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
  method: z.enum(['players', 'captains', 'host']), options: z.array(ChoiceOptionSchema).min(2).max(6), canVote: z.boolean(),
  counts: z.array(z.object({ optionKey: GameKeySchema, count: z.number().int().min(0) }).strict()).nullable(),
  pending: z.enum(['tie', 'no-votes', 'host']).nullable(), leaders: z.array(GameKeySchema).nullable(),
  decision: z.object({ optionKey: GameKeySchema, reason: z.enum(['vote', 'host', 'tie-break', 'fallback']), resolution: z.enum(['majority', 'host', 'default', 'random']) }).strict().nullable(),
}).strict();
export const PublicStageSchema = z.object({
  id: GameIdSchema, nodeKey: GameKeySchema, stageKey: GameKeySchema,
  kind: z.enum(['collect', 'challenge', 'vote', 'route', 'info', 'scoreboard', 'minigame']), prompt: z.string().min(1).max(2000),
  input: InputSchema.nullable(), status: z.enum(['ACTIVE', 'CLOSED', 'VOID']),
  // Server clock. A running timed stage has deadlineAt; a paused one keeps the
  // frozen remainder instead. Both are null when the stage has no time limit.
  deadlineAt: z.string().datetime().nullable(), pausedRemainingMs: z.number().int().min(0).nullable(),
  // Progress is public; what was answered is not.
  submittedCount: z.number().int().min(0), eligibleCount: z.number().int().min(0),
  challenge: z.object({ maxAwardMilli: AwardMilliSchema, judgedPlayerIds: z.array(GameIdSchema), judgedTeamIds: z.array(GameIdSchema) }).strict().nullable(),
  teams: StageTeamsSchema.nullable(),
  route: PublicRouteSchema.nullable(),
  // Show-only scenes: an info scene's title, a scoreboard scene's standings selection.
  info: z.object({ title: z.string().min(1).max(120) }).strict().nullable(),
  scoreboard: z.object({ show: z.enum(['players', 'teams', 'both']) }).strict().nullable(),
  ballot: z.array(BallotEntrySchema).nullable(),
  minigame: PublicMinigameSchema.nullable(),
  // True when a later vote shows these answers without names; they are revealed by that vote.
  revealAfterVote: z.boolean(),
  revealed: z.boolean(), reveal: StageRevealSchema.nullable(),
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
  // Totals of the game's current teams, following that lineup's carryover rule.
  teamStandings: z.array(z.object({ teamId: GameIdSchema, name: z.string().min(1).max(60), memberIds: z.array(GameIdSchema), amountMilli: SignedMilliSchema }).strict()),
}).strict();
export type SessionView = z.infer<typeof SessionViewSchema>;

export const SessionChangedSchema = z.object({
  formatVersion: z.literal(1), type: z.literal('session.changed'), sessionId: GameIdSchema, revision: RevisionSchema,
}).strict();

export { PresentationSchema };
