import { z } from 'zod';
import { AutoRevealSecondsSchema, IdleCloseMinutesSchema, GameIdSchema, MAX_OPEN_INVITES, OPEN_INVITES_DEFAULT, ReclaimSeatSchema, REACTIONS, MUSIC_VOLUME_DEFAULT } from '@party/contracts';
import type { Config } from '../config.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { authorize, type Transaction, type TrustedActor } from '../game/model.js';
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
  idleCloseMinutes: IdleCloseMinutesSchema.default(0), keepOpen: z.boolean().default(false),
  autoRevealSeconds: AutoRevealSecondsSchema.nullable().default(null), hostPhonePlayerId: GameIdSchema.nullable().default(null),
  hostPhoneCredentialId: GameIdSchema.nullable().default(null),
  birthdayVote: z.boolean().default(false), birthdayVoters: z.array(GameIdSchema).default([]), birthdayReady: z.boolean().default(false),
  bannedPeople: z.array(GameIdSchema).default([]),
  reclaimApproval: z.boolean().default(false),
  // Host settings (see RoomSettingsSchema). Rooms saved before they existed get these defaults.
  showScores: z.boolean().default(true), reactions: z.boolean().default(true), autoClose: z.boolean().default(true), autoCloseSeconds: z.number().int().min(1).max(30).default(3),
  // Breaks: whether players may vote for one, how many must agree, who has voted, and when the running break began.
  breakVotes: z.boolean().default(true), breakPercent: z.number().int().min(10).max(100).default(50), breakVoters: z.array(GameIdSchema).max(200).default([]), breakStartedAt: z.string().datetime().nullable().default(null),
  chat: z.boolean().default(false),
  reactionLimit: z.number().int().min(1).max(30).default(10), reactionChoices: z.array(z.number().int().min(0).max(REACTIONS.length - 1)).min(1).max(REACTIONS.length).default(REACTIONS.map((_, index) => index)),
  // Side games on the phones while waiting, and whether they use chips (slot machine, blackjack, packs, stakes in challenges).
  // New rooms store both (games on, chips off, unless the game says otherwise); the defaults only cover rooms opened
  // before that, which keep both on as they had.
  sideGames: z.boolean().default(true), chips: z.boolean().default(true),
  // Challenges one player may have waiting for an answer at once (from the game, 3 unless it says otherwise).
  openInvites: z.number().int().min(1).max(MAX_OPEN_INVITES).default(OPEN_INVITES_DEFAULT),
  // Players confirm a new look (picture, drawing, character) before it is used; off: every choice is used at once.
  confirmLooks: z.boolean().default(false),
  // The host's quick time button: seconds it adds (from the game, 30 unless it says otherwise).
  quickTimeSeconds: z.number().int().min(5).max(600).default(30),
  // The game's music on the shared screen: playing or not, and how loud (0 to 100).
  music: z.boolean().default(true), musicVolume: z.number().int().min(0).max(100).default(MUSIC_VOLUME_DEFAULT),
  // Set when the host went back to the lobby: the fresh room everyone moves into (see restart.ts).
  nextRoom: GameIdSchema.nullable().default(null),
  roomClosed: z.boolean().default(false),
  seatRequests: z.array(RequestSchema).max(50).default([]),
  // People in the room (room-people.ts): guests may make their own account while joining; the people the host
  // added to this room, and phones asking to sign in as one of them (the host approves each).
  signup: z.boolean().default(false),
  // Phones on the test bench (several in one browser, rooms/test-seats.ts) may join only when the host allows it;
  // opening the test bench switches it on.
  testBench: z.boolean().default(false),
  // Set only by the authenticated local rehearsal launcher.
  tryout: z.boolean().default(false),
  expected: z.array(GameIdSchema).max(100).default([]),
  nameRequests: z.array(z.object({ id: GameIdSchema, personId: GameIdSchema, status: z.enum(['PENDING', 'APPROVED', 'DENIED', 'USED']), requestedAt: z.string().datetime() }).strict()).max(50).default([]),
}).strict();
export type RoomState = z.infer<typeof RoomStateSchema>;
export const readRoomState = (value: unknown): RoomState => { const parsed = RoomStateSchema.safeParse(value); return parsed.success ? parsed.data : RoomStateSchema.parse({}); };
export function isHostPhone(state: RoomState, actor: TrustedActor): boolean {
  return actor.role === 'player' && state.hostPhonePlayerId === actor.playerId
    && actor.credentialProof?.kind === 'player' && state.hostPhoneCredentialId === actor.credentialProof.id;
}
const live = (state: RoomState, now: number) => state.seatRequests.filter(request => now - Date.parse(request.requestedAt) < REQUEST_MS);
export const pendingRequests = (state: RoomState, now = Date.now()) => live(state, now).filter(request => request.status === 'PENDING');

export function createSeatReclaim(client: PrismaClient, config: Config, connected: (sessionId: string) => Set<string>, kick: (sessionId: string, playerId: string) => void) {
  const save = (tx: Transaction, sessionId: string, state: RoomState) => tx.gameSession.update({ where: { id: sessionId }, data: { state: { ...state } } });
  async function grant(tx: Transaction, sessionId: string, playerId: string, token: string) {
    await tx.playerCredential.updateMany({ where: { sessionId, playerId, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.playerCredential.create({ data: { sessionId, playerId, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + PLAYER_ACCESS_MS) } });
    const session = await tx.gameSession.findUniqueOrThrow({ where: { id: sessionId }, select: { state: true } });
    const state = readRoomState(session.state);
    if (state.hostPhonePlayerId === playerId) await save(tx, sessionId, { ...state, hostPhonePlayerId: null, hostPhoneCredentialId: null });
    await recordRoomChange(tx, sessionId, 'seat.reclaimed');
  }
  return {
    /** Seats a new phone may take over: joined, not removed by the host, and with no phone connected right now. */
    async seats(roomCode: string) {
      const room = await client.gameSession.findUnique({ where: { roomCode }, select: { id: true, status: true, state: true, arcadeRound: { select: { id: true } }, players: { where: { leftAt: null }, select: { id: true, displayName: true }, orderBy: { joinedAt: 'asc' } } } });
      roomAssert(room && room.status !== 'FINISHED' && !room.arcadeRound, 'ROOM_NOT_AVAILABLE');
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
      const room = await client.gameSession.findUnique({ where: { roomCode }, select: { id: true, arcadeRound: { select: { id: true } } } });
      // An arcade round's seats belong to its lobby's members: no taking them over by room code.
      roomAssert(room && !room.arcadeRound, 'ROOM_NOT_AVAILABLE');
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
    async setSettings(sessionId: string, principal: Principal, settings: Partial<Pick<RoomState, 'reclaimApproval' | 'showScores' | 'reactions' | 'chat' | 'autoClose' | 'autoCloseSeconds' | 'breakVotes' | 'breakPercent' | 'reactionLimit' | 'reactionChoices' | 'sideGames' | 'chips' | 'openInvites' | 'confirmLooks' | 'quickTimeSeconds' | 'music' | 'musicVolume' | 'signup' | 'testBench' | 'keepOpen' | 'autoRevealSeconds'>>) {
      const updated = Object.keys(settings);
      const onlyReveal = updated.length === 1 && updated[0] === 'autoRevealSeconds';
      roomAssert(principal.role === 'host' || (principal.role === 'player' && onlyReveal), 'FORBIDDEN');
      await client.$transaction(async tx => {
        await lockRoom(tx, sessionId);
        const session = await tx.gameSession.findUniqueOrThrow({ where: { id: sessionId } }); await authorize(tx, session, principal.actor);
        const state = readRoomState(session.state);
        if (principal.role !== 'host') roomAssert(isHostPhone(state, principal.actor), 'FORBIDDEN');
        // Turning approval off does not silently grant waiting requests; the host still answers those.
        await save(tx, sessionId, { ...state, ...settings });
        if (settings.keepOpen !== undefined) await tx.gameSession.update({ where: { id: sessionId }, data: { idleCloseAt: null } });
        await recordRoomChange(tx, sessionId, 'room.settings');
      });
    },
  };
}
