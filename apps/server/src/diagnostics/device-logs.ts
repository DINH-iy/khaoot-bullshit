import type { FastifyInstance, FastifyRequest } from 'fastify';
import { DEVICE_LOG_BODY_MAX, GameIdSchema, LogDetailSchema, LogListSchema, NewDeviceLogSchema, ServerProblemSchema, type LogSummary } from '@party/contracts';
import type { Config } from '../config.js';
import type { DeviceLog, PrismaClient } from '../generated/prisma/client.js';
import type { OwnerAccess } from '../hosting/owner-access.js';
import { allowedOrigin, RateLimiter, roomAssert } from '../rooms/security.js';

const DAY = 24 * 60 * 60 * 1000;
export const LOG_RETENTION_DAYS = 7;
/** Past this many logs in an hour new device logs are refused, so a flood cannot fill the Pi's disk. */
const HOURLY_MAX = 3000;
/** The oldest go first past this many, whatever their age. */
const TOTAL_MAX = 20_000;
const LIST_LIMIT = 300;
/** Server errors this close to a device log, in the same room, are shown with it. */
const RELATED_WINDOW_MS = 15 * 60 * 1000;
const summaryFields = { id: true, source: true, reason: true, summary: true, sessionId: true, lobbyId: true, playerId: true, role: true, requestId: true, createdAt: true } as const;
type SummaryRow = Pick<DeviceLog, keyof typeof summaryFields>;

/** Deletes logs older than the retention period, and the oldest past the total cap. Small batches, safe to repeat. */
export async function pruneLogs(client: PrismaClient, now = new Date()) {
  const old = await client.deviceLog.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - LOG_RETENTION_DAYS * DAY) } } });
  const cut = await client.deviceLog.findMany({ orderBy: { createdAt: 'desc' }, skip: TOTAL_MAX, take: 1, select: { createdAt: true } });
  const over = cut[0] ? await client.deviceLog.deleteMany({ where: { createdAt: { lte: cut[0].createdAt } } }) : { count: 0 };
  return old.count + over.count;
}

const ROLE_NAMES: Record<string, string> = { host: 'Host screen', display: 'Shared screen', player: 'Player', other: 'Device', server: 'Server' };

/** Room codes, lobby names and player names for a page of logs, looked up now (the log itself stores only ids). */
async function summaries(client: PrismaClient, rows: SummaryRow[]): Promise<LogSummary[]> {
  const ids = <K extends 'sessionId' | 'lobbyId' | 'playerId'>(key: K) => [...new Set(rows.map(row => row[key]).filter((id): id is string => Boolean(id)))];
  const [rooms, lobbies, players] = await Promise.all([
    client.gameSession.findMany({ where: { id: { in: ids('sessionId') } }, select: { id: true, roomCode: true } }),
    client.arcadeLobby.findMany({ where: { id: { in: ids('lobbyId') } }, select: { id: true, title: true } }),
    client.sessionPlayer.findMany({ where: { id: { in: ids('playerId') } }, select: { id: true, sessionId: true, displayName: true } }),
  ]);
  const roomCode = new Map(rooms.map(room => [room.id, room.roomCode])); const lobbyName = new Map(lobbies.map(lobby => [lobby.id, lobby.title]));
  const player = new Map(players.map(seat => [seat.id, seat]));
  return rows.map(row => {
    const seat = row.playerId ? player.get(row.playerId) : undefined;
    // The device says which seat it plays in; the name is shown only when that seat is in that room.
    const name = seat && seat.sessionId === row.sessionId ? ` ${seat.displayName}` : '';
    const lobby = row.lobbyId ? lobbyName.get(row.lobbyId) : undefined; const code = row.sessionId ? roomCode.get(row.sessionId) : undefined;
    return {
      id: row.id, source: row.source === 'SERVER' ? 'server' : 'device', reason: row.reason, summary: row.summary,
      sessionId: row.sessionId, lobbyId: row.lobbyId, place: [lobby && `Arcade ${lobby}`, code && `Room ${code}`].filter(Boolean).join(' · ') || null,
      who: `${ROLE_NAMES[row.role] ?? 'Device'}${name}`, requestId: row.requestId, createdAt: row.createdAt.toISOString(),
    };
  });
}

export function registerDeviceLogs(app: FastifyInstance, client: PrismaClient, config: Config, owner: OwnerAccess) {
  const limiter = new RateLimiter(2048);
  // Every phone of a party sends its log when the game ends, often through one router: the limits are generous.
  app.post('/api/diagnostics', {
    bodyLimit: DEVICE_LOG_BODY_MAX,
    onRequest: async (request, reply) => {
      try {
        roomAssert(request.headers['x-party-request'] === '1' && allowedOrigin(request.headers, config), 'ORIGIN_REJECTED');
        roomAssert(limiter.allow(`logs:${request.ip}`, 60) && limiter.allow(`logs-hour:${request.ip}`, 600, 3_600_000), 'RATE_LIMITED');
      } catch (error) { return owner.fail(reply, error); }
    },
  }, async (request, reply) => {
    try {
      const parsed = NewDeviceLogSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      const { id, reason, summary, sessionId, lobbyId, playerId, device, stats, events } = parsed.data;
      roomAssert(await client.deviceLog.count({ where: { createdAt: { gt: new Date(Date.now() - 3_600_000) } } }) < HOURLY_MAX, 'STORAGE_FULL');
      // A retried send (same id) is stored once.
      await client.deviceLog.createMany({ skipDuplicates: true, data: [{
        id, source: 'DEVICE', reason, summary, sessionId, lobbyId, playerId, role: device.role,
        requestId: events.findLast(event => event.requestId && event.kind === 'request' && event.code && !/^2\d\d$/.test(event.code))?.requestId ?? null,
        details: { device, stats, events },
      }] });
      return { ok: true, data: { id } };
    } catch (error) { return owner.fail(reply, error); }
  });

  const idParam = (request: FastifyRequest) => { const id = GameIdSchema.safeParse((request.params as { id?: string }).id); roomAssert(id.success, 'INVALID_COMMAND'); return id.data; };
  app.get('/api/host/logs', async (request, reply) => {
    try {
      owner.requireOwner(request);
      const rows = await client.deviceLog.findMany({ orderBy: { createdAt: 'desc' }, take: LIST_LIMIT, select: summaryFields });
      return { ok: true, data: LogListSchema.parse({ items: await summaries(client, rows) }) };
    } catch (error) { return owner.fail(reply, error); }
  });
  app.get('/api/host/logs/:id', async (request, reply) => {
    try {
      owner.requireOwner(request);
      const row = await client.deviceLog.findUnique({ where: { id: idParam(request) } }); roomAssert(row, 'NOT_FOUND');
      const [summary] = await summaries(client, [row]);
      const details = row.details as Record<string, unknown>;
      const server = row.source === 'SERVER' ? ServerProblemSchema.parse(details) : null;
      const events = row.source === 'DEVICE' && Array.isArray(details['events']) ? details['events'] : [];
      const requestIds = [...new Set(events.map(event => (event as { requestId?: unknown }).requestId).filter((value): value is string => typeof value === 'string'))].slice(0, 300);
      const near = { gte: new Date(row.createdAt.getTime() - RELATED_WINDOW_MS), lte: new Date(row.createdAt.getTime() + 60_000) };
      const relatedRows = row.source === 'DEVICE' ? await client.deviceLog.findMany({
        where: { source: 'SERVER', OR: [{ requestId: { in: requestIds } }, ...(row.sessionId ? [{ sessionId: row.sessionId, createdAt: near }] : []), ...(row.lobbyId ? [{ lobbyId: row.lobbyId, createdAt: near }] : [])] },
        orderBy: { createdAt: 'asc' }, take: 20,
      }) : [];
      const related = (await summaries(client, relatedRows)).map((item, index) => ({ ...item, server: ServerProblemSchema.parse(relatedRows[index]!.details) }));
      return { ok: true, data: LogDetailSchema.parse({
        ...summary, server, related,
        device: row.source === 'DEVICE' ? details['device'] : null, stats: row.source === 'DEVICE' ? details['stats'] : null, events,
      }) };
    } catch (error) { return owner.fail(reply, error); }
  });

  let pruning: Promise<unknown> | undefined;
  const prune = () => { pruning ??= pruneLogs(client).then(count => { if (count) app.log.info({ event: 'logs_pruned', count }, 'Old device logs deleted'); })
    .catch(() => app.log.warn({ event: 'logs_prune_failed' }, 'Deleting old device logs failed')).finally(() => { pruning = undefined; }); };
  const timer = setInterval(prune, 60 * 60 * 1000); timer.unref();
  app.addHook('onReady', async () => { prune(); });
  app.addHook('preClose', async () => { clearInterval(timer); await pruning; });
}
