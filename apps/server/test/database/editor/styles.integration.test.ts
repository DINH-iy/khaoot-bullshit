import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_SAVED_STYLES, type SavedStyle } from '@party/contracts';
import { buildApp } from '../../../src/app.js';
import { readConfig } from '../../../src/config.js';
import { ownerCreator } from '../../../src/hosting/owner-creator.js';
import { db, prisma } from '../game-fixture.js';

// Saved styles: looks made in Look & feel. The owner and editors share them; nobody else sees them.
const ownerToken = 'y'.repeat(43);
const config = readConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ROOM_TOKEN_SECRET: 'c'.repeat(64), PUBLIC_ORIGIN: 'http://127.0.0.1:4173', LOCAL_OWNER_TOKEN: ownerToken });
const headers = { origin: config.PUBLIC_ORIGIN, 'x-party-request': '1' };
let app: ReturnType<typeof buildApp>; let owner: string;
const call = (method: 'GET' | 'POST', path: string, body?: unknown, cookie = '') =>
  app.inject({ method, url: path, ...(body === undefined ? {} : { payload: body as object }), headers: { ...headers, ...(cookie ? { cookie } : {}) } });
const cookieOf = (response: Awaited<ReturnType<typeof call>>) => String(response.headers['set-cookie']).split(';')[0]!;
beforeAll(async () => { app = buildApp(config, { database: { ...db, close: async () => {} } }); await app.ready(); owner = cookieOf(await call('POST', '/api/host/claim', { token: ownerToken })); });
afterAll(async () => { await app.close(); await db.close(); });
async function person(canEdit: boolean) {
  const made = await call('POST', '/api/host/people', { name: `S ${randomUUID().slice(0, 8)}`, canEdit }, owner);
  return cookieOf(await call('POST', '/api/people/claim', { token: made.json().data.key }));
}
const listed = async (cookie: string) => (await call('GET', '/api/host/styles', undefined, cookie)).json().data as SavedStyle[];

describe('saved styles', () => {
  it('are created and updated per style id, and shared between the owner and editors', async () => {
    const styleId = randomUUID();
    const theme = { preset: 'neon', colors: { background: '#336699' }, font: 'serif' };
    const created = await call('POST', '/api/host/styles', { styleId, name: 'Blue neon', theme }, owner);
    expect(created.statusCode).toBe(200); expect(created.json().data).toMatchObject({ id: styleId, name: 'Blue neon', theme });
    // Saving the same id again replaces it: an update, never a second style.
    const editor = await person(true);
    const updated = { ...theme, headingFont: 'slab' };
    expect((await call('POST', '/api/host/styles', { styleId, name: 'Blue neon 2', theme: updated }, editor)).statusCode).toBe(200);
    const mine = (await listed(owner)).filter(style => style.id === styleId);
    expect(mine).toEqual([expect.objectContaining({ name: 'Blue neon 2', theme: updated })]);
    expect((await listed(editor)).some(style => style.id === styleId)).toBe(true);

    expect((await call('POST', `/api/host/styles/${styleId}/delete`, {}, editor)).statusCode).toBe(200);
    expect((await listed(owner)).some(style => style.id === styleId)).toBe(false);
    expect((await call('POST', `/api/host/styles/${styleId}/delete`, {}, owner)).json().error.code).toBe('NOT_FOUND');
  });

  it('refuse people without editor rights, and looks the games could not use', async () => {
    const player = await person(false);
    expect((await call('GET', '/api/host/styles', undefined, player)).statusCode).toBe(401);
    expect((await call('POST', '/api/host/styles', { styleId: randomUUID(), name: 'Nope', theme: {} }, player)).statusCode).toBe(401);
    expect((await call('POST', '/api/host/styles', { styleId: randomUUID(), name: 'Nope', theme: {} })).statusCode).toBe(401);
    for (const body of [{ styleId: randomUUID(), name: ' ', theme: {} }, { styleId: randomUUID(), name: 'Bad colour', theme: { colors: { background: 'red' } } },
      { styleId: randomUUID(), name: 'Unknown setting', theme: { sparkles: true } }, { styleId: 'not-an-id', name: 'Bad id', theme: {} }]) {
      expect((await call('POST', '/api/host/styles', body, owner)).json().error.code).toBe('INVALID_COMMAND');
    }
  });

  it('stop at the limit, also when saves arrive together', async () => {
    const creator = await ownerCreator(prisma);
    await prisma.themeStyle.deleteMany({ where: { creatorId: creator.id } });
    await prisma.themeStyle.createMany({ data: Array.from({ length: MAX_SAVED_STYLES - 1 }, (_, index) => ({ id: randomUUID(), creatorId: creator.id, name: `Style ${index}`, theme: {} })) });
    const results = await Promise.all([0, 1, 2].map(index => call('POST', '/api/host/styles', { styleId: randomUUID(), name: `Late ${index}`, theme: {} }, owner)));
    expect(results.filter(result => result.statusCode === 200)).toHaveLength(1);
    expect(results.filter(result => result.json().error?.code === 'STYLE_LIMIT')).toHaveLength(2);
    expect(await prisma.themeStyle.count({ where: { creatorId: creator.id } })).toBe(MAX_SAVED_STYLES);
    await prisma.themeStyle.deleteMany({ where: { creatorId: creator.id } });
  });
});
