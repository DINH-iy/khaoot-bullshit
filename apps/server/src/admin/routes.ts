import { statfs } from 'node:fs/promises';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AdminHealthSchema, GameIdSchema, AdminActionListSchema, AdminRoomsSchema, AdminStorageSchema } from '@party/contracts';
import type { Config } from '../config.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { createOwnerAccess } from '../hosting/owner-access.js';
import { ownerCreator } from '../hosting/owner-creator.js';
import { closeRoom } from '../rooms/close.js';
import { readRoomState } from '../rooms/reclaim.js';
import { roomAssert } from '../rooms/security.js';
import { defaultMediaDirectory } from '../assets/media.js';
import { cleanUpMedia } from '../assets/cleanup.js';
import { recordAction } from './actions.js';
import { readHealth } from './health.js';
import type { DatabaseHealth } from '../database/client.js';
import type { RequestMetrics } from '../diagnostics/observability.js';

/**
 * Admin → Live rooms, Storage and Action log, for the owner only. Live rooms lists every room still open
 * (the owner's, rehearsals and arcade rounds) and can close one; closing keeps its history like a finished
 * game. Storage shows what the server keeps and runs the usual clean-up at once. The action log reads
 * what the owner and editors changed.
 */
export function registerAdminRoutes(app: FastifyInstance, client: PrismaClient, config: Config, owner: ReturnType<typeof createOwnerAccess>,
  health?: { metrics: RequestMetrics; database: DatabaseHealth; connections: () => number }) {
  const directory = config.MEDIA_DIR ?? defaultMediaDirectory;
  const sessionParam = (request: FastifyRequest) => { const id = GameIdSchema.safeParse((request.params as { sessionId?: string }).sessionId); roomAssert(id.success, 'INVALID_COMMAND'); return id.data; };

  app.get('/api/host/admin/rooms', async (request, reply) => {
    try {
      owner.requireOwner(request);
      const creator = await ownerCreator(client);
      const rooms = await client.gameSession.findMany({ where: { status: { not: 'FINISHED' }, roomCode: { not: null } }, orderBy: { createdAt: 'desc' }, take: 200,
        select: { id: true, roomCode: true, status: true, mode: true, hostId: true, createdAt: true, updatedAt: true, state: true, arcadeRound: { select: { id: true } },
          gameVersion: { select: { game: { select: { title: true } } } }, _count: { select: { players: { where: { leftAt: null } } } } } });
      return { ok: true, data: AdminRoomsSchema.parse({ rooms: rooms.map(room => {
        const state = readRoomState(room.state);
        const kind = room.arcadeRound ? 'arcade' : state.tryout ? 'tryout' : room.mode === 'REHEARSAL' && state.rehearsalOf ? 'rehearsal' : 'game';
        return { sessionId: room.id, roomCode: room.roomCode, title: room.gameVersion.game.title, status: room.status, kind, players: room._count.players,
          openedAt: room.createdAt.toISOString(), lastActiveAt: room.updatedAt.toISOString(), yours: room.hostId === creator.id };
      }) }) };
    } catch (error) { return owner.fail(reply, error); }
  });
  // Closing any open room (also an arcade round or someone's rehearsal): it ends as it is; answers and scores stay.
  app.post('/api/host/admin/rooms/:sessionId/close', async (request, reply) => {
    try {
      owner.requireOwner(request); const id = sessionParam(request);
      const room = await client.gameSession.findUnique({ where: { id }, select: { roomCode: true, gameVersion: { select: { game: { select: { title: true } } } } } }); roomAssert(room, 'NOT_FOUND');
      const closed = await client.$transaction(tx => closeRoom(tx, id));
      if (closed) await recordAction(client, { personId: null }, 'room.closed', `${room.gameVersion.game.title} (${room.roomCode ?? 'no code'})`);
      return { ok: true, data: { closed } };
    } catch (error) { return owner.fail(reply, error); }
  });

  app.get('/api/host/admin/storage', async (request, reply) => {
    try {
      owner.requireOwner(request);
      const [library, uploads, removedUploads, feedback, logs, database, disk] = await Promise.all([
        client.gameMedia.groupBy({ by: ['kind'], where: { removedAt: null }, _sum: { byteSize: true }, _count: { _all: true }, orderBy: { kind: 'asc' } }),
        client.asset.aggregate({ where: { removedAt: null }, _sum: { byteSize: true }, _count: { _all: true } }),
        client.asset.count({ where: { removedAt: { not: null } } }),
        client.$queryRaw<{ count: bigint; bytes: bigint | null }[]>`SELECT count(*)::bigint AS count, sum(octet_length(data))::bigint AS bytes FROM feedback_attachments`,
        client.deviceLog.count(),
        client.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database())::bigint AS bytes`,
        statfs(directory).then(stats => ({ free: Number(stats.bavail) * Number(stats.bsize), total: Number(stats.blocks) * Number(stats.bsize) }), () => null),
      ]);
      return { ok: true, data: AdminStorageSchema.parse({
        library: library.map(row => ({ kind: row.kind.toLowerCase(), files: row._count._all, bytes: Number(row._sum.byteSize ?? 0) })),
        uploads: { files: uploads._count._all, bytes: Number(uploads._sum.byteSize ?? 0), cleared: removedUploads },
        feedback: { files: Number(feedback[0]?.count ?? 0), bytes: Number(feedback[0]?.bytes ?? 0n) }, deviceLogs: logs,
        databaseBytes: Number(database[0]?.bytes ?? 0n), disk, retentionDays: config.MEDIA_RETENTION_DAYS,
      }) };
    } catch (error) { return owner.fail(reply, error); }
  });
  // The usual clean-up (it also runs every 10 minutes), at once: files of rooms over the keeping time, unsent uploads, unused pictures.
  app.post('/api/host/admin/storage/clean-up', async (request, reply) => {
    try {
      owner.requireOwner(request);
      const result = await cleanUpMedia(client, directory, new Date(), config.MEDIA_RETENTION_DAYS);
      await recordAction(client, { personId: null }, 'storage.cleanup', `${result.removed} files removed`, result);
      return { ok: true, data: result };
    } catch (error) { return owner.fail(reply, error); }
  });

  app.get('/api/host/admin/health', async (request, reply) => {
    try {
      owner.requireOwner(request); roomAssert(health, 'AUTH_UNAVAILABLE');
      return { ok: true, data: AdminHealthSchema.parse(await readHealth(client, { ...health!, version: config.APP_VERSION, mediaDirectory: directory })) };
    } catch (error) { return owner.fail(reply, error); }
  });

  app.get('/api/host/admin/actions', async (request, reply) => {
    try {
      owner.requireOwner(request);
      const rows = await client.adminAction.findMany({ orderBy: { createdAt: 'desc' }, take: 300 });
      return { ok: true, data: AdminActionListSchema.parse({ actions: rows.map(row => ({ id: row.id, at: row.createdAt.toISOString(), actor: row.actorName, byOwner: row.actorPersonId === null, action: row.action, subject: row.subject })) }) };
    } catch (error) { return owner.fail(reply, error); }
  });
}
