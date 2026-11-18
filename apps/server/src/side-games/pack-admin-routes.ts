import type { FastifyInstance, FastifyRequest } from 'fastify';
import { EconomySchema, PackAdminSchema, PackItemInputSchema, PackSetInputSchema } from '@party/contracts';
import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { OwnerAccess } from '../hosting/owner-access.js';
import { roomAssert } from '../rooms/security.js';
import { readEconomy, writeEconomy } from './economy.js';
import { adminSets, packAdmin } from './pack-sets.js';

// Admin → Chips & packs: the chip economy and the pack sets, for the owner only. Every change answers with
// the whole page again, so the screen always shows what is stored.
const SetId = z.uuid(); const ItemKey = z.string().min(1).max(40);

export function registerPackAdminRoutes(app: FastifyInstance, client: PrismaClient, owner: OwnerAccess) {
  const page = async () => PackAdminSchema.parse({ economy: await readEconomy(client), sets: await adminSets(client) });
  const param = <T>(request: FastifyRequest, name: string, schema: z.ZodType<T>) => { const value = schema.safeParse((request.params as Record<string, unknown>)[name]); roomAssert(value.success, 'INVALID_COMMAND'); return value.data; };
  const body = <T>(request: FastifyRequest, schema: z.ZodType<T>) => { const value = schema.safeParse(request.body); roomAssert(value.success, 'INVALID_COMMAND'); return value.data; };
  const change = (path: string, work: (request: FastifyRequest) => Promise<unknown>) =>
    app.post(path, async (request, reply) => {
      try { owner.requireOwner(request, 'edit'); await work(request); return { ok: true, data: await page() }; } catch (error) { return owner.fail(reply, error); }
    });

  app.get('/api/host/packs', async (request, reply) => {
    try { owner.requireOwner(request); return { ok: true, data: await page() }; } catch (error) { return owner.fail(reply, error); }
  });
  change('/api/host/packs/economy', request => writeEconomy(client, body(request, EconomySchema)));
  change('/api/host/packs/sets', request => packAdmin.createSet(client, body(request, PackSetInputSchema)));
  change('/api/host/packs/sets/:setId', async request => roomAssert(await packAdmin.updateSet(client, param(request, 'setId', SetId), body(request, PackSetInputSchema)), 'NOT_FOUND'));
  change('/api/host/packs/sets/:setId/delete', async request => roomAssert(await packAdmin.archiveSet(client, param(request, 'setId', SetId)), 'NOT_FOUND'));
  change('/api/host/packs/sets/:setId/items', async request => {
    const setId = param(request, 'setId', SetId); const input = body(request, PackItemInputSchema);
    roomAssert(await client.packSet.count({ where: { id: setId, archivedAt: null } }) === 1, 'NOT_FOUND');
    await packAdmin.addItem(client, setId, input);
  });
  change('/api/host/packs/items/:itemKey', async request => roomAssert(await packAdmin.updateItem(client, param(request, 'itemKey', ItemKey), body(request, PackItemInputSchema)), 'NOT_FOUND'));
  change('/api/host/packs/items/:itemKey/delete', async request => roomAssert(await packAdmin.retireItem(client, param(request, 'itemKey', ItemKey)), 'NOT_FOUND'));
}
