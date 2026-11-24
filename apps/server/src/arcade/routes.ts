import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ArcadeLeaderboardSchema, ArcadeListSchema, ArcadeLobbyViewSchema, ArcadeLockSchema, ArcadePasswordUpdateSchema, ArcadePickSchema, GameIdSchema, isArcadeGame, type RoomReply } from '@party/contracts';
import type { Config } from '../config.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { GameError } from '../game/errors.js';
import { personFromCookie } from '../people/identity.js';
import type { createRoomGateway } from '../rooms/gateway.js';
import { allowedOrigin, RateLimiter, RoomError, roomAssert, roomCookie } from '../rooms/security.js';
import { CONNECTED_MS, createLobbies, ensureLeader, lockLobby, lookOf, memberCookie, present } from './lobbies.js';
import { leaderboard, lobbyScores } from './results.js';
import type { Rounds } from './rounds.js';

const status: Partial<Record<string, number>> = { UNAUTHORIZED: 401, FORBIDDEN: 403, ORIGIN_REJECTED: 403, RATE_LIMITED: 429, ROOM_NOT_AVAILABLE: 404, AUTH_UNAVAILABLE: 503,
  LOBBY_PASSWORD_REQUIRED: 403, LOBBY_LOCKED: 409, LOBBY_FULL: 409, ARCADE_FULL: 409, ROUND_ON: 409, NOT_ENOUGH_PLAYERS: 409, INVALID_STATE: 409, REVISION_CONFLICT: 409 };

/**
 * The arcade's HTTP side. Anyone may open or join a lobby (a guest by typing a name, a person as themselves),
 * limited per address and in number of open lobbies. Like local hosting it is a test-version feature: it is
 * refused in production until creator sign-in exists, and its rooms are rehearsal rooms that production rejects.
 */
export function registerArcade(app: FastifyInstance, client: PrismaClient, config: Config, gateway: ReturnType<typeof createRoomGateway>, rounds: Rounds, lobbies = createLobbies(client)) {
  const limiter = new RateLimiter(4096);
  const fail = (reply: FastifyReply, error: unknown) => {
    const code = error instanceof RoomError || error instanceof GameError ? error.code : 'GAME_UNAVAILABLE';
    if (code === 'GAME_UNAVAILABLE') app.log.error({ err: error, event: 'arcade_failed' }, 'Arcade request failed');
    else app.log.warn({ event: 'arcade_rejected', code }, 'Arcade request rejected');
    return reply.code(status[code] ?? (code === 'GAME_UNAVAILABLE' ? 500 : 400)).send({ ok: false, error: { code } } satisfies RoomReply<never>);
  };
  // Phones behind one address (a test tunnel) share these, so the polling limits are generous.
  const guard = (request: FastifyRequest, bucket: string, limit: number) => {
    roomAssert(request.headers['x-party-request'] === '1' && allowedOrigin(request.headers, config), 'ORIGIN_REJECTED');
    roomAssert(config.NODE_ENV !== 'production' && config.ROOM_TOKEN_SECRET, 'AUTH_UNAVAILABLE');
    roomAssert(limiter.allow(`arcade-${bucket}:${request.ip}`, limit), 'RATE_LIMITED');
  };
  const lobbyParam = (request: FastifyRequest) => { const id = GameIdSchema.safeParse((request.params as { lobbyId?: string }).lobbyId); roomAssert(id.success, 'INVALID_COMMAND'); return id.data; };
  const sessionParam = (request: FastifyRequest) => { const id = GameIdSchema.safeParse((request.params as { sessionId?: string }).sessionId); roomAssert(id.success, 'INVALID_COMMAND'); return id.data; };
  const signedIn = async (request: FastifyRequest) => { const found = await personFromCookie(client, request.headers.cookie); return found ? { id: found.person.id, name: found.person.name, look: found.person.look } : null; };
  const requireMember = async (request: FastifyRequest, lobbyId: string) => {
    const member = await lobbies.memberOf(lobbyId, request.headers.cookie); roomAssert(member, 'UNAUTHORIZED');
    roomAssert(limiter.allow(`arcade-member:${member.id}`, 240), 'RATE_LIMITED');
    return member;
  };

  /** The lobby as this browser sees it; a member's look also checks them in and keeps a leader. */
  async function view(lobbyId: string, cookie: string | undefined, now = new Date()) {
    const member = await lobbies.memberOf(lobbyId, cookie);
    if (member) await lobbies.touch(member, now);
    let lobby = await client.arcadeLobby.findUnique({ where: { id: lobbyId } }); roomAssert(lobby, 'ROOM_NOT_AVAILABLE');
    const open = await client.arcadeRound.findFirst({ where: { lobbyId, endedAt: null }, include: { session: { select: { status: true } }, seats: { select: { memberId: true } } } });
    // A round whose room ended some other way is over.
    if (open?.session.status === 'FINISHED') await rounds.end(open.id, now);
    const round = open?.session.status === 'FINISHED' ? null : open;
    const closed = Boolean(lobby.closedAt) || !await client.arcadeLobby.count({ where: { id: lobbyId, ...lobbies.openWhere(now) } });
    if (!closed && member) {
      const leaderId = await client.$transaction(async tx => { await lockLobby(tx, lobbyId); return ensureLeader(tx, lobbyId, now); });
      if (leaderId !== lobby.leaderId) lobby = { ...lobby, leaderId };
    }
    if (lobby.passwordHash && !member) return ArcadeLobbyViewSchema.parse({
      id: lobby.id, title: lobby.title, locked: lobby.locked, protected: true, closed,
      me: null, members: [], round: null, totals: [], lastRound: null, rounds: [],
    });
    const members = await client.arcadeMember.findMany({ where: { lobbyId, leftAt: null }, orderBy: { joinedAt: 'asc' } });
    const seated = new Set(round?.seats.map(seat => seat.memberId) ?? []);
    const scores = await lobbyScores(client, lobbyId);
    return ArcadeLobbyViewSchema.parse({
      id: lobby.id, title: lobby.title, locked: lobby.locked, protected: Boolean(lobby.passwordHash), closed,
      me: member ? { memberId: member.id, leader: lobby.leaderId === member.id } : null,
      members: members.filter(entry => present(entry, now) || seated.has(entry.id)).map(entry => ({ id: entry.id, displayName: entry.displayName, look: lookOf(entry),
        connected: now.getTime() - entry.lastSeenAt.getTime() < CONNECTED_MS, leader: entry.id === lobby!.leaderId, playing: seated.has(entry.id) })),
      round: round && isArcadeGame(round.game) ? { number: round.number, game: round.game, teams: round.teams, seated: Boolean(member && seated.has(member.id)) } : null,
      ...scores,
      // A stored choice of a game no longer offered is simply not shown.
      pick: ArcadePickSchema.safeParse(lobby.pick).data ?? null,
    });
  }

  app.get('/api/arcade', async (request, reply) => {
    try {
      guard(request, 'list', 600); const now = new Date();
      const found = await client.arcadeLobby.findMany({ where: lobbies.openWhere(now), orderBy: { createdAt: 'desc' }, take: 40, include: {
        members: { where: { leftAt: null }, select: { id: true, displayName: true, lastSeenAt: true, leftAt: true } }, rounds: { where: { endedAt: null }, select: { game: true } } } });
      const mine = await Promise.all(found.map(lobby => lobbies.memberOf(lobby.id, request.headers.cookie)));
      return { ok: true, data: ArcadeListSchema.parse({ lobbies: found.map((lobby, index) => ({ id: lobby.id, title: lobby.title, locked: lobby.locked, protected: Boolean(lobby.passwordHash),
        players: lobby.members.filter(member => present(member, now)).length, leaderName: lobby.passwordHash && !mine[index] ? null : lobby.members.find(member => member.id === lobby.leaderId)?.displayName ?? null,
        playing: lobby.rounds[0] && isArcadeGame(lobby.rounds[0].game) ? lobby.rounds[0].game : null, member: Boolean(mine[index]) })) }) };
    } catch (error) { return fail(reply, error); }
  });
  app.get('/api/arcade/leaderboard', async (request, reply) => {
    try { guard(request, 'list', 600); return { ok: true, data: ArcadeLeaderboardSchema.parse(await leaderboard(client)) }; } catch (error) { return fail(reply, error); }
  });
  app.post('/api/arcade', async (request, reply) => {
    try {
      guard(request, 'create', 10);
      const created = await lobbies.create(request.body, request.headers.cookie, await signedIn(request));
      if (created.token) reply.header('set-cookie', memberCookie(config, created.lobbyId, created.token));
      app.log.info({ event: 'arcade_lobby_opened' }, 'Arcade lobby opened');
      return { ok: true, data: { lobbyId: created.lobbyId } };
    } catch (error) { return fail(reply, error); }
  });
  app.get('/api/arcade/lobbies/:lobbyId', async (request, reply) => {
    try { guard(request, 'view', 1200); return { ok: true, data: await view(lobbyParam(request), request.headers.cookie) }; } catch (error) { return fail(reply, error); }
  });
  app.post('/api/arcade/lobbies/:lobbyId/join', async (request, reply) => {
    try {
      guard(request, 'join', 30); const lobbyId = lobbyParam(request);
      const joined = await lobbies.join(lobbyId, request.body, request.headers.cookie, await signedIn(request));
      if (joined.token) reply.header('set-cookie', memberCookie(config, lobbyId, joined.token));
      return { ok: true, data: {} };
    } catch (error) { return fail(reply, error); }
  });
  app.post('/api/arcade/lobbies/:lobbyId/lock', async (request, reply) => {
    try {
      guard(request, 'act', 240); const lobbyId = lobbyParam(request);
      const body = ArcadeLockSchema.safeParse(request.body); roomAssert(body.success, 'INVALID_COMMAND');
      await lobbies.setLocked(await requireMember(request, lobbyId), body.data.locked); return { ok: true, data: {} };
    } catch (error) { return fail(reply, error); }
  });
  app.post('/api/arcade/lobbies/:lobbyId/pick', async (request, reply) => {
    try {
      guard(request, 'act', 240); const lobbyId = lobbyParam(request);
      const body = ArcadePickSchema.safeParse(request.body); roomAssert(body.success, 'INVALID_COMMAND');
      await lobbies.setPick(await requireMember(request, lobbyId), body.data); return { ok: true, data: {} };
    } catch (error) { return fail(reply, error); }
  });
  app.post('/api/arcade/lobbies/:lobbyId/password', async (request, reply) => {
    try {
      guard(request, 'password', 10); const lobbyId = lobbyParam(request);
      const body = ArcadePasswordUpdateSchema.safeParse(request.body); roomAssert(body.success, 'INVALID_COMMAND');
      await lobbies.setPassword(await requireMember(request, lobbyId), body.data.password);
      return { ok: true, data: {} };
    } catch (error) { return fail(reply, error); }
  });
  app.post('/api/arcade/lobbies/:lobbyId/leave', async (request, reply) => {
    try { guard(request, 'act', 240); const lobbyId = lobbyParam(request); await lobbies.leave(await requireMember(request, lobbyId)); return { ok: true, data: {} }; } catch (error) { return fail(reply, error); }
  });
  // A phone in a round's room checks in here, so its member stays present (and leader) while playing.
  app.post('/api/arcade/lobbies/:lobbyId/here', async (request, reply) => {
    try { guard(request, 'view', 1200); const lobbyId = lobbyParam(request); await lobbies.touch(await requireMember(request, lobbyId)); return { ok: true, data: {} }; } catch (error) { return fail(reply, error); }
  });
  app.post('/api/arcade/lobbies/:lobbyId/rounds', async (request, reply) => {
    try { guard(request, 'act', 240); const lobbyId = lobbyParam(request); return { ok: true, data: await rounds.start(await requireMember(request, lobbyId), request.body) }; } catch (error) { return fail(reply, error); }
  });
  // From the lobby page: the leader ends a round (also one they do not play in, for example after taking over).
  app.post('/api/arcade/lobbies/:lobbyId/round/end', async (request, reply) => {
    try {
      guard(request, 'act', 240); const lobbyId = lobbyParam(request); const member = await requireMember(request, lobbyId); const now = new Date();
      roomAssert(await client.$transaction(async tx => { await lockLobby(tx, lobbyId); return ensureLeader(tx, lobbyId, now); }) === member.id, 'FORBIDDEN');
      const open = await client.arcadeRound.findFirst({ where: { lobbyId, endedAt: null } }); roomAssert(open, 'INVALID_STATE');
      await rounds.end(open.id, now); return { ok: true, data: {} };
    } catch (error) { return fail(reply, error); }
  });
  // A seated member enters the round's room: this sets the room's player cookie.
  app.post('/api/arcade/lobbies/:lobbyId/enter', async (request, reply) => {
    try {
      guard(request, 'act', 240); const entered = await rounds.enter(await requireMember(request, lobbyParam(request)));
      reply.header('set-cookie', roomCookie(config, entered.sessionId, entered.token, entered.expiresAt));
      return { ok: true, data: { sessionId: entered.sessionId } };
    } catch (error) { return fail(reply, error); }
  });
  // The leader's steps in the round's room, signed in with that room's player cookie.
  app.post('/api/arcade/rounds/:sessionId/act', async (request, reply) => {
    try {
      guard(request, 'act', 240); const sessionId = sessionParam(request);
      await rounds.act(await gateway.authenticate(sessionId, request.headers.cookie), request.body); return { ok: true, data: {} };
    } catch (error) { return fail(reply, error); }
  });

  app.post('/api/arcade/rounds/:sessionId/display', async (request, reply) => {
    try {
      guard(request, 'act', 240); const sessionId = sessionParam(request);
      return { ok: true, data: await rounds.display(await gateway.authenticate(sessionId, request.headers.cookie)) };
    } catch (error) { return fail(reply, error); }
  });

  let sweeping: Promise<unknown> | undefined;
  const sweeper = setInterval(() => { sweeping ??= rounds.sweep().then(count => { if (count) app.log.info({ event: 'arcade_lobbies_closed', count }, 'Quiet arcade lobbies closed'); })
    .catch(() => app.log.warn({ event: 'arcade_sweep_failed' }, 'Closing quiet arcade lobbies failed')).finally(() => { sweeping = undefined; }); }, 60_000);
  sweeper.unref();
  app.addHook('preClose', async () => { clearInterval(sweeper); await sweeping; });
}
