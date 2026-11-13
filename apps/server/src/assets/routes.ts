import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { DrawingSchema, GameIdSchema, MAX_DRAWING_BYTES, type MediaKind, type RoomReply } from '@party/contracts';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { GameError } from '../game/errors.js';
import { readSessionView } from '../game/views.js';
import { VotePresentationSchema } from '../game/model.js';
import { createRoomGateway, type Principal } from '../rooms/gateway.js';
import { allowedOrigin, RateLimiter, RoomError, roomAssert } from '../rooms/security.js';
import { cleanUpMedia } from './cleanup.js';
import { assetPath, cleanPicture, defaultMediaDirectory, MAX_PICTURE_BYTES, MAX_UPLOAD_BYTES, removeStored, SESSION_MEDIA_BYTES, storeBytes, storeUpload, UPLOAD_CONTENT_TYPES, UploadTooLarge } from './media.js';

const MAX_ACTIVE_UPLOADS = 4;

export function registerAssetRoutes(app: FastifyInstance, client: PrismaClient, config: Config) {
  const directory = config.MEDIA_DIR ?? defaultMediaDirectory;
  const gateway = createRoomGateway(client, config); const limiter = new RateLimiter(2048);
  let active = 0;
  const status: Partial<Record<string, number>> = { UNAUTHORIZED: 401, CREDENTIAL_EXPIRED: 401, FORBIDDEN: 403, INELIGIBLE: 403, ORIGIN_REJECTED: 403, NOT_FOUND: 404, FILE_TOO_LARGE: 413, UNSUPPORTED_MEDIA: 415, RATE_LIMITED: 429, STORAGE_FULL: 507, INVALID_STATE: 409, ALREADY_SUBMITTED: 409 };
  const fail = (reply: FastifyReply, error: unknown) => {
    const code = error instanceof UploadTooLarge ? 'FILE_TOO_LARGE' : error instanceof RoomError || error instanceof GameError ? error.code : 'GAME_UNAVAILABLE';
    app.log.warn({ event: 'asset_request_rejected', code }, 'Asset request rejected');
    // An upload refused before its bytes were read must not leave them on a reused connection.
    return reply.header('connection', 'close').code(status[code] ?? (code === 'GAME_UNAVAILABLE' ? 500 : 400)).send({ ok: false, error: { code } } satisfies RoomReply<never>);
  };
  const ids = (request: FastifyRequest) => {
    const params = request.params as { sessionId?: string; assetId?: string };
    const sessionId = GameIdSchema.safeParse(params.sessionId); const assetId = GameIdSchema.safeParse(params.assetId ?? params.sessionId);
    roomAssert(sessionId.success && assetId.success, 'INVALID_COMMAND');
    return { sessionId: sessionId.data, assetId: assetId.data };
  };

  // The streaming parser is scoped to the upload route; every other route keeps the small JSON limit.
  void app.register(async scope => {
    scope.addContentTypeParser(UPLOAD_CONTENT_TYPES, (_request, payload, done) => { done(null, payload); });
    scope.post('/api/rooms/:sessionId/assets', async (request, reply) => {
      let stored: { assetId: string } | undefined; let sessionId = '';
      try {
        sessionId = ids(request).sessionId;
        roomAssert(request.headers['x-party-request'] === '1' && allowedOrigin(request.headers, config), 'ORIGIN_REJECTED');
        const principal = await gateway.authenticate(sessionId, request.headers.cookie);
        roomAssert(principal.actor.role === 'player', 'FORBIDDEN'); const playerId = principal.actor.playerId;
        roomAssert(limiter.allow(`upload:${principal.id}`, 12), 'RATE_LIMITED');
        const declared = Number(request.headers['content-length']);
        if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) throw new UploadTooLarge();
        // Checked before any byte is stored: an open media round this player has not answered yet.
        const view = await readSessionView(client, principal.actor, sessionId);
        const stage = view.stage; const input = stage?.input;
        roomAssert(view.status === 'RUNNING' && stage?.status === 'ACTIVE' && input?.kind === 'media', 'INVALID_STATE');
        roomAssert(!view.ownSubmission, 'ALREADY_SUBMITTED');
        // Not while teams are being made, and only the captain when the captain answers for the team.
        const teams = stage.teams;
        roomAssert(!teams?.forming, 'INVALID_STATE');
        roomAssert(!teams || teams.answers === 'everyone' || teams.teams.find(team => team.index === teams.ownTeamIndex)?.captainId === playerId, 'INELIGIBLE');
        const used = await client.asset.aggregate({ where: { sessionId, removedAt: null }, _sum: { byteSize: true } });
        roomAssert((used._sum.byteSize ?? 0) < SESSION_MEDIA_BYTES, 'STORAGE_FULL');
        roomAssert(active < MAX_ACTIVE_UPLOADS, 'RATE_LIMITED');
        active++;
        try {
          const assetId = randomUUID();
          const media = await storeUpload(request.body as Readable, directory, sessionId, assetId);
          roomAssert(media, 'UNSUPPORTED_MEDIA'); stored = { assetId };
          const mediaKind = media.kind.toLowerCase() as MediaKind;
          roomAssert(input.accept.includes(mediaKind), 'UNSUPPORTED_MEDIA');
          // One pending upload per player and stage: choosing another file replaces the previous one.
          const replaced = await client.$transaction(async tx => {
            const previous = await tx.asset.findMany({ where: { stageRunId: stage.id, playerId, submissionId: null }, select: { id: true } });
            await tx.asset.deleteMany({ where: { id: { in: previous.map(asset => asset.id) } } });
            await tx.asset.create({ data: { id: assetId, sessionId, stageRunId: stage.id, playerId, kind: media.kind, contentType: media.contentType, byteSize: media.byteSize, sha256: media.sha256 } });
            return previous;
          });
          stored = undefined;
          await Promise.all(replaced.map(asset => removeStored(directory, sessionId, asset.id).catch(() => undefined)));
          app.log.info({ event: 'asset_stored', kind: media.kind, byteSize: media.byteSize }, 'Upload stored');
          return { ok: true, data: { assetId, mediaKind } };
        } finally { active--; }
      } catch (error) {
        if (stored) await removeStored(directory, sessionId, stored.assetId).catch(() => undefined);
        return fail(reply, error);
      }
    });
  });

  const DrawingUploadSchema = z.object({ purpose: z.enum(['answer', 'part', 'avatar']), drawing: DrawingSchema }).strict();
  /** Stores server-checked bytes as an asset of this player, within the room's storage budget. */
  const keep = async (sessionId: string, playerId: string, bytes: Buffer, data: { kind: 'DRAWING' | 'IMAGE'; contentType: string; stageRunId: string | null }) => {
    const used = await client.asset.aggregate({ where: { sessionId, removedAt: null }, _sum: { byteSize: true } });
    roomAssert((used._sum.byteSize ?? 0) + bytes.length <= SESSION_MEDIA_BYTES, 'STORAGE_FULL');
    const assetId = randomUUID(); const stored = await storeBytes(bytes, directory, sessionId, assetId);
    try { await client.asset.create({ data: { id: assetId, sessionId, playerId, stageRunId: data.stageRunId, kind: data.kind, contentType: data.contentType, purpose: data.stageRunId ? 'ANSWER' : 'AVATAR', byteSize: stored.byteSize, sha256: stored.sha256 } }); }
    catch (error) { await removeStored(directory, sessionId, assetId).catch(() => undefined); throw error; }
    return assetId;
  };
  // A drawing: an answer in a drawing round, one turn of Pass the pencil, or a drawn picture of the player.
  // Checked against the drawing rules, then stored exactly as re-written by the server.
  app.post('/api/rooms/:sessionId/drawings', { bodyLimit: MAX_DRAWING_BYTES + 1024 }, async (request, reply) => {
    try {
      const { sessionId } = ids(request);
      roomAssert(request.headers['x-party-request'] === '1' && allowedOrigin(request.headers, config), 'ORIGIN_REJECTED');
      const principal = await gateway.authenticate(sessionId, request.headers.cookie);
      roomAssert(principal.actor.role === 'player', 'FORBIDDEN'); const playerId = principal.actor.playerId;
      roomAssert(limiter.allow(`drawing:${principal.id}`, 40), 'RATE_LIMITED');
      const body = DrawingUploadSchema.safeParse(request.body); roomAssert(body.success, 'INVALID_COMMAND');
      let stageRunId: string | null = null;
      if (body.data.purpose !== 'avatar') {
        const view = await readSessionView(client, principal.actor, sessionId); const stage = view.stage;
        roomAssert(view.status === 'RUNNING' && stage?.status === 'ACTIVE' && !stage.teams?.forming, 'INVALID_STATE');
        if (body.data.purpose === 'answer') { roomAssert(stage.input?.kind === 'drawing' && !view.ownSubmission, 'INVALID_STATE'); roomAssert((body.data.drawing.strokes.length) <= stage.input.maxStrokes, 'INVALID_COMMAND'); }
        else roomAssert(stage.minigame?.game === 'relay-drawing', 'INVALID_STATE');
        stageRunId = stage.id;
      }
      const assetId = await keep(sessionId, playerId, Buffer.from(JSON.stringify(body.data.drawing)), { kind: 'DRAWING', contentType: 'application/json', stageRunId });
      return { ok: true, data: { assetId } };
    } catch (error) { return fail(reply, error); }
  });
  // A photo for the player's picture, cropped and re-drawn on the phone; rebuilt without metadata here.
  void app.register(async scope => {
    scope.addContentTypeParser('image/png', { parseAs: 'buffer', bodyLimit: MAX_PICTURE_BYTES }, (_request, body, done) => { done(null, body); });
    scope.post('/api/rooms/:sessionId/picture', async (request, reply) => {
      try {
        const { sessionId } = ids(request);
        roomAssert(request.headers['x-party-request'] === '1' && allowedOrigin(request.headers, config), 'ORIGIN_REJECTED');
        const principal = await gateway.authenticate(sessionId, request.headers.cookie);
        roomAssert(principal.actor.role === 'player', 'FORBIDDEN');
        roomAssert(limiter.allow(`picture:${principal.id}`, 10), 'RATE_LIMITED');
        const clean = Buffer.isBuffer(request.body) ? cleanPicture(request.body) : null; roomAssert(clean, 'UNSUPPORTED_MEDIA');
        const assetId = await keep(sessionId, principal.actor.playerId, clean, { kind: 'IMAGE', contentType: 'image/png', stageRunId: null });
        return { ok: true, data: { assetId } };
      } catch (error) { return fail(reply, error); }
    });
  });

  // The clean-up runs every ten minutes, a small batch at a time, and never during shutdown.
  let cleaning: Promise<void> | undefined; let closing = false;
  const clean = () => { if (cleaning || closing) return; cleaning = cleanUpMedia(client, directory, new Date(), config.MEDIA_RETENTION_DAYS)
    .then(result => { if (result.removed || result.partials) app.log.info({ event: 'media_cleaned', removed: result.removed, partials: result.partials }, 'Old media removed'); })
    .catch(() => { app.log.warn({ event: 'media_cleanup_failed' }, 'Media clean-up failed; retrying later'); }).finally(() => { cleaning = undefined; }); };
  const cleanTimer = setInterval(clean, 10 * 60 * 1000); cleanTimer.unref();
  const firstClean = setTimeout(clean, 60 * 1000); firstClean.unref();
  app.addHook('preClose', async () => { closing = true; clearInterval(cleanTimer); clearTimeout(firstClean); await cleaning; });

  app.get('/api/rooms/:sessionId/assets/:assetId', async (request, reply) => {
    try {
      const { sessionId, assetId } = ids(request);
      roomAssert(allowedOrigin(request.headers, config), 'ORIGIN_REJECTED');
      let principal: Principal;
      try { principal = await gateway.authenticate(sessionId, request.headers.cookie); }
      catch { principal = await gateway.authenticate(sessionId, request.headers.cookie, true); }
      roomAssert(limiter.allow(`download:${principal.id}`, 600), 'RATE_LIMITED');
      const asset = await client.asset.findFirst({ where: { id: assetId, sessionId }, include: { stage: { select: { revealedAt: true } }, submission: { select: { slotKey: true } } } });
      roomAssert(asset && !asset.removedAt, 'NOT_FOUND');
      // Pictures of players and the turns of a relay drawing are for the whole room to see, straight away.
      const open = asset.purpose === 'AVATAR' || Boolean(asset.submission?.slotKey.startsWith('part-'));
      // Before the reveal only the uploader and the host can look; afterwards the whole room can.
      const own = principal.actor.role === 'player' && principal.actor.playerId === asset.playerId;
      // During a vote on that round, the room sees the uploads without names.
      const latest = open || own || principal.role === 'host' || asset.stage?.revealedAt ? null : await client.stageRun.findFirst({ where: { sessionId }, orderBy: { number: 'desc' }, select: { presentation: true } });
      const ballot = latest ? VotePresentationSchema.safeParse(latest.presentation) : null;
      roomAssert(open || own || principal.role === 'host' || asset.stage?.revealedAt || (ballot?.success && ballot.data.sourceStageRunId === asset.stageRunId && asset.submissionId), 'FORBIDDEN');
      const path = assetPath(directory, sessionId, assetId);
      const size = await stat(path).then(file => file.size, () => -1); roomAssert(size === asset.byteSize, 'NOT_FOUND');
      let start = 0; let end = size - 1; let partial = false;
      const range = /^bytes=(\d{0,15})-(\d{0,15})$/.exec(request.headers.range ?? '');
      if (range && (range[1] || range[2])) {
        partial = true;
        if (range[1]) { start = Number(range[1]); if (range[2]) end = Math.min(Number(range[2]), size - 1); }
        else start = Math.max(0, size - Number(range[2]));
        if (start > end) return reply.code(416).header('content-range', `bytes */${size}`).send();
      }
      // Stored bytes are served as inert media: verified type, no sniffing, no script or navigation.
      reply.code(partial ? 206 : 200).headers({ 'content-type': asset.contentType, 'content-length': end - start + 1, 'accept-ranges': 'bytes', 'content-disposition': 'inline',
        'content-security-policy': "sandbox; default-src 'none'", 'x-content-type-options': 'nosniff', 'cache-control': open ? 'private, max-age=86400, immutable' : 'private, no-store', ...(partial ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}) });
      return reply.send(createReadStream(path, { start, end }));
    } catch (error) { return fail(reply, error); }
  });
}
