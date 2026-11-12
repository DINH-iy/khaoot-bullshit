import { Server } from 'socket.io';
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ClaimRoomSchema, CommandReceiptSchema, ConnectRoomSchema, GameIdSchema, HeartbeatSchema, RoomSnapshotSchema, SessionChangedSchema, type RoomReply } from '@party/contracts';
import type { Config } from '../config.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { TokenVerifier } from '../auth.js';
import { AuthenticationUnavailable } from '../auth.js';
import { GameError } from '../game/errors.js';
import { createGameService } from '../game/service.js';
import { readSessionView } from '../game/views.js';
import { actorKey, authorize } from '../game/model.js';
import { createRoomGateway, lockRoom, type Principal } from './gateway.js';
import { allowedOrigin, cookieName, newToken, RateLimiter, RoomError, roomAssert, roomCookie, tokenHash } from './security.js';

export function registerRoomNetworking(app: FastifyInstance, client: PrismaClient, config: Config, verifier?: TokenVerifier) {
  const gateway = createRoomGateway(client, config); const limiter = new RateLimiter();
  let shuttingDown = false; let publishing = false;
  const io = new Server(app.server, { serveClient: false, connectTimeout: 5000, maxHttpBufferSize: 16 * 1024, pingInterval: 10000, pingTimeout: 10000,
    perMessageDeflate: false, allowRequest: (request, callback) => callback(null, !shuttingDown && io.engine.clientsCount < 512 && allowedOrigin(request.headers, config)),
  });
  const service = createGameService(client, event => app.log.info({ event: 'game_command', ...event }, 'Game command completed'));
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
  const snapshot = async (principal: Principal) => {
    const [view, players, session] = await Promise.all([
      readSessionView(client, principal.actor, principal.sessionId),
      client.sessionPlayer.findMany({ where: { sessionId: principal.sessionId, leftAt: null }, select: { id: true, displayName: true }, orderBy: { joinedAt: 'asc' } }),
      client.gameSession.findUniqueOrThrow({ where: { id: principal.sessionId }, select: { roomCode: true } }),
    ]);
    const connected = new Set<string>();
    for (const socket of io.sockets.sockets.values()) {
      const peer = socket.data['principal'] as Principal | undefined;
      if (peer?.sessionId === principal.sessionId && peer.actor.role === 'player') connected.add(peer.actor.playerId);
    }
    return RoomSnapshotSchema.parse({ view, roomCode: session.roomCode, role: principal.role, selfPlayerId: principal.actor.role === 'player' ? principal.actor.playerId : null,
      players: players.map(player => ({ ...player, connected: connected.has(player.id) })) });
  };

  app.post('/api/rooms/join', async (request, reply) => {
    try {
      requireOrigin(request); roomAssert(limiter.allow(`join:${request.ip}`, 120), 'RATE_LIMITED');
      const joined = await gateway.join(request.body);
      reply.header('set-cookie', roomCookie(config, joined.sessionId, joined.token, joined.expiresAt));
      return { ok: true, data: { sessionId: joined.sessionId } };
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
      const token = newToken(); const expiresAt = new Date(Math.min(Date.now() + 60 * 60 * 1000, principal.expiresAt.getTime()));
      await client.$transaction(async tx => {
        await lockRoom(tx, id);
        const session = await tx.gameSession.findUniqueOrThrow({ where: { id } }); await authorize(tx, session, principal.actor);
        await tx.roomCredential.create({ data: { sessionId: id, role: 'DISPLAY', source: principal.source, tokenHash: tokenHash(token), expiresAt } });
      });
      return { ok: true, data: { token } };
    } catch (error) { return reply.code(403).send(failure(error)); }
  });
  app.post('/api/rooms/:sessionId/revoke', async (request, reply) => {
    try {
      requireOrigin(request); const id = sessionId(request); const principal = await gateway.authenticate(id, cookie(request));
      const body = z.object({ playerId: GameIdSchema }).strict().safeParse(request.body); roomAssert(body.success, 'INVALID_COMMAND');
      await gateway.revoke(id, principal, body.data.playerId);
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
      roomAssert(limiter.allow(`connect:${socket.handshake.address}`, 240), 'RATE_LIMITED');
      const principal = await gateway.authenticate(parsed.data.sessionId, socket.handshake.headers.cookie, parsed.data.display);
      const peers = [...io.sockets.sockets.values()].filter(peer => (peer.data['principal'] as Principal | undefined)?.id === principal.id).length;
      roomAssert(peers < 3, 'RATE_LIMITED'); socket.data['principal'] = principal;
    })().then(() => next()).catch(error => { const safe = failure(error); const denied = new Error('Room access denied'); Object.assign(denied, { data: safe.ok ? undefined : safe.error }); next(denied); });
  });
  io.on('connection', socket => {
    const original = socket.data['principal'] as Principal; const id = original.sessionId;
    void socket.join([`session:${id}`, `${original.role}:${id}`, `credential:${original.id}`]);
    if (original.actor.role === 'player') void socket.join(`player:${id}:${original.actor.playerId}`);
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
      void (async () => { const principal = await current(); roomAssert(input && typeof input === 'object' && (input as { sessionId?: string }).sessionId === id, 'FORBIDDEN'); return service.execute(principal.actor, input); })()
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
          const saved = await tx.gameCommand.findUnique({ where: { sessionId_actorKey_commandKey: { sessionId: id, actorKey: actorKey(principal.actor), commandKey: parsed.data.commandId } } });
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
    socket.on('disconnect', reason => { clearTimeout(expiry); io.to(`session:${id}`).emit('presence.changed'); app.log.info({ event: 'room_disconnected', reason }, 'Room disconnected'); });
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
  app.addHook('onReady', async () => {
    // Current deployment has one authoritative backend. Multiple instances need
    // room leases before enabling this startup recovery protocol.
    const running = await client.gameSession.findMany({ where: { status: 'RUNNING', roomCode: { not: null }, roomCredentials: { some: {} } }, select: { id: true, hostId: true, revision: true }, take: 101 });
    roomAssert(running.length <= 100, 'GAME_UNAVAILABLE');
    for (const session of running) await service.execute({ role: 'host', creatorId: session.hostId }, { formatVersion: 1, type: 'session.pause', sessionId: session.id, commandId: crypto.randomUUID(), expectedRevision: session.revision });
    if (running.length) app.log.info({ event: 'rooms_recovered', count: running.length }, 'Recovered rooms paused for host review');
  });
  app.addHook('preClose', async () => { shuttingDown = true; clearInterval(ticker); await publishTask; await io.close(); });
  return { io, gateway, snapshot };
}
