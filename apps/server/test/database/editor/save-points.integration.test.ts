import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_SAVE_POINTS } from '@party/contracts';
import { buildApp } from '../../../src/app.js';
import { readConfig } from '../../../src/config.js';
import { db, prisma } from '../game-fixture.js';

// Save points: copies of a game's saved draft, shared by the owner and editors, to go back to later.
const ownerToken = 'v'.repeat(43);
const config = readConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ROOM_TOKEN_SECRET: 'f'.repeat(64), PUBLIC_ORIGIN: 'http://127.0.0.1:4173', LOCAL_OWNER_TOKEN: ownerToken });
const headers = { origin: config.PUBLIC_ORIGIN, 'x-party-request': '1' };
let app: ReturnType<typeof buildApp>; let owner: string;
const call = (method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown, cookie = owner) =>
  app.inject({ method, url, ...(body === undefined ? {} : { payload: body as object }), headers: { ...headers, ...(cookie ? { cookie } : {}) } });
const cookieOf = (response: Awaited<ReturnType<typeof call>>) => String(response.headers['set-cookie']).split(';')[0]!;
beforeAll(async () => { app = buildApp(config, { database: { ...db, close: async () => {} } }); await app.ready(); owner = cookieOf(await call('POST', '/api/host/claim', { token: ownerToken }, '')); });
afterAll(async () => { await app.close(); await db.close(); });

async function game() {
  const gameId = randomUUID();
  const made = await call('POST', '/api/host/games', { gameId, title: 'Save me', startFrom: null });
  return { gameId, definition: made.json().data.definition as Record<string, unknown> };
}
const point = (gameId: string, body: Record<string, unknown>, cookie = owner) => call('POST', `/api/host/games/${gameId}/save-points`, { savePointId: randomUUID(), name: 'Point', expectedRevision: 0, ...body }, cookie);
async function person(canEdit: boolean) {
  const name = `S ${randomUUID().slice(0, 8)}`; const made = await call('POST', '/api/host/people', { name, canEdit });
  return { name, cookie: cookieOf(await call('POST', '/api/people/claim', { token: made.json().data.key }, '')) };
}

describe('save points', () => {
  it('keep the saved draft as it was, once per request id, and can be read back by editors', async () => {
    const { gameId, definition } = await game(); const savePointId = randomUUID();
    const made = await point(gameId, { savePointId, name: '  Before the rework ' });
    expect(made.statusCode).toBe(200);
    expect(made.json().data).toMatchObject({ id: savePointId, name: 'Before the rework', automatic: false, savedBy: null, sceneCount: 1 });
    // A retried click returns the same save point rather than a second one.
    expect((await point(gameId, { savePointId, name: 'Other' })).json().data.name).toBe('Before the rework');
    // Later changes to the draft never change the save point.
    const changed = { ...definition, title: 'Changed', editor: { positions: { welcome: { x: 40, y: 80 } } } };
    expect((await call('PUT', `/api/host/games/${gameId}/draft`, { expectedRevision: 0, definition: changed })).statusCode).toBe(200);
    const editor = await person(true);
    const listed = (await call('GET', `/api/host/games/${gameId}/save-points`, undefined, editor.cookie)).json().data;
    expect(listed).toMatchObject({ limit: MAX_SAVE_POINTS, savePoints: [{ id: savePointId }] });
    expect((await call('GET', `/api/host/games/${gameId}/save-points/${savePointId}`, undefined, editor.cookie)).json().data.definition).toEqual(definition);
    // An editor's save point says who made it.
    expect((await point(gameId, { expectedRevision: 1 }, editor.cookie)).json().data.savedBy).toBe(editor.name);
  });

  it('are only made of the draft the person has seen', async () => {
    const { gameId, definition } = await game();
    await call('PUT', `/api/host/games/${gameId}/draft`, { expectedRevision: 0, definition: { ...definition, title: 'Newer' } });
    const stale = await point(gameId, { expectedRevision: 0 });
    expect(stale.statusCode).toBe(409); expect(stale.json().error.code).toBe('REVISION_CONFLICT');
    expect((await call('GET', `/api/host/games/${gameId}/save-points`)).json().data.savePoints).toEqual([]);
  });

  it('stop at the limit, except that an automatic one replaces the oldest automatic one', async () => {
    const { gameId } = await game();
    const auto = await point(gameId, { name: 'First automatic', automatic: true });
    for (let index = 1; index < MAX_SAVE_POINTS; index++) expect((await point(gameId, { name: `Mine ${index}` })).statusCode).toBe(200);
    const full = await point(gameId, { name: 'One too many' });
    expect(full.statusCode).toBe(409); expect(full.json().error.code).toBe('SAVE_POINT_LIMIT');
    expect((await point(gameId, { name: 'Second automatic', automatic: true })).statusCode).toBe(200);
    const names = ((await call('GET', `/api/host/games/${gameId}/save-points`)).json().data.savePoints as { id: string; name: string }[]);
    expect(names).toHaveLength(MAX_SAVE_POINTS);
    expect(names.some(entry => entry.id === auto.json().data.id)).toBe(false);
    // Only save points people made are left besides the new one: a full game of those refuses an automatic one too.
    await prisma.gameSavePoint.updateMany({ where: { gameId }, data: { automatic: false } });
    expect((await point(gameId, { name: 'Third automatic', automatic: true })).json().error.code).toBe('SAVE_POINT_LIMIT');
  });

  it('are deleted only within their own game', async () => {
    const first = await game(); const second = await game();
    const made = (await point(first.gameId, {})).json().data.id as string;
    expect((await call('GET', `/api/host/games/${second.gameId}/save-points/${made}`)).statusCode).toBe(404);
    expect((await call('POST', `/api/host/games/${second.gameId}/save-points/${made}/delete`, {})).statusCode).toBe(404);
    // Reusing another game's save point id does not copy or reveal it.
    expect((await point(second.gameId, { savePointId: made })).statusCode).toBe(404);
    expect((await call('POST', `/api/host/games/${first.gameId}/save-points/${made}/delete`, {})).statusCode).toBe(200);
    expect((await call('GET', `/api/host/games/${first.gameId}/save-points`)).json().data.savePoints).toEqual([]);
  });

  it('are refused to players, to anyone signed out, and for games no longer in the list', async () => {
    const { gameId } = await game(); const player = await person(false);
    expect((await point(gameId, {}, player.cookie)).statusCode).toBe(401);
    expect((await call('GET', `/api/host/games/${gameId}/save-points`, undefined, player.cookie)).statusCode).toBe(401);
    expect((await call('GET', `/api/host/games/${gameId}/save-points`, undefined, '')).statusCode).toBe(401);
    expect((await point(gameId, { name: '   ' })).statusCode).toBe(400);
    await call('POST', `/api/host/games/${gameId}/archive`, {});
    expect((await point(gameId, {})).statusCode).toBe(404);
  });
});
