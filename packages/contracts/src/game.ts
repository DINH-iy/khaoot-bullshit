import { z } from 'zod';

export const GameKeySchema = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
export const GameIdSchema = z.string().uuid().transform(value => value.toLowerCase());
export const RevisionSchema = z.number().int().min(0).max(2_147_483_646);
// Public JSON represents exact fixed-point points as decimal integer strings.
export const AwardMilliSchema = z.string().regex(/^(0|[1-9][0-9]{0,11})$/);
export const ChoiceOptionSchema = z.object({ key: GameKeySchema, label: z.string().trim().min(1).max(240) }).strict();
export const InputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('choice'), options: z.array(ChoiceOptionSchema).min(2).max(12) }).strict().refine(
    input => new Set(input.options.map(option => option.key)).size === input.options.length, 'Choice keys must be unique',
  ),
  z.object({ kind: z.literal('text'), maxLength: z.number().int().min(1).max(2000) }).strict(),
  // Reserved contracts; asset validation/creation services must exist before execution.
  z.object({ kind: z.literal('drawing'), maxStrokes: z.number().int().min(1).max(2000) }).strict(),
]);
export const SubmissionValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('choice'), choiceKey: GameKeySchema }).strict(),
  z.object({ kind: z.literal('text'), text: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ kind: z.literal('drawing'), assetId: GameIdSchema }).strict(),
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
  // Concurrent players do not depend on a global session revision. The stage ID
  // binds the answer to its original stage, including after a reconnect.
  z.object({ ...envelope, type: z.literal('submission.submit'), stageRunId: GameIdSchema, value: SubmissionValueSchema }).strict(),
]);
export type GameCommand = z.infer<typeof GameCommandSchema>;
export const CommandReceiptSchema = z.object({
  formatVersion: z.literal(1), commandId: GameIdSchema, sessionId: GameIdSchema,
  revision: RevisionSchema, type: z.enum(GameCommandSchema.options.map(option => option.shape.type.value)),
  stageRunId: GameIdSchema.nullable(), submissionId: GameIdSchema.nullable(),
}).strict();
export type CommandReceipt = z.infer<typeof CommandReceiptSchema>;

export const GameErrorCodeSchema = z.enum([
  'INVALID_COMMAND', 'INVALID_DEFINITION', 'UNSUPPORTED_FEATURE', 'FORBIDDEN', 'NOT_FOUND',
  'REVISION_CONFLICT', 'COMMAND_KEY_REUSED', 'INVALID_STATE', 'INELIGIBLE',
  'ALREADY_SUBMITTED', 'ALREADY_JUDGED', 'INVALID_SUBMISSION', 'GAME_UNAVAILABLE',
]);
export type GameErrorCode = z.infer<typeof GameErrorCodeSchema>;

export const PublicStageSchema = z.object({
  id: GameIdSchema, nodeKey: GameKeySchema, stageKey: GameKeySchema,
  kind: z.enum(['collect', 'challenge']), prompt: z.string().min(1).max(2000),
  input: InputSchema.nullable(), status: z.enum(['ACTIVE', 'CLOSED', 'VOID']),
}).strict();
export const SessionViewSchema = z.object({
  formatVersion: z.literal(1), sessionId: GameIdSchema, revision: RevisionSchema,
  status: z.enum(['LOBBY', 'RUNNING', 'PAUSED', 'RECOVERING', 'FINISHED']),
  title: z.string().min(1).max(160), stage: PublicStageSchema.nullable(),
  ownSubmission: z.object({ id: GameIdSchema, value: SubmissionValueSchema }).strict().nullable(),
  // Only closed-stage scores are visible; awards on an open quiz are private.
  standings: z.array(z.object({ playerId: GameIdSchema, amountMilli: z.string().regex(/^-?(0|[1-9][0-9]*)$/) }).strict()),
}).strict();
export type SessionView = z.infer<typeof SessionViewSchema>;

export const SessionChangedSchema = z.object({
  formatVersion: z.literal(1), type: z.literal('session.changed'), sessionId: GameIdSchema, revision: RevisionSchema,
}).strict();
