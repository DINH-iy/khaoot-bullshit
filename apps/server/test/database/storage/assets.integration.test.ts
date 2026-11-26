import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../../src/app.js';
import { MEDIA_LIMITS } from '../../../src/assets/media.js';
import { readConfig } from '../../../src/config.js';
import { createGameService } from '../../../src/game/service.js';
import { readSessionView } from '../../../src/game/views.js';
import { db, prisma } from '../game-fixture.js';

const ownerToken = 'a'.repeat(43);
let mediaDirectory: string; let app: ReturnType<typeof buildApp>;
const headers = { origin: 'http://127.0.0.1:4173', 'x-party-request': '1' };
beforeAll(async () => {
  mediaDirectory = await mkdtemp(join(tmpdir(), 'party-media-test-'));
  app = buildApp(readConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ROOM_TOKEN_SECRET: 'd'.repeat(64), PUBLIC_ORIGIN: headers.origin, LOCAL_OWNER_TOKEN: ownerToken, MEDIA_DIR: mediaDirectory }), { database: { ...db, close: async () => {} } });
  await app.ready();
});
afterAll(async () => { await app.close(); await db.close(); await rm(mediaDirectory, { recursive: true, force: true }); });

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('party-picture-bytes-0123456789')]);
const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(40, 7)]);
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(40, 3)]);
const cookieOf = (response: { headers: Record<string, unknown> }) => String(response.headers['set-cookie']).split(';')[0]!;
const json = (url: string, payload: object, cookie?: string) => app.inject({ method: 'POST', url, payload, headers: { ...headers, ...(cookie ? { cookie } : {}) } });
const upload = (sessionId: string, cookie: string | undefined, body: Buffer, contentType = 'image/png', extra: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: `/api/rooms/${sessionId}/assets`, payload: body, headers: { ...headers, 'content-type': contentType, ...(cookie ? { cookie } : {}), ...extra } });
const download = (sessionId: string, assetId: string, cookie?: string, extra: Record<string, string> = {}) =>
  app.inject({ method: 'GET', url: `/api/rooms/${sessionId}/assets/${assetId}`, headers: { host: '127.0.0.1:4173', ...(cookie ? { cookie } : {}), ...extra } });
const stored = async (sessionId: string) => readdir(join(mediaDirectory, sessionId)).catch(() => [] as string[]);

async function room(gameKey = 'picture-party') {
  const owner = cookieOf(await json('/api/host/claim', { token: ownerToken }));
  const sessionId = randomUUID();
  const created = await json('/api/host/rooms', { gameKey, sessionId, commandId: randomUUID() }, owner);
  expect(created.statusCode).toBe(200); const host = cookieOf(created);
  const session = await prisma.gameSession.findUniqueOrThrow({ where: { id: sessionId } });
  const players: { cookie: string; id: string; actor: { role: 'player'; playerId: string } }[] = [];
  for (const displayName of ['Ada', 'Ben']) {
    const cookie = cookieOf(await json('/api/rooms/join', { roomCode: session.roomCode, displayName, joinId: randomUUID() }));
    const id = (await prisma.sessionPlayer.findFirstOrThrow({ where: { sessionId, displayName } })).id;
    players.push({ cookie, id, actor: { role: 'player' as const, playerId: id } });
  }
  const service = createGameService(prisma); const hostActor = { role: 'host' as const, creatorId: session.hostId };
  const command = async (type: string, extra: Record<string, unknown> = {}) => {
    const current = await prisma.gameSession.findUniqueOrThrow({ where: { id: sessionId } });
    return service.execute(hostActor, { formatVersion: 1, commandId: randomUUID(), sessionId, expectedRevision: current.revision, type, ...extra });
  };
  const stageRunId = (await command('session.start')).stageRunId!;
  const submit = (index: number, assetId: string) => service.execute(players[index]!.actor, { formatVersion: 1, commandId: randomUUID(), sessionId, type: 'submission.submit', stageRunId, value: { kind: 'media', assetId } });
  return { sessionId, host, players, command, stageRunId, submit };
}

describe('uploaded pictures, GIFs and videos as answers', () => {
  it('stores only verified media of the kinds this round accepts, from a player of this room', async () => {
    const r = await room(); const ada = r.players[0]!;
    expect((await upload(r.sessionId, undefined, png)).statusCode).toBe(401);
    expect((await upload(r.sessionId, r.host, png)).statusCode).toBe(403);
    expect((await upload(r.sessionId, ada.cookie, png, 'image/png', { origin: 'https://evil.example' })).statusCode).toBe(403);
    // The declared type is ignored: content decides.
    expect((await upload(r.sessionId, ada.cookie, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).json()).toEqual({ ok: false, error: { code: 'UNSUPPORTED_MEDIA' } });
    expect((await upload(r.sessionId, ada.cookie, mp4, 'image/png')).statusCode).toBe(415); // this round takes pictures and GIFs only
    expect((await upload(r.sessionId, ada.cookie, png, 'text/html')).statusCode).toBe(415);
    expect((await upload(r.sessionId, ada.cookie, png, 'image/png', { 'content-length': String(MEDIA_LIMITS.VIDEO + 1) })).statusCode).toBe(413);
    const oversized = Buffer.concat([png, Buffer.alloc(MEDIA_LIMITS.IMAGE)]);
    expect((await upload(r.sessionId, ada.cookie, oversized)).json()).toEqual({ ok: false, error: { code: 'FILE_TOO_LARGE' } });
    expect(await stored(r.sessionId)).toEqual([]);
    expect(await prisma.asset.count({ where: { sessionId: r.sessionId } })).toBe(0);

    const first = await upload(r.sessionId, ada.cookie, png, 'image/jpeg');
    expect(first.json()).toEqual({ ok: true, data: { assetId: expect.any(String), mediaKind: 'image' } });
    const second = await upload(r.sessionId, ada.cookie, gif, 'image/gif');
    expect(second.json().data.mediaKind).toBe('gif');
    // Choosing another file replaces the pending one on disk and in the database.
    expect(await stored(r.sessionId)).toEqual([second.json().data.assetId]);
    expect(await prisma.asset.findMany({ where: { sessionId: r.sessionId } })).toMatchObject([{ id: second.json().data.assetId, kind: 'GIF', contentType: 'image/gif', byteSize: gif.length, playerId: ada.id, submissionId: null }]);
    expect(await readFile(join(mediaDirectory, r.sessionId, second.json().data.assetId))).toEqual(gif);
  });

  it('binds an upload to its uploader and stage, and shows it to the room only in the vote and after the reveal', async () => {
    const r = await room(); const [ada, ben] = [r.players[0]!, r.players[1]!];
    const assetId = (await upload(r.sessionId, ada.cookie, png)).json().data.assetId as string;
    expect((await download(r.sessionId, assetId)).statusCode).toBe(401);
    expect((await download(r.sessionId, assetId, ben.cookie)).statusCode).toBe(403);
    const other = await room();
    expect((await download(other.sessionId, assetId, other.players[0]!.cookie)).statusCode).toBe(404);
    const own = await download(r.sessionId, assetId, ada.cookie);
    expect(own.statusCode).toBe(200); expect(own.rawPayload).toEqual(png);
    expect(own.headers).toMatchObject({ 'content-type': 'image/png', 'content-security-policy': "sandbox; default-src 'none'", 'x-content-type-options': 'nosniff', 'accept-ranges': 'bytes' });
    expect((await download(r.sessionId, assetId, r.host)).statusCode).toBe(200);
    const part = await download(r.sessionId, assetId, ada.cookie, { range: 'bytes=8-12' });
    expect(part.statusCode).toBe(206); expect(part.rawPayload).toEqual(png.subarray(8, 13)); expect(part.headers['content-range']).toBe(`bytes 8-12/${png.length}`);
    expect((await download(r.sessionId, assetId, ada.cookie, { range: 'bytes=9999-' })).statusCode).toBe(416);

    // Nobody can answer with someone else's upload, an invented one, or the same one twice.
    await expect(r.submit(1, assetId)).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    await expect(r.submit(0, randomUUID())).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    const receipt = await r.submit(0, assetId) as { submissionId: string };
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: assetId } })).submissionId).toBe(receipt.submissionId);
    expect((await upload(r.sessionId, ada.cookie, gif, 'image/gif')).statusCode).toBe(409);
    expect(await stored(r.sessionId)).toEqual([assetId]);

    await r.command('stage.close', { stageRunId: r.stageRunId });
    expect((await upload(r.sessionId, ben.cookie, png)).statusCode).toBe(409);
    expect((await readSessionView(prisma, ben.actor, r.sessionId)).stage!.reveal).toBeNull();
    expect((await download(r.sessionId, assetId, ben.cookie)).statusCode).toBe(403);
    // The next round votes on these uploads: the room may now see the picture, but not whose it is.
    const vote = (await r.command('stage.advance', { stageRunId: r.stageRunId })).stageRunId!;
    expect((await download(r.sessionId, assetId, ben.cookie)).rawPayload).toEqual(png);
    const ballot = (await readSessionView(prisma, ben.actor, r.sessionId)).stage!;
    expect(ballot.ballot).toEqual([{ submissionId: receipt.submissionId, own: false, content: { kind: 'media', assetId, mediaKind: 'image' } }]);
    expect(ballot.reveal).toBeNull();
    await r.command('stage.close', { stageRunId: vote });
    await r.command('stage.reveal', { stageRunId: vote });
    expect((await readSessionView(prisma, ben.actor, r.sessionId)).stage!.reveal!.answer).toEqual({ kind: 'vote', entries: [{ submissionId: receipt.submissionId, playerId: ada.id, teamId: null, votes: 0 }] });

    // The next upload round also accepts video; an upload from the earlier round cannot be reused there.
    const next = (await r.command('stage.advance', { stageRunId: vote })).stageRunId!;
    const clip = await upload(r.sessionId, ben.cookie, mp4, 'video/mp4');
    expect(clip.json().data.mediaKind).toBe('video');
    const service = createGameService(prisma);
    await expect(service.execute(ada.actor, { formatVersion: 1, commandId: randomUUID(), sessionId: r.sessionId, type: 'submission.submit', stageRunId: next, value: { kind: 'media', assetId } })).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    await expect(service.execute(ben.actor, { formatVersion: 1, commandId: randomUUID(), sessionId: r.sessionId, type: 'submission.submit', stageRunId: next, value: { kind: 'media', assetId: clip.json().data.assetId } })).resolves.toMatchObject({ type: 'submission.submit' });
  });
});

describe('a team’s own winning sound', () => {
  const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(200, 1)]);
  const sound = (sessionId: string, cookie: string | undefined, body: Buffer) =>
    app.inject({ method: 'POST', url: `/api/rooms/${sessionId}/sounds`, payload: body, headers: { ...headers, 'content-type': 'application/octet-stream', ...(cookie ? { cookie } : {}) } });
  it('is uploaded by a team member while teams are made, only audio up to 2 MB, plays for the whole room, and only that team can use it', async () => {
    const r = await room('team-party'); const [ada, ben] = r.players as [typeof r.players[number], typeof r.players[number]];
    for (const [index, team] of [[0, 0], [1, 1]] as const) await r.command('teams.assign', { stageRunId: r.stageRunId, playerId: r.players[index]!.id, teamIndex: team });
    expect((await sound(r.sessionId, r.host, mp3)).statusCode).toBe(403);
    expect((await sound(r.sessionId, ada.cookie, png)).statusCode).toBe(415);
    expect((await sound(r.sessionId, ada.cookie, Buffer.concat([mp3, Buffer.alloc(2 * 1024 * 1024)]))).statusCode).toBe(413);
    const uploaded = await sound(r.sessionId, ada.cookie, mp3);
    expect(uploaded.statusCode).toBe(200);
    const { assetId } = uploaded.json().data as { assetId: string };
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: assetId } })).toMatchObject({ kind: 'AUDIO', purpose: 'SOUND', contentType: 'audio/mpeg', stageRunId: null });
    // The shared screen (and everyone in the room) can play it.
    const played = await download(r.sessionId, assetId, ben.cookie);
    expect(played.statusCode).toBe(200); expect(played.headers['content-type']).toBe('audio/mpeg');
    const service = createGameService(prisma);
    const celebrate = (actor: typeof ada, teamIndex: number) => service.execute(actor.actor, { formatVersion: 1, commandId: randomUUID(), sessionId: r.sessionId, type: 'teams.celebration', stageRunId: r.stageRunId, teamIndex,
      celebration: { emoji: '🎉', text: '', sound: null, upload: assetId } });
    // Ben's team cannot take Ada's sound; Ada's team can.
    await expect(celebrate(ben, 1)).rejects.toMatchObject({ code: 'INVALID_COMMAND' });
    await celebrate(ada, 0);
    expect((await readSessionView(prisma, ada.actor, r.sessionId)).stage!.teams!.teams[0]!.celebration).toMatchObject({ upload: assetId });
    // Once the teams are set, no more sounds.
    await r.command('teams.confirm', { stageRunId: r.stageRunId });
    expect((await sound(r.sessionId, ada.cookie, mp3)).statusCode).toBe(409);
  });
});
