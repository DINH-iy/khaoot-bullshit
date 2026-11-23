import type { FastifyInstance, FastifyRequest } from 'fastify';
import { GameIdSchema, GroupMatchesSchema, MAX_GROUP_MEMBERS, NewPersonGroupSchema, PersonGroupListSchema, PersonGroupSchema, UpdatePersonGroupSchema } from '@party/contracts';
import type { Transaction } from '../game/model.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { OwnerAccess } from '../hosting/owner-access.js';
import { RoomError, roomAssert } from '../rooms/security.js';
import { nameKey, nameTaken } from './accounts.js';
import { matchingIds } from './directory.js';

// Groups of people (Admin → People → Groups), owner only. A group is a shortcut for the host's
// "Add people…" list in a room: it never gives anyone rights and holds no history.
const MAX_GROUPS = 200;
// Removed people drop out of every group (their membership row stays, harmlessly, as history of who was in it).
const MEMBERS = { where: { person: { removedAt: null } }, orderBy: { person: { name: 'asc' } }, select: { personId: true, person: { select: { name: true } } } } as const;
const shown = (group: { id: string; name: string; members: { personId: string; person: { name: string } }[] }) =>
  ({ id: group.id, name: group.name, personIds: group.members.map(member => member.personId), names: group.members.map(member => member.person.name) });
/** The group as the pages show it, after a change. */
const reread = async (tx: Transaction, id: string) => shown(await tx.personGroup.findUniqueOrThrow({ where: { id }, select: { id: true, name: true, members: MEMBERS } }));

export function registerGroupRoutes(app: FastifyInstance, client: PrismaClient, owner: OwnerAccess) {
  const idParam = (request: FastifyRequest) => { const id = GameIdSchema.safeParse((request.params as { id?: string }).id); roomAssert(id.success, 'INVALID_COMMAND'); return id.data; };
  const named = <T>(work: Promise<T>) => work.catch((error: unknown) => { throw nameTaken(error) ? new RoomError('NAME_TAKEN') : error; });

  app.get('/api/host/groups', async (request, reply) => {
    try {
      owner.requireOwner(request);
      const groups = await client.personGroup.findMany({ orderBy: { name: 'asc' }, take: MAX_GROUPS, select: { id: true, name: true, members: MEMBERS } });
      return { ok: true, data: PersonGroupListSchema.parse({ groups: groups.map(shown) }) };
    } catch (error) { return owner.fail(reply, error); }
  });
  app.post('/api/host/groups', async (request, reply) => {
    try {
      owner.requireOwner(request, 'edit');
      const parsed = NewPersonGroupSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      roomAssert(await client.personGroup.count() < MAX_GROUPS, 'RATE_LIMITED');
      const group = await named(client.personGroup.create({ data: { name: parsed.data.name, nameKey: nameKey(parsed.data.name) } }));
      return { ok: true, data: PersonGroupSchema.parse({ id: group.id, name: group.name, personIds: [], names: [] }) };
    } catch (error) { return owner.fail(reply, error); }
  });
  // A new name and/or the whole member list, in one transaction: the list is replaced, never merged.
  app.put('/api/host/groups/:id', async (request, reply) => {
    try {
      owner.requireOwner(request, 'edit'); const id = idParam(request);
      const parsed = UpdatePersonGroupSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      const { name, personIds } = parsed.data;
      const saved = await named(client.$transaction(async tx => {
        const group = await tx.personGroup.findUnique({ where: { id } }); roomAssert(group, 'NOT_FOUND');
        if (name !== undefined) await tx.personGroup.update({ where: { id }, data: { name, nameKey: nameKey(name) } });
        if (personIds !== undefined) {
          const found = (await tx.person.findMany({ where: { id: { in: [...new Set(personIds)] }, removedAt: null }, select: { id: true } })).map(person => person.id);
          await tx.personGroupMember.deleteMany({ where: { groupId: id } });
          if (found.length) await tx.personGroupMember.createMany({ data: found.map(personId => ({ groupId: id, personId })) });
        }
        return reread(tx, id);
      }));
      return { ok: true, data: PersonGroupSchema.parse(saved) };
    } catch (error) { return owner.fail(reply, error); }
  });
  // Everyone whose name contains the search (everyone when it is empty) in or out at once, also those on other pages.
  app.post('/api/host/groups/:id/matches', async (request, reply) => {
    try {
      owner.requireOwner(request, 'edit'); const id = idParam(request);
      const parsed = GroupMatchesSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      const { search, add } = parsed.data;
      const saved = await client.$transaction(async tx => {
        const group = await tx.personGroup.findUnique({ where: { id } }); roomAssert(group, 'NOT_FOUND');
        // Matching ignores capitals and accents, as the lists of people do (directory.ts).
        const matching = new Set(await matchingIds(tx, search));
        const current = await tx.personGroupMember.findMany({ where: { groupId: id, person: { removedAt: null } }, select: { personId: true } });
        if (add) {
          const inGroup = new Set(current.map(member => member.personId)); const fresh = [...matching].filter(personId => !inGroup.has(personId));
          roomAssert(inGroup.size + fresh.length <= MAX_GROUP_MEMBERS, 'GROUP_FULL');
          if (fresh.length) await tx.personGroupMember.createMany({ data: fresh.map(personId => ({ groupId: id, personId })), skipDuplicates: true });
        } else {
          const leaving = current.map(member => member.personId).filter(personId => matching.has(personId));
          if (leaving.length) await tx.personGroupMember.deleteMany({ where: { groupId: id, personId: { in: leaving } } });
        }
        return reread(tx, id);
      });
      return { ok: true, data: PersonGroupSchema.parse(saved) };
    } catch (error) { return owner.fail(reply, error); }
  });
  app.post('/api/host/groups/:id/remove', async (request, reply) => {
    try {
      owner.requireOwner(request, 'edit'); const id = idParam(request);
      const removed = await client.personGroup.deleteMany({ where: { id } }); roomAssert(removed.count === 1, 'NOT_FOUND');
      return { ok: true, data: {} };
    } catch (error) { return owner.fail(reply, error); }
  });
}
