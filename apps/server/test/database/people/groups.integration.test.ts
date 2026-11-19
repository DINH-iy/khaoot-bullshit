import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../../src/app.js';
import { readConfig } from '../../../src/config.js';
import { db } from '../game-fixture.js';

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
const listed = async () => (await call('GET', '/api/host/groups', undefined, await ownerCookie())).json().data.groups as { id: string; name: string; personIds: string[] }[];

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
    const people = (await call('GET', '/api/host/people', undefined, await ownerCookie())).json().data.people as { id: string }[];
    expect(people.some(entry => entry.id === eve)).toBe(true);
  });

  it('have unique names (ignoring capitals) and can be renamed', async () => {
    const name = unique('Neighbours'); const id = await group(name);
    expect((await call('POST', '/api/host/groups', { name: name.toUpperCase() }, await ownerCookie())).json().error.code).toBe('NAME_TAKEN');
    const other = await group(unique('Other'));
    expect((await call('PUT', `/api/host/groups/${other}`, { name: name.toLowerCase() }, await ownerCookie())).json().error.code).toBe('NAME_TAKEN');
    expect((await call('PUT', `/api/host/groups/${id}`, { name: 'Renamed ' + name }, await ownerCookie())).json().data.name).toBe('Renamed ' + name);
    expect((await call('PUT', `/api/host/groups/${id}`, {}, await ownerCookie())).statusCode).toBe(400);
  });
});
