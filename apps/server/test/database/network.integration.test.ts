import { randomUUID } from 'node:crypto';
import { io as connect, type Socket } from 'socket.io-client';
import { generateKeyPair, SignJWT } from 'jose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { RoomReply, RoomSnapshot, CommandReceipt } from '@party/contracts';
import { buildApp } from '../../src/app.js';
import { readConfig } from '../../src/config.js';
import { createTokenVerifier } from '../../src/auth.js';
import { provisionRehearsal } from '../../src/rooms/rehearsal.js';
import { createRoomGateway } from '../../src/rooms/gateway.js';
import { cookieName, tokenHash } from '../../src/rooms/security.js';
import { createGameService } from '../../src/game/service.js';
import { answer, db, fixture, prisma } from './game-fixture.js';

const config = readConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ROOM_TOKEN_SECRET: 'a'.repeat(64), PUBLIC_ORIGIN: 'http://127.0.0.1:4173', AUTH_ISSUER: 'https://identity.example/', AUTH_AUDIENCE: 'party-api', AUTH_JWKS_URL: 'https://identity.example/keys' });
const headers = { origin: config.PUBLIC_ORIGIN, 'x-party-request': '1' }; const sockets: Socket[] = [];
let app: ReturnType<typeof buildApp>; let url: string; let keys: Awaited<ReturnType<typeof generateKeyPair>>;
beforeAll(async () => {
  keys = await generateKeyPair('RS256');
  app = buildApp(config, { database: { ...db, close: async () => {} }, verifyToken: createTokenVerifier(config, keys.publicKey)! });
  url = await app.listen({ host: '127.0.0.1', port: 0 });
});
afterEach(() => { for (const socket of sockets.splice(0)) socket.disconnect(); });
afterAll(async () => { await app.close(); await db.close(); });
async function api(path: string, body: unknown, cookie?: string) {
  return app.inject({ method: 'POST', url: path, payload: JSON.stringify(body), headers: { ...headers, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } });
}
function extractCookie(response: Awaited<ReturnType<typeof api>>) { return String(response.headers['set-cookie']).split(';')[0]!; }
async function room() {
  const f = await provisionRehearsal(prisma); const response = await api(`/api/rooms/${f.sessionId}/claim`, { token: f.hostToken });
  expect(response.statusCode).toBe(200); return { ...f, cookie: extractCookie(response) };
}
async function player(f: Awaited<ReturnType<typeof room>>, displayName = 'Alex', joinId = randomUUID()) {
  const response = await api('/api/rooms/join', { roomCode: f.roomCode, displayName, joinId });
  expect(response.statusCode).toBe(200); return { cookie: extractCookie(response), joinId };
}
async function socketFor(sessionId: string, cookie?: string, options: { display?: true; transports?: ('polling' | 'websocket')[]; origin?: string } = {}) {
  const socket = connect(url, { autoConnect: false, forceNew: true, auth: { sessionId, ...(options.display ? { display: true } : {}) },
    transports: options.transports ?? ['websocket'], extraHeaders: { Origin: options.origin ?? config.PUBLIC_ORIGIN, ...(cookie ? { Cookie: cookie } : {}) }, reconnectionAttempts: 5, reconnectionDelay: 100, reconnectionDelayMax: 300, timeout: 2000 }); sockets.push(socket);
  await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); }); return socket;
}
function emit<T>(socket: Socket, event: string, input: unknown): Promise<T> {
  return new Promise((resolve, reject) => socket.timeout(5000).emit(event, input, (error: Error | null, reply: RoomReply<T>) => {
    if (error) reject(error); else if (!reply.ok) reject(Object.assign(new Error(reply.error.code), reply.error)); else resolve(reply.data);
  }));
}
const sync = (socket: Socket, sessionId: string) => emit<RoomSnapshot>(socket, 'room.sync', { sessionId });
function socketEvent(socket: Socket, event: string): Promise<void> {
  return new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error(`Missing ${event}`)), 5000); socket.once(event, () => { clearTimeout(timeout); resolve(); }); });
}
async function hostCommand(socket: Socket, sessionId: string, type: string, extra: Record<string, unknown> = {}) {
  const state = await sync(socket, sessionId);
  return emit<CommandReceipt>(socket, 'room.command', { formatVersion: 1, sessionId, commandId: randomUUID(), expectedRevision: state.view.revision, type, ...extra });
}

describe('verified HTTP admission and actual Socket.IO networking', () => {
  it('verifies signed host identities, ownership and idempotent room creation', async () => {
    const f = await fixture();
    const token = await new SignJWT({ scope: 'games:write' }).setProtectedHeader({ alg: 'RS256' }).setIssuer(config.AUTH_ISSUER!).setAudience('party-api').setSubject(f.creator.subject).setIssuedAt().setExpirationTime('5m').sign(keys.privateKey);
    const body = { sessionId: randomUUID(), commandId: randomUUID(), gameVersionId: f.version.id };
    const request = () => app.inject({ method: 'POST', url: '/api/rooms', payload: body, headers: { ...headers, authorization: `Bearer ${token}` } });
    const first = await request(); const second = await request();
    expect(first.statusCode).toBe(200); expect(second.json()).toEqual(first.json()); expect(extractCookie(second)).toBe(extractCookie(first));
    expect((await api('/api/rooms', body)).statusCode).toBe(403);
    const forged = await app.inject({ method: 'POST', url: '/api/rooms', payload: body, headers: { ...headers, authorization: 'Bearer forged' } }); expect(forged.statusCode).toBe(403);
  });
  it('rejects missing credentials, forged roles, cross-room access and hostile origins', async () => {
    const f = await room(); const other = await room(); const p = await player(f);
    await expect(socketFor(f.sessionId)).rejects.toThrow('Room access denied');
    await expect(socketFor(other.sessionId, p.cookie)).rejects.toThrow('Room access denied');
    await expect(socketFor(f.sessionId, p.cookie, { origin: 'https://evil.example' })).rejects.toThrow();
    const client = await socketFor(f.sessionId, p.cookie);
    await expect(emit(client, 'room.command', { formatVersion: 1, type: 'session.start', sessionId: f.sessionId, commandId: randomUUID(), expectedRevision: 2 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(emit(client, 'room.sync', { sessionId: other.sessionId })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const csrf = await app.inject({ method: 'POST', url: `/api/rooms/${f.sessionId}/claim`, payload: { token: f.hostToken }, headers: { ...headers, origin: 'https://evil.example' } }); expect(csrf.statusCode).toBe(401);
  });
  it('retries lost joins without duplicate players and never recovers identity from a nickname', async () => {
    const f = await room(); const first = await player(f, 'Same name'); const retry = await player(f, 'Different retry name', first.joinId);
    expect(retry.cookie).toBe(first.cookie); expect(await prisma.sessionPlayer.count({ where: { sessionId: f.sessionId } })).toBe(1);
    const another = await player(f, 'Same name'); expect(another.cookie).not.toBe(first.cookie);
    expect((await prisma.playerCredential.findMany({ where: { sessionId: f.sessionId } })).every(row => /^[0-9a-f]{64}$/.test(row.tokenHash))).toBe(true);
  });
  it.each(['websocket', 'polling'] as const)('authenticates %s transport and measures round trips', async transport => {
    const f = await room(); const p = await player(f); const client = await socketFor(f.sessionId, p.cookie, { transports: [transport] });
    expect((await sync(client, f.sessionId)).role).toBe('player');
    const heartbeat = await emit<{ nonce: string }>(client, 'room.heartbeat', { nonce: 'test' }); expect(heartbeat.nonce).toBe('test');
  });
  it('keeps display access read-only and separate from the host cookie', async () => {
    const f = await room(); const grant = await api(`/api/rooms/${f.sessionId}/display`, {}, f.cookie); const token = grant.json().data.token as string;
    const claim = await api(`/api/rooms/${f.sessionId}/claim`, { token }); const displayCookie = extractCookie(claim);
    expect(displayCookie.startsWith(cookieName(f.sessionId, true))).toBe(true);
    const display = await socketFor(f.sessionId, displayCookie, { display: true }); const host = await socketFor(f.sessionId, f.cookie);
    expect((await sync(display, f.sessionId)).role).toBe('display'); expect((await sync(host, f.sessionId)).role).toBe('host');
    await expect(emit(display, 'room.command', { formatVersion: 1, sessionId: f.sessionId, type: 'session.start', commandId: randomUUID(), expectedRevision: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('supports twenty real clients, private submissions, retries and reconnect state restoration', async () => {
    const f = await room(); const host = await socketFor(f.sessionId, f.cookie); const players = [];
    for (let i = 0; i < 20; i++) { const p = await player(f, `Player ${i}`); players.push(await socketFor(f.sessionId, p.cookie)); }
    const stageRunId = (await hostCommand(host, f.sessionId, 'session.start')).stageRunId!;
    const commands = players.map(() => answer(f.sessionId, stageRunId));
    const receipts = await Promise.all(players.map((socket, i) => emit<CommandReceipt>(socket, 'room.command', commands[i])));
    expect(await emit(players[0]!, 'room.command', commands[0])).toEqual(receipts[0]);
    expect(await prisma.scoreEntry.count({ where: { sessionId: f.sessionId } })).toBe(20);
    const before = await sync(players[0]!, f.sessionId); expect(before.view.standings).toEqual([]); expect(before.view.ownSubmission).not.toBeNull();
    const hostState = await sync(host, f.sessionId); expect(hostState.view.ownSubmission).toBeNull(); expect(JSON.stringify(hostState)).not.toContain('correctChoiceKey');
    const reconnected = socketEvent(players[0]!, 'connect'); players[0]!.io.engine!.close(); await reconnected;
    expect((await sync(players[0]!, f.sessionId)).selfPlayerId).toBe(before.selfPlayerId);
    expect((await sync(players[0]!, f.sessionId)).view.ownSubmission).toEqual(before.view.ownSubmission);
    const recovered = await emit<{ receipt: CommandReceipt }>(players[0]!, 'room.receipt', { commandId: commands[0]!.commandId }); expect(recovered.receipt).toEqual(receipts[0]);
    const otherReceipt = await emit<{ receipt: null }>(players[1]!, 'room.receipt', { commandId: commands[0]!.commandId }); expect(otherReceipt.receipt).toBeNull();
    for (const socket of players) socket.disconnect(); host.disconnect();
  }, 15000);
  it('revokes access on an established connection and rejects expired credentials and production rehearsal keys', async () => {
    const f = await room(); const p = await player(f); const socket = await socketFor(f.sessionId, p.cookie); const state = await sync(socket, f.sessionId);
    const disconnected = socketEvent(socket, 'disconnect'); await api(`/api/rooms/${f.sessionId}/revoke`, { playerId: state.selfPlayerId }, f.cookie); await disconnected;
    await expect(socketFor(f.sessionId, p.cookie)).rejects.toThrow('Room access denied');
    const second = await player(f, 'Expiring');
    await prisma.playerCredential.updateMany({ where: { sessionId: f.sessionId, revokedAt: null }, data: { expiresAt: new Date(Date.now() - 1000), createdAt: new Date(Date.now() - 10000) } });
    await expect(socketFor(f.sessionId, second.cookie)).rejects.toThrow('Room access denied');
    const production = createRoomGateway(prisma, { ...config, NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://party.example' });
    await expect(production.authenticate(f.sessionId, f.cookie)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(await prisma.roomCredential.findUnique({ where: { tokenHash: tokenHash(f.hostToken) } })).not.toBeNull();
  });
  it('restarts the server, pauses the recovered room, and restores identity and the saved answer', async () => {
    const f = await room(); const p = await player(f); const host = await socketFor(f.sessionId, f.cookie); const client = await socketFor(f.sessionId, p.cookie);
    const stageRunId = (await hostCommand(host, f.sessionId, 'session.start')).stageRunId!;
    const command = answer(f.sessionId, stageRunId); const receipt = await emit(client, 'room.command', command); const original = await sync(client, f.sessionId);
    await prisma.roomCredential.updateMany({ where: { sessionId: f.sessionId, role: 'HOST' }, data: { createdAt: new Date(Date.now() - 10000), expiresAt: new Date(Date.now() - 1000) } });
    client.disconnect(); host.disconnect(); await app.close();
    app = buildApp(config, { database: { ...db, close: async () => {} }, verifyToken: createTokenVerifier(config, keys.publicKey)! });
    url = await app.listen({ host: '127.0.0.1', port: Number(new URL(url).port) });
    const rejoined = await socketFor(f.sessionId, p.cookie); const recovered = await sync(rejoined, f.sessionId);
    expect(recovered.view.status).toBe('PAUSED'); expect(recovered.selfPlayerId).toBe(original.selfPlayerId); expect(recovered.view.ownSubmission).toEqual(original.view.ownSubmission);
    expect(await emit(rejoined, 'room.command', command)).toEqual(receipt);
    expect(await prisma.scoreEntry.count({ where: { stageRunId } })).toBe(1);
  });
  it('rechecks a revoked credential inside the command transaction even with a previously verified actor', async () => {
    const f = await room(); const p = await player(f); const host = await socketFor(f.sessionId, f.cookie);
    const stageRunId = (await hostCommand(host, f.sessionId, 'session.start')).stageRunId!;
    const gateway = createRoomGateway(prisma, config); const principal = await gateway.authenticate(f.sessionId, p.cookie);
    await gateway.revoke(f.sessionId, principal);
    await expect(createGameService(prisma).execute(principal.actor, answer(f.sessionId, stageRunId))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await prisma.submission.count({ where: { stageRunId } })).toBe(0);
  });
  it('contains malformed and oversized packets without taking the server down', async () => {
    const f = await room(); const p = await player(f); const client = await socketFor(f.sessionId, p.cookie);
    await expect(emit(client, 'room.command', { sessionId: f.sessionId, role: 'host', type: 'session.start' })).rejects.toMatchObject({ code: 'INVALID_COMMAND' });
    expect(await emit(client, 'room.heartbeat', { nonce: 'still-alive' })).toMatchObject({ nonce: 'still-alive' });
    const disconnected = socketEvent(client, 'disconnect'); client.emit('room.command', { sessionId: f.sessionId, text: 'x'.repeat(17000) }); await disconnected;
    expect((await app.inject('/api/health/live')).statusCode).toBe(200);
    const fresh = await socketFor(f.sessionId, p.cookie); expect((await sync(fresh, f.sessionId)).role).toBe('player');
  });
});
