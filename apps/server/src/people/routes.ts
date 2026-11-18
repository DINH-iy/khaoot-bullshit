import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ClaimPersonSchema, GameIdSchema, MeSchema, NewPersonSchema, PeopleListSchema, PeopleStatsSchema, PersonEditorSchema, PersonKeyViewSchema, PlayerLookSchema, RenamePersonSchema } from '@party/contracts';
import type { Config } from '../config.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { OwnerAccess } from '../hosting/owner-access.js';
import type { EditorLive } from '../authoring/live.js';
import { allowedOrigin, newToken, RateLimiter, RoomError, roomAssert, tokenHash } from '../rooms/security.js';
import { clearPersonCookie, personCookie, personFromCookie } from './identity.js';
import { openPersonKey, personKeyHash } from './keys.js';
import { peopleStats } from './stats.js';
import { addDevice, createPerson, keyFields, nameKey, nameTaken as taken } from './accounts.js';


export function registerPeopleRoutes(app: FastifyInstance, client: PrismaClient, config: Config, owner: OwnerAccess, live?: EditorLive) {
  const limiter = new RateLimiter(2048);
  const guard = (request: FastifyRequest, limit: number) => {
    roomAssert(request.headers['x-party-request'] === '1' && allowedOrigin(request.headers, config), 'ORIGIN_REJECTED');
    roomAssert(limiter.allow(`people:${limit}:${request.ip}`, limit), 'RATE_LIMITED');
  };

  // A phone signs in once, with the personal link or by typing the key: from then on it joins every room as that person.
  app.post('/api/people/claim', async (request, reply) => {
    try {
      guard(request, 20);
      const parsed = ClaimPersonSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      const hash = personKeyHash(parsed.data.token); roomAssert(hash, 'UNAUTHORIZED');
      const person = await client.person.findUnique({ where: { linkHash: hash } });
      roomAssert(person && !person.removedAt, 'UNAUTHORIZED');
      const token = await addDevice(client, person.id);
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
      return { ok: true, data: MeSchema.parse({ person: found ? { id: found.person.id, name: found.person.name, look: look.success ? look.data : null, canEdit: found.person.canEdit } : null }) };
    } catch (error) { return owner.fail(reply, error); }
  });
  // "Not me": this phone stops being that person (other phones stay signed in).
  app.post('/api/people/forget', async (request, reply) => {
    try {
      guard(request, 20);
      const found = await personFromCookie(client, request.headers.cookie);
      if (found) await client.personDevice.update({ where: { id: found.deviceId }, data: { revokedAt: new Date() } });
      if (found?.person.canEdit) live?.dropPerson(found.person.id);
      reply.header('set-cookie', clearPersonCookie(config));
      return { ok: true, data: {} };
    } catch (error) { return owner.fail(reply, error); }
  });

  // The owner makes and manages people in the admin menu. Editors never get here.
  const idParam = (request: FastifyRequest) => { const id = GameIdSchema.safeParse((request.params as { id?: string }).id); roomAssert(id.success, 'INVALID_COMMAND'); return id.data; };
  /** A key and its two stored forms: the hash to check it by, and the sealed copy the owner can open. */
  const activePerson = async (id: string) => roomAssert(await client.person.count({ where: { id, removedAt: null } }) === 1, 'NOT_FOUND');
  app.get('/api/host/people', async (request, reply) => {
    try {
      owner.requireOwner(request);
      const people = await client.person.findMany({ where: { removedAt: null }, orderBy: { name: 'asc' }, take: 500, select: {
        id: true, name: true, createdAt: true, canEdit: true, keySealed: true,
        devices: { where: { revokedAt: null }, select: { lastSeenAt: true } },
        _count: { select: { players: true } },
      } });
      const sums = await client.chipEntry.groupBy({ by: ['personId', 'reason'], where: { personId: { in: people.map(person => person.id) } }, _sum: { amount: true } });
      const total = (id: string, reasons: string[]) => sums.filter(row => row.personId === id && reasons.includes(row.reason)).reduce((sum, row) => sum + (row._sum.amount ?? 0), 0);
      return { ok: true, data: PeopleListSchema.parse({ people: people.map(person => ({
        id: person.id, name: person.name, createdAt: person.createdAt.toISOString(), devices: person.devices.length,
        lastSeenAt: person.devices.reduce<Date | null>((latest, device) => !latest || device.lastSeenAt > latest ? device.lastSeenAt : latest, null)?.toISOString() ?? null,
        games: person._count.players, chips: total(person.id, ['START', 'REFILL', 'BET', 'PAYOUT']), wagered: -total(person.id, ['BET']),
        canEdit: person.canEdit, hasKey: person.keySealed !== null,
      })) }) };
    } catch (error) { return owner.fail(reply, error); }
  });
  // Totals per person over every real game (stats.ts), for the People page and its leaderboard.
  app.get('/api/host/people/stats', async (request, reply) => {
    try {
      owner.requireOwner(request);
      const people = await client.person.findMany({ where: { removedAt: null }, select: { id: true }, take: 500 });
      return { ok: true, data: PeopleStatsSchema.parse({ stats: await peopleStats(client, people.map(person => person.id)) }) };
    } catch (error) { return owner.fail(reply, error); }
  });
  app.post('/api/host/people', async (request, reply) => {
    try {
      const { roomSecret } = owner.requireOwner(request);
      const parsed = NewPersonSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      const { person, key } = await createPerson(client, roomSecret, parsed.data.name, parsed.data.canEdit);
      app.log.info({ event: 'person_added', canEdit: person.canEdit }, 'Person added');
      return { ok: true, data: PersonKeyViewSchema.parse({ id: person.id, name: person.name, key }) };
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
  // Editor rights: work on the owner's games. Taking them away also closes any editor they have open.
  app.post('/api/host/people/:id/editor', async (request, reply) => {
    try {
      owner.requireOwner(request); const id = idParam(request);
      const parsed = PersonEditorSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      const changed = await client.person.updateMany({ where: { id, removedAt: null }, data: { canEdit: parsed.data.canEdit } });
      roomAssert(changed.count === 1, 'NOT_FOUND');
      if (!parsed.data.canEdit) live?.dropPerson(id);
      app.log.info({ event: 'person_editor_changed', canEdit: parsed.data.canEdit }, 'Editor rights changed');
      return { ok: true, data: {} };
    } catch (error) { return owner.fail(reply, error); }
  });
  // Look the key up again (when someone forgot it). Null for people made before keys were stored.
  app.get('/api/host/people/:id/key', async (request, reply) => {
    try {
      const { roomSecret } = owner.requireOwner(request);
      const person = await client.person.findFirst({ where: { id: idParam(request), removedAt: null }, select: { id: true, name: true, keySealed: true } });
      roomAssert(person, 'NOT_FOUND');
      const key = openPersonKey(roomSecret, person.keySealed); roomAssert(key, 'NOT_FOUND');
      app.log.info({ event: 'person_key_viewed' }, 'Personal key looked up');
      return { ok: true, data: PersonKeyViewSchema.parse({ id: person.id, name: person.name, key }) };
    } catch (error) { return owner.fail(reply, error); }
  });
  // A new key: the old key (and link) stop working; phones already signed in stay signed in.
  app.post('/api/host/people/:id/key', async (request, reply) => {
    try {
      const { roomSecret } = owner.requireOwner(request); const id = idParam(request);
      await activePerson(id);
      const { key, data } = keyFields(roomSecret);
      const person = await client.person.update({ where: { id }, data });
      return { ok: true, data: PersonKeyViewSchema.parse({ id: person.id, name: person.name, key }) };
    } catch (error) { return owner.fail(reply, error); }
  });
  app.post('/api/host/people/:id/sign-out', async (request, reply) => {
    try {
      owner.requireOwner(request); const id = idParam(request);
      await activePerson(id);
      await client.personDevice.updateMany({ where: { personId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      live?.dropPerson(id);
      return { ok: true, data: {} };
    } catch (error) { return owner.fail(reply, error); }
  });
  // Removing keeps history (seats, chips) but signs every phone out, frees the name and drops the key and editor rights.
  app.post('/api/host/people/:id/remove', async (request, reply) => {
    try {
      owner.requireOwner(request); const id = idParam(request);
      await client.$transaction(async tx => {
        const person = await tx.person.findUnique({ where: { id } }); roomAssert(person && !person.removedAt, 'NOT_FOUND');
        await tx.personDevice.updateMany({ where: { personId: id, revokedAt: null }, data: { revokedAt: new Date() } });
        await tx.person.update({ where: { id }, data: { removedAt: new Date(), nameKey: `removed:${id.replaceAll('-', '')}`, linkHash: tokenHash(newToken()), keySealed: null, canEdit: false } });
      });
      live?.dropPerson(id);
      return { ok: true, data: {} };
    } catch (error) { return owner.fail(reply, error); }
  });
}
