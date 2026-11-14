import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { readConfig } from '../../src/config.js';
import { db, prisma } from './game-fixture.js';

const ownerToken = 'f'.repeat(43);
const config = readConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ROOM_TOKEN_SECRET: 'd'.repeat(64), PUBLIC_ORIGIN: 'http://127.0.0.1:4173', LOCAL_OWNER_TOKEN: ownerToken });
const headers = { origin: config.PUBLIC_ORIGIN, 'x-party-request': '1' };
let app: ReturnType<typeof buildApp>;
beforeAll(async () => { app = buildApp(config, { database: { ...db, close: async () => {} } }); await app.ready(); });
afterAll(async () => { await app.close(); await db.close(); });
const call = (method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown, extra: Record<string, string> = {}) =>
  app.inject({ method, url, ...(body === undefined ? {} : { payload: body as object }), headers: { ...headers, ...extra } });
async function owner() { const response = await call('POST', '/api/host/claim', { token: ownerToken }); return { cookie: String(response.headers['set-cookie']).split(';')[0]! }; }
const report = (overrides: Record<string, unknown> = {}) => ({
  id: randomUUID(), kind: 'bug', title: 'The start button does nothing', details: 'Pressed it twice', reporterName: 'Sam',
  context: { page: '/?room=abc', screen: 'host screen', viewport: { width: 390, height: 844 }, userAgent: 'Test',
    elements: [{ source: 'RoomScreen@network/room-screen.tsx:150', sources: [], selector: 'main > button', tag: 'button', text: 'Start', label: '' }] },
  ...overrides,
});

describe('feedback from testers', () => {
  it('lets anyone send a report from this origin, and stores a retried send once', async () => {
    const body = report();
    expect((await call('POST', '/api/feedback', body)).statusCode).toBe(200);
    // A retry with the same id but different content neither duplicates nor overwrites.
    expect((await call('POST', '/api/feedback', { ...body, title: 'Changed on retry' })).statusCode).toBe(200);
    const stored = await prisma.feedbackItem.findMany({ where: { id: body.id } });
    expect(stored).toHaveLength(1); expect(stored[0]).toMatchObject({ title: body.title, kind: 'BUG', status: 'NEW', reporterName: 'Sam' });
  });

  it('refuses other sites, malformed reports and unknown fields', async () => {
    expect((await call('POST', '/api/feedback', report(), { origin: 'https://evil.example' })).statusCode).toBe(403);
    expect((await call('POST', '/api/feedback', report(), { 'x-party-request': '' })).statusCode).toBe(403);
    expect((await call('POST', '/api/feedback', report({ title: 'x' }))).statusCode).toBe(400);
    expect((await call('POST', '/api/feedback', report({ kind: 'praise' }))).statusCode).toBe(400);
    expect((await call('POST', '/api/feedback', report({ status: 'done' }))).statusCode).toBe(400);
    expect((await call('POST', '/api/feedback', report({ context: { ...report().context, elements: Array(6).fill(report().context.elements[0]) } }))).statusCode).toBe(400);
  });

  it('shows and changes reports for the owner only', async () => {
    const body = report({ kind: 'minigame', title: 'Galgje (hangman)' });
    await call('POST', '/api/feedback', body);
    expect((await call('GET', '/api/host/feedback')).statusCode).toBe(401);
    expect((await call('PUT', `/api/host/feedback/${body.id}`, { status: 'done' })).statusCode).toBe(401);
    expect((await call('POST', `/api/host/feedback/${body.id}/delete`, {})).statusCode).toBe(401);
    expect((await call('GET', '/api/host/feedback', undefined, { cookie: `party_owner=${'x'.repeat(43)}` })).statusCode).toBe(401);

    const { cookie } = await owner();
    const list = await call('GET', '/api/host/feedback', undefined, { cookie });
    expect(list.statusCode).toBe(200);
    expect(list.json().data.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: body.id, kind: 'minigame', status: 'new', context: body.context })]));

    const changed = await call('PUT', `/api/host/feedback/${body.id}`, { status: 'in_progress', ownerNote: 'Next week' }, { cookie });
    expect(changed.json().data).toMatchObject({ status: 'in_progress', ownerNote: 'Next week', kind: 'minigame' });
    expect((await call('PUT', `/api/host/feedback/${body.id}`, {}, { cookie })).statusCode).toBe(400);
    expect((await call('PUT', `/api/host/feedback/${body.id}`, { title: 'Rewritten' }, { cookie })).statusCode).toBe(400);
    expect((await call('PUT', `/api/host/feedback/${randomUUID()}`, { status: 'done' }, { cookie })).statusCode).toBe(404);

    expect((await call('POST', `/api/host/feedback/${body.id}/delete`, {}, { cookie })).statusCode).toBe(200);
    expect(await prisma.feedbackItem.count({ where: { id: body.id } })).toBe(0);
    expect((await call('POST', `/api/host/feedback/${body.id}/delete`, {}, { cookie })).statusCode).toBe(404);
  });

  it('limits how many reports one address can send', async () => {
    const fresh = buildApp(config, { database: { ...db, close: async () => {} } }); await fresh.ready();
    try {
      const codes: number[] = [];
      for (let i = 0; i < 31; i++) codes.push((await fresh.inject({ method: 'POST', url: '/api/feedback', payload: report(), headers })).statusCode);
      expect(codes.slice(0, 30).every(code => code === 200)).toBe(true); expect(codes[30]).toBe(429);
    } finally { await fresh.close(); }
  });
});
