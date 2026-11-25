import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EDITOR_ROLE_ID, VIEWER_ROLE_ID } from '@party/contracts';
import { buildApp } from '../../../src/app.js';
import { readConfig } from '../../../src/config.js';
import { db } from '../game-fixture.js';

const ownerToken = 'r'.repeat(43);
const config = readConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ROOM_TOKEN_SECRET: 'd'.repeat(64), PUBLIC_ORIGIN: 'http://127.0.0.1:4173', LOCAL_OWNER_TOKEN: ownerToken });
const headers = { origin: config.PUBLIC_ORIGIN, 'x-party-request': '1' };
let app: ReturnType<typeof buildApp>; let owner: string;
const call = (method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown, cookie = owner) =>
  app.inject({ method, url, ...(body === undefined ? {} : { payload: body as object }), headers: { ...headers, ...(cookie ? { cookie } : {}) } });
const cookieOf = (response: Awaited<ReturnType<typeof call>>) => String(response.headers['set-cookie']).split(';')[0]!;
beforeAll(async () => {
  app = buildApp(config, { database: { ...db, close: async () => {} } }); await app.ready();
  owner = cookieOf(await call('POST', '/api/host/claim', { token: ownerToken }, ''));
});
afterAll(async () => { await app.close(); await db.close(); });
/** A person with this role (or none), signed in on their own device. */
async function person(roleId: string | null) {
  const name = `P ${randomUUID().slice(0, 8)}`;
  const made = (await call('POST', '/api/host/people', { name, roleId })).json().data as { id: string; key: string };
  return { id: made.id, name, cookie: cookieOf(await call('POST', '/api/people/claim', { token: made.key }, '')) };
}
const newGame = async (cookie = owner) => { const gameId = randomUUID(); expect((await call('POST', '/api/host/games', { gameId, title: `Roles ${gameId.slice(0, 6)}`, startFrom: null }, cookie)).statusCode).toBe(200); return gameId; };

describe('roles: the owner’s own roles decide what people may do', () => {
  it('a role’s app permissions decide making games, the media library and hosting; changes apply at once', async () => {
    const roles = (await call('GET', '/api/host/roles')).json().data.roles as { id: string; name: string; builtIn: boolean; permissions: string[] }[];
    expect(roles.find(role => role.id === EDITOR_ROLE_ID)).toMatchObject({ builtIn: true, permissions: expect.arrayContaining(['games.make', 'game.edit']) });
    expect(roles.find(role => role.id === VIEWER_ROLE_ID)).toMatchObject({ builtIn: true, permissions: ['game.view', 'game.rehearse', 'game.copy'] });

    // A role of the owner's own: it may make games and host rooms, nothing else.
    const roleName = `Quizmaster ${randomUUID().slice(0, 6)}`;
    const quizmaster = (await call('POST', '/api/host/roles', { name: roleName, permissions: ['games.make', 'rooms.host'] })).json().data.id as string;
    expect((await call('POST', '/api/host/roles', { name: roleName.toUpperCase(), permissions: [] })).json().error.code).toBe('NAME_TAKEN');
    expect((await call('POST', '/api/host/roles', { name: 'Bad', permissions: ['admin.everything'] })).statusCode).toBe(400);
    const sam = await person(quizmaster);
    expect((await call('GET', '/api/host/access', undefined, sam.cookie)).json().data).toMatchObject({ role: 'editor', permissions: ['games.make', 'rooms.host'] });
    await newGame(sam.cookie);
    const sessionId = randomUUID();
    expect((await call('POST', '/api/host/rooms', { sessionId, commandId: randomUUID(), gameKey: 'timed-quiz' }, sam.cookie)).statusCode).toBe(200);
    // Not in the role: the media library and the test bench.
    expect((await call('PUT', `/api/host/media/${randomUUID()}`, { name: 'x' }, sam.cookie)).json().error.code).toBe('FORBIDDEN');
    expect((await call('POST', '/api/host/minigame-tryout', { sessionId: randomUUID(), commandId: randomUUID() }, sam.cookie)).json().error.code).toBe('FORBIDDEN');
    // Never: the admin pages, and the roles themselves.
    expect((await call('GET', '/api/host/roles', undefined, sam.cookie)).statusCode).toBe(401);
    expect((await call('GET', '/api/host/admin/rooms', undefined, sam.cookie)).statusCode).toBe(401);
    // The owner takes "make games" away: the next request is refused.
    expect((await call('PUT', `/api/host/roles/${quizmaster}`, { name: roleName, permissions: ['rooms.host'] })).statusCode).toBe(200);
    expect((await call('POST', '/api/host/games', { gameId: randomUUID(), title: 'Too late', startFrom: null }, sam.cookie)).json().error.code).toBe('FORBIDDEN');
    // A player only (no role) cannot work on games at all.
    const player = await person(null);
    expect((await call('GET', '/api/host/games', undefined, player.cookie)).statusCode).toBe(401);

    // Removing: never a built-in role, and not while someone has the role.
    expect((await call('POST', `/api/host/roles/${VIEWER_ROLE_ID}/delete`, {})).json().error.code).toBe('INVALID_STATE');
    expect((await call('POST', `/api/host/roles/${quizmaster}/delete`, {})).json().error.code).toBe('INVALID_STATE');
    expect((await call('POST', `/api/host/people/${sam.id}/role`, { roleId: null })).statusCode).toBe(200);
    expect((await call('GET', '/api/host/games', undefined, sam.cookie)).statusCode).toBe(401);
    expect((await call('POST', `/api/host/roles/${quizmaster}/delete`, {})).statusCode).toBe(200);
    const actions = (await call('GET', '/api/host/admin/actions')).json().data.actions as { action: string; subject: string }[];
    expect(actions.some(row => row.action === 'role.removed' && row.subject === roleName)).toBe(true);
  });

  it('a share’s role decides what someone may do with that game', async () => {
    const gameId = await newGame();
    const viewer = await person(VIEWER_ROLE_ID);
    // Not shared yet: the game does not exist for them.
    expect((await call('GET', `/api/host/games/${gameId}`, undefined, viewer.cookie)).statusCode).toBe(404);
    expect((await call('POST', `/api/host/games/${gameId}/sharing`, { shares: [{ personId: viewer.id, roleId: VIEWER_ROLE_ID }] })).statusCode).toBe(200);
    const draft = (await call('GET', `/api/host/games/${gameId}`, undefined, viewer.cookie)).json().data as { can: string[]; definition: unknown; revision: number };
    expect(draft.can.sort()).toEqual(['game.copy', 'game.rehearse', 'game.view']);
    expect((await call('GET', '/api/host/games', undefined, viewer.cookie)).json().data.find((game: { gameId: string }) => game.gameId === gameId)).toMatchObject({ shared: true, can: expect.arrayContaining(['game.view']) });
    // Looking is fine; changing, publishing, save points and sharing are refused.
    expect((await call('PUT', `/api/host/games/${gameId}/draft`, { expectedRevision: draft.revision, definition: draft.definition }, viewer.cookie)).json().error.code).toBe('FORBIDDEN');
    expect((await call('POST', `/api/host/games/${gameId}/publish`, { expectedRevision: draft.revision }, viewer.cookie)).json().error.code).toBe('FORBIDDEN');
    expect((await call('POST', `/api/host/games/${gameId}/save-points`, { savePointId: randomUUID(), name: 'Mine', expectedRevision: draft.revision }, viewer.cookie)).json().error.code).toBe('FORBIDDEN');
    expect((await call('GET', `/api/host/games/${gameId}/save-points`, undefined, viewer.cookie)).statusCode).toBe(200);
    expect((await call('GET', `/api/host/games/${gameId}/sharing`, undefined, viewer.cookie)).json().error.code).toBe('FORBIDDEN');
    expect((await call('POST', `/api/host/games/${gameId}/archive`, {}, viewer.cookie)).json().error.code).toBe('FORBIDDEN');
    // Shared as Editor instead: they may change it.
    expect((await call('POST', `/api/host/games/${gameId}/sharing`, { shares: [{ personId: viewer.id, roleId: EDITOR_ROLE_ID }] })).statusCode).toBe(200);
    expect((await call('PUT', `/api/host/games/${gameId}/draft`, { expectedRevision: draft.revision, definition: draft.definition }, viewer.cookie)).statusCode).toBe(200);
    // A role with "every game" sees the owner's games without any share.
    const allName = `All games ${randomUUID().slice(0, 6)}`;
    const all = (await call('POST', '/api/host/roles', { name: allName, permissions: ['games.all'] })).json().data.id as string;
    const lead = await person(all);
    expect((await call('GET', `/api/host/games/${gameId}`, undefined, lead.cookie)).json().data.can).toContain('game.remove');
  });
});
