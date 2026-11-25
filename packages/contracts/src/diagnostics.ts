import { z } from 'zod';

/**
 * Device logs: what happened on one phone or screen, sent by itself when something went wrong (an unexpected
 * server answer, a script error, a request that timed out) and once at the end of a game. The server adds its
 * own unexpected errors to the same list. Only the owner reads them, in Admin → Logs; they are kept 7 days.
 * A log never holds typed text, input values, tokens, keys, cookies or URL hashes.
 */
const text = (max: number) => z.string().transform(value => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max));

export const DEVICE_LOG_EVENTS_MAX = 300;
export const DEVICE_EVENT_KINDS = ['tap', 'request', 'command', 'error', 'connection', 'page'] as const;
export const DeviceEventSchema = z.object({
  /** Milliseconds since 1970 on the device's clock. */
  at: z.number().int().min(0).max(8.64e15),
  kind: z.enum(DEVICE_EVENT_KINDS),
  screen: text(40),
  /** "POST /api/arcade/lobbies/1a2b3c4d/start", "room.command round.start", "Start round (button)". */
  what: text(160),
  /** The answer's code ("GAME_UNAVAILABLE", "200", "timeout"). */
  code: text(60).optional(),
  requestId: text(36).optional(),
  ms: z.number().int().min(0).max(600_000).optional(),
  /** The same tap repeated this many times in a row (a tap race). */
  n: z.number().int().min(2).max(1_000_000).optional(),
}).strict();
export type DeviceEvent = z.input<typeof DeviceEventSchema>;

/** Round-trip and responsiveness figures for the whole log, not only the events kept. */
const TimingSchema = z.object({ count: z.number().int().min(0).max(1_000_000), median: z.number().int().min(0).max(600_000), max: z.number().int().min(0).max(600_000) }).strict();
export const DeviceStatsSchema = z.object({
  /** The room's heartbeat round trips. */
  heartbeat: TimingSchema.nullable(),
  /** Requests and confirmed commands. */
  requests: TimingSchema.nullable(),
  /** Moments the page was busy for 50 ms or more (Chrome and Edge report these). */
  longTasks: TimingSchema.nullable(),
  reconnects: z.number().int().min(0).max(100_000),
}).strict();
export type DeviceStats = z.infer<typeof DeviceStatsSchema>;

export const DEVICE_LOG_REASONS = ['problem', 'game_over'] as const;
export const DeviceLogReasonSchema = z.enum(DEVICE_LOG_REASONS);
export type DeviceLogReason = z.infer<typeof DeviceLogReasonSchema>;

/** Room for 300 events with every field at its limit; a typical log is a quarter of this. */
export const DEVICE_LOG_BODY_MAX = 160 * 1024;
export const NewDeviceLogSchema = z.object({
  /** Chosen by the device per report, so a retried send is stored once. */
  id: z.uuid(),
  reason: DeviceLogReasonSchema,
  /** The first thing that went wrong, in one line ("GAME_UNAVAILABLE on POST /api/arcade/…"). */
  summary: text(300),
  sessionId: z.uuid().nullable(),
  lobbyId: z.uuid().nullable(),
  /** The seat this device plays in, as the room told it. */
  playerId: z.uuid().nullable(),
  device: z.object({
    /** Random per browser tab. */
    id: text(40),
    role: z.enum(['host', 'player', 'display', 'other']),
    userAgent: text(300),
    viewport: z.object({ width: z.number().int().min(0).max(20_000), height: z.number().int().min(0).max(20_000) }).strict(),
  }).strict(),
  stats: DeviceStatsSchema,
  events: z.array(DeviceEventSchema).max(DEVICE_LOG_EVENTS_MAX),
}).strict();
export type NewDeviceLog = z.input<typeof NewDeviceLogSchema>;

/** An unexpected server error, recorded by the server itself. */
export const ServerProblemSchema = z.object({
  /** Where it happened: "POST /api/arcade/lobbies/:id/start" or "room.command round.start". */
  where: z.string(),
  message: z.string(),
  /** The first lines of the stack trace. */
  stack: z.array(z.string()),
  /** Who asked: "player", "owner", "member" or "unknown". Never a token. */
  actor: z.string(),
}).strict();
export type ServerProblem = z.infer<typeof ServerProblemSchema>;

export const LogSourceSchema = z.enum(['device', 'server']);
export const LogSummarySchema = z.object({
  id: z.uuid(),
  source: LogSourceSchema,
  reason: z.string(),
  summary: z.string(),
  sessionId: z.uuid().nullable(),
  lobbyId: z.uuid().nullable(),
  /** Room code or lobby name, when still known. */
  place: z.string().nullable(),
  /** "Player Sam", "Host screen", "Server". */
  who: z.string(),
  requestId: z.string().nullable(),
  createdAt: z.string(),
}).strict();
export type LogSummary = z.infer<typeof LogSummarySchema>;
export const LogListSchema = z.object({ items: z.array(LogSummarySchema) }).strict();
export type LogList = z.infer<typeof LogListSchema>;

export const LogDetailSchema = LogSummarySchema.extend({
  device: NewDeviceLogSchema.shape.device.nullable(),
  stats: DeviceStatsSchema.nullable(),
  events: z.array(DeviceEventSchema),
  server: ServerProblemSchema.nullable(),
  /** Server errors that belong to this device log: same request id, or the same room around the same time. */
  related: z.array(LogSummarySchema.extend({ server: ServerProblemSchema })),
}).strict();
export type LogDetail = z.infer<typeof LogDetailSchema>;
