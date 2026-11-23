import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../../src/app.js';
import { readConfig } from '../../../src/config.js';
import { MAX_GROUP_MEMBERS, PEOPLE_PAGE_SIZE } from '@party/contracts';
import { db, prisma } from '../game-fixture.js';

const ownerToken = 'g'.repeat(43);
const config = readConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ROOM_TOKEN_SECRET: 'f'.repeat(64), PUBLIC_ORIGIN: 'http://127.0.0.1:4173', LOCAL_OWNER_TOKEN: ownerToken });
const headers = { origin: config.PUBLIC_ORIGIN, 'x-party-request': '1' };
let app: ReturnType<typeof buildApp>;
beforeAll(async () => { app = buildApp(config, { database: { ...db, close: async () => {} } }); await app.ready(); });
afterAll(async () => { await app.close(); await db.close(); });
const call = (method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown, cookie?: string) =>
  app.inject({ method, url, ...(body === undefined ? {} : { payload: body as object }), headers: { ...headers, ...(cookie ? { cookie } : {}) } });
let owner = '';
async function ownerCookie() { if (!owner) owner = String((await call('POST', '/api/host/claim', { token: ownerToken })).headers['set-cookie']).split(';')[0]!; return owner; }
const unique = (name: string) => `${name} ${randomUUID().slice(0, 6)}`;
async function person(name: string) { const made = await call('POST', '/api/host/people', { name: unique(name) }, await ownerCookie()); expect(made.statusCode).toBe(200); return made.json().data.id as string; }
async function group(name: string) { const made = await call('POST', '/api/host/groups', { name }, await ownerCookie()); expect(made.statusCode).toBe(200); return made.json().data.id as string; }
const listed = async () => (await call('GET', '/api/host/groups', undefined, await ownerCookie())).json().data.groups as { id: string; name: string; personIds: string[]; names: string[] }[];

describe('groups of people', () => {
  it('are for the owner only', async () => {
    expect((await call('GET', '/api/host/groups')).statusCode).toBe(401);
    expect((await call('POST', '/api/host/groups', { name: 'Sneaky' })).statusCode).toBe(401);
    // A signed-in person (not the owner) gets nowhere either.
    const made = await call('POST', '/api/host/people', { name: unique('Plain') }, await ownerCookie());
    const claimed = await call('POST', '/api/people/claim', { token: made.json().data.key });
    const cookie = String(claimed.headers['set-cookie']).split(';')[0]!;
    expect((await call('GET', '/api/host/groups', undefined, cookie)).statusCode).toBe(401);
  });

  it('hold members, and a person can be in several groups', async () => {
    const [ann, bo, cy] = [await person('Ann'), await person('Bo'), await person('Cy')];
    const work = await group(unique('Work')); const family = await group(unique('Family'));
    expect((await call('PUT', `/api/host/groups/${work}`, { personIds: [ann, bo, bo] }, await ownerCookie())).json().data.personIds.sort()).toEqual([ann, bo].sort());
    expect((await call('PUT', `/api/host/groups/${family}`, { personIds: [bo, cy] }, await ownerCookie())).statusCode).toBe(200);
    const groups = await listed();
    expect(groups.find(entry => entry.id === work)!.personIds.sort()).toEqual([ann, bo].sort());
    expect(groups.find(entry => entry.id === family)!.personIds.sort()).toEqual([bo, cy].sort());
    // The list is replaced, not merged; unknown people are left out.
    const replaced = await call('PUT', `/api/host/groups/${work}`, { personIds: [cy, randomUUID()] }, await ownerCookie());
    expect(replaced.json().data.personIds).toEqual([cy]);
  });

  it('drop removed people, and deleting a group keeps the people', async () => {
    const [dee, eve] = [await person('Dee'), await person('Eve')]; const id = await group(unique('Club'));
    await call('PUT', `/api/host/groups/${id}`, { personIds: [dee, eve] }, await ownerCookie());
    expect((await call('POST', `/api/host/people/${dee}/remove`, {}, await ownerCookie())).statusCode).toBe(200);
    expect((await listed()).find(entry => entry.id === id)!.personIds).toEqual([eve]);
    expect((await call('POST', `/api/host/groups/${id}/remove`, {}, await ownerCookie())).statusCode).toBe(200);
    expect((await listed()).some(entry => entry.id === id)).toBe(false);
    expect((await call('POST', `/api/host/groups/${id}/remove`, {}, await ownerCookie())).statusCode).not.toBe(200);
    expect((await call('GET', `/api/host/people/${eve}`, undefined, await ownerCookie())).statusCode).toBe(200);
  });

  it('have unique names (ignoring capitals) and can be renamed', async () => {
    const name = unique('Neighbours'); const id = await group(name);
    expect((await call('POST', '/api/host/groups', { name: name.toUpperCase() }, await ownerCookie())).json().error.code).toBe('NAME_TAKEN');
    const other = await group(unique('Other'));
    expect((await call('PUT', `/api/host/groups/${other}`, { name: name.toLowerCase() }, await ownerCookie())).json().error.code).toBe('NAME_TAKEN');
    expect((await call('PUT', `/api/host/groups/${id}`, { name: 'Renamed ' + name }, await ownerCookie())).json().data.name).toBe('Renamed ' + name);
    expect((await call('PUT', `/api/host/groups/${id}`, {}, await ownerCookie())).statusCode).toBe(400);
  });

  it('add or take out everyone matching a search at once, also beyond the first page, and list member names', async () => {
    const tag = randomUUID().slice(0, 6); const id = await group(unique('Many'));
    const people = Array.from({ length: PEOPLE_PAGE_SIZE + 3 }, (_, index) => ({ name: `Many ${tag} ${String(index).padStart(3, '0')}`, nameKey: `many ${tag} ${String(index).padStart(3, '0')}`, linkHash: randomUUID().replaceAll('-', '').padEnd(64, '0') }));
    await prisma.person.createMany({ data: people });
    const added = await call('POST', `/api/host/groups/${id}/matches`, { search: `MANY ${tag}`, add: true }, await ownerCookie());
    expect(added.statusCode).toBe(200);
    expect(added.json().data.personIds).toHaveLength(people.length);
    expect(added.json().data.names).toEqual(people.map(person => person.name));
    // Again changes nothing; taking out a narrower search leaves the rest.
    expect((await call('POST', `/api/host/groups/${id}/matches`, { search: `many ${tag}`, add: true }, await ownerCookie())).json().data.personIds).toHaveLength(people.length);
    const taken = await call('POST', `/api/host/groups/${id}/matches`, { search: `Mány ${tag} 05`, add: false }, await ownerCookie());
    expect(taken.json().data.names).toEqual(people.map(person => person.name).filter(name => !name.includes(`${tag} 05`)));
    // A group never grows past its limit.
    expect((await call('POST', `/api/host/groups/${id}/matches`, { search: '', add: true }, await ownerCookie())).json().error?.code ?? 'fits')
      .toBe(await prisma.person.count({ where: { removedAt: null } }) > MAX_GROUP_MEMBERS ? 'GROUP_FULL' : 'fits');
  });
});

describe('the people list', () => {
  it('comes a page at a time (A–Z), searched on the server, with the total on every page', async () => {
    const tag = randomUUID().slice(0, 6);
    const names = Array.from({ length: PEOPLE_PAGE_SIZE + 2 }, (_, index) => `Paged ${tag} ${String(index).padStart(3, '0')}`);
    await prisma.person.createMany({ data: names.map(name => ({ name, nameKey: name.toLowerCase(), linkHash: randomUUID().replaceAll('-', '').padEnd(64, '1') })) });
    const page = async (number: number, search = `paged ${tag}`) => (await call('GET', `/api/host/people?search=${encodeURIComponent(search)}&page=${number}`, undefined, await ownerCookie())).json().data as { people: { name: string }[]; total: number; page: number; pageSize: number };
    const first = await page(0); const second = await page(1);
    expect(first).toMatchObject({ total: names.length, page: 0, pageSize: PEOPLE_PAGE_SIZE });
    expect([...first.people, ...second.people].map(person => person.name)).toEqual(names);
    expect((await page(2)).people).toEqual([]);
    expect((await page(0, `PAGED ${tag} 01`)).people.map(person => person.name)).toEqual(names.filter(name => name.includes(`${tag} 01`)));
    // Accents and capitals are ignored both ways; % and _ are just characters.
    await person(`Anoúk Ölçer ${tag}`);
    expect((await page(0, `ANOUK olcer ${tag}`)).people.map(entry => entry.name)).toEqual([expect.stringContaining(`Anoúk Ölçer ${tag}`)]);
    expect((await page(0, `ANOÚK`)).total).toBeGreaterThan(0);
    expect((await page(0, `${tag} 0%`)).total).toBe(0); expect((await page(0, `${tag} 0_0`)).total).toBe(0);
    // Everyone is counted: the whole list has the same total as the database.
    expect((await page(0, '')).total).toBe(await prisma.person.count({ where: { removedAt: null } }));
    expect((await call('GET', '/api/host/people?page=-1', undefined, await ownerCookie())).statusCode).not.toBe(200);
  });

  it('summarises everyone, and one person and their places can be read on their own', async () => {
    const id = await person('Single');
    const summary = (await call('GET', '/api/host/people/summary', undefined, await ownerCookie())).json().data as { people: number; neverSignedIn: number };
    expect(summary.people).toBe(await prisma.person.count({ where: { removedAt: null } }));
    expect(summary.neverSignedIn).toBeGreaterThan(0);
    expect((await call('GET', `/api/host/people/${id}`, undefined, await ownerCookie())).json().data).toMatchObject({ id, devices: 0, key: expect.any(String) });
    const standing = (await call('GET', `/api/host/people/${id}/stats`, undefined, await ownerCookie())).json().data as { stats: { games: number }; places: Record<string, number | null>; of: number };
    expect(standing.stats.games).toBe(0); expect(standing.places.wins).toBeNull(); expect(standing.of).toBe(summary.people);
    const board = (await call('GET', '/api/host/people/stats?sort=points&page=0', undefined, await ownerCookie())).json().data as { rows: unknown[]; total: number; pageSize: number };
    expect(board.total).toBe(summary.people); expect(board.rows.length).toBe(Math.min(board.pageSize, board.total));
    expect((await call('GET', '/api/host/people/stats?sort=nonsense', undefined, await ownerCookie())).statusCode).not.toBe(200);
    expect((await call('GET', `/api/host/people/${randomUUID()}`, undefined, await ownerCookie())).statusCode).toBe(404);
    expect((await call('GET', '/api/host/people/summary')).statusCode).toBe(401);
  });
});
