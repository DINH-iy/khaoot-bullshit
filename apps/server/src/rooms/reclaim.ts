import { z } from 'zod';
import { GameIdSchema, ReclaimSeatSchema } from '@party/contracts';
import type { Config } from '../config.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { authorize, type Transaction } from '../game/model.js';
import { lockRoom, recordRoomChange, type Principal } from './gateway.js';
import { joinToken, roomAssert, tokenHash } from './security.js';

// Seat takeover: a player whose phone died continues on another phone. Only a
// seat with no phone connected can be requested. Whether the host must approve
// is a room setting the host changes at any time. Approval replaces the seat's
// credentials, so the old phone loses access; scores and answers stay with the seat.
const REQUEST_MS = 10 * 60 * 1000;
const PLAYER_ACCESS_MS = 4 * 60 * 60 * 1000;
const RequestSchema = z.object({ id: GameIdSchema, playerId: GameIdSchema, status: z.enum(['PENDING', 'APPROVED', 'DENIED']), requestedAt: z.string().datetime() }).strict();
export const RoomStateSchema = z.object({
  reclaimApproval: z.boolean().default(false),
  // Host settings (see RoomSettingsSchema). Rooms saved before they existed get these defaults.
  showScores: z.boolean().default(true), reactions: z.boolean().default(true), autoClose: z.boolean().default(true),
  seatRequests: z.array(RequestSchema).max(50).default([]),
}).strict();
export type RoomState = z.infer<typeof RoomStateSchema>;
export const readRoomState = (value: unknown): RoomState => { const parsed = RoomStateSchema.safeParse(value); return parsed.success ? parsed.data : RoomStateSchema.parse({}); };
const live = (state: RoomState, now: number) => state.seatRequests.filter(request => now - Date.parse(request.requestedAt) < REQUEST_MS);
export const pendingRequests = (state: RoomState, now = Date.now()) => live(state, now).filter(request => request.status === 'PENDING');

export function createSeatReclaim(client: PrismaClient, config: Config, connected: (sessionId: string) => Set<string>, kick: (sessionId: string, playerId: string) => void) {
  const save = (tx: Transaction, sessionId: string, state: RoomState) => tx.gameSession.update({ where: { id: sessionId }, data: { state: { ...state } } });
  async function grant(tx: Transaction, sessionId: string, playerId: string, token: string) {
    await tx.playerCredential.updateMany({ where: { sessionId, playerId, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.playerCredential.create({ data: { sessionId, playerId, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + PLAYER_ACCESS_MS) } });
    await recordRoomChange(tx, sessionId, 'seat.reclaimed');
  }
  return {
    /** Seats a new phone may take over: joined, not removed by the host, and with no phone connected right now. */
    async seats(roomCode: string) {
      const room = await client.gameSession.findUnique({ where: { roomCode }, select: { id: true, status: true, state: true, players: { where: { leftAt: null }, select: { id: true, displayName: true }, orderBy: { joinedAt: 'asc' } } } });
      roomAssert(room && room.status !== 'FINISHED', 'ROOM_NOT_AVAILABLE');
      const online = connected(room.id);
      return { approval: readRoomState(room.state).reclaimApproval, seats: room.players.filter(player => !online.has(player.id)) };
    },
    /**
     * Asks for a seat, or checks on an earlier ask: the same request ID always
     * maps to the same access, so a phone simply repeats this call while it waits.
     */
    async request(input: unknown) {
      const parsed = ReclaimSeatSchema.safeParse(input); roomAssert(parsed.success, 'INVALID_COMMAND');
      roomAssert(config.ROOM_TOKEN_SECRET, 'AUTH_UNAVAILABLE'); const { roomCode, playerId, requestId } = parsed.data;
      const room = await client.gameSession.findUnique({ where: { roomCode }, select: { id: true } }); roomAssert(room, 'ROOM_NOT_AVAILABLE');
      const sessionId = room.id; const token = joinToken(config.ROOM_TOKEN_SECRET, sessionId, `reclaim:${requestId}`);
      const outcome = await client.$transaction(async tx => {
        await lockRoom(tx, sessionId);
        const session = await tx.gameSession.findUniqueOrThrow({ where: { id: sessionId } });
        roomAssert(session.status !== 'FINISHED' && (config.NODE_ENV !== 'production' || session.mode !== 'REHEARSAL'), 'ROOM_NOT_AVAILABLE');
        const state = readRoomState(session.state); const now = Date.now();
        const existing = state.seatRequests.find(request => request.id === requestId);
        if (existing) {
          roomAssert(existing.playerId === playerId, 'INVALID_COMMAND');
          if (existing.status === 'APPROVED') {
            const credential = await tx.playerCredential.findUnique({ where: { tokenHash: tokenHash(token) } });
            roomAssert(credential && !credential.revokedAt && credential.expiresAt.getTime() > now, 'SEAT_UNAVAILABLE');
            return { status: 'approved' as const, expiresAt: credential.expiresAt };
          }
          roomAssert(existing.status === 'PENDING', 'SEAT_DENIED');
          roomAssert(now - Date.parse(existing.requestedAt) < REQUEST_MS, 'SEAT_UNAVAILABLE');
          return { status: 'pending' as const };
        }
        const seat = await tx.sessionPlayer.findFirst({ where: { id: playerId, sessionId, leftAt: null }, select: { id: true } });
        roomAssert(seat && !connected(sessionId).has(playerId), 'SEAT_UNAVAILABLE');
        const kept = live(state, now);
        roomAssert(kept.filter(request => request.status === 'PENDING').length < 20, 'RATE_LIMITED');
        const request = { id: requestId, playerId, status: state.reclaimApproval ? 'PENDING' as const : 'APPROVED' as const, requestedAt: new Date(now).toISOString() };
        await save(tx, sessionId, { ...state, seatRequests: [...kept, request] });
        if (!state.reclaimApproval) { await grant(tx, sessionId, playerId, token); return { status: 'approved' as const, expiresAt: new Date(now + PLAYER_ACCESS_MS), kick: true }; }
        await recordRoomChange(tx, sessionId, 'seat.requested');
        return { status: 'pending' as const };
      });
      if ('kick' in outcome) kick(sessionId, playerId);
      return { sessionId, token, ...outcome };
    },
    /** The host approves or denies a pending request. Approval works even if the old phone came back. */
    async decide(sessionId: string, principal: Principal, requestId: string, approve: boolean) {
      roomAssert(principal.role === 'host', 'FORBIDDEN'); roomAssert(config.ROOM_TOKEN_SECRET, 'AUTH_UNAVAILABLE');
      const playerId = await client.$transaction(async tx => {
        await lockRoom(tx, sessionId);
        const session = await tx.gameSession.findUniqueOrThrow({ where: { id: sessionId } }); await authorize(tx, session, principal.actor);
        const state = readRoomState(session.state);
        const request = pendingRequests(state).find(candidate => candidate.id === requestId); roomAssert(request, 'NOT_FOUND');
        const seat = await tx.sessionPlayer.findFirst({ where: { id: request.playerId, sessionId, leftAt: null }, select: { id: true } });
        const approved = approve && Boolean(seat);
        // Approving one request for a seat turns down the others for that seat.
        await save(tx, sessionId, { ...state, seatRequests: state.seatRequests.map(candidate => candidate.id === requestId ? { ...candidate, status: approved ? 'APPROVED' : 'DENIED' }
          : approved && candidate.playerId === request.playerId && candidate.status === 'PENDING' ? { ...candidate, status: 'DENIED' } : candidate) });
        if (approved) await grant(tx, sessionId, request.playerId, joinToken(config.ROOM_TOKEN_SECRET!, sessionId, `reclaim:${requestId}`));
        else await recordRoomChange(tx, sessionId, 'seat.denied');
        roomAssert(!approve || approved, 'SEAT_UNAVAILABLE');
        return approved ? request.playerId : null;
      });
      if (playerId) kick(sessionId, playerId);
    },
    async setSettings(sessionId: string, principal: Principal, settings: Partial<Pick<RoomState, 'reclaimApproval' | 'showScores' | 'reactions' | 'autoClose'>>) {
      roomAssert(principal.role === 'host', 'FORBIDDEN');
      await client.$transaction(async tx => {
        await lockRoom(tx, sessionId);
        const session = await tx.gameSession.findUniqueOrThrow({ where: { id: sessionId } }); await authorize(tx, session, principal.actor);
        const state = readRoomState(session.state);
        // Turning approval off does not silently grant waiting requests; the host still answers those.
        await save(tx, sessionId, { ...state, ...settings });
        await recordRoomChange(tx, sessionId, 'room.settings');
      });
    },
  };
}
