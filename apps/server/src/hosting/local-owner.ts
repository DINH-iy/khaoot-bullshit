import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ClaimRoomSchema, GameIdSchema, HostMenuSchema, HostRoomSchema, type RoomReply } from '@party/contracts';
import type { Config } from '../config.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { contentHash } from '../game/definition.js';
import { allStages, maxPathStages } from '../game/graph.js';
import { GameError } from '../game/errors.js';
import { createGameService } from '../game/service.js';
import { builtInGames } from '../game/templates.js';
import { lockRoom, makeRoomCode } from '../rooms/gateway.js';
import { allowedOrigin, joinToken, namedCookie, newToken, RateLimiter, RoomError, roomAssert, roomCookie, tokenHash } from '../rooms/security.js';

// Local owner hosting: the person running this server opens a private link and
// hosts built-in games from the browser. It is an explicit non-production
// stand-in for creator sign-in. Config refuses the token in production, and the
// rooms it creates carry LOCAL_REHEARSAL grants that production rejects anyway.
const OWNER_COOKIE = 'party_owner';
const OWNER = { issuer: 'urn:local-owner', subject: 'owner' };
const HOST_ACCESS_MS = 8 * 60 * 60 * 1000;
const digest = (value: string) => createHash('sha256').update(value).digest();

export function registerLocalHosting(app: FastifyInstance, client: PrismaClient, config: Config) {
  const limiter = new RateLimiter(1024);
  const service = createGameService(client, event => app.log.info({ event: 'game_command', ...event }, 'Game command completed'));
  const secure = config.PUBLIC_ORIGIN.startsWith('https:') ? '; Secure' : '';
  const status: Partial<Record<string, number>> = { UNAUTHORIZED: 401, AUTH_UNAVAILABLE: 503, RATE_LIMITED: 429, ORIGIN_REJECTED: 403, FORBIDDEN: 403, NOT_FOUND: 404, ROOM_NOT_AVAILABLE: 404 };
  const fail = (reply: FastifyReply, error: unknown) => {
    const code = error instanceof RoomError || error instanceof GameError ? error.code : 'GAME_UNAVAILABLE';
    app.log.warn({ event: 'host_request_rejected', code }, 'Host request rejected');
    return reply.code(status[code] ?? (code === 'GAME_UNAVAILABLE' ? 500 : 400)).send({ ok: false, error: { code } } satisfies RoomReply<never>);
  };
  // Each limit has its own counter: a strict key-guessing limit on signing in
  // must not be used up by the owner's ordinary menu and room requests.
  const guard = (request: FastifyRequest, bucket: 'menu' | 'claim' = 'menu') => {
    roomAssert(request.headers['x-party-request'] === '1' && allowedOrigin(request.headers, config), 'ORIGIN_REJECTED');
    roomAssert(limiter.allow(`host-${bucket}:${request.ip}`, bucket === 'claim' ? 20 : 120), 'RATE_LIMITED');
    roomAssert(config.NODE_ENV !== 'production' && config.LOCAL_OWNER_TOKEN && config.ROOM_TOKEN_SECRET, 'AUTH_UNAVAILABLE');
    return { ownerToken: config.LOCAL_OWNER_TOKEN, roomSecret: config.ROOM_TOKEN_SECRET };
  };
  const isOwner = (expected: string, candidate: string | undefined) => candidate !== undefined && timingSafeEqual(digest(candidate), digest(expected));
  const requireOwner = (request: FastifyRequest) => {
    const settings = guard(request);
    roomAssert(isOwner(settings.ownerToken, namedCookie(request.headers.cookie, OWNER_COOKIE)), 'UNAUTHORIZED');
    return settings;
  };
  const ownerCreator = () => client.creator.upsert({ where: { issuer_subject: OWNER }, create: OWNER, update: {} });
  async function versionFor(creatorId: string, game: (typeof builtInGames)[number]): Promise<string> {
    const hash = contentHash(game.definition);
    return client.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('local-owner-games', 0))::text AS locked`;
      const existing = await tx.gameVersion.findFirst({ where: { contentHash: hash, game: { creatorId, archivedAt: null } }, select: { id: true } });
      if (existing) return existing.id;
      const created = await tx.game.create({ data: { creatorId, title: game.definition.title } });
      return (await tx.gameVersion.create({ data: { gameId: created.id, createdById: creatorId, number: 1, definitionFormat: game.definition.formatVersion, definition: game.definition, contentHash: hash }, select: { id: true } })).id;
    });
  }

  app.post('/api/host/claim', async (request, reply) => {
    try {
      const settings = guard(request, 'claim');
      const parsed = ClaimRoomSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      roomAssert(isOwner(settings.ownerToken, parsed.data.token), 'UNAUTHORIZED');
      reply.header('set-cookie', `${OWNER_COOKIE}=${parsed.data.token}; Path=/api/host; HttpOnly; SameSite=Strict; Max-Age=43200${secure}`);
      return { ok: true, data: {} };
    } catch (error) { return fail(reply, error); }
  });
  app.get('/api/host', async (request, reply) => {
    try {
      requireOwner(request);
      const creator = await ownerCreator();
      const rooms = await client.gameSession.findMany({
        where: { hostId: creator.id, status: { not: 'FINISHED' }, roomCode: { not: null }, createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        select: { id: true, roomCode: true, status: true, gameVersion: { select: { game: { select: { title: true } } } }, _count: { select: { players: { where: { leftAt: null } } } } },
        orderBy: { createdAt: 'desc' }, take: 10,
      });
      return { ok: true, data: HostMenuSchema.parse({
        games: builtInGames.map(game => ({ key: game.key, title: game.definition.title, description: game.description, stageCount: maxPathStages(game.definition), timed: allStages(game.definition).some(entry => entry.stage.durationMs !== null) })),
        rooms: rooms.map(room => ({ sessionId: room.id, roomCode: room.roomCode, title: room.gameVersion.game.title, status: room.status, playerCount: room._count.players })),
      }) };
    } catch (error) { return fail(reply, error); }
  });
  app.post('/api/host/rooms', async (request, reply) => {
    try {
      const settings = requireOwner(request);
      const parsed = HostRoomSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      const game = builtInGames.find(entry => entry.key === parsed.data.gameKey); roomAssert(game, 'NOT_FOUND');
      const { sessionId, commandId } = parsed.data;
      const creator = await ownerCreator();
      const gameVersionId = await versionFor(creator.id, game);
      // Deterministic per request, so a retried click returns the same room and access.
      const token = joinToken(settings.roomSecret, sessionId, `owner:${commandId}`);
      await service.execute({ role: 'host', creatorId: creator.id }, { formatVersion: 1, type: 'session.create', sessionId, commandId, expectedRevision: 0, mode: 'REHEARSAL', gameVersionId });
      const expiresAt = await client.$transaction(async tx => {
        await lockRoom(tx, sessionId);
        const previous = await tx.roomCredential.findUnique({ where: { tokenHash: tokenHash(token) } });
        if (previous) { roomAssert(!previous.revokedAt && previous.expiresAt.getTime() > Date.now(), 'UNAUTHORIZED'); return previous.expiresAt; }
        const expires = new Date(Date.now() + HOST_ACCESS_MS);
        await tx.gameSession.update({ where: { id: sessionId }, data: { roomCode: makeRoomCode() } });
        await tx.roomCredential.create({ data: { sessionId, role: 'HOST', source: 'LOCAL_REHEARSAL', tokenHash: tokenHash(token), expiresAt: expires } });
        return expires;
      });
      reply.header('set-cookie', roomCookie(config, sessionId, token, expiresAt));
      return { ok: true, data: { sessionId } };
    } catch (error) { return fail(reply, error); }
  });
  // The owner can always get back into their own room, e.g. after host access expired.
  app.post('/api/host/rooms/:sessionId/enter', async (request, reply) => {
    try {
      requireOwner(request);
      const id = GameIdSchema.safeParse((request.params as { sessionId?: string }).sessionId); roomAssert(id.success, 'INVALID_COMMAND');
      const creator = await ownerCreator(); const token = newToken(); const expiresAt = new Date(Date.now() + HOST_ACCESS_MS);
      await client.$transaction(async tx => {
        await lockRoom(tx, id.data);
        const session = await tx.gameSession.findUnique({ where: { id: id.data } });
        roomAssert(session && session.hostId === creator.id && session.roomCode && session.status !== 'FINISHED', 'ROOM_NOT_AVAILABLE');
        await tx.roomCredential.create({ data: { sessionId: id.data, role: 'HOST', source: 'LOCAL_REHEARSAL', tokenHash: tokenHash(token), expiresAt } });
      });
      reply.header('set-cookie', roomCookie(config, id.data, token, expiresAt));
      return { ok: true, data: { sessionId: id.data } };
    } catch (error) { return fail(reply, error); }
  });
}
