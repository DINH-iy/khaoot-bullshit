import { randomUUID } from 'node:crypto';
import { io as connect, type Socket } from 'socket.io-client';
import { SignJWT } from 'jose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EDITOR_NAMESPACE, type Draft, type EditorPeer } from '@party/contracts';
import { buildApp } from '../../src/app.js';
import { readConfig } from '../../src/config.js';
import { db } from './game-fixture.js';

const ownerToken = 'l'.repeat(43);
const config = readConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ROOM_TOKEN_SECRET: 'd'.repeat(64), PUBLIC_ORIGIN: 'http://127.0.0.1:4173', LOCAL_OWNER_TOKEN: ownerToken });
const headers = { origin: config.PUBLIC_ORIGIN, 'x-party-request': '1' }; const sockets: Socket[] = [];
let app: ReturnType<typeof buildApp>; let url: string; let owner: string;
const call = (method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown, cookie = owner) =>
  app.inject({ method, url: path, ...(body === undefined ? {} : { payload: body as object }), headers: { ...headers, ...(cookie ? { cookie } : {}) } });
beforeAll(async () => {
  app = buildApp(config, { database: { ...db, close: async () => {} } }); url = await app.listen({ host: '127.0.0.1', port: 0 });
  owner = String((await call('POST', '/api/host/claim', { token: ownerToken }, '')).headers['set-cookie']).split(';')[0]!;
});
afterEach(() => { for (const socket of sockets.splice(0)) socket.disconnect(); });
afterAll(async () => { await app.close(); await db.close(); });

async function newGame() { const gameId = randomUUID(); const created = await call('POST', '/api/host/games', { gameId, title: 'Together', startFrom: null }); expect(created.statusCode).toBe(200); return created.json().data as Draft; }
const ticketFor = async (gameId: string) => (await call('POST', `/api/host/games/${gameId}/live`, {})).json().data.ticket as string;
function open(auth: object) { const socket = connect(`${url}${EDITOR_NAMESPACE}`, { auth, transports: ['websocket'], reconnection: false, extraHeaders: { origin: config.PUBLIC_ORIGIN } }); sockets.push(socket); return socket; }
const joined = (socket: Socket) => new Promise<void>((resolve, reject) => { socket.once('connect', () => resolve()); socket.once('connect_error', reject); });
const next = <T>(socket: Socket, event: string, when: (data: T) => boolean = () => true) => new Promise<T>(resolve => { const listen = (data: T) => { if (when(data)) { socket.off(event, listen); resolve(data); } }; socket.on(event, listen); });

describe('editing a game together', () => {
  it('gives a ticket only to someone who may edit that game, and admits nobody without one', async () => {
    const game = await newGame();
    expect((await call('POST', `/api/host/games/${game.gameId}/live`, {}, '')).statusCode).toBe(401);
    expect((await call('POST', `/api/host/games/${randomUUID()}/live`, {})).statusCode).toBe(404);
    await expect(joined(open({ name: 'Nobody' }))).rejects.toThrow('Editor access denied');
    await expect(joined(open({ ticket: 'x'.repeat(120), name: 'Nobody' }))).rejects.toThrow('Editor access denied');
    // Signed with the room secret itself, or meant for something else: not a ticket.
    const forged = await new SignJWT({ game: game.gameId }).setProtectedHeader({ alg: 'HS256' }).setSubject('x').setAudience('party-editor-live').setIssuedAt().setExpirationTime('2m').sign(Buffer.from('d'.repeat(64), 'hex'));
    await expect(joined(open({ ticket: forged, name: 'Forger' }))).rejects.toThrow('Editor access denied');
    await expect(joined(open({ ticket: await ticketFor(game.gameId), name: '' }))).rejects.toThrow('Editor access denied');
    await joined(open({ ticket: await ticketFor(game.gameId), name: 'Ada' }));
  });

  it('shows who is there and what they have selected, relays pointers, and keeps games apart', async () => {
    const game = await newGame(); const other = await newGame();
    const ada = open({ ticket: await ticketFor(game.gameId), name: 'Ada' }); await joined(ada);
    const both = next<EditorPeer[]>(ada, 'editor.peers', peers => peers.length === 2);
    const ben = open({ ticket: await ticketFor(game.gameId), name: 'Ben' }); await joined(ben);
    const stranger = open({ ticket: await ticketFor(other.gameId), name: 'Cleo' }); await joined(stranger);
    const leaked: unknown[] = []; stranger.onAny((event, data) => { if (event !== 'editor.peers' || (data as EditorPeer[]).some(peer => peer.name !== 'Cleo')) leaked.push(event); });
    const peers = await both;
    expect(peers.map(peer => peer.name).sort()).toEqual(['Ada', 'Ben']); expect(new Set(peers.map(peer => peer.color)).size).toBe(2);

    const selected = next<EditorPeer[]>(ada, 'editor.peers', list => list.some(peer => peer.selected.length > 0));
    ben.emit('editor.presence', { name: 'Ben', view: 'scene', selected: ['welcome'] });
    expect((await selected).find(peer => peer.id === ben.id)).toMatchObject({ name: 'Ben', view: 'scene', selected: ['welcome'] });
    // Malformed updates change nothing.
    ben.emit('editor.presence', { name: 'Ben', view: 'scene', selected: ['welcome'], admin: true }); ben.emit('editor.cursor', { x: 'left', y: 1 });

    const pointer = next<{ id: string; at: unknown }>(ada, 'editor.cursor');
    ben.emit('editor.cursor', { x: 120, y: 48 });
    expect(await pointer).toEqual({ id: ben.id, at: { x: 120, y: 48 } });

    const left = next<EditorPeer[]>(ada, 'editor.peers', list => list.length === 1);
    ben.disconnect();
    expect((await left)[0]).toMatchObject({ name: 'Ada' });
    expect(leaked).toEqual([]);
  });

  it('hands every save to the others at once, and a late save is refused so it can be merged', async () => {
    const game = await newGame();
    const ada = open({ ticket: await ticketFor(game.gameId), name: 'Ada' }); await joined(ada);
    const pushed = next<Draft>(ada, 'editor.draft');
    const renamed = { ...(game.definition as object), title: 'Renamed by Ben' };
    const save = await call('PUT', `/api/host/games/${game.gameId}/draft`, { expectedRevision: 0, definition: renamed });
    expect(save.statusCode).toBe(200);
    expect(await pushed).toMatchObject({ gameId: game.gameId, revision: 1, title: 'Renamed by Ben', definition: { title: 'Renamed by Ben' } });
    // Ada, still on revision 0, is told to merge rather than overwrite.
    const late = await call('PUT', `/api/host/games/${game.gameId}/draft`, { expectedRevision: 0, definition: game.definition });
    expect(late.statusCode).toBe(409); expect(late.json().error.code).toBe('REVISION_CONFLICT');
  });
});
