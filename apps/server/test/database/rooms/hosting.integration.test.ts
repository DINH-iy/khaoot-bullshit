import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../../src/app.js';
import { readConfig } from '../../../src/config.js';
import { createGameService } from '../../../src/game/service.js';
import { db, prisma } from '../game-fixture.js';

const ownerToken = 'o'.repeat(43);
const settings = { NODE_ENV: 'test', LOG_LEVEL: 'silent', ROOM_TOKEN_SECRET: 'c'.repeat(64), PUBLIC_ORIGIN: 'http://127.0.0.1:4173' };
const config = readConfig({ ...settings, LOCAL_OWNER_TOKEN: ownerToken });
const headers = { origin: config.PUBLIC_ORIGIN, 'x-party-request': '1' };
let app: ReturnType<typeof buildApp>;
beforeAll(async () => { app = buildApp(config, { database: { ...db, close: async () => {} } }); await app.listen({ host: '127.0.0.1', port: 0 }); });
afterAll(async () => { await app.close(); await db.close(); });
const call = (method: 'GET' | 'POST', url: string, body?: unknown, cookie?: string, extra: Record<string, string> = {}) =>
  app.inject({ method, url, ...(body === undefined ? {} : { payload: body as object }), headers: { ...headers, ...(cookie ? { cookie } : {}), ...extra } });
const cookieOf = (response: Awaited<ReturnType<typeof call>>) => String(response.headers['set-cookie']).split(';')[0]!;
async function owner() { const response = await call('POST', '/api/host/claim', { token: ownerToken }); expect(response.statusCode).toBe(200); return cookieOf(response); }

describe('hosting a room from the browser as the local owner', () => {
  it('admits only the owner key, from this origin, in an HttpOnly cookie', async () => {
    expect((await call('GET', '/api/host')).statusCode).toBe(401);
    expect((await call('POST', '/api/host/claim', { token: 'x'.repeat(43) })).statusCode).toBe(401);
    expect((await call('GET', '/api/host', undefined, `party_owner=${'x'.repeat(43)}`)).statusCode).toBe(401);
    expect((await call('POST', '/api/host/rooms', { gameKey: 'timed-quiz', sessionId: randomUUID(), commandId: randomUUID() })).statusCode).toBe(401);
    expect((await call('POST', '/api/host/claim', { token: ownerToken }, undefined, { origin: 'https://evil.example' })).statusCode).toBe(403);
    const claimed = await call('POST', '/api/host/claim', { token: ownerToken });
    expect(String(claimed.headers['set-cookie'])).toMatch(/^party_owner=o{43}; Path=\/api\/host; HttpOnly; SameSite=Strict/);
    expect(claimed.body).not.toContain(ownerToken);
  });

  it('lists built-in games without prompts or answers and opens the same room for a retried request', async () => {
    const cookie = await owner();
    const menu = await call('GET', '/api/host', undefined, cookie);
    expect(menu.statusCode).toBe(200);
    expect(menu.json().data.games).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'timed-quiz', timed: true, stageCount: 6 }), expect.objectContaining({ key: 'first-reliable-game', timed: false })]));
    for (const secret of ['Saturn', 'saturn', 'Canberra', 'correctChoiceKey', 'correctOrder', 'Hippopotamus', 'prompt']) expect(menu.body).not.toContain(secret);

    const body = { gameKey: 'timed-quiz', sessionId: randomUUID(), commandId: randomUUID() };
    const first = await call('POST', '/api/host/rooms', body, cookie); const retry = await call('POST', '/api/host/rooms', body, cookie);
    expect(first.statusCode).toBe(200); expect(retry.json()).toEqual(first.json()); expect(cookieOf(retry)).toBe(cookieOf(first));
    expect(await prisma.roomCredential.count({ where: { sessionId: body.sessionId } })).toBe(1);
    // A reused request identity cannot be redirected to a different game.
    expect((await call('POST', '/api/host/rooms', { ...body, gameKey: 'first-reliable-game' }, cookie)).statusCode).toBe(400);
    expect((await call('POST', '/api/host/rooms', { ...body, sessionId: randomUUID(), commandId: randomUUID(), gameKey: 'missing' }, cookie)).statusCode).toBe(404);

    const snapshot = await call('GET', `/api/rooms/${body.sessionId}`, undefined, cookieOf(first));
    expect(snapshot.json().data).toMatchObject({ role: 'host', view: { status: 'LOBBY', title: 'Timed quiz' }, roomCode: expect.stringMatching(/^[A-Z2-9]{6}$/) });
    const session = await prisma.gameSession.findUniqueOrThrow({ where: { id: body.sessionId }, include: { roomCredentials: true } });
    // Local grants only: production rejects these rooms and credentials.
    expect(session.mode).toBe('REHEARSAL'); expect(session.roomCredentials[0]!.source).toBe('LOCAL_REHEARSAL');

    const again = await call('GET', '/api/host', undefined, cookie);
    expect(again.json().data.rooms).toEqual(expect.arrayContaining([expect.objectContaining({ sessionId: body.sessionId, status: 'LOBBY', playerCount: 0 })]));
    const entered = await call('POST', `/api/host/rooms/${body.sessionId}/enter`, {}, cookie);
    expect(entered.statusCode).toBe(200); expect(cookieOf(entered)).not.toBe(cookieOf(first));
    expect((await call('GET', `/api/rooms/${body.sessionId}`, undefined, cookieOf(entered))).json().data.role).toBe('host');
    expect((await call('POST', `/api/host/rooms/${randomUUID()}/enter`, {}, cookie)).statusCode).toBe(404);
    expect((await call('POST', `/api/host/rooms/${body.sessionId}/enter`, {})).statusCode).toBe(401);
  });

  it('closes a timed stage on the running server without anyone connected', async () => {
    const cookie = await owner(); const body = { gameKey: 'timed-quiz', sessionId: randomUUID(), commandId: randomUUID() };
    expect((await call('POST', '/api/host/rooms', body, cookie)).statusCode).toBe(200);
    const session = await prisma.gameSession.findUniqueOrThrow({ where: { id: body.sessionId } });
    const service = createGameService(prisma); const host = { role: 'host' as const, creatorId: session.hostId };
    const started = await service.execute(host, { formatVersion: 1, type: 'session.start', sessionId: body.sessionId, commandId: randomUUID(), expectedRevision: session.revision });
    await service.execute(host, { formatVersion: 1, type: 'stage.timer', sessionId: body.sessionId, commandId: randomUUID(), expectedRevision: started.revision, stageRunId: started.stageRunId, change: { kind: 'set', ms: 1000 } });
    await expect.poll(async () => (await prisma.stageRun.findUniqueOrThrow({ where: { id: started.stageRunId! } })).status, { timeout: 6000, interval: 200 }).toBe('CLOSED');
    const closed = await prisma.stageRun.findUniqueOrThrow({ where: { id: started.stageRunId! } });
    expect(closed.closedAt!.getTime() - closed.openedAt.getTime()).toBeGreaterThanOrEqual(2250);
  });

  it('keeps signing in available after many ordinary menu requests', async () => {
    const cookie = await owner();
    for (let i = 0; i < 25; i++) expect((await call('GET', '/api/host', undefined, cookie)).statusCode).toBe(200);
    expect((await call('POST', '/api/host/claim', { token: ownerToken })).statusCode).toBe(200);
  });
  it('stays unavailable when the owner key is not configured', async () => {
    const closed = buildApp(readConfig(settings), { database: { ...db, close: async () => {} } });
    try {
      const response = await closed.inject({ method: 'POST', url: '/api/host/claim', payload: { token: ownerToken }, headers });
      expect(response.statusCode).toBe(503);
      expect((await closed.inject({ method: 'GET', url: '/api/host', headers: { ...headers, cookie: `party_owner=${ownerToken}` } })).statusCode).toBe(503);
    } finally { await closed.close(); }
  });

  it('goes back to the lobby in a fresh room: the old one ends with its history, players and the shared screen follow', async () => {
    const cookie = await owner();
    const body = { gameKey: 'timed-quiz', sessionId: randomUUID(), commandId: randomUUID() };
    const opened = await call('POST', '/api/host/rooms', body, cookie); const host = cookieOf(opened);
    const old = await prisma.gameSession.findUniqueOrThrow({ where: { id: body.sessionId } });
    expect((await call('POST', `/api/rooms/${old.id}/settings`, { showScores: false }, host)).statusCode).toBe(200);
    const phone = cookieOf(await call('POST', '/api/rooms/join', { roomCode: old.roomCode, joinId: randomUUID(), displayName: 'Ada' }));
    const token = (await call('POST', `/api/rooms/${old.id}/display`, {}, host)).json().data.token as string;
    const screen = cookieOf(await call('POST', `/api/rooms/${old.id}/claim`, { token }));
    const started = await createGameService(prisma).execute({ role: 'host', creatorId: old.hostId }, { formatVersion: 1, type: 'session.start', sessionId: old.id, commandId: randomUUID(), expectedRevision: (await prisma.gameSession.findUniqueOrThrow({ where: { id: old.id } })).revision });
    expect(started.stageRunId).toBeTruthy();
    // Only the owner can do it; a retry with the same IDs opens the same room.
    const restart = { sessionId: randomUUID(), commandId: randomUUID() };
    expect((await call('POST', `/api/host/rooms/${old.id}/restart`, restart)).statusCode).toBe(401);
    const moved = await call('POST', `/api/host/rooms/${old.id}/restart`, restart, cookie); expect(moved.statusCode).toBe(200);
    expect((await call('POST', `/api/host/rooms/${old.id}/restart`, restart, cookie)).json().data.sessionId).toBe(restart.sessionId);
    expect((await call('POST', `/api/host/rooms/${old.id}/restart`, { sessionId: randomUUID(), commandId: randomUUID() }, cookie)).statusCode).not.toBe(200);
    // The old room has ended, its round closed and its history kept; it points at the new one.
    const ended = await prisma.gameSession.findUniqueOrThrow({ where: { id: old.id } });
    expect(ended.status).toBe('FINISHED');
    expect(await prisma.stageRun.count({ where: { sessionId: old.id, status: 'ACTIVE' } })).toBe(0);
    expect(await prisma.stageRun.count({ where: { sessionId: old.id } })).toBe(1);
    expect((await call('GET', `/api/rooms/${old.id}`, undefined, phone)).json().data.nextRoom).toBe(restart.sessionId);
    // The new room is a fresh lobby with the host's settings and access.
    const fresh = (await call('GET', `/api/rooms/${restart.sessionId}`, undefined, cookieOf(moved))).json().data;
    expect(fresh).toMatchObject({ role: 'host', nextRoom: null, settings: { showScores: false }, view: { status: 'LOBBY' } });
    expect(fresh.roomCode).not.toBe(old.roomCode);
    // The phone follows into the same seat each time, with its name; the shared screen follows as a shared screen.
    const followed = await call('POST', `/api/rooms/${old.id}/follow`, {}, phone); expect(followed.statusCode).toBe(200);
    expect((await call('POST', `/api/rooms/${old.id}/follow`, {}, phone)).json().data.sessionId).toBe(restart.sessionId);
    const seat = (await call('GET', `/api/rooms/${restart.sessionId}`, undefined, cookieOf(followed))).json().data;
    expect(seat).toMatchObject({ role: 'player', players: [{ displayName: 'Ada' }] });
    const shown = await call('POST', `/api/rooms/${old.id}/follow`, { display: true }, screen); expect(shown.statusCode).toBe(200);
    expect(String(shown.headers['set-cookie'])).toContain('_display=');
    expect(await prisma.roomCredential.count({ where: { sessionId: restart.sessionId, role: 'DISPLAY' } })).toBe(1);
    // Without access to the old room, nobody gets into the new one this way.
    expect((await call('POST', `/api/rooms/${old.id}/follow`, {})).statusCode).toBe(400);
  });
});
