import { z } from 'zod';
import { GameIdSchema, GameErrorCodeSchema, SessionViewSchema } from './game.js';
import { PlayerLookSchema } from './players.js';

export const RoomCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z2-9]{6}$/);
export const JoinRoomSchema = z.object({
  roomCode: RoomCodeSchema, joinId: GameIdSchema,
  displayName: z.string().trim().min(1).max(40),
  // The look this phone used last time, if any.
  look: PlayerLookSchema.optional(),
}).strict();
export const ClaimRoomSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
export const ConnectRoomSchema = z.object({ sessionId: GameIdSchema, display: z.literal(true).optional() }).strict();
export const NetworkErrorCodeSchema = z.enum([
  ...GameErrorCodeSchema.options, 'UNAUTHORIZED', 'CREDENTIAL_EXPIRED', 'AUTH_UNAVAILABLE', 'ROOM_NOT_AVAILABLE', 'RATE_LIMITED', 'ORIGIN_REJECTED', 'FILE_TOO_LARGE', 'UNSUPPORTED_MEDIA', 'STORAGE_FULL', 'SEAT_UNAVAILABLE', 'SEAT_DENIED',
]);
export type NetworkErrorCode = z.infer<typeof NetworkErrorCodeSchema>;
export type RoomReply<T> = { ok: true; data: T } | { ok: false; error: { code: NetworkErrorCode } };
export const RoomSnapshotSchema = z.object({
  view: SessionViewSchema, roomCode: RoomCodeSchema,
  role: z.enum(['host', 'player', 'display']), selfPlayerId: GameIdSchema.nullable(),
  players: z.array(z.object({ id: GameIdSchema, displayName: z.string().min(1).max(40), connected: z.boolean(), look: PlayerLookSchema }).strict()),
  settings: z.object({ reclaimApproval: z.boolean(), showScores: z.boolean(), reactions: z.boolean(), autoClose: z.boolean(), reactionLimit: z.number().int(), reactionChoices: z.array(z.number().int()) }).strict(),
  // Host only: new phones waiting to take over a seat. Empty for everyone else.
  seatRequests: z.array(z.object({ requestId: GameIdSchema, playerId: GameIdSchema, requestedAt: z.string().datetime() }).strict()),
}).strict();
// Seat takeover from a new phone. The request ID is created by that phone and
// kept while it waits; repeating the request checks on it.
export const ReclaimSeatSchema = z.object({ roomCode: RoomCodeSchema, playerId: GameIdSchema, requestId: GameIdSchema }).strict();
export const SeatListSchema = z.object({ approval: z.boolean(), seats: z.array(z.object({ id: GameIdSchema, displayName: z.string().min(1).max(40) }).strict()) }).strict();
export const SeatDecisionSchema = z.object({ requestId: GameIdSchema, approve: z.boolean() }).strict();
/** Emoji and stickers players can send to the shared screen. A reaction is its position in this list. */
export const REACTIONS = ['👍', '😂', '🔥', '😮', '😱', '👏', '❤️', '🎉', '🤔', '💀', '🙈', '🍻', 'GG', 'LOL', 'NOOO', 'YES!', 'WOW', 'BOO'] as const;
// Host settings for the room; send only what changes.
// `showScores`: players and the shared screen see the scoreboard during the game (else only at scoreboard scenes and the end).
// `reactions`: players may send emoji and stickers to the shared screen. `autoClose`: a round closes 3 seconds after everyone answered.
// `reactionLimit`: reactions each player may send per 10 seconds. `reactionChoices`: which of REACTIONS are allowed (positions in the list).
export const RoomSettingsSchema = z.object({ reclaimApproval: z.boolean(), showScores: z.boolean(), reactions: z.boolean(), autoClose: z.boolean(),
  reactionLimit: z.number().int().min(1).max(30), reactionChoices: z.array(z.number().int().min(0).max(REACTIONS.length - 1)).min(1).max(REACTIONS.length).refine(list => new Set(list).size === list.length, 'Each reaction once') }).partial().strict()
  .refine(settings => Object.keys(settings).length > 0, 'Change at least one setting');
export const ReactionSchema = z.object({ reaction: z.number().int().min(0).max(REACTIONS.length - 1) }).strict();
export type RoomSnapshot = z.infer<typeof RoomSnapshotSchema>;
import { MediaKindSchema } from './game.js';
import { GameSummarySchema } from './authoring.js';
export const UploadedAssetSchema = z.object({ assetId: GameIdSchema, mediaKind: MediaKindSchema }).strict();
export const HeartbeatSchema = z.object({ nonce: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }).strict();
export const HeartbeatReplySchema = z.object({ nonce: z.string(), serverTime: z.string().datetime() }).strict();

// Browser hosting menu. Lists only titles and shape, never prompts or answers.
export const HostGameSchema = z.object({ key: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/), title: z.string().min(1).max(160), description: z.string().max(240), stageCount: z.number().int().min(1), timed: z.boolean(), branches: z.boolean(),
  // For the menu: what is in the game, about how long it takes, and its colours (for the cover).
  features: z.array(z.enum(['quiz', 'order', 'writing', 'drawing', 'uploads', 'votes', 'minigames', 'challenges', 'teams', 'routes'])), minutes: z.number().int().min(1),
  colors: z.object({ from: z.string(), to: z.string(), accent: z.string() }).strict() }).strict();
export const HostMenuSchema = z.object({
  games: z.array(HostGameSchema),
  // The owner's own games, with their draft and publishing state.
  myGames: z.array(GameSummarySchema),
  rooms: z.array(z.object({ sessionId: GameIdSchema, roomCode: RoomCodeSchema, title: z.string().min(1).max(160), status: SessionViewSchema.shape.status, playerCount: z.number().int().min(0) }).strict()),
}).strict();
export type HostMenu = z.infer<typeof HostMenuSchema>;
// Open a room for a built-in game (`gameKey`) or for the latest published version of one of your games (`gameId`).
export const HostRoomSchema = z.object({ gameKey: HostGameSchema.shape.key.optional(), gameId: GameIdSchema.optional(), sessionId: GameIdSchema, commandId: GameIdSchema }).strict()
  .refine(input => (input.gameKey === undefined) !== (input.gameId === undefined), 'Choose a built-in game or one of your games');

// The public look of a room, for its join screen: title, texts and theme only.
export const RoomLookSchema = z.object({ title: z.string().min(1).max(160), presentation: z.object({ texts: z.record(z.string(), z.string()), animations: z.record(z.string(), z.unknown()), themes: z.array(z.unknown()).max(2) }).strict() }).strict();
