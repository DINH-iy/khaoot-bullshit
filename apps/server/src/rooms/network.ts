import { Server } from 'socket.io';
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ChatModerationSchema, ChatSendSchema, HOST_PHONE_COMMANDS, ClaimRoomSchema, CommandReceiptSchema, ConnectRoomSchema, RoomCodeSchema, RoomLookSchema, RoomSettingsSchema, SeatDecisionSchema, SeatListSchema, ExpectedPeopleSchema, GameIdSchema, HeartbeatSchema, RoomSnapshotSchema, SessionChangedSchema, type RoomReply, PlayerLookSchema, defaultLook } from '@party/contracts';
import type { Config } from '../config.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { TokenVerifier } from '../auth/auth.js';
import { AuthenticationUnavailable } from '../auth/auth.js';
import { GameError } from '../game/errors.js';
import { revealDueStages } from '../game/auto-reveal.js';
import { createGameService } from '../game/service.js';
import { readSessionView } from '../game/views.js';
import { actorKey, authorize } from '../game/model.js';
import { closeExpiredStages } from '../game/timing.js';
import { parseDefinition } from '../game/definition.js';
import { createRoomGateway, lockRoom, recordRoomChange, type Principal } from './gateway.js';
import { createSeatReclaim, isHostPhone, pendingRequests, readRoomState } from './reclaim.js';
import { createRoomPeople } from './room-people.js';
import { connectionCookies, SEAT_HEADER, seatOf } from './test-seats.js';
import { closeRoom } from './close.js';
import { reconcileEmptyRooms } from './idle-close.js';
import { followRoom } from './restart.js';
import { createLiveSignals } from '../minigames/tap-race/live.js';
import { registerMinigameEvents } from './minigame-events.js';
import { createRoomChat } from './chat.js';
import { registerReactions } from './reactions.js';
import { breakVotesNeeded, createBreaks } from './breaks.js';
import { personCookie, personFromCookie } from '../people/identity.js';
import { allowedOrigin, cookieName, newToken, RateLimiter, RoomError, roomAssert, roomCookie, tokenHash } from './security.js';
import { clientAddress } from '../http/client-address.js';
import { decideDueVotes } from '../minigames/shared/steps/engine.js';
import { arcadeLink } from '../arcade/link.js';

export function registerRoomNetworking(app: FastifyInstance, client: PrismaClient, config: Config, verifier?: TokenVerifier) {
  const gateway = createRoomGateway(client, config); const limiter = new RateLimiter();
  let shuttingDown = false; let publishing = false;
  const io = new Server(app.server, { serveClient: false, connectTimeout: 5000, maxHttpBufferSize: 16 * 1024, pingInterval: 10000, pingTimeout: 10000,
    perMessageDeflate: false, allowRequest: (request, callback) => callback(null, !shuttingDown && io.engine.clientsCount < 512 && allowedOrigin(request.headers, config)),
  });
  const live = createLiveSignals();
  const service = createGameService(client, event => app.log.info({ event: 'game_command', ...event }, 'Game command completed'), undefined, live.signals);
  const minigames = registerMinigameEvents(io, client, live, app.log);
  const reactions = registerReactions(io, client); const chat = createRoomChat(client); const breaks = createBreaks(client, service);
  const failure = (error: unknown): RoomReply<never> => {
    const code = error instanceof RoomError || error instanceof GameError ? error.code : 'GAME_UNAVAILABLE';
    app.log.warn({ event: 'room_request_rejected', code }, 'Room request rejected');
    return { ok: false, error: { code } };
  };
  const cookie = (request: FastifyRequest) => request.headers.cookie;
  const sessionId = (request: FastifyRequest) => { const parsed = GameIdSchema.safeParse((request.params as { sessionId?: string }).sessionId); roomAssert(parsed.success, 'INVALID_COMMAND'); return parsed.data; };
  const requireOrigin = (request: FastifyRequest) => {
    roomAssert(request.headers['x-party-request'] === '1' && allowedOrigin(request.headers, config), 'ORIGIN_REJECTED');
    roomAssert(limiter.allow(`http:${request.ip}`, 240), 'RATE_LIMITED');
  };
  // Single-backend presence: which seats have a phone connected to this process right now.
  const connectedPlayers = (id: string) => {
    const connected = new Set<string>();
    for (const socket of io.sockets.sockets.values()) {
      const peer = socket.data['principal'] as Principal | undefined;
      if (peer?.sessionId === id && peer.actor.role === 'player') connected.add(peer.actor.playerId);
    }
    return connected;
  };
  // Whether a shared screen of this room is connected to this process: it plays the videos and songs.
  const displayConnected = (id: string) => [...io.sockets.sockets.values()].some(socket => { const peer = socket.data['principal'] as Principal | undefined; return peer?.sessionId === id && peer.role === 'display'; });
  const hasPresence = (id: string) => Boolean(io.sockets.adapter.rooms.get(`host:${id}`)?.size || io.sockets.adapter.rooms.get(`player:${id}`)?.size);
  const occupiedRooms = () => new Set([...io.sockets.sockets.values()].flatMap(socket => {
    const peer = socket.data['principal'] as Principal;
    return peer.role === 'display' ? [] : [peer.sessionId];
  }));
  const hostPhoneActor = async (principal: Principal) => {
    if (principal.actor.role !== 'player') return principal.actor;
    const room = await client.gameSession.findUniqueOrThrow({ where: { id: principal.sessionId }, select: { hostId: true } });
    return { role: 'host' as const, creatorId: room.hostId, actingPlayerId: principal.actor.playerId, credentialProof: principal.actor.credentialProof };
  };
  const people = createRoomPeople(client, config);
  const seats = createSeatReclaim(client, config, connectedPlayers, (id, playerId) => { io.in(`player:${id}:${playerId}`).disconnectSockets(true); });
  const snapshot = async (principal: Principal) => {
    const selfId = principal.actor.role === 'player' ? principal.actor.playerId : null;
    const [view, players, session, arcade] = await Promise.all([
      readSessionView(client, principal.actor, principal.sessionId),
      client.sessionPlayer.findMany({ where: { sessionId: principal.sessionId, leftAt: null }, select: { id: true, displayName: true, look: true, personId: true }, orderBy: { joinedAt: 'asc' } }),
      client.gameSession.findUniqueOrThrow({ where: { id: principal.sessionId }, select: { roomCode: true, state: true } }),
      arcadeLink(client, principal.sessionId, selfId),
    ]);
    const connected = connectedPlayers(principal.sessionId); const state = readRoomState(session.state);
    const hostPhone = isHostPhone(state, principal.actor);
    // Secret scores: phones and the shared screen get no standings during the game, only at a scoreboard scene and at the end. The host always sees them.
    const scoresOpen = state.showScores || principal.role === 'host' || view.status === 'FINISHED' || (view.stage?.kind === 'scoreboard' && view.stage.status === 'ACTIVE');
    // "Most reactions" comes from the room's own count; without one, the slide is left out.
    const reacted = view.awards?.some(slide => slide.stat === 'mostReactions') ? reactions.most(principal.sessionId) : null;
    const awards = view.awards?.flatMap(slide => slide.stat !== 'mostReactions' ? [slide] : reacted ? [{ ...slide, playerIds: reacted.playerIds, value: `${reacted.count} ${reacted.count === 1 ? 'reaction' : 'reactions'}` }] : []) ?? null;
    const shown = { ...(scoresOpen ? view : { ...view, standings: [], teamStandings: [] }), awards };
    // The host also sees the people added to the room and the phones asking to sign in as one of them.
    const roomPeople = principal.role === 'host' ? await people.hostView(principal.sessionId, state) : { expected: [], nameRequests: [] };
    return RoomSnapshotSchema.parse({ view: shown, roomCode: session.roomCode, role: principal.role, displayConnected: displayConnected(principal.sessionId), ...(selfId && state.hostPhonePlayerId !== selfId && state.birthdayVote && ['RUNNING', 'PAUSED'].includes(view.status)
        ? { birthdayVote: { voted: state.birthdayVoters.includes(selfId), ready: state.birthdayReady } } : {}),
      hostPhone, ...(principal.role === 'host' ? { hostPhonePlayerId: state.hostPhonePlayerId } : {}), selfPlayerId: principal.actor.role === 'player' ? principal.actor.playerId : null,
      // A stored look that no longer fits the parts list falls back to the default.
      players: players.map(player => { const look = PlayerLookSchema.safeParse(player.look); return { id: player.id, displayName: player.displayName, look: look.success ? look.data : defaultLook(player.id), connected: connected.has(player.id), ...(principal.role === 'host' && player.personId ? { canBan: true } : {}) }; }), settings: { reclaimApproval: state.reclaimApproval, showScores: state.showScores, reactions: state.reactions, chat: state.chat, autoClose: state.autoClose, autoCloseSeconds: state.autoCloseSeconds, breakVotes: state.breakVotes, breakPercent: state.breakPercent, reactionLimit: state.reactionLimit, reactionChoices: state.reactionChoices, sideGames: state.sideGames, chips: state.chips, openInvites: state.openInvites, confirmLooks: state.confirmLooks, quickTimeSeconds: state.quickTimeSeconds, music: state.music, musicVolume: state.musicVolume, signup: state.signup, testBench: state.testBench, ...(principal.role === 'host' ? { idleCloseMinutes: state.idleCloseMinutes, keepOpen: state.keepOpen } : {}),
        ...(principal.role === 'host' || hostPhone ? { autoRevealSeconds: state.autoRevealSeconds } : {}) },
      break: { active: Boolean(state.breakStartedAt) && view.status === 'PAUSED', startedAt: state.breakStartedAt, votes: state.breakVoters.length, needed: breakVotesNeeded(state.breakPercent, players.length), voted: Boolean(selfId && state.breakVoters.includes(selfId)) },
      seatRequests: principal.role === 'host' ? pendingRequests(state).map(request => ({ requestId: request.id, playerId: request.playerId, requestedAt: request.requestedAt })) : [], ...roomPeople, nextRoom: state.nextRoom, roomClosed: state.roomClosed, arcade });
  };

  app.post('/api/rooms/join', async (request, reply) => {
    try {
      requireOrigin(request); roomAssert(limiter.allow(`join:${request.ip}`, 120), 'RATE_LIMITED');
      const signedIn = await personFromCookie(client, request.headers.cookie);
      const joined = await gateway.join(request.body, signedIn ? { id: signedIn.person.id, name: signedIn.person.name, look: signedIn.person.look } : null, Boolean(seatOf(request.headers[SEAT_HEADER])));
      reply.header('set-cookie', roomCookie(config, joined.sessionId, joined.token, joined.expiresAt));
      return { ok: true, data: { sessionId: joined.sessionId } };
    } catch (error) { return reply.code(error instanceof RoomError && error.code === 'RATE_LIMITED' ? 429 : 400).send(failure(error)); }
  });
  app.get('/api/rooms/look/:roomCode', async (request, reply) => {
    try {
      requireOrigin(request); roomAssert(limiter.allow(`look:${request.ip}`, 120), 'RATE_LIMITED');
      const code = RoomCodeSchema.safeParse((request.params as { roomCode?: string }).roomCode); roomAssert(code.success, 'INVALID_COMMAND');
      const room = await client.gameSession.findUnique({ where: { roomCode: code.data }, select: { id: true, status: true, state: true, gameVersion: { select: { definition: true } } } });
      roomAssert(room && room.status !== 'FINISHED', 'ROOM_NOT_AVAILABLE');
      const definition = parseDefinition(room.gameVersion.definition);
      const look = definition.presentation;
      const joining = await people.joinInfo(room.id, readRoomState(room.state));
      return { ok: true, data: RoomLookSchema.parse({ title: definition.title, presentation: { texts: look?.texts ?? {}, translations: look?.translations, animations: look?.animations ?? {}, themes: look?.theme ? [look.theme] : [] }, ...joining }) };
    } catch (error) { return reply.code(error instanceof RoomError && error.code === 'RATE_LIMITED' ? 429 : 404).send(failure(error)); }
  });
  app.get('/api/rooms/seats/:roomCode', async (request, reply) => {
    try {
      requireOrigin(request); roomAssert(limiter.allow(`seats:${request.ip}`, 60), 'RATE_LIMITED');
      const code = RoomCodeSchema.safeParse((request.params as { roomCode?: string }).roomCode); roomAssert(code.success, 'INVALID_COMMAND');
      return { ok: true, data: SeatListSchema.parse(await seats.seats(code.data)) };
    } catch (error) { return reply.code(error instanceof RoomError && error.code === 'RATE_LIMITED' ? 429 : 400).send(failure(error)); }
  });
  app.post('/api/rooms/reclaim', async (request, reply) => {
    try {
      // Waiting phones repeat this every few seconds, so the limit allows minutes of polling.
      requireOrigin(request); roomAssert(limiter.allow(`reclaim:${request.ip}`, 120), 'RATE_LIMITED');
      const result = await seats.request(request.body);
      if (result.status === 'approved') reply.header('set-cookie', roomCookie(config, result.sessionId, result.token, result.expiresAt));
      return { ok: true, data: { status: result.status, sessionId: result.status === 'approved' ? result.sessionId : null } };
    } catch (error) { return reply.code(error instanceof RoomError && error.code === 'RATE_LIMITED' ? 429 : 400).send(failure(error)); }
  });
  // People in a room (room-people.ts). A guest makes their own account while joining (when the host allows it):
  // this phone is signed in as the new person and gets the key once, to write down.
  app.post('/api/rooms/signup', async (request, reply) => {
    try {
      requireOrigin(request); roomAssert(limiter.allow(`signup:${request.ip}`, 10), 'RATE_LIMITED');
      const made = await people.signup(request.body, Boolean(await personFromCookie(client, cookie(request))));
      reply.header('set-cookie', personCookie(config, made.device));
      app.log.info({ event: 'person_signed_up' }, 'Guest made an account while joining');
      return { ok: true, data: { name: made.name, key: made.key } };
    } catch (error) { return reply.code(error instanceof RoomError && error.code === 'RATE_LIMITED' ? 429 : 400).send(failure(error)); }
  });
  // A phone asks to sign in as one of the people the host added, and repeats the call while it waits for the host.
  app.post('/api/rooms/pick', async (request, reply) => {
    try {
      requireOrigin(request); roomAssert(limiter.allow(`pick:${request.ip}`, 120), 'RATE_LIMITED');
      const result = await people.pick(request.body);
      if (result.status === 'approved') { reply.header('set-cookie', personCookie(config, result.device)); return { ok: true, data: { status: 'approved', name: result.name } }; }
      return { ok: true, data: { status: 'pending', name: null } };
    } catch (error) { return reply.code(error instanceof RoomError && error.code === 'RATE_LIMITED' ? 429 : 400).send(failure(error)); }
  });
  app.post('/api/rooms/:sessionId/expected', async (request, reply) => {
    try {
      requireOrigin(request); const id = sessionId(request); const principal = await gateway.authenticate(id, cookie(request));
      roomAssert(ExpectedPeopleSchema.safeParse(request.body).success, 'INVALID_COMMAND');
      await people.setExpected(id, principal, request.body); return { ok: true, data: {} };
    } catch (error) { return reply.code(403).send(failure(error)); }
  });
  app.post('/api/rooms/:sessionId/name-requests', async (request, reply) => {
    try {
      requireOrigin(request); const id = sessionId(request); const principal = await gateway.authenticate(id, cookie(request));
      const body = SeatDecisionSchema.safeParse(request.body); roomAssert(body.success, 'INVALID_COMMAND');
      await people.decide(id, principal, body.data.requestId, body.data.approve); return { ok: true, data: {} };
    } catch (error) { return reply.code(403).send(failure(error)); }
  });
  app.post('/api/rooms/:sessionId/seat-requests', async (request, reply) => {
    try {
      requireOrigin(request); const id = sessionId(request); const principal = await gateway.authenticate(id, cookie(request));
      const body = SeatDecisionSchema.safeParse(request.body); roomAssert(body.success, 'INVALID_COMMAND');
      await seats.decide(id, principal, body.data.requestId, body.data.approve); return { ok: true, data: {} };
    } catch (error) { return reply.code(403).send(failure(error)); }
  });
  app.post('/api/rooms/:sessionId/settings', async (request, reply) => {
    try {
      requireOrigin(request); const id = sessionId(request); const principal = await gateway.authenticate(id, cookie(request));
      const body = RoomSettingsSchema.safeParse(request.body); roomAssert(body.success, 'INVALID_COMMAND');
      reactions.settingsChanged(id); await seats.setSettings(id, principal, Object.fromEntries(Object.entries(body.data).filter(([, value]) => value !== undefined)));
      if (body.data.chat === false) chat.clear(id);
      return { ok: true, data: {} };
    } catch (error) { return reply.code(403).send(failure(error)); }
  });
  const chatPrincipal = async (request: FastifyRequest) => {
    roomAssert(request.headers['x-party-request'] === '1' && allowedOrigin(request.headers, config), 'ORIGIN_REJECTED');
    const principal = await gateway.authenticate(sessionId(request), cookie(request));
    roomAssert(limiter.allow(`chat:${principal.id}`, 100), 'RATE_LIMITED');
    return principal;
  };
  app.get('/api/rooms/:sessionId/chat', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    try { return { ok: true, data: await chat.read(await chatPrincipal(request)) }; }
    catch (error) { return reply.code(403).send(failure(error)); }
  });
  app.post('/api/rooms/:sessionId/chat', async (request, reply) => {
    try {
      const principal = await chatPrincipal(request);
      const input = ChatSendSchema.safeParse(request.body);
      roomAssert(input.success, 'INVALID_COMMAND');
      await chat.send(principal, input.data);
      return { ok: true, data: {} };
    } catch (error) { return reply.code(403).send(failure(error)); }
  });
  app.post('/api/rooms/:sessionId/chat/moderation', async (request, reply) => {
    try {
      const principal = await chatPrincipal(request);
      const input = ChatModerationSchema.safeParse(request.body);
      roomAssert(input.success, 'INVALID_COMMAND');
      const action = input.data;
      if (action.action === 'report') await chat.report(principal, action.messageId);
      else if (action.action === 'show') {
        const message = await chat.quote(principal, action.messageId);
        roomAssert(await reactions.showText(principal.sessionId, message.from, message.text), 'FORBIDDEN');
      } else await chat.mute(principal, action.playerId, action.muted);
      return { ok: true, data: {} };
    } catch (error) { return reply.code(403).send(failure(error)); }
  });
  // A break: a player votes for (or withdraws from) one, the host calls one. The host ends it by continuing the game.
  app.post('/api/rooms/:sessionId/break', async (request, reply) => {
    try {
      requireOrigin(request); const id = sessionId(request); const principal = await gateway.authenticate(id, cookie(request));
      const body = z.object({ vote: z.boolean().optional() }).strict().safeParse(request.body); roomAssert(body.success, 'INVALID_COMMAND');
      if (principal.role === 'host') await breaks.call(id, principal); else await breaks.vote(id, principal, body.data.vote ?? true);
      return { ok: true, data: {} };
    } catch (error) { return reply.code(403).send(failure(error)); }
  });
  // Back to the lobby: a phone or the shared screen of the ended room moves into the next one (restart.ts).
  app.post('/api/rooms/:sessionId/follow', async (request, reply) => {
    try {
      requireOrigin(request); roomAssert(limiter.allow(`follow:${request.ip}`, 120), 'RATE_LIMITED');
      const display = (request.body as { display?: unknown } | null)?.display === true;
      const principal = await gateway.authenticate(sessionId(request), cookie(request), display);
      const moved = await followRoom(client, config, principal);
      reply.header('set-cookie', roomCookie(config, moved.sessionId, moved.token, moved.expiresAt, moved.display));
      return { ok: true, data: { sessionId: moved.sessionId } };
    } catch (error) { return reply.code(error instanceof RoomError && error.code === 'RATE_LIMITED' ? 429 : 400).send(failure(error)); }
  });
  app.post('/api/rooms/:sessionId/claim', async (request, reply) => {
    try {
      requireOrigin(request); roomAssert(limiter.allow(`claim:${request.ip}`, 30), 'RATE_LIMITED');
      const parsed = ClaimRoomSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND'); const id = sessionId(request);
      const grant = await gateway.claim(id, parsed.data.token);
      reply.header('set-cookie', roomCookie(config, id, parsed.data.token, grant.expiresAt, grant.display)); return { ok: true, data: { sessionId: id } };
    } catch (error) { return reply.code(401).send(failure(error)); }
  });
  app.post('/api/rooms', async (request, reply) => {
    try {
      requireOrigin(request); roomAssert(verifier && config.AUTH_ISSUER, 'AUTH_UNAVAILABLE');
      const auth = request.headers.authorization; roomAssert(auth && auth.startsWith('Bearer ') && auth.length <= 8192, 'UNAUTHORIZED');
      const parsed = z.object({ gameVersionId: GameIdSchema, sessionId: GameIdSchema, commandId: GameIdSchema }).strict().safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      let identity;
      try { identity = await verifier(auth.slice(7)); } catch (error) { throw new RoomError(error instanceof AuthenticationUnavailable ? 'AUTH_UNAVAILABLE' : 'UNAUTHORIZED'); }
      const created = await gateway.create(identity, parsed.data.gameVersionId, parsed.data.sessionId, parsed.data.commandId);
      reply.header('set-cookie', roomCookie(config, created.sessionId, created.token, created.expiresAt)); return { ok: true, data: { sessionId: created.sessionId } };
    } catch (error) { return reply.code(error instanceof RoomError && error.code === 'AUTH_UNAVAILABLE' ? 503 : 403).send(failure(error)); }
  });
  app.get('/api/rooms/:sessionId', async (request, reply) => {
    try { requireOrigin(request); return { ok: true, data: await snapshot(await gateway.authenticate(sessionId(request), cookie(request))) }; }
    catch (error) { return reply.code(401).send(failure(error)); }
  });
  app.post('/api/rooms/:sessionId/display', async (request, reply) => {
    try {
      requireOrigin(request); const id = sessionId(request); const principal = await gateway.authenticate(id, cookie(request)); roomAssert(principal.role === 'host', 'FORBIDDEN');
      // The shared screen stays valid for as long as the host who created it.
      const token = newToken(); const expiresAt = principal.expiresAt;
      await client.$transaction(async tx => {
        await lockRoom(tx, id);
        const session = await tx.gameSession.findUniqueOrThrow({ where: { id } }); await authorize(tx, session, principal.actor);
        await tx.roomCredential.create({ data: { sessionId: id, role: 'DISPLAY', source: principal.source, tokenHash: tokenHash(token), expiresAt } });
      });
      return { ok: true, data: { token } };
    } catch (error) { return reply.code(403).send(failure(error)); }
  });
  app.post('/api/rooms/:sessionId/birthday-vote', async (request, reply) => {
    try {
      requireOrigin(request); const id = sessionId(request); const principal = await gateway.authenticate(id, cookie(request));
      const input = z.object({ vote: z.boolean() }).strict().safeParse(request.body);
      roomAssert(input.success && principal.actor.role === 'player', 'FORBIDDEN');
      const actor = principal.actor;
      await client.$transaction(async tx => {
        await lockRoom(tx, id);
        const room = await tx.gameSession.findUniqueOrThrow({ where: { id } }); await authorize(tx, room, actor);
        const state = readRoomState(room.state);
        roomAssert(state.birthdayVote && state.hostPhonePlayerId !== actor.playerId && ['RUNNING', 'PAUSED'].includes(room.status), 'FORBIDDEN');
        if (state.birthdayReady || state.birthdayVoters.includes(actor.playerId) === input.data.vote) return;
        const players = await tx.sessionPlayer.findMany({ where: { sessionId: id, leftAt: null, ...(state.hostPhonePlayerId ? { id: { not: state.hostPhonePlayerId } } : {}) }, select: { id: true } });
        const eligible = new Set(players.map(player => player.id));
        const votes = new Set(state.birthdayVoters.filter(playerId => eligible.has(playerId)));
        if (input.data.vote) votes.add(actor.playerId); else votes.delete(actor.playerId);
        await tx.gameSession.update({ where: { id }, data: { state: { ...state, birthdayVoters: [...votes], birthdayReady: votes.size > players.length / 2 } } });
        // Only player snapshots carry the vote. The public event does not identify the action.
        await recordRoomChange(tx, id, 'room.updated');
      });
      return { ok: true, data: {} };
    } catch (error) { return reply.code(403).send(failure(error)); }
  });

  app.post('/api/rooms/:sessionId/host-phone', async (request, reply) => {
    try {
      requireOrigin(request); const id = sessionId(request); const principal = await gateway.authenticate(id, cookie(request));
      roomAssert(principal.role === 'host', 'FORBIDDEN');
      const input = z.object({ playerId: GameIdSchema.nullable() }).strict().safeParse(request.body);
      roomAssert(input.success, 'INVALID_COMMAND');
      await client.$transaction(async tx => {
        await lockRoom(tx, id);
        const room = await tx.gameSession.findUniqueOrThrow({ where: { id } });
        await authorize(tx, room, principal.actor);
        const playerId = input.data.playerId;
        let credentialId: string | null = null;
        if (playerId) {
          for (const socket of io.sockets.sockets.values()) {
            const peer = socket.data['principal'] as Principal | undefined;
            if (peer?.sessionId === id && peer.actor.role === 'player' && peer.actor.playerId === playerId
                && peer.actor.credentialProof?.kind === 'player') credentialId = peer.actor.credentialProof.id;
          }
          roomAssert(credentialId && await tx.playerCredential.count({ where: {
            id: credentialId, sessionId: id, playerId, revokedAt: null, expiresAt: { gt: new Date() }, player: { leftAt: null },
          } }) === 1, 'INELIGIBLE');
        }
        await tx.gameSession.update({ where: { id }, data: { state: {
          ...readRoomState(room.state), hostPhonePlayerId: playerId, hostPhoneCredentialId: credentialId,
        } } });
        await recordRoomChange(tx, id, 'room.hostPhone');
      });
      return { ok: true, data: {} };
    } catch (error) { return reply.code(403).send(failure(error)); }
  });

  app.post('/api/rooms/:sessionId/close', async (request, reply) => {
    try {
      requireOrigin(request); const id = sessionId(request); const principal = await gateway.authenticate(id, cookie(request));
      roomAssert(principal.role === 'host', 'FORBIDDEN');
      await client.$transaction(async tx => {
        await lockRoom(tx, id);
        const room = await tx.gameSession.findUniqueOrThrow({ where: { id } });
        await authorize(tx, room, principal.actor);
        await closeRoom(tx, id);
      });
      chat.clear(id);
      return { ok: true, data: {} };
    } catch (error) { return reply.code(403).send(failure(error)); }
  });

  app.post('/api/rooms/:sessionId/revoke', async (request, reply) => {
    try {
      requireOrigin(request); const id = sessionId(request); const principal = await gateway.authenticate(id, cookie(request));
      const body = z.object({ playerId: GameIdSchema, ban: z.boolean().optional() }).strict().safeParse(request.body); roomAssert(body.success, 'INVALID_COMMAND');
      await gateway.revoke(id, principal, body.data.playerId, body.data.ban);
      io.in(`player:${id}:${body.data.playerId}`).disconnectSockets(true); return { ok: true, data: {} };
    } catch (error) { return reply.code(403).send(failure(error)); }
  });
  app.post('/api/rooms/:sessionId/logout', async (request, reply) => {
    try {
      requireOrigin(request); const id = sessionId(request); const principal = await gateway.authenticate(id, cookie(request));
      await gateway.revoke(id, principal); io.in(`credential:${principal.id}`).disconnectSockets(true);
      reply.header('set-cookie', `${cookieName(id)}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${config.PUBLIC_ORIGIN.startsWith('https:') ? '; Secure' : ''}`);
      return { ok: true, data: {} };
    } catch (error) { return reply.code(401).send(failure(error)); }
  });

  io.use((socket, next) => {
    void (async () => {
      const parsed = ConnectRoomSchema.safeParse(socket.handshake.auth); roomAssert(parsed.success, 'UNAUTHORIZED');
      // A test bench phone reads its own seat's cookies, for this and every later check.
      socket.handshake.headers.cookie = connectionCookies(socket.handshake.headers.cookie, parsed.data.seat);
      roomAssert(limiter.allow(`connect:${clientAddress(socket.handshake.address, socket.handshake.headers, config.TRUST_CLOUDFLARE_LOCAL)}`, 240), 'RATE_LIMITED');
      const principal = await gateway.authenticate(parsed.data.sessionId, socket.handshake.headers.cookie, parsed.data.display);
      const peers = [...io.sockets.sockets.values()].filter(peer => (peer.data['principal'] as Principal | undefined)?.id === principal.id).length;
      roomAssert(peers < 3, 'RATE_LIMITED'); socket.data['principal'] = principal;
    })().then(() => next()).catch(error => { const safe = failure(error); const denied = new Error('Room access denied'); Object.assign(denied, { data: safe.ok ? undefined : safe.error }); next(denied); });
  });
  io.on('connection', socket => {
    const original = socket.data['principal'] as Principal; const id = original.sessionId;
    void socket.join([`session:${id}`, `${original.role}:${id}`, `credential:${original.id}`]);
    if (original.actor.role === 'player') void socket.join(`player:${id}:${original.actor.playerId}`);
    if (original.role !== 'display') void client.gameSession.updateMany({
      where: { id, idleCloseAt: { not: null } }, data: { idleCloseAt: null },
    }).catch(() => app.log.warn({ event: 'idle_room_reset_failed' }, 'Could not reset empty room timer'));
    const stopMinigames = minigames.connect(socket, original); reactions.connect(socket, original);
    const expiry = setTimeout(() => { socket.emit('room.error', { code: 'CREDENTIAL_EXPIRED' }); socket.disconnect(true); }, Math.max(1, original.expiresAt.getTime() - Date.now())); expiry.unref();
    let syncing = false; let commanding = false; let heartbeating = false; let receipting = false;
    const current = async () => {
      roomAssert(limiter.allow(`events:${original.id}`, 180), 'RATE_LIMITED');
      return gateway.authenticate(id, socket.handshake.headers.cookie, socket.handshake.auth['display'] === true);
    };
    socket.on('room.sync', (input: unknown, ack: unknown) => {
      if (typeof ack !== 'function') return;
      if (syncing) { ack({ ok: false, error: { code: 'RATE_LIMITED' } }); return; } syncing = true;
      void (async () => { roomAssert(ConnectRoomSchema.safeParse(input).success && (input as { sessionId: string }).sessionId === id, 'FORBIDDEN'); return snapshot(await current()); })()
        .then(data => ack({ ok: true, data })).catch(error => ack(failure(error))).finally(() => { syncing = false; });
    });
    socket.on('room.command', (input: unknown, ack: unknown) => {
      if (typeof ack !== 'function') return;
      if (commanding) { ack({ ok: false, error: { code: 'RATE_LIMITED' } }); return; } commanding = true;
      void (async () => { const principal = await current(); roomAssert(input && typeof input === 'object' && (input as { sessionId?: string }).sessionId === id, 'FORBIDDEN'); const type = (input as { type?: string }).type;
        const delegated = principal.role === 'player' && (HOST_PHONE_COMMANDS as readonly string[]).includes(type ?? '');
        return service.execute(delegated ? await hostPhoneActor(principal) : principal.actor, input); })()
        .then(data => ack({ ok: true, data })).catch(error => ack(failure(error))).finally(() => { commanding = false; });
    });
    socket.on('room.receipt', (input: unknown, ack: unknown) => {
      if (typeof ack !== 'function') return;
      if (receipting) { ack({ ok: false, error: { code: 'RATE_LIMITED' } }); return; } receipting = true;
      void (async () => {
        const parsed = z.object({ commandId: GameIdSchema }).strict().safeParse(input); roomAssert(parsed.success, 'INVALID_COMMAND');
        const principal = await current();
        return client.$transaction(async tx => {
          const session = await tx.gameSession.findUniqueOrThrow({ where: { id } }); await authorize(tx, session, principal.actor);
          const owner = principal.actor.role === 'player' && isHostPhone(readRoomState(session.state), principal.actor)
            ? [actorKey(principal.actor), `host-phone:${principal.actor.credentialProof!.id}`] : [actorKey(principal.actor)];
          const saved = await tx.gameCommand.findFirst({ where: { sessionId: id, actorKey: { in: owner }, commandKey: parsed.data.commandId } });
          return { receipt: saved ? CommandReceiptSchema.parse(saved.result) : null };
        });
      })().then(data => ack({ ok: true, data })).catch(error => ack(failure(error))).finally(() => { receipting = false; });
    });
    socket.on('room.heartbeat', (input: unknown, ack: unknown) => {
      if (typeof ack !== 'function' || heartbeating) return; heartbeating = true;
      void (async () => { const parsed = HeartbeatSchema.safeParse(input); roomAssert(parsed.success, 'INVALID_COMMAND'); await current(); return { nonce: parsed.data.nonce, serverTime: new Date().toISOString() }; })()
        .then(data => ack({ ok: true, data })).catch(error => { ack(failure(error)); if (error instanceof RoomError && ['UNAUTHORIZED', 'CREDENTIAL_EXPIRED'].includes(error.code)) socket.disconnect(true); }).finally(() => { heartbeating = false; });
    });
    io.to(`session:${id}`).emit('presence.changed'); app.log.info({ event: 'room_connected', role: original.role }, 'Room connected');
    socket.on('disconnect', reason => { clearTimeout(expiry); stopMinigames(); io.to(`session:${id}`).emit('presence.changed'); app.log.info({ event: 'room_disconnected', reason }, 'Room disconnected'); });
  });

  const publish = async () => {
    if (publishing || shuttingDown) return; publishing = true;
    try {
      const sessions = [...new Set([...io.sockets.sockets.values()].map(socket => (socket.data['principal'] as Principal).sessionId))];
      if (!sessions.length) return;
      const events = await client.outboxEvent.findMany({ where: { sessionId: { in: sessions }, publishedAt: null, attempts: { lt: 5 }, availableAt: { lte: new Date() } }, orderBy: [{ createdAt: 'asc' }, { revision: 'asc' }, { eventIndex: 'asc' }], take: 100 });
      for (const event of events) {
        try {
          if (event.type === 'session.changed') {
            const data = SessionChangedSchema.parse(event.payload); roomAssert(data.sessionId === event.sessionId, 'INVALID_STATE');
            const audience = event.audience === 'HOST' ? 'host' : event.audience === 'DISPLAY' ? 'display' : 'player';
            io.to(`${audience}:${event.sessionId}`).emit('room.changed', data);
            if (audience === 'host') minigames.roomChanged(event.sessionId);
          } else if (event.type === 'submission.saved' && event.audience === 'PLAYER' && /^player:[0-9a-f-]{36}$/.test(event.audienceKey)) {
            const data = CommandReceiptSchema.parse(event.payload); roomAssert(data.sessionId === event.sessionId, 'INVALID_STATE');
            io.to(`player:${event.sessionId}:${event.audienceKey.slice(7)}`).emit('submission.saved', data);
          } else throw new RoomError('INVALID_STATE');
          await client.outboxEvent.update({ where: { id: event.id }, data: { publishedAt: new Date() } });
        } catch { await client.outboxEvent.update({ where: { id: event.id }, data: { attempts: { increment: 1 }, availableAt: new Date(Date.now() + 5000) } }); app.log.warn({ event: 'outbox_publish_failed' }, 'Notification publication failed'); }
      }
    } catch { app.log.warn({ event: 'outbox_unavailable' }, 'Notification storage unavailable'); }
    finally { publishing = false; }
  };
  let publishTask: Promise<void> | undefined;
  const ticker = setInterval(() => { if (!publishing) publishTask = publish(); }, 250); ticker.unref();
  // Deadlines are durable rows, so automatic closing needs no per-room timer
  // and continues for rooms with nobody connected.
  let closing = false; let closeTask: Promise<void> | undefined; const timeoutBackoff = new Map<string, number>(); let voteTicks = 0; const revealBackoff = new Map<string, number>();
  let idleTask: Promise<void> | undefined;
  const idleReadyAt = Date.now() + 30_000; // Let phones reconnect after a backend restart.
  const idleTicker = setInterval(() => {
    if (idleTask || shuttingDown || Date.now() < idleReadyAt) return;
    idleTask = reconcileEmptyRooms(client, occupiedRooms(), hasPresence).then(({ closed, failed }) => {
      if (closed) app.log.info({ event: 'idle_rooms_closed', count: closed }, 'Closed empty rooms');
      if (failed) app.log.warn({ event: 'idle_room_closing_failed', count: failed }, 'Empty rooms will be retried');
    }).catch(() => app.log.warn({ event: 'idle_room_check_failed' }, 'Could not check empty rooms')).finally(() => { idleTask = undefined; });
  }, 5000);
  idleTicker.unref();
  const closeDue = async () => {
    if (closing || shuttingDown) return; closing = true;
    // Team votes in step games whose time ran out are decided too, about once a second.
    if (++voteTicks % 4 === 0) await decideDueVotes(client as never, service).catch(() => app.log.warn({ event: 'step_votes_unavailable' }, 'Deciding team votes unavailable'));
    try { const { closed, failed } = await closeExpiredStages(client, service, undefined, timeoutBackoff); if (closed) app.log.info({ event: 'stages_timed_out', count: closed }, 'Timed stages closed'); if (failed) app.log.warn({ event: 'stage_timeout_failed', count: failed }, 'Some timed stages could not be closed; retrying later'); }
    catch { app.log.warn({ event: 'stage_timeout_unavailable' }, 'Timed stage closing unavailable'); }
    finally {
      if (voteTicks % 2 === 0) await revealDueStages(client, service, revealBackoff).catch(() => app.log.warn({ event: 'auto_reveal_failed' }, 'Automatic result reveal unavailable'));
      closing = false;
    }
  };
  const timeoutTicker = setInterval(() => { if (!closing) closeTask = closeDue(); }, 250); timeoutTicker.unref();
  app.addHook('onReady', async () => {
    // Current deployment has one authoritative backend. Multiple instances need
    // room leases before enabling this startup recovery protocol.
    const running = await client.gameSession.findMany({ where: { status: 'RUNNING', roomCode: { not: null }, roomCredentials: { some: {} } }, select: { id: true, hostId: true, revision: true }, take: 101 });
    roomAssert(running.length <= 100, 'GAME_UNAVAILABLE');
    for (const session of running) await service.execute({ role: 'host', creatorId: session.hostId }, { formatVersion: 1, type: 'session.pause', sessionId: session.id, commandId: crypto.randomUUID(), expectedRevision: session.revision });
    if (running.length) app.log.info({ event: 'rooms_recovered', count: running.length }, 'Recovered rooms paused for host review');
  });
  app.addHook('preClose', async () => { shuttingDown = true; clearInterval(ticker); clearInterval(timeoutTicker); clearInterval(idleTicker); minigames.close(); await publishTask; await closeTask; await idleTask; await io.close(); });
  return { io, gateway, snapshot, service };
}
