import type { FastifyInstance, FastifyRequest } from 'fastify';
import { GameIdSchema, MAX_SAVED_STYLES, SavedStyleListSchema, SavedStyleSchema, SaveStyleSchema } from '@party/contracts';
import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import type { OwnerAccess } from '../hosting/owner-access.js';
import { ownerCreator } from '../hosting/owner-creator.js';
import { RoomError, roomAssert } from '../rooms/security.js';

// Saved styles (contracts/styles.ts): looks made in Look & feel, shared by the owner and
// editors like prefabs. A game copies the values it uses, so nothing here is ever played.
const MAX_THEME_BYTES = 8 * 1024;

export function registerStyleRoutes(app: FastifyInstance, client: PrismaClient, owner: OwnerAccess) {
  const idParam = (request: FastifyRequest) => { const id = GameIdSchema.safeParse((request.params as { styleId?: string }).styleId); roomAssert(id.success, 'INVALID_COMMAND'); return id.data; };
  const style = (row: { id: string; name: string; theme: unknown; updatedAt: Date }) => SavedStyleSchema.safeParse({ id: row.id, name: row.name, theme: row.theme, updatedAt: row.updatedAt.toISOString() });

  app.get('/api/host/styles', async (request, reply) => {
    try {
      await owner.requireEditor(request);
      const creator = await ownerCreator(client);
      const rows = await client.themeStyle.findMany({ where: { creatorId: creator.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: MAX_SAVED_STYLES });
      // A style that no longer fits the current look settings is left out rather than breaking the list.
      return { ok: true, data: SavedStyleListSchema.parse(rows.map(style).flatMap(result => result.success ? [result.data] : [])) };
    } catch (error) { return owner.fail(reply, error); }
  });

  // Saving is idempotent per styleId: it creates the style, or replaces its name and look.
  app.post('/api/host/styles', { bodyLimit: MAX_THEME_BYTES + 1024 }, async (request, reply) => {
    try {
      await owner.requirePermission(request, 'games.make', 'edit');
      const parsed = SaveStyleSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      const { styleId, name, theme } = parsed.data;
      roomAssert(Buffer.byteLength(JSON.stringify(theme), 'utf8') <= MAX_THEME_BYTES, 'INVALID_COMMAND');
      const creator = await ownerCreator(client);
      const row = await client.$transaction(async tx => {
        // One writer at a time per owner, so the limit holds when two saves arrive together.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(519243092)`;
        const existing = await tx.themeStyle.findUnique({ where: { id: styleId } });
        if (existing) {
          roomAssert(existing.creatorId === creator.id, 'NOT_FOUND');
          return tx.themeStyle.update({ where: { id: styleId }, data: { name, theme: theme as Prisma.InputJsonValue } });
        }
        roomAssert(await tx.themeStyle.count({ where: { creatorId: creator.id } }) < MAX_SAVED_STYLES, 'STYLE_LIMIT');
        return tx.themeStyle.create({ data: { id: styleId, creatorId: creator.id, name, theme: theme as Prisma.InputJsonValue } });
      }, { isolationLevel: 'ReadCommitted' });
      app.log.info({ event: 'style_saved' }, 'Style saved');
      const result = style(row); roomAssert(result.success, 'INVALID_COMMAND');
      return { ok: true, data: result.data };
    } catch (error) { return owner.fail(reply, error); }
  });

  app.post('/api/host/styles/:styleId/delete', async (request, reply) => {
    try {
      await owner.requirePermission(request, 'games.make', 'edit');
      const creator = await ownerCreator(client);
      const removed = await client.themeStyle.deleteMany({ where: { id: idParam(request), creatorId: creator.id } });
      if (removed.count !== 1) throw new RoomError('NOT_FOUND');
      return { ok: true, data: {} };
    } catch (error) { return owner.fail(reply, error); }
  });
}
