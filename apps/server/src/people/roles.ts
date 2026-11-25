import type { FastifyInstance, FastifyRequest } from 'fastify';
import { GameIdSchema, RoleInputSchema, RoleListSchema, type Role } from '@party/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { createOwnerAccess } from '../hosting/owner-access.js';
import type { EditorLive } from '../authoring/live.js';
import { RoomError, roomAssert } from '../rooms/security.js';
import { recordAction } from '../admin/actions.js';

/**
 * Admin → Roles (the owner only): the owner's own roles, each a name and a set of permissions (contracts/roles.ts).
 * The built-in Editor and Viewer can be renamed and changed but not removed (new shares start as Editor); any
 * other role can be removed once no person and no shared game uses it. A change takes effect at once.
 */
export function registerRoleRoutes(app: FastifyInstance, client: PrismaClient, owner: ReturnType<typeof createOwnerAccess>, live?: EditorLive) {
  const idParam = (request: FastifyRequest) => { const id = GameIdSchema.safeParse((request.params as { id?: string }).id); roomAssert(id.success, 'INVALID_COMMAND'); return id.data; };
  const nameKey = (name: string) => name.trim().toLowerCase();
  const taken = (error: unknown) => (error as { code?: unknown } | null)?.code === 'P2002';
  const list = async (): Promise<Role[]> => (await client.accessRole.findMany({ orderBy: [{ builtIn: 'desc' }, { nameKey: 'asc' }], include: { _count: { select: { people: { where: { removedAt: null } }, shares: true } } } }))
    .map(role => ({ id: role.id, name: role.name, permissions: RoleInputSchema.shape.permissions.parse(role.permissions.filter(entry => RoleInputSchema.shape.permissions.element.safeParse(entry).success)),
      builtIn: role.builtIn, people: role._count.people, shares: role._count.shares }));
  /** Everyone working with this role closes their open editor, so the changed rights apply at once (every request reads them again anyway). */
  const dropHolders = async (roleId: string) => {
    if (!live) return;
    const holders = await client.person.findMany({ where: { OR: [{ roleId }, { gameShares: { some: { roleId } } }] }, select: { id: true } });
    for (const person of holders) live.dropPerson(person.id);
  };

  app.get('/api/host/roles', async (request, reply) => {
    try { owner.requireOwner(request); return { ok: true, data: RoleListSchema.parse({ roles: await list() }) }; } catch (error) { return owner.fail(reply, error); }
  });
  app.post('/api/host/roles', async (request, reply) => {
    try {
      owner.requireOwner(request);
      const parsed = RoleInputSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      const role = await client.accessRole.create({ data: { name: parsed.data.name, nameKey: nameKey(parsed.data.name), permissions: [...new Set(parsed.data.permissions)] } })
        .catch((error: unknown) => { throw taken(error) ? new RoomError('NAME_TAKEN') : error; });
      await recordAction(client, { personId: null }, 'role.added', role.name, { permissions: role.permissions });
      return { ok: true, data: { id: role.id } };
    } catch (error) { return owner.fail(reply, error); }
  });
  app.put('/api/host/roles/:id', async (request, reply) => {
    try {
      owner.requireOwner(request); const id = idParam(request);
      const parsed = RoleInputSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      const changed = await client.accessRole.updateMany({ where: { id }, data: { name: parsed.data.name, nameKey: nameKey(parsed.data.name), permissions: [...new Set(parsed.data.permissions)] } })
        .catch((error: unknown) => { throw taken(error) ? new RoomError('NAME_TAKEN') : error; });
      roomAssert(changed.count === 1, 'NOT_FOUND');
      await dropHolders(id);
      await recordAction(client, { personId: null }, 'role.changed', parsed.data.name, { permissions: parsed.data.permissions });
      return { ok: true, data: {} };
    } catch (error) { return owner.fail(reply, error); }
  });
  app.post('/api/host/roles/:id/delete', async (request, reply) => {
    try {
      owner.requireOwner(request); const id = idParam(request);
      const role = await client.accessRole.findUnique({ where: { id }, include: { _count: { select: { people: true, shares: true } } } }); roomAssert(role, 'NOT_FOUND');
      // Built-in roles stay; a role in use stays until nobody (no person, no shared game) has it.
      roomAssert(!role.builtIn && role._count.people === 0 && role._count.shares === 0, 'INVALID_STATE');
      await client.accessRole.delete({ where: { id } });
      await recordAction(client, { personId: null }, 'role.removed', role.name);
      return { ok: true, data: {} };
    } catch (error) { return owner.fail(reply, error); }
  });
}
