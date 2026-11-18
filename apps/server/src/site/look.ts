import type { FastifyInstance } from 'fastify';
import { SiteLookSchema, type SiteLook } from '@party/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { OwnerAccess } from '../hosting/owner-access.js';
import { roomAssert } from '../rooms/security.js';

// The site's look for the join screen (before a room code): the owner's setting, one row in site_settings.
// Nothing stored, or something that no longer fits, means the standard look.
const KEY = 'siteLook';
export async function readSiteLook(client: PrismaClient): Promise<SiteLook> {
  const row = await client.siteSetting.findUnique({ where: { key: KEY } });
  const parsed = SiteLookSchema.safeParse(row?.value); return parsed.success ? parsed.data : {};
}

export function registerSiteLook(app: FastifyInstance, client: PrismaClient, owner: OwnerAccess) {
  // For every visitor: the join screen asks for it before anything else.
  app.get('/api/site/look', async () => ({ ok: true, data: await readSiteLook(client) }));
  app.get('/api/host/site-look', async (request, reply) => {
    try { owner.requireOwner(request); return { ok: true, data: await readSiteLook(client) }; } catch (error) { return owner.fail(reply, error); }
  });
  app.post('/api/host/site-look', async (request, reply) => {
    try {
      owner.requireOwner(request, 'edit');
      const parsed = SiteLookSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      await client.siteSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: parsed.data }, update: { value: parsed.data } });
      return { ok: true, data: parsed.data };
    } catch (error) { return owner.fail(reply, error); }
  });
}
