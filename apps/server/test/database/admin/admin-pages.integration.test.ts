import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../../src/app.js';
import { readConfig } from '../../../src/config.js';
import { db, prisma } from '../game-fixture.js';

const ownerToken = 'q'.repeat(43);
const config = readConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ROOM_TOKEN_SECRET: 'f'.repeat(64), PUBLIC_ORIGIN: 'http://127.0.0.1:4173', LOCAL_OWNER_TOKEN: ownerToken });
const headers = { origin: config.PUBLIC_ORIGIN, 'x-party-request': '1' };
let app: ReturnType<typeof buildApp>; let owner: string;
const call = (method: 'GET' | 'POST', url: string, body?: unknown, cookie = owner) =>
  app.inject({ method, url, ...(body === undefined ? {} : { payload: body as object }), headers: { ...headers, ...(cookie ? { cookie } : {}) } });
const cookieOf = (response: Awaited<ReturnType<typeof call>>) => String(response.headers['set-cookie']).split(';')[0]!;
beforeAll(async () => {
  app = buildApp(config, { database: { ...db, close: async () => {} } }); await app.ready();
  owner = cookieOf(await call('POST', '/api/host/claim', { token: ownerToken }, ''));
});
afterAll(async () => { await app.close(); await db.close(); });

describe('admin: live rooms, storage and the action log', () => {
  it('are the owner’s alone; closing a room keeps its history; actions of the owner and editors are logged', async () => {
    // An editor may edit games, but never sees these pages.
    const name = `Ed ${randomUUID().slice(0, 8)}`;
    const made = (await call('POST', '/api/host/people', { name, canEdit: true })).json().data as { id: string; key: string };
    const editor = cookieOf(await call('POST', '/api/people/claim', { token: made.key }, ''));
    for (const path of ['/api/host/admin/rooms', '/api/host/admin/storage', '/api/host/admin/actions', '/api/host/admin/health']) expect((await call('GET', path, undefined, editor)).statusCode).toBe(401);
    expect((await call('POST', '/api/host/admin/storage/clean-up', {}, editor)).statusCode).toBe(401);

    // A room the owner opened shows as open; closing it ends it without removing anything.
    const sessionId = randomUUID();
    expect((await call('POST', '/api/host/rooms', { sessionId, commandId: randomUUID(), gameKey: 'timed-quiz' })).statusCode).toBe(200);
    const rooms = (await call('GET', '/api/host/admin/rooms')).json().data.rooms as { sessionId: string; kind: string; yours: boolean; status: string }[];
    expect(rooms.find(room => room.sessionId === sessionId)).toMatchObject({ kind: 'game', yours: true, status: 'LOBBY' });
    expect((await call('POST', `/api/host/admin/rooms/${sessionId}/close`, {})).json().data).toEqual({ closed: true });
    expect((await call('GET', '/api/host/admin/rooms')).json().data.rooms.some((room: { sessionId: string }) => room.sessionId === sessionId)).toBe(false);
    expect(await prisma.gameSession.findUniqueOrThrow({ where: { id: sessionId } })).toMatchObject({ status: 'FINISHED' });

    // Health: every part with a verdict; the database is reachable and its migrations all went through.
    const health = (await call('GET', '/api/host/admin/health')).json().data as { level: string; parts: { key: string; level: string; facts: { label: string; value: string }[] }[] };
    expect(health.parts.map(part => part.key)).toEqual(['server', 'database', 'rooms', 'problems', 'machine']);
    const database = health.parts.find(part => part.key === 'database')!;
    expect(database.facts).toContainEqual({ label: 'Reachable', value: 'yes' });
    expect(database.facts.some(fact => fact.label === 'Migrations that failed')).toBe(false);
    // Storage: sizes, and the usual clean-up run at once.
    const storage = (await call('GET', '/api/host/admin/storage')).json().data;
    expect(storage).toMatchObject({ retentionDays: config.MEDIA_RETENTION_DAYS, uploads: { files: expect.any(Number) } });
    expect(storage.databaseBytes).toBeGreaterThan(0);
    expect((await call('POST', '/api/host/admin/storage/clean-up', {})).statusCode).toBe(200);

    // The editor makes and publishes a game: logged under their name, next to the owner's actions.
    const gameId = randomUUID();
    expect((await call('POST', '/api/host/games', { gameId, title: `Logged ${name}`, startFrom: null }, editor)).statusCode).toBe(200);
    expect((await call('POST', `/api/host/games/${gameId}/publish`, { expectedRevision: 0 }, editor)).statusCode).toBe(200);
    const actions = (await call('GET', '/api/host/admin/actions')).json().data.actions as { actor: string; byOwner: boolean; action: string; subject: string }[];
    expect(actions.find(row => row.action === 'game.published' && row.subject.startsWith(`Logged ${name}`))).toMatchObject({ actor: name, byOwner: false });
    expect(actions.find(row => row.action === 'person.added' && row.subject === name)).toMatchObject({ byOwner: true });
    expect(actions.some(row => row.action === 'room.closed')).toBe(true);
    expect(actions.some(row => row.action === 'storage.cleanup')).toBe(true);
  });
});
