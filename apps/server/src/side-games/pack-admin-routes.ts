import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { EconomySchema, PackAdminSchema, PackItemInputSchema, PackSetInputSchema } from '@party/contracts';
import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { OwnerAccess } from '../hosting/owner-access.js';
import type { Config } from '../config.js';
import { assetPath, cleanPicture, defaultMediaDirectory, MAX_PICTURE_BYTES, removeStored, storeBytes } from '../assets/media.js';
import { roomAssert } from '../rooms/security.js';
import { readEconomy, writeEconomy } from './economy.js';
import { adminSets, packAdmin } from './pack-sets.js';

// Admin → Chips & packs: the chip economy and the pack sets, for the owner only. Every change answers with
// the whole page again, so the screen always shows what is stored.
const SetId = z.uuid(); const ItemKey = z.string().min(1).max(40);

// Item pictures live in the media folder under PICTURES (not a room's folder), each a cleaned PNG.
const PICTURES = 'pack-items';

export function registerPackAdminRoutes(app: FastifyInstance, client: PrismaClient, config: Config, owner: OwnerAccess) {
  const directory = config.MEDIA_DIR ?? defaultMediaDirectory;
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

  // A picture for an item: a square PNG made on the owner's device, rebuilt here without anything but its image.
  void app.register(async scope => {
    scope.addContentTypeParser('image/png', { parseAs: 'buffer', bodyLimit: MAX_PICTURE_BYTES }, (_request, body, done) => { done(null, body); });
    scope.post('/api/host/packs/items/:itemKey/picture', async (request, reply) => {
      let stored: string | null = null;
      try {
        owner.requireOwner(request, 'edit');
        const key = param(request, 'itemKey', ItemKey);
        const clean = Buffer.isBuffer(request.body) ? cleanPicture(request.body) : null; roomAssert(clean, 'UNSUPPORTED_MEDIA');
        const imageId = randomUUID(); await storeBytes(clean, directory, PICTURES, imageId); stored = imageId;
        const changed = await packAdmin.setPicture(client, key, imageId); roomAssert(changed, 'NOT_FOUND'); stored = null;
        if (changed.previous) await removeStored(directory, PICTURES, changed.previous).catch(() => undefined);
        return { ok: true, data: await page() };
      } catch (error) {
        if (stored) await removeStored(directory, PICTURES, stored).catch(() => undefined);
        return owner.fail(reply, error);
      }
    });
  });
  change('/api/host/packs/items/:itemKey/picture/delete', async request => {
    const changed = await packAdmin.setPicture(client, param(request, 'itemKey', ItemKey), null); roomAssert(changed, 'NOT_FOUND');
    if (changed.previous) await removeStored(directory, PICTURES, changed.previous).catch(() => undefined);
  });
  // Pictures are shown to everyone who sees the packs; the id is a random UUID and a picture never changes.
  app.get('/api/packs/pictures/:imageId', async (request, reply) => {
    const id = SetId.safeParse((request.params as { imageId?: string }).imageId);
    if (!id.success) return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND' } });
    const path = assetPath(directory, PICTURES, id.data);
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND' } });
    return reply.header('content-type', 'image/png').header('cache-control', 'public, max-age=31536000, immutable').header('x-content-type-options', 'nosniff').send(createReadStream(path));
  });
}
