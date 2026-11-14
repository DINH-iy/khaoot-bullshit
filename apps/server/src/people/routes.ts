import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ClaimPersonSchema, GameIdSchema, MeSchema, NewPersonSchema, PeopleListSchema, PersonLinkSchema, PlayerLookSchema, RenamePersonSchema } from '@party/contracts';
import type { Config } from '../config.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { Prisma } from '../generated/prisma/client.js';
import type { OwnerAccess } from '../hosting/owner-access.js';
import { allowedOrigin, newToken, RateLimiter, RoomError, roomAssert, tokenHash } from '../rooms/security.js';
import { clearPersonCookie, personCookie, personFromCookie } from './identity.js';

const nameKey = (name: string) => name.trim().toLowerCase();
const taken = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

export function registerPeopleRoutes(app: FastifyInstance, client: PrismaClient, config: Config, owner: OwnerAccess) {
  const limiter = new RateLimiter(2048);
  const guard = (request: FastifyRequest, limit: number) => {
    roomAssert(request.headers['x-party-request'] === '1' && allowedOrigin(request.headers, config), 'ORIGIN_REJECTED');
    roomAssert(limiter.allow(`people:${limit}:${request.ip}`, limit), 'RATE_LIMITED');
  };

  // A phone opens its personal link once: from then on it joins every room as that person.
  app.post('/api/people/claim', async (request, reply) => {
    try {
      guard(request, 20);
      const parsed = ClaimPersonSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      const person = await client.person.findUnique({ where: { linkHash: tokenHash(parsed.data.token) } });
      roomAssert(person && !person.removedAt, 'UNAUTHORIZED');
      const token = newToken();
      await client.personDevice.create({ data: { personId: person.id, tokenHash: tokenHash(token) } });
      reply.header('set-cookie', personCookie(config, token));
      app.log.info({ event: 'person_device_added' }, 'Phone signed in as a person');
      return { ok: true, data: { name: person.name } };
    } catch (error) { return owner.fail(reply, error); }
  });
  app.get('/api/people/me', async (request, reply) => {
    try {
      guard(request, 120);
      const found = await personFromCookie(client, request.headers.cookie);
      const look = PlayerLookSchema.safeParse(found?.person.look);
      return { ok: true, data: MeSchema.parse({ person: found ? { id: found.person.id, name: found.person.name, look: look.success ? look.data : null } : null }) };
    } catch (error) { return owner.fail(reply, error); }
  });
  // "Not me": this phone stops being that person (other phones stay signed in).
  app.post('/api/people/forget', async (request, reply) => {
    try {
      guard(request, 20);
      const found = await personFromCookie(client, request.headers.cookie);
      if (found) await client.personDevice.update({ where: { id: found.deviceId }, data: { revokedAt: new Date() } });
      reply.header('set-cookie', clearPersonCookie(config));
      return { ok: true, data: {} };
    } catch (error) { return owner.fail(reply, error); }
  });

  // The owner makes and manages people in the admin menu.
  const idParam = (request: FastifyRequest) => { const id = GameIdSchema.safeParse((request.params as { id?: string }).id); roomAssert(id.success, 'INVALID_COMMAND'); return id.data; };
  const freshLink = async (id: string) => {
    const token = newToken();
    const person = await client.person.update({ where: { id }, data: { linkHash: tokenHash(token) } });
    return PersonLinkSchema.parse({ id: person.id, name: person.name, token });
  };
  app.get('/api/host/people', async (request, reply) => {
    try {
      owner.requireOwner(request);
      const people = await client.person.findMany({ where: { removedAt: null }, orderBy: { name: 'asc' }, take: 500, select: {
        id: true, name: true, createdAt: true,
        devices: { where: { revokedAt: null }, select: { lastSeenAt: true } },
        _count: { select: { players: true } },
      } });
      const sums = await client.chipEntry.groupBy({ by: ['personId', 'reason'], where: { personId: { in: people.map(person => person.id) } }, _sum: { amount: true } });
      const total = (id: string, reasons: string[]) => sums.filter(row => row.personId === id && reasons.includes(row.reason)).reduce((sum, row) => sum + (row._sum.amount ?? 0), 0);
      return { ok: true, data: PeopleListSchema.parse({ people: people.map(person => ({
        id: person.id, name: person.name, createdAt: person.createdAt.toISOString(), devices: person.devices.length,
        lastSeenAt: person.devices.reduce<Date | null>((latest, device) => !latest || device.lastSeenAt > latest ? device.lastSeenAt : latest, null)?.toISOString() ?? null,
        games: person._count.players, chips: total(person.id, ['START', 'REFILL', 'BET', 'PAYOUT']), wagered: -total(person.id, ['BET']),
      })) }) };
    } catch (error) { return owner.fail(reply, error); }
  });
  app.post('/api/host/people', async (request, reply) => {
    try {
      owner.requireOwner(request);
      const parsed = NewPersonSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      const token = newToken();
      const person = await client.person.create({ data: { name: parsed.data.name, nameKey: nameKey(parsed.data.name), linkHash: tokenHash(token) } })
        .catch(error => { throw taken(error) ? new RoomError('NAME_TAKEN') : error; });
      return { ok: true, data: PersonLinkSchema.parse({ id: person.id, name: person.name, token }) };
    } catch (error) { return owner.fail(reply, error); }
  });
  app.put('/api/host/people/:id', async (request, reply) => {
    try {
      owner.requireOwner(request);
      const parsed = RenamePersonSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      const changed = await client.person.updateMany({ where: { id: idParam(request), removedAt: null }, data: { name: parsed.data.name, nameKey: nameKey(parsed.data.name) } })
        .catch(error => { throw taken(error) ? new RoomError('NAME_TAKEN') : error; });
      roomAssert(changed.count === 1, 'NOT_FOUND');
      return { ok: true, data: {} };
    } catch (error) { return owner.fail(reply, error); }
  });
  // A new personal link: the old link stops working; phones already signed in stay signed in.
  app.post('/api/host/people/:id/link', async (request, reply) => {
    try {
      owner.requireOwner(request); const id = idParam(request);
      roomAssert(await client.person.count({ where: { id, removedAt: null } }) === 1, 'NOT_FOUND');
      return { ok: true, data: await freshLink(id) };
    } catch (error) { return owner.fail(reply, error); }
  });
  app.post('/api/host/people/:id/sign-out', async (request, reply) => {
    try {
      owner.requireOwner(request); const id = idParam(request);
      roomAssert(await client.person.count({ where: { id, removedAt: null } }) === 1, 'NOT_FOUND');
      await client.personDevice.updateMany({ where: { personId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      return { ok: true, data: {} };
    } catch (error) { return owner.fail(reply, error); }
  });
  // Removing keeps history (seats, chips) but signs every phone out and frees the name.
  app.post('/api/host/people/:id/remove', async (request, reply) => {
    try {
      owner.requireOwner(request); const id = idParam(request);
      await client.$transaction(async tx => {
        const person = await tx.person.findUnique({ where: { id } }); roomAssert(person && !person.removedAt, 'NOT_FOUND');
        await tx.personDevice.updateMany({ where: { personId: id, revokedAt: null }, data: { revokedAt: new Date() } });
        await tx.person.update({ where: { id }, data: { removedAt: new Date(), nameKey: `removed:${id.replaceAll('-', '')}`, linkHash: tokenHash(newToken()) } });
      });
      return { ok: true, data: {} };
    } catch (error) { return owner.fail(reply, error); }
  });
}
