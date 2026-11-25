import type { FastifyInstance, FastifyRequest } from 'fastify';
import { EDITOR_ROLE_ID, PersonRoleSchema } from '@party/contracts';
import { recordAction } from '../admin/actions.js';
import { ClaimPersonSchema, GameIdSchema, LeaderboardQuerySchema, LeaderboardSchema, MeSchema, NewPersonSchema, PeoplePageSchema, PeopleQuerySchema, PeopleSummarySchema, PersonEditorSchema, PersonKeyViewSchema, PersonRowSchema, PersonStandingSchema, PlayerLookSchema, RenamePersonSchema } from '@party/contracts';
import type { Config } from '../config.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { OwnerAccess } from '../hosting/owner-access.js';
import type { EditorLive } from '../authoring/live.js';
import { allowedOrigin, newToken, RateLimiter, RoomError, roomAssert, tokenHash } from '../rooms/security.js';
import { clearPersonCookie, personCookie, personFromCookie } from './identity.js';
import { openPersonKey, personKeyHash } from './keys.js';
import { leaderboard, peoplePage, peopleSummary, personRow, standing } from './directory.js';
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
  // A page of people A–Z (directory.ts), optionally searched; only the People page asks for the keys.
  app.get('/api/host/people', async (request, reply) => {
    try {
      const { roomSecret } = owner.requireOwner(request);
      const query = PeopleQuerySchema.safeParse(request.query); roomAssert(query.success, 'INVALID_COMMAND');
      return { ok: true, data: PeoplePageSchema.parse(await peoplePage(client, query.data, query.data.withKeys === '1' ? roomSecret : null)) };
    } catch (error) { return owner.fail(reply, error); }
  });
  app.get('/api/host/people/summary', async (request, reply) => {
    try { owner.requireOwner(request); return { ok: true, data: PeopleSummarySchema.parse(await peopleSummary(client)) }; } catch (error) { return owner.fail(reply, error); }
  });
  // Totals over every real game (stats.ts): the leaderboard, a page at a time, sorted by any ranking.
  app.get('/api/host/people/stats', async (request, reply) => {
    try {
      owner.requireOwner(request);
      const query = LeaderboardQuerySchema.safeParse(request.query); roomAssert(query.success, 'INVALID_COMMAND');
      return { ok: true, data: LeaderboardSchema.parse(await leaderboard(client, query.data)) };
    } catch (error) { return owner.fail(reply, error); }
  });
  app.get('/api/host/people/:id', async (request, reply) => {
    try {
      const { roomSecret } = owner.requireOwner(request);
      const person = await personRow(client, idParam(request), roomSecret); roomAssert(person, 'NOT_FOUND');
      return { ok: true, data: PersonRowSchema.parse(person) };
    } catch (error) { return owner.fail(reply, error); }
  });
  // One person's totals and their place among everyone.
  app.get('/api/host/people/:id/stats', async (request, reply) => {
    try {
      owner.requireOwner(request);
      const found = await standing(client, idParam(request)); roomAssert(found, 'NOT_FOUND');
      return { ok: true, data: PersonStandingSchema.parse(found) };
    } catch (error) { return owner.fail(reply, error); }
  });
  /** A person's name for the action log. */
  const nameOf = async (id: string) => (await client.person.findUnique({ where: { id }, select: { name: true } }))?.name ?? 'Unknown person';
  app.post('/api/host/people', async (request, reply) => {
    try {
      const { roomSecret } = owner.requireOwner(request);
      const parsed = NewPersonSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      // A role given here, or (the older way) "can edit games" as the Editor role.
      const roleId = parsed.data.roleId !== undefined ? parsed.data.roleId : parsed.data.canEdit ? EDITOR_ROLE_ID : null;
      if (roleId) roomAssert(await client.accessRole.findUnique({ where: { id: roleId }, select: { id: true } }), 'INVALID_COMMAND');
      const { person, key } = await createPerson(client, roomSecret, parsed.data.name, roleId);
      app.log.info({ event: 'person_added', canEdit: person.canEdit }, 'Person added');
      await recordAction(client, { personId: null }, 'person.added', person.name, { roleId: person.roleId });
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
      await recordAction(client, { personId: null }, 'person.renamed', parsed.data.name);
      return { ok: true, data: {} };
    } catch (error) { return owner.fail(reply, error); }
  });
  // Editor rights: work on the owner's games. Taking them away also closes any editor they have open.
  app.post('/api/host/people/:id/editor', async (request, reply) => {
    try {
      owner.requireOwner(request); const id = idParam(request);
      const parsed = PersonEditorSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      // The older switch: on gives the Editor role (keeping a role the person already has), off takes the role away.
      const current = await client.person.findFirst({ where: { id, removedAt: null }, select: { roleId: true } }); roomAssert(current, 'NOT_FOUND');
      const roleId = parsed.data.canEdit ? current.roleId ?? EDITOR_ROLE_ID : null;
      await client.person.update({ where: { id }, data: { roleId, canEdit: roleId !== null } });
      if (!parsed.data.canEdit) live?.dropPerson(id);
      app.log.info({ event: 'person_editor_changed', canEdit: parsed.data.canEdit }, 'Editor rights changed');
      await recordAction(client, { personId: null }, parsed.data.canEdit ? 'person.editor_on' : 'person.editor_off', await nameOf(id));
      return { ok: true, data: {} };
    } catch (error) { return owner.fail(reply, error); }
  });
  // A person's role: what they may do besides playing (see Admin → Roles); none makes them a player only.
  // Takes effect at once: every request reads the role again, and an editor they have open closes.
  app.post('/api/host/people/:id/role', async (request, reply) => {
    try {
      owner.requireOwner(request); const id = idParam(request);
      const parsed = PersonRoleSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      const role = parsed.data.roleId ? await client.accessRole.findUnique({ where: { id: parsed.data.roleId }, select: { name: true } }) : null;
      roomAssert(!parsed.data.roleId || role, 'INVALID_COMMAND');
      const changed = await client.person.updateMany({ where: { id, removedAt: null }, data: { roleId: parsed.data.roleId, canEdit: parsed.data.roleId !== null } });
      roomAssert(changed.count === 1, 'NOT_FOUND');
      live?.dropPerson(id);
      await recordAction(client, { personId: null }, 'person.role', `${await nameOf(id)}: ${role?.name ?? 'player only'}`);
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
      await recordAction(client, { personId: null }, 'person.new_key', person.name);
      return { ok: true, data: PersonKeyViewSchema.parse({ id: person.id, name: person.name, key }) };
    } catch (error) { return owner.fail(reply, error); }
  });
  app.post('/api/host/people/:id/sign-out', async (request, reply) => {
    try {
      owner.requireOwner(request); const id = idParam(request);
      await activePerson(id);
      await client.personDevice.updateMany({ where: { personId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      live?.dropPerson(id);
      await recordAction(client, { personId: null }, 'person.signed_out', await nameOf(id));
      return { ok: true, data: {} };
    } catch (error) { return owner.fail(reply, error); }
  });
  // Removing keeps history (seats, chips) but signs every phone out, frees the name and drops the key and editor rights.
  app.post('/api/host/people/:id/remove', async (request, reply) => {
    try {
      owner.requireOwner(request); const id = idParam(request); const name = await nameOf(id);
      await client.$transaction(async tx => {
        const person = await tx.person.findUnique({ where: { id } }); roomAssert(person && !person.removedAt, 'NOT_FOUND');
        await tx.personDevice.updateMany({ where: { personId: id, revokedAt: null }, data: { revokedAt: new Date() } });
        await tx.person.update({ where: { id }, data: { removedAt: new Date(), nameKey: `removed:${id.replaceAll('-', '')}`, linkHash: tokenHash(newToken()), keySealed: null, canEdit: false, roleId: null } });
      });
      live?.dropPerson(id);
      await recordAction(client, { personId: null }, 'person.removed', name);
      return { ok: true, data: {} };
    } catch (error) { return owner.fail(reply, error); }
  });
}
