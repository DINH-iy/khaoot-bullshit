import { z } from 'zod';
import { GameIdSchema, GameErrorCodeSchema, SessionViewSchema } from './game.js';

export const RoomCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z2-9]{6}$/);
export const JoinRoomSchema = z.object({
  roomCode: RoomCodeSchema, joinId: GameIdSchema,
  displayName: z.string().trim().min(1).max(40),
}).strict();
export const ClaimRoomSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
export const ConnectRoomSchema = z.object({ sessionId: GameIdSchema, display: z.literal(true).optional() }).strict();
export const NetworkErrorCodeSchema = z.enum([
  ...GameErrorCodeSchema.options, 'UNAUTHORIZED', 'CREDENTIAL_EXPIRED', 'AUTH_UNAVAILABLE', 'ROOM_NOT_AVAILABLE', 'RATE_LIMITED', 'ORIGIN_REJECTED',
]);
export type NetworkErrorCode = z.infer<typeof NetworkErrorCodeSchema>;
export type RoomReply<T> = { ok: true; data: T } | { ok: false; error: { code: NetworkErrorCode } };
export const RoomSnapshotSchema = z.object({
  view: SessionViewSchema, roomCode: RoomCodeSchema,
  role: z.enum(['host', 'player', 'display']), selfPlayerId: GameIdSchema.nullable(),
  players: z.array(z.object({ id: GameIdSchema, displayName: z.string().min(1).max(40), connected: z.boolean() }).strict()),
}).strict();
export type RoomSnapshot = z.infer<typeof RoomSnapshotSchema>;
export const HeartbeatSchema = z.object({ nonce: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }).strict();
export const HeartbeatReplySchema = z.object({ nonce: z.string(), serverTime: z.string().datetime() }).strict();
