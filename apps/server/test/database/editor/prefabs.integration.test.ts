import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../../src/app.js';
import { readConfig } from '../../../src/config.js';
import { db } from '../game-fixture.js';

// Prefabs: scenes saved from the editor. The owner and editors share them; nobody else sees them.
const ownerToken = 's'.repeat(43);
const config = readConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ROOM_TOKEN_SECRET: 'b'.repeat(64), PUBLIC_ORIGIN: 'http://127.0.0.1:4173', LOCAL_OWNER_TOKEN: ownerToken });
const headers = { origin: config.PUBLIC_ORIGIN, 'x-party-request': '1' };
let app: ReturnType<typeof buildApp>; let owner: string;
const call = (method: 'GET' | 'POST', path: string, body?: unknown, cookie = '') =>
  app.inject({ method, url: path, ...(body === undefined ? {} : { payload: body as object }), headers: { ...headers, ...(cookie ? { cookie } : {}) } });
const cookieOf = (response: Awaited<ReturnType<typeof call>>) => String(response.headers['set-cookie']).split(';')[0]!;
beforeAll(async () => { app = buildApp(config, { database: { ...db, close: async () => {} } }); await app.ready(); owner = cookieOf(await call('POST', '/api/host/claim', { token: ownerToken })); });
afterAll(async () => { await app.close(); await db.close(); });

const content = {
  nodes: [{ key: 'write', stages: [{ key: 'main', kind: 'collect', prompt: 'Write', durationMs: 60000, input: { kind: 'text', maxLength: 240 }, scoring: { kind: 'none' } }] },
    { key: 'ballot', stages: [{ key: 'main', kind: 'vote', prompt: 'Vote', durationMs: 45000, source: { nodeKey: 'write', stageKey: 'main' }, awardPerVoteMilli: '5000' }] }],
  edges: [{ key: 'w-b', from: 'write', to: 'ballot' }],
  positions: { write: { x: 0, y: 0 }, ballot: { x: 360, y: 0 } },
  keys: ['write', 'ballot'],
};
async function person(canEdit: boolean) {
  const made = await call('POST', '/api/host/people', { name: `P ${randomUUID().slice(0, 8)}`, canEdit }, owner);
  return cookieOf(await call('POST', '/api/people/claim', { token: made.json().data.key }));
}

describe('prefabs', () => {
  it('are saved once per request id, and shared between the owner and editors', async () => {
    const prefabId = randomUUID(); const body = { prefabId, name: 'Write and vote', content };
    const saved = await call('POST', '/api/host/prefabs', body, owner);
    expect(saved.statusCode).toBe(200); expect(saved.json().data).toMatchObject({ id: prefabId, name: 'Write and vote', sceneCount: 2 });
    // A retried click returns the same prefab rather than a second one.
    expect((await call('POST', '/api/host/prefabs', { ...body, name: 'Other name' }, owner)).json().data.name).toBe('Write and vote');
    const editor = await person(true);
    const listed = (await call('GET', '/api/host/prefabs', undefined, editor)).json().data.prefabs as { id: string }[];
    expect(listed.filter(entry => entry.id === prefabId)).toHaveLength(1);
    expect((await call('GET', `/api/host/prefabs/${prefabId}`, undefined, editor)).json().data.content).toEqual(content);
  });

  it('are refused to players and to anyone signed out', async () => {
    const player = await person(false); const prefabId = randomUUID();
    expect((await call('POST', '/api/host/prefabs', { prefabId, name: 'Nope', content }, player)).statusCode).toBe(401);
    expect((await call('GET', '/api/host/prefabs', undefined, player)).statusCode).toBe(401);
    expect((await call('GET', '/api/host/prefabs')).statusCode).toBe(401);
  });

  it('refuse content that is not a set of scenes with their own connections', async () => {
    const bad = [
      { ...content, edges: [{ key: 'out', from: 'ballot', to: 'elsewhere' }] },
      { ...content, keys: ['write'] },
      { ...content, nodes: [] },
      { ...content, nodes: [{ key: 'write', stages: [] }, content.nodes[1]] },
      { ...content, extra: true },
    ];
    for (const entry of bad) expect((await call('POST', '/api/host/prefabs', { prefabId: randomUUID(), name: 'Bad', content: entry }, owner)).statusCode).toBe(400);
    expect((await call('POST', '/api/host/prefabs', { prefabId: randomUUID(), name: '   ', content }, owner)).statusCode).toBe(400);
  });

  it('can be deleted by an editor; games keep what was inserted', async () => {
    const prefabId = randomUUID(); await call('POST', '/api/host/prefabs', { prefabId, name: 'Short-lived', content }, owner);
    const editor = await person(true);
    expect((await call('POST', `/api/host/prefabs/${prefabId}/delete`, {}, editor)).statusCode).toBe(200);
    expect((await call('GET', `/api/host/prefabs/${prefabId}`, undefined, owner)).statusCode).toBe(404);
    expect((await call('POST', `/api/host/prefabs/${prefabId}/delete`, {}, owner)).statusCode).toBe(404);
  });
});
