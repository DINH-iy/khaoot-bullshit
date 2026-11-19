import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../../src/app.js';
import { readConfig } from '../../../src/config.js';
import { sniffLibrary } from '../../../src/assets/library.js';
import { db } from '../game-fixture.js';

const ownerToken = 'm'.repeat(43);
let mediaDir = ''; let app: ReturnType<typeof buildApp>; let origin = '';
const headers = () => ({ origin, 'x-party-request': '1' });
beforeAll(async () => {
  mediaDir = await mkdtemp(join(tmpdir(), 'party-library-'));
  const config = readConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ROOM_TOKEN_SECRET: 'a'.repeat(64), PUBLIC_ORIGIN: 'http://127.0.0.1:4173', LOCAL_OWNER_TOKEN: ownerToken, MEDIA_DIR: mediaDir });
  origin = config.PUBLIC_ORIGIN;
  app = buildApp(config, { database: { ...db, close: async () => {} } }); await app.ready();
});
afterAll(async () => { await app.close(); await db.close(); await rm(mediaDir, { recursive: true, force: true }); });
let owner = '';
async function ownerCookie() { if (!owner) owner = String((await app.inject({ method: 'POST', url: '/api/host/claim', payload: { token: ownerToken }, headers: headers() })).headers['set-cookie']).split(';')[0]!; return owner; }
const json = async (method: 'GET' | 'POST' | 'PUT', url: string, body?: object, cookie?: string) =>
  app.inject({ method, url, ...(body ? { payload: body } : {}), headers: { ...headers(), cookie: cookie ?? await ownerCookie() } });
const upload = async (bytes: Buffer, name: string, cookie?: string) =>
  app.inject({ method: 'POST', url: `/api/host/media?name=${encodeURIComponent(name)}`, payload: bytes, headers: { ...headers(), cookie: cookie ?? await ownerCookie(), 'content-type': 'application/octet-stream' } });

// Small real headers: enough for recognising the type; the rest is filler.
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]);
const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(500, 2)]);
const m4a = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypM4A '), Buffer.alloc(300, 3)]);

describe('the media library', () => {
  it('recognises pictures, videos and songs by their bytes, never by their name', () => {
    expect(sniffLibrary(png)).toEqual({ kind: 'image', contentType: 'image/png' });
    expect(sniffLibrary(mp3)).toEqual({ kind: 'audio', contentType: 'audio/mpeg' });
    expect(sniffLibrary(m4a)).toEqual({ kind: 'audio', contentType: 'audio/mp4' });
    expect(sniffLibrary(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(20)]))).toEqual({ kind: 'audio', contentType: 'audio/wav' });
    expect(sniffLibrary(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(20)]))?.kind).toBe('video');
    // AAC ADTS frames (layer bits 0) and anything else are refused.
    expect(sniffLibrary(Buffer.concat([Buffer.from([0xff, 0xf1]), Buffer.alloc(20)]))).toBeNull();
    expect(sniffLibrary(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
  });

  it('takes uploads from the owner only (or editors), refuses other files, and lists them', async () => {
    expect((await upload(png, 'x.png', '')).statusCode).toBe(401);
    const refused = await upload(Buffer.from('<html><script>alert(1)</script></html>'), 'song.mp3');
    expect(refused.json().error.code).toBe('UNSUPPORTED_MEDIA');
    const picture = await upload(png, 'Eiffel tower.png'); expect(picture.statusCode).toBe(200);
    expect(picture.json().data).toMatchObject({ kind: 'image', name: 'Eiffel tower.png', contentType: 'image/png', byteSize: png.length });
    const song = await upload(mp3, '../../etc/Thinking music.mp3'); expect(song.json().data).toMatchObject({ kind: 'audio', contentType: 'audio/mpeg' });
    // A path in the name is never used as one: files are stored by id only.
    expect(song.json().data.name).not.toContain('/');
    expect((await readdir(join(mediaDir, 'game-media'))).sort()).toEqual([picture.json().data.id, song.json().data.id].sort());
    const listed = (await json('GET', '/api/host/media')).json().data;
    expect(listed.items.map((entry: { id: string }) => entry.id)).toEqual(expect.arrayContaining([picture.json().data.id, song.json().data.id]));
    expect(listed.usedBytes).toBeGreaterThanOrEqual(png.length + mp3.length);
    expect((await app.inject({ method: 'GET', url: '/api/host/media', headers: headers() })).statusCode).toBe(401);
    // A credit (composer and licence) for the song, shown when it plays; empty removes it again.
    const credited = await json('PUT', `/api/host/media/${song.json().data.id}`, { credit: '“Hotrock” Kevin MacLeod (incompetech.com), CC BY 4.0' });
    expect(credited.json().data.credit).toBe('“Hotrock” Kevin MacLeod (incompetech.com), CC BY 4.0');
    expect((await json('PUT', `/api/host/media/${song.json().data.id}`, { credit: '' })).json().data.credit).toBeNull();
    expect((await json('PUT', `/api/host/media/${song.json().data.id}`, {})).statusCode).toBe(400);
  });

  it('serves a file as inert media, with byte ranges for seeking', async () => {
    const id = (await upload(mp3, 'clip.mp3')).json().data.id;
    const whole = await app.inject({ method: 'GET', url: `/api/media/${id}`, headers: { host: '127.0.0.1:4173' } });
    expect(whole.statusCode).toBe(200); expect(whole.rawPayload.equals(mp3)).toBe(true);
    expect(whole.headers).toMatchObject({ 'content-type': 'audio/mpeg', 'x-content-type-options': 'nosniff', 'accept-ranges': 'bytes' });
    expect(String(whole.headers['content-security-policy'])).toContain('sandbox');
    const part = await app.inject({ method: 'GET', url: `/api/media/${id}`, headers: { host: '127.0.0.1:4173', range: 'bytes=3-9' } });
    expect(part.statusCode).toBe(206); expect(part.rawPayload.equals(mp3.subarray(3, 10))).toBe(true);
    expect((await app.inject({ method: 'GET', url: `/api/media/${randomUUID()}`, headers: { host: '127.0.0.1:4173' } })).statusCode).toBe(404);
  });

  it('keeps a file a game still uses, and removes one that is no longer used', async () => {
    const id = (await upload(png, 'question.png')).json().data.id;
    const gameId = randomUUID();
    const draft = (await json('POST', '/api/host/games', { gameId, title: 'Media game', startFrom: null })).json().data;
    const withMedia = { ...draft.definition, nodes: draft.definition.nodes.map((node: { stages: object[] }, index: number) => index === 0 ? { ...node, stages: [{ ...node.stages[0], media: { id, kind: 'image' } }, ...node.stages.slice(1)] } : node) };
    const saved = await json('PUT', `/api/host/games/${gameId}/draft`, { expectedRevision: draft.revision, definition: withMedia });
    expect(saved.statusCode).toBe(200);
    expect((await json('POST', `/api/host/media/${id}/remove`, {})).json().error.code).toBe('MEDIA_IN_USE');
    // Taken out of the scene again: now it can go, file first.
    expect((await json('PUT', `/api/host/games/${gameId}/draft`, { expectedRevision: saved.json().data.revision, definition: draft.definition })).statusCode).toBe(200);
    expect((await json('POST', `/api/host/media/${id}/remove`, {})).statusCode).toBe(200);
    expect(await readdir(join(mediaDir, 'game-media'))).not.toContain(id);
    expect((await app.inject({ method: 'GET', url: `/api/media/${id}`, headers: { host: '127.0.0.1:4173' } })).statusCode).toBe(404);
    expect((await json('GET', '/api/host/media')).json().data.items.some((entry: { id: string }) => entry.id === id)).toBe(false);
  });
});
