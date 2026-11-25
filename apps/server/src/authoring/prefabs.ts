import type { FastifyInstance, FastifyRequest } from 'fastify';
import { GameIdSchema, MAX_PREFAB_BYTES, PrefabListSchema, PrefabSchema, PrefabSummarySchema, SavePrefabSchema } from '@party/contracts';
import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import type { OwnerAccess } from '../hosting/owner-access.js';
import { ownerCreator } from '../hosting/owner-creator.js';
import { RoomError, roomAssert } from '../rooms/security.js';

// Prefabs: scenes saved from the editor to insert into any game. The owner and
// editors share them, like the games. A prefab is never played as it is: it is
// pasted into a draft, and that draft is validated when it is saved.
const MAX_PREFABS = 200;

export function registerPrefabRoutes(app: FastifyInstance, client: PrismaClient, owner: OwnerAccess) {
  const idParam = (request: FastifyRequest) => { const id = GameIdSchema.safeParse((request.params as { prefabId?: string }).prefabId); roomAssert(id.success, 'INVALID_COMMAND'); return id.data; };
  const summary = (row: { id: string; name: string; sceneCount: number; createdAt: Date }) => PrefabSummarySchema.parse({ id: row.id, name: row.name, sceneCount: row.sceneCount, createdAt: row.createdAt.toISOString() });

  app.get('/api/host/prefabs', async (request, reply) => {
    try {
      await owner.requireEditor(request);
      const creator = await ownerCreator(client);
      const rows = await client.scenePrefab.findMany({ where: { creatorId: creator.id }, orderBy: { createdAt: 'desc' }, take: MAX_PREFABS, select: { id: true, name: true, sceneCount: true, createdAt: true } });
      return { ok: true, data: PrefabListSchema.parse({ prefabs: rows.map(summary) }) };
    } catch (error) { return owner.fail(reply, error); }
  });
  app.get('/api/host/prefabs/:prefabId', async (request, reply) => {
    try {
      await owner.requireEditor(request, 'edit');
      const creator = await ownerCreator(client);
      const row = await client.scenePrefab.findFirst({ where: { id: idParam(request), creatorId: creator.id } }); roomAssert(row, 'NOT_FOUND');
      return { ok: true, data: PrefabSchema.parse({ ...summary(row), content: row.content }) };
    } catch (error) { return owner.fail(reply, error); }
  });
  // Saving is idempotent per prefabId: a retried click returns the same prefab.
  app.post('/api/host/prefabs', { bodyLimit: MAX_PREFAB_BYTES + 4 * 1024 }, async (request, reply) => {
    try {
      await owner.requirePermission(request, 'games.make');
      const parsed = SavePrefabSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      const { prefabId, name, content } = parsed.data;
      roomAssert(Buffer.byteLength(JSON.stringify(content), 'utf8') <= MAX_PREFAB_BYTES, 'INVALID_COMMAND');
      const creator = await ownerCreator(client);
      const existing = await client.scenePrefab.findUnique({ where: { id: prefabId } });
      if (existing) { roomAssert(existing.creatorId === creator.id, 'NOT_FOUND'); return { ok: true, data: summary(existing) }; }
      roomAssert(await client.scenePrefab.count({ where: { creatorId: creator.id } }) < MAX_PREFABS, 'PREFAB_LIMIT');
      const row = await client.scenePrefab.create({ data: { id: prefabId, creatorId: creator.id, name, sceneCount: content.nodes.length, content: content as Prisma.InputJsonValue } })
        .catch(async (error: unknown) => {
          // Two identical requests at once: the second finds the first one's prefab.
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return client.scenePrefab.findUniqueOrThrow({ where: { id: prefabId } });
          throw error;
        });
      roomAssert(row.creatorId === creator.id, 'NOT_FOUND');
      app.log.info({ event: 'prefab_saved', scenes: row.sceneCount }, 'Prefab saved');
      return { ok: true, data: summary(row) };
    } catch (error) { return owner.fail(reply, error); }
  });
  app.post('/api/host/prefabs/:prefabId/delete', async (request, reply) => {
    try {
      await owner.requirePermission(request, 'games.make');
      const creator = await ownerCreator(client);
      const removed = await client.scenePrefab.deleteMany({ where: { id: idParam(request), creatorId: creator.id } });
      if (removed.count !== 1) throw new RoomError('NOT_FOUND');
      return { ok: true, data: {} };
    } catch (error) { return owner.fail(reply, error); }
  });
}
