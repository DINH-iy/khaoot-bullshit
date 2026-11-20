import { gameFacts } from './game-facts.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ClaimRoomSchema, GameIdSchema, HostGameSchema, HostMenuSchema, HostRoomSchema, MAX_DRAFT_BYTES, RestartRoomSchema } from '@party/contracts';
import type { Config } from '../config.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { contentHash } from '../game/definition.js';
import { allStages, maxPathStages } from '../game/graph.js';
import { createGameService } from '../game/service.js';
import { builtInGames } from '../game/templates.js';
import { createAuthoring } from '../authoring/drafts.js';
import type { EditorLive } from '../authoring/live.js';
import { lockRoom, makeRoomCode } from '../rooms/gateway.js';
import { joinToken, newToken, roomAssert, roomCookie, tokenHash } from '../rooms/security.js';
import { OWNER_COOKIE, type OwnerAccess } from './owner-access.js';
import { readRoomState } from '../rooms/reclaim.js';
import { linkNextRoom } from '../rooms/restart.js';
import { closeRoom } from '../rooms/close.js';
import { ownerCreator as sharedOwnerCreator } from './owner-creator.js';

// Local owner hosting: the person running this server opens a private link and
// hosts built-in games from the browser (owner access: ./owner-access.ts). The
// rooms it creates carry LOCAL_REHEARSAL grants that production rejects anyway.
const HOST_ACCESS_MS = 8 * 60 * 60 * 1000;

export function registerLocalHosting(app: FastifyInstance, client: PrismaClient, config: Config, owner: OwnerAccess, live?: EditorLive) {
  const { fail, guard, isOwner, localToken, requireOwner, requireEditor } = owner;
  const service = createGameService(client, event => app.log.info({ event: 'game_command', ...event }, 'Game command completed'));
  const authoring = createAuthoring(client);
  const secure = config.PUBLIC_ORIGIN.startsWith('https:') ? '; Secure' : '';
  const ownerCookie = (token: string) => `${OWNER_COOKIE}=${token}; Path=/api/host; HttpOnly; SameSite=Strict; Max-Age=43200${secure}`;
  const ownerCreator = () => sharedOwnerCreator(client);
  async function versionFor(creatorId: string, game: (typeof builtInGames)[number]): Promise<string> {
    const hash = contentHash(game.definition);
    return client.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('local-owner-games', 0))::text AS locked`;
      // Built-in games are kept apart from authored ones (which have a draft).
      const existing = await tx.gameVersion.findFirst({ where: { contentHash: hash, game: { creatorId, archivedAt: null, draft: { is: null } } }, select: { id: true } });
      if (existing) return existing.id;
      const created = await tx.game.create({ data: { creatorId, title: game.definition.title } });
      return (await tx.gameVersion.create({ data: { gameId: created.id, createdById: creatorId, number: 1, definitionFormat: game.definition.formatVersion, definition: game.definition, contentHash: hash }, select: { id: true } })).id;
    });
  }

  /** Opens a room as the owner's host. Deterministic per request, so a retried click returns the same room and access. */
  async function openRoom(roomSecret: string, creatorId: string, gameVersionId: string, sessionId: string, commandId: string) {
      const token = joinToken(roomSecret, sessionId, `owner:${commandId}`);
      await service.execute({ role: 'host', creatorId: creatorId }, { formatVersion: 1, type: 'session.create', sessionId, commandId, expectedRevision: 0, mode: 'REHEARSAL', gameVersionId });
      const expiresAt = await client.$transaction(async tx => {
        await lockRoom(tx, sessionId);
        const previous = await tx.roomCredential.findUnique({ where: { tokenHash: tokenHash(token) } });
        if (previous) { roomAssert(!previous.revokedAt && previous.expiresAt.getTime() > Date.now(), 'UNAUTHORIZED'); return previous.expiresAt; }
        const expires = new Date(Date.now() + HOST_ACCESS_MS);
        await tx.gameSession.update({ where: { id: sessionId }, data: { roomCode: makeRoomCode() } });
        await tx.roomCredential.create({ data: { sessionId, role: 'HOST', source: 'LOCAL_REHEARSAL', tokenHash: tokenHash(token), expiresAt: expires } });
        return expires;
      });
    return expiresAt;
  }
  app.post('/api/host/claim', async (request, reply) => {
    try {
      const settings = guard(request, 'claim');
      const parsed = ClaimRoomSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      roomAssert(isOwner(settings.ownerToken, parsed.data.token), 'UNAUTHORIZED');
      reply.header('set-cookie', ownerCookie(parsed.data.token));
      return { ok: true, data: {} };
    } catch (error) { return fail(reply, error); }
  });
  app.post('/api/host/claim-local', async (request, reply) => {
    try {
      const settings = guard(request, 'claim');
      roomAssert(request.headers.origin && request.headers['sec-fetch-site'] === 'same-origin', 'ORIGIN_REJECTED');
      const token = localToken(settings, request);
      roomAssert(token, 'FORBIDDEN');
      reply.header('set-cookie', ownerCookie(token));
      return { ok: true, data: {} };
    } catch (error) { return fail(reply, error); }
  });
  // The menu. Editors get the same games, but never the owner's open rooms.
  app.get('/api/host', async (request, reply) => {
    try {
      const { role } = await requireEditor(request);
      const creator = await ownerCreator(); const custom = await authoring.builtInVersions(creator.id);
      const rooms = role !== 'owner' ? [] : await client.gameSession.findMany({
        where: { hostId: creator.id, status: { not: 'FINISHED' }, roomCode: { not: null }, createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        select: { id: true, roomCode: true, status: true, gameVersion: { select: { game: { select: { title: true } } } }, _count: { select: { players: { where: { leftAt: null } } } } },
        orderBy: { createdAt: 'desc' }, take: 10,
      });
      return { ok: true, data: HostMenuSchema.parse({
        games: builtInGames.map(game => {
          // The owner's published version replaces the built-in in the menu (and in rooms); the description stays.
          const own = custom.get(game.key); const definition = own?.definition ?? game.definition;
          return { key: game.key, title: definition.title, description: game.description, stageCount: maxPathStages(definition), branches: allStages(definition).some(entry => entry.stage.kind === 'route'), timed: allStages(definition).some(entry => entry.stage.durationMs !== null), ...gameFacts(definition),
            custom: own ? { gameId: own.gameId, inUse: own.versionId !== null, unpublished: own.unpublished } : null };
        }),
        myGames: await authoring.list(creator.id),
        role,
        rooms: rooms.map(room => ({ sessionId: room.id, roomCode: room.roomCode, title: room.gameVersion.game.title, status: room.status, playerCount: room._count.players })),
      }) };
    } catch (error) { return fail(reply, error); }
  });
  app.post('/api/host/rooms', async (request, reply) => {
    try {
      const settings = requireOwner(request);
      const parsed = HostRoomSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      const { sessionId, commandId, gameKey, gameId } = parsed.data;
      const creator = await ownerCreator();
      // A built-in game, or the latest published version of one of your own games.
      const game = gameKey ? builtInGames.find(entry => entry.key === gameKey) : null; roomAssert(!gameKey || game, 'NOT_FOUND');
      // A built-in game plays the owner's published version of it, if there is one.
      const own = game ? (await authoring.builtInVersions(creator.id)).get(game.key)?.versionId ?? null : null;
      const gameVersionId = own ?? (game ? await versionFor(creator.id, game) : await authoring.latestVersion(creator.id, gameId!));
      const expiresAt = await openRoom(settings.roomSecret, creator.id, gameVersionId, sessionId, commandId);
      const token = joinToken(settings.roomSecret, sessionId, `owner:${commandId}`);
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

  // Close a room from the host menu: it ends like a finished game (its history stays) and leaves "Your open rooms".
  // Closing a room that already ended is fine, so a repeated click does no harm.
  app.post('/api/host/rooms/:sessionId/close', async (request, reply) => {
    try {
      requireOwner(request);
      const id = GameIdSchema.safeParse((request.params as { sessionId?: string }).sessionId); roomAssert(id.success, 'INVALID_COMMAND');
      const creator = await ownerCreator();
      const session = await client.gameSession.findUnique({ where: { id: id.data }, select: { hostId: true, roomCode: true } });
      roomAssert(session && session.hostId === creator.id && session.roomCode, 'ROOM_NOT_AVAILABLE');
      await client.$transaction(tx => closeRoom(tx, id.data));
      return { ok: true, data: { sessionId: id.data } };
    } catch (error) { return fail(reply, error); }
  });

  // Built-in games: the owner edits their own version of one (opened in the editor like any game, used once published)
  // or goes back to the original. Editors (people with editor rights) do not change the built-in games.
  const builtInKey = (request: FastifyRequest) => { const key = HostGameSchema.shape.key.safeParse((request.params as { key?: string }).key); roomAssert(key.success && builtInGames.some(game => game.key === key.data), 'NOT_FOUND'); return key.data; };
  app.post('/api/host/builtins/:key/edit', async (request, reply) => {
    try { requireOwner(request); return { ok: true, data: { gameId: await authoring.editBuiltIn((await ownerCreator()).id, builtInKey(request)) } }; } catch (error) { return fail(reply, error); }
  });
  app.post('/api/host/builtins/:key/restore', async (request, reply) => {
    try { requireOwner(request); await authoring.restoreBuiltIn((await ownerCreator()).id, builtInKey(request)); return { ok: true, data: {} }; } catch (error) { return fail(reply, error); }
  });

  // Back to the lobby: the same game again in a fresh room; the old one ends and everyone follows (rooms/restart.ts).
  // The phone of the host makes up the new room's IDs, so a retry opens the same room.
  app.post('/api/host/rooms/:sessionId/restart', async (request, reply) => {
    try {
      const settings = requireOwner(request);
      const id = GameIdSchema.safeParse((request.params as { sessionId?: string }).sessionId); roomAssert(id.success, 'INVALID_COMMAND');
      const body = RestartRoomSchema.safeParse(request.body); roomAssert(body.success, 'INVALID_COMMAND');
      const creator = await ownerCreator();
      const old = await client.gameSession.findUnique({ where: { id: id.data } });
      roomAssert(old && old.hostId === creator.id && old.roomCode, 'ROOM_NOT_AVAILABLE');
      const next = readRoomState(old.state).nextRoom; roomAssert(next === null || next === body.data.sessionId, 'ROOM_NOT_AVAILABLE');
      const expiresAt = await openRoom(settings.roomSecret, creator.id, old.gameVersionId, body.data.sessionId, body.data.commandId);
      await client.$transaction(tx => linkNextRoom(tx, old.id, body.data.sessionId));
      reply.header('set-cookie', roomCookie(config, body.data.sessionId, joinToken(settings.roomSecret, body.data.sessionId, `owner:${body.data.commandId}`), expiresAt));
      return { ok: true, data: { sessionId: body.data.sessionId } };
    } catch (error) { return fail(reply, error); }
  });

  // Your games: drafts, problems per scene, and publishing. The owner and editors
  // (people with editor rights) may do all of this, including practice rooms;
  // opening real rooms (above) stays with the owner.
  const gameParam = (request: FastifyRequest) => { const id = GameIdSchema.safeParse((request.params as { gameId?: string }).gameId); roomAssert(id.success, 'INVALID_COMMAND'); return id.data; };
  app.get('/api/host/games', async (request, reply) => {
    try { await requireEditor(request); return { ok: true, data: await authoring.list((await ownerCreator()).id) }; } catch (error) { return fail(reply, error); }
  });
  app.post('/api/host/games', async (request, reply) => {
    try { await requireEditor(request); return { ok: true, data: await authoring.create((await ownerCreator()).id, request.body) }; } catch (error) { return fail(reply, error); }
  });
  app.get('/api/host/games/:gameId', async (request, reply) => {
    try { await requireEditor(request, 'edit'); return { ok: true, data: await authoring.get((await ownerCreator()).id, gameParam(request)) }; } catch (error) { return fail(reply, error); }
  });
  // A short-lived ticket for the live channel of one game: who else is editing, and their saves as they happen.
  app.post('/api/host/games/:gameId/live', async (request, reply) => {
    try {
      const access = await requireEditor(request, 'edit'); roomAssert(live, 'AUTH_UNAVAILABLE');
      const creator = await ownerCreator(); const { gameId } = await authoring.get(creator.id, gameParam(request));
      return { ok: true, data: { ticket: await live.ticket(creator.id, gameId, access.personId) } };
    } catch (error) { return fail(reply, error); }
  });
  // A whole game is larger than ordinary requests, so this route alone accepts up to the draft limit.
  app.put('/api/host/games/:gameId/draft', { bodyLimit: MAX_DRAFT_BYTES + 16 * 1024 }, async (request, reply) => {
    try { await requireEditor(request, 'edit'); const draft = await authoring.save((await ownerCreator()).id, gameParam(request), request.body); live?.saved(draft); return { ok: true, data: draft }; } catch (error) { return fail(reply, error); }
  });
  // Pasted games can be as large as a draft, so this route alone accepts up to the draft limit.
  app.post('/api/host/games/import', { bodyLimit: MAX_DRAFT_BYTES + 16 * 1024 }, async (request, reply) => {
    try { await requireEditor(request); return { ok: true, data: await authoring.importGame((await ownerCreator()).id, request.body) }; } catch (error) { return fail(reply, error); }
  });
  app.post('/api/host/games/:gameId/archive', async (request, reply) => {
    try { await requireEditor(request); await authoring.archive((await ownerCreator()).id, gameParam(request)); return { ok: true, data: {} }; } catch (error) { return fail(reply, error); }
  });
  app.post('/api/host/games/:gameId/rehearse', async (request, reply) => {
    try {
      const settings = await requireEditor(request); const creator = await ownerCreator();
      const body = request.body as { sessionId?: unknown; commandId?: unknown };
      const versionId = await authoring.rehearsalVersion(creator.id, gameParam(request), request.body);
      const sessionId = String(body.sessionId); const commandId = String(body.commandId);
      const expiresAt = await openRoom(settings.roomSecret, creator.id, versionId, sessionId, commandId);
      reply.header('set-cookie', roomCookie(config, sessionId, joinToken(settings.roomSecret, sessionId, `owner:${commandId}`), expiresAt));
      return { ok: true, data: { sessionId } };
    } catch (error) { return fail(reply, error); }
  });
  app.post('/api/host/games/:gameId/publish', async (request, reply) => {
    try { await requireEditor(request); const draft = await authoring.publish((await ownerCreator()).id, gameParam(request), request.body); live?.saved(draft); return { ok: true, data: draft }; } catch (error) { return fail(reply, error); }
  });
}
