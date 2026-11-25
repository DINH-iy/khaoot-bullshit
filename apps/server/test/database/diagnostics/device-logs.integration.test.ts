import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../../src/app.js';
import { readConfig } from '../../../src/config.js';
import { pruneLogs } from '../../../src/diagnostics/device-logs.js';
import { db, prisma } from '../game-fixture.js';

const ownerToken = 'f'.repeat(43);
const config = readConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ROOM_TOKEN_SECRET: 'd'.repeat(64), PUBLIC_ORIGIN: 'http://127.0.0.1:4173', LOCAL_OWNER_TOKEN: ownerToken });
const headers = { origin: config.PUBLIC_ORIGIN, 'x-party-request': '1' };
let app: ReturnType<typeof buildApp>;
beforeAll(async () => { app = buildApp(config, { database: { ...db, close: async () => {} } }); await app.ready(); });
afterAll(async () => { await app.close(); await db.close(); });
const call = (method: 'GET' | 'POST', url: string, body?: unknown, extra: Record<string, string> = {}) =>
  app.inject({ method, url, ...(body === undefined ? {} : { payload: body as object }), headers: { ...headers, ...extra } });
async function ownerCookie() { const response = await call('POST', '/api/host/claim', { token: ownerToken }); return String(response.headers['set-cookie']).split(';')[0]!; }
const deviceLog = (overrides: Record<string, unknown> = {}) => ({
  id: randomUUID(), reason: 'problem', summary: 'GAME_UNAVAILABLE · POST /api/feedback',
  sessionId: null, lobbyId: null, playerId: null,
  device: { id: 'a1b2c3d4', role: 'player', userAgent: 'Test', viewport: { width: 390, height: 844 } },
  stats: { heartbeat: { count: 4, median: 30, max: 90 }, requests: null, longTasks: null, reconnects: 1 },
  events: [{ at: Date.now(), kind: 'tap', screen: 'player phone', what: 'Send (button)' }],
  ...overrides,
});

describe('device logs and server problems', () => {
  it('stores a device’s log once, even when it is sent again, and refuses malformed or foreign ones', async () => {
    const body = deviceLog();
    expect((await call('POST', '/api/diagnostics', body)).statusCode).toBe(200);
    expect((await call('POST', '/api/diagnostics', { ...body, summary: 'Changed on retry' })).statusCode).toBe(200);
    const stored = await prisma.deviceLog.findMany({ where: { id: body.id } });
    expect(stored).toHaveLength(1); expect(stored[0]).toMatchObject({ source: 'DEVICE', reason: 'problem', role: 'player', summary: body.summary });
    expect((await call('POST', '/api/diagnostics', deviceLog(), { origin: 'https://evil.example' })).statusCode).toBe(403);
    expect((await call('POST', '/api/diagnostics', deviceLog({ events: [{ at: 1, kind: 'keystroke', screen: '', what: 'a' }] }))).statusCode).toBe(400);
  });

  it('saves an unexpected server error with its request id and shows it with the device log of that request', async () => {
    // The feedback inbox's database count fails once: the browser only hears GAME_UNAVAILABLE.
    vi.spyOn(prisma.feedbackItem, 'count').mockRejectedValueOnce(new Error('value too long for type character varying(20)'));
    const failed = await call('POST', '/api/feedback', { id: randomUUID(), kind: 'bug', title: 'Broken thing', details: '', reporterName: null,
      context: { page: '/', screen: 'join screen', viewport: { width: 390, height: 844 }, userAgent: 'Test', elements: [] } });
    expect(failed.json()).toEqual({ ok: false, error: { code: 'GAME_UNAVAILABLE' } });
    const requestId = String(failed.headers['x-request-id']);
    await vi.waitFor(async () => expect(await prisma.deviceLog.findFirst({ where: { requestId, source: 'SERVER' } })).not.toBeNull());
    const saved = await prisma.deviceLog.findFirstOrThrow({ where: { requestId, source: 'SERVER' } });
    expect(saved.details).toMatchObject({ where: 'POST /api/feedback (host)', message: 'Error: value too long for type character varying(20)' });

    const device = deviceLog({ events: [{ at: Date.now(), kind: 'request', screen: 'join screen', what: 'POST /api/feedback', code: 'GAME_UNAVAILABLE', requestId, ms: 12 }] });
    await call('POST', '/api/diagnostics', device);
    const cookie = await ownerCookie();
    const detail = (await call('GET', `/api/host/logs/${device.id}`, undefined, { cookie })).json().data;
    expect(detail).toMatchObject({ source: 'device', requestId, who: 'Player', stats: { reconnects: 1 } });
    expect(detail.related).toEqual([expect.objectContaining({ id: saved.id, server: expect.objectContaining({ message: 'Error: value too long for type character varying(20)' }) })]);
  });

  it('shows logs to the owner only, newest first, without their events in the list', async () => {
    const body = deviceLog({ reason: 'game_over', summary: 'Game over' }); await call('POST', '/api/diagnostics', body);
    expect((await call('GET', '/api/host/logs')).statusCode).toBe(401);
    expect((await call('GET', `/api/host/logs/${body.id}`)).statusCode).toBe(401);
    expect((await call('GET', '/api/host/logs', undefined, { cookie: `party_owner=${'x'.repeat(43)}` })).statusCode).toBe(401);
    const cookie = await ownerCookie();
    const items = (await call('GET', '/api/host/logs', undefined, { cookie })).json().data.items;
    expect(items[0]).toMatchObject({ id: body.id, reason: 'game_over', source: 'device' }); expect(items[0].events).toBeUndefined();
    expect((await call('GET', `/api/host/logs/${randomUUID()}`, undefined, { cookie })).statusCode).toBe(404);
  });

  it('deletes logs older than a week', async () => {
    const old = deviceLog(); const recent = deviceLog();
    await call('POST', '/api/diagnostics', old); await call('POST', '/api/diagnostics', recent);
    await prisma.deviceLog.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) } });
    expect(await pruneLogs(prisma)).toBeGreaterThanOrEqual(1);
    expect(await prisma.deviceLog.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await prisma.deviceLog.findUnique({ where: { id: recent.id } })).not.toBeNull();
  });
});
