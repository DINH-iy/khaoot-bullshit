import { randomUUID } from 'node:crypto';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EDITOR_NAMESPACE, type Draft } from '@party/contracts';
import { buildApp } from '../../src/app.js';
import { readConfig } from '../../src/config.js';
import { tokenHash } from '../../src/rooms/security.js';
import { db, prisma } from './game-fixture.js';

// Editors: people the owner gave editor rights. They work on the owner's games
// with their own person sign-in, and never get hosting or the admin menu.
const ownerToken = 'r'.repeat(43);
const config = readConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ROOM_TOKEN_SECRET: 'f'.repeat(64), PUBLIC_ORIGIN: 'http://127.0.0.1:4173', LOCAL_OWNER_TOKEN: ownerToken });
const headers = { origin: config.PUBLIC_ORIGIN, 'x-party-request': '1' }; const sockets: Socket[] = [];
let app: ReturnType<typeof buildApp>; let url: string; let owner: string;
type Method = 'GET' | 'POST' | 'PUT';
const call = (method: Method, path: string, body?: unknown, cookie = '') =>
  app.inject({ method, url: path, ...(body === undefined ? {} : { payload: body as object }), headers: { ...headers, ...(cookie ? { cookie } : {}) } });
const cookieOf = (response: Awaited<ReturnType<typeof call>>) => String(response.headers['set-cookie']).split(';')[0]!;
beforeAll(async () => {
  app = buildApp(config, { database: { ...db, close: async () => {} } }); url = await app.listen({ host: '127.0.0.1', port: 0 });
  owner = cookieOf(await call('POST', '/api/host/claim', { token: ownerToken }));
});
afterEach(() => { for (const socket of sockets.splice(0)) socket.disconnect(); });
afterAll(async () => { await app.close(); await db.close(); });

async function makePerson(canEdit: boolean) {
  const made = await call('POST', '/api/host/people', { name: `Ed ${randomUUID().slice(0, 8)}`, canEdit }, owner); expect(made.statusCode).toBe(200);
  const { id, key } = made.json().data as { id: string; key: string };
  const claimed = await call('POST', '/api/people/claim', { token: key }); expect(claimed.statusCode).toBe(200);
  return { id, key, cookie: cookieOf(claimed) };
}
async function newGame(cookie: string) {
  const created = await call('POST', '/api/host/games', { gameId: randomUUID(), title: 'Made together', startFrom: null }, cookie);
  expect(created.statusCode).toBe(200); return created.json().data as Draft;
}

describe('people with editor rights', () => {
  it('work on games: menu, create, edit, publish, rehearse, live editing and remove', async () => {
    const editor = await makePerson(true);
    const menu = await call('GET', '/api/host', undefined, editor.cookie);
    expect(menu.statusCode).toBe(200); expect(menu.json().data).toMatchObject({ role: 'editor', rooms: [] });
    expect((await call('GET', '/api/host', undefined, owner)).json().data.role).toBe('owner');
    const game = await newGame(editor.cookie);
    expect((await call('GET', `/api/host/games/${game.gameId}`, undefined, editor.cookie)).statusCode).toBe(200);
    const saved = await call('PUT', `/api/host/games/${game.gameId}/draft`, { expectedRevision: game.revision, definition: { ...(game.definition as object), title: 'Renamed by the editor' } }, editor.cookie);
    expect(saved.statusCode).toBe(200);
    // The owner sees the same game: it is one shared set of games.
    expect((await call('GET', `/api/host/games/${game.gameId}`, undefined, owner)).json().data.definition.title).toBe('Renamed by the editor');
    expect((await call('POST', `/api/host/games/${game.gameId}/publish`, { expectedRevision: saved.json().data.revision }, editor.cookie)).statusCode).toBe(200);
    const rehearsal = await call('POST', `/api/host/games/${game.gameId}/rehearse`, { expectedRevision: saved.json().data.revision, startNodeKey: null, sessionId: randomUUID(), commandId: randomUUID() }, editor.cookie);
    expect(rehearsal.statusCode).toBe(200);
    expect((await call('POST', `/api/host/games/${game.gameId}/live`, {}, editor.cookie)).statusCode).toBe(200);
    expect((await call('POST', `/api/host/games/${game.gameId}/archive`, {}, editor.cookie)).statusCode).toBe(200);
  });

  it('never host real rooms or use the admin menu', async () => {
    const editor = await makePerson(true); const game = await newGame(owner);
    const room = { sessionId: randomUUID(), commandId: randomUUID() };
    expect((await call('POST', '/api/host/rooms', { gameKey: 'timed-quiz', ...room }, editor.cookie)).statusCode).toBe(401);
    expect((await call('POST', '/api/host/rooms', { gameId: game.gameId, ...room }, editor.cookie)).statusCode).toBe(401);
    const opened = await call('POST', '/api/host/rooms', { gameKey: 'timed-quiz', ...room }, owner); expect(opened.statusCode).toBe(200);
    expect((await call('POST', `/api/host/rooms/${room.sessionId}/enter`, {}, editor.cookie)).statusCode).toBe(401);
    for (const [method, path] of [['GET', '/api/host/people'], ['POST', '/api/host/people'], ['GET', `/api/host/people/${editor.id}/key`], ['POST', `/api/host/people/${editor.id}/editor`], ['GET', '/api/host/feedback']] as const)
      expect((await call(method, path, method === 'POST' ? { name: 'x', canEdit: true } : undefined, editor.cookie)).statusCode).toBe(401);
    // Its open rooms stay the owner's business.
    expect((await call('GET', '/api/host', undefined, editor.cookie)).json().data.rooms).toEqual([]);
  });

  it('are refused without the rights, and lose them at once', async () => {
    const player = await makePerson(false);
    expect((await call('GET', '/api/host', undefined, player.cookie)).statusCode).toBe(401);
    expect((await call('POST', '/api/host/games', { gameId: randomUUID(), title: 'No', startFrom: null }, player.cookie)).statusCode).toBe(401);
    expect((await call('GET', '/api/people/me', undefined, player.cookie)).json().data.person.canEdit).toBe(false);
    // Rights given: allowed from the next request on. Taken away: refused from the next request on.
    expect((await call('POST', `/api/host/people/${player.id}/editor`, { canEdit: true }, owner)).statusCode).toBe(200);
    expect((await call('GET', '/api/host', undefined, player.cookie)).statusCode).toBe(200);
    expect((await call('GET', '/api/people/me', undefined, player.cookie)).json().data.person.canEdit).toBe(true);
    expect((await call('POST', `/api/host/people/${player.id}/editor`, { canEdit: false }, owner)).statusCode).toBe(200);
    expect((await call('GET', '/api/host', undefined, player.cookie)).statusCode).toBe(401);
    // Signed-out phones and removed people lose them too.
    const signedOut = await makePerson(true);
    expect((await call('POST', `/api/host/people/${signedOut.id}/sign-out`, {}, owner)).statusCode).toBe(200);
    expect((await call('GET', '/api/host', undefined, signedOut.cookie)).statusCode).toBe(401);
    const removed = await makePerson(true);
    expect((await call('POST', `/api/host/people/${removed.id}/remove`, {}, owner)).statusCode).toBe(200);
    expect((await call('GET', '/api/host', undefined, removed.cookie)).statusCode).toBe(401);
    expect(await prisma.person.findUniqueOrThrow({ where: { id: removed.id } })).toMatchObject({ canEdit: false, keySealed: null });
  });

  it('are disconnected from live editing when the rights are taken away', async () => {
    const editor = await makePerson(true); const game = await newGame(owner);
    const ticket = (await call('POST', `/api/host/games/${game.gameId}/live`, {}, editor.cookie)).json().data.ticket as string;
    const socket = connect(`${url}${EDITOR_NAMESPACE}`, { auth: { ticket, name: 'Ed' }, transports: ['websocket'], reconnection: false, extraHeaders: { origin: config.PUBLIC_ORIGIN } }); sockets.push(socket);
    await new Promise<void>((resolve, reject) => { socket.once('connect', () => resolve()); socket.once('connect_error', reject); });
    const dropped = new Promise<string>(resolve => socket.once('disconnect', resolve));
    expect((await call('POST', `/api/host/people/${editor.id}/editor`, { canEdit: false }, owner)).statusCode).toBe(200);
    expect(await dropped).toBe('io server disconnect');
  });
});

describe('personal keys', () => {
  it('sign in however they are typed, can be looked up by the owner, and a new key replaces the old', async () => {
    const person = await makePerson(false);
    expect(person.key).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect((await call('POST', '/api/people/claim', { token: ` ${person.key.replaceAll('-', ' ').toLowerCase()} ` })).statusCode).toBe(200);
    const looked = await call('GET', `/api/host/people/${person.id}/key`, undefined, owner);
    expect(looked.json().data).toEqual({ id: person.id, name: expect.any(String), key: person.key });
    expect((await call('GET', `/api/host/people/${person.id}/key`)).statusCode).toBe(401);
    // Stored as a hash and an encrypted copy, never as the key itself.
    const row = await prisma.person.findUniqueOrThrow({ where: { id: person.id } });
    expect(row.linkHash).toBe(tokenHash(person.key)); expect(row.keySealed).not.toContain(person.key);
    const renewed = (await call('POST', `/api/host/people/${person.id}/key`, {}, owner)).json().data.key as string;
    expect(renewed).not.toBe(person.key);
    expect((await call('POST', '/api/people/claim', { token: person.key })).statusCode).toBe(401);
    expect((await call('GET', `/api/host/people/${person.id}/key`, undefined, owner)).json().data.key).toBe(renewed);
    // The phone that signed in earlier stays signed in.
    expect((await call('GET', '/api/people/me', undefined, person.cookie)).json().data.person).not.toBeNull();
  });

  it('keep older personal links working; those keys cannot be shown until renewed', async () => {
    const link = randomUUID().replaceAll('-', '').padEnd(43, 'x');
    const name = `Old ${randomUUID().slice(0, 8)}`;
    const old = await prisma.person.create({ data: { name, nameKey: name.toLowerCase(), linkHash: tokenHash(link) } });
    expect((await call('POST', '/api/people/claim', { token: link })).statusCode).toBe(200);
    const rows = (await call('GET', '/api/host/people', undefined, owner)).json().data.people as { id: string; hasKey: boolean; canEdit: boolean }[];
    expect(rows.find(row => row.id === old.id)).toMatchObject({ hasKey: false, canEdit: false });
    expect((await call('GET', `/api/host/people/${old.id}/key`, undefined, owner)).statusCode).toBe(404);
  });
});
