import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { GameIdSchema, LIBRARY_LIMITS, LibraryItemSchema, MediaLibrarySchema, UpdateLibraryItemSchema, type SceneMediaKind } from '@party/contracts';
import type { Config } from '../config.js';
import type { GameMediaKind, PrismaClient } from '../generated/prisma/client.js';
import type { OwnerAccess } from '../hosting/owner-access.js';
import { allowedOrigin, RateLimiter, RoomError, roomAssert } from '../rooms/security.js';
import { defaultMediaDirectory, removeStored, sendStored, sniffMedia, storeUpload, UploadTooLarge, type UploadRules } from './media.js';

// The media library (contracts/media.ts): the owner and editors upload pictures, videos and songs,
// and scenes use them. Files go to <media folder>/game-media/<id>; the rooms' clean-up never touches them.
export const LIBRARY_FOLDER = 'game-media';
const MAX_ACTIVE_UPLOADS = 2;
const KIND: Record<SceneMediaKind, GameMediaKind> = { image: 'IMAGE', video: 'VIDEO', audio: 'AUDIO' };
const SCENE_KIND: Record<GameMediaKind, SceneMediaKind> = { IMAGE: 'image', VIDEO: 'video', AUDIO: 'audio' };
type LibraryType = { kind: SceneMediaKind; contentType: string };

/**
 * Recognises library files by their first bytes (the name and declared type are never trusted):
 * the players' picture and video types, plus MP3, M4A, Ogg, WAV and FLAC songs. GIFs count as pictures.
 */
export function sniffLibrary(head: Uint8Array): LibraryType | null {
  const known = sniffMedia(head);
  if (known) return { kind: known.kind === 'VIDEO' ? 'video' : 'image', contentType: known.contentType };
  if (head.length < 12) return null;
  const ascii = (start: number, length: number) => String.fromCharCode(...head.subarray(start, start + length));
  if (ascii(0, 3) === 'ID3') return { kind: 'audio', contentType: 'audio/mpeg' };
  // An MPEG audio frame without a tag: sync bits, and a layer (AAC's ADTS frames have layer 0).
  if (head[0] === 0xff && (head[1]! & 0xe0) === 0xe0 && (head[1]! & 0x06) !== 0) return { kind: 'audio', contentType: 'audio/mpeg' };
  if (ascii(0, 4) === 'OggS') return { kind: 'audio', contentType: 'audio/ogg' };
  if (ascii(0, 4) === 'fLaC') return { kind: 'audio', contentType: 'audio/flac' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return { kind: 'audio', contentType: 'audio/wav' };
  if (ascii(4, 4) === 'ftyp' && ['M4A ', 'M4B '].includes(ascii(8, 4))) return { kind: 'audio', contentType: 'audio/mp4' };
  return null;
}
const RULES: UploadRules<LibraryType> = { sniff: sniffLibrary, limit: type => LIBRARY_LIMITS[type.kind], max: Math.max(LIBRARY_LIMITS.image, LIBRARY_LIMITS.video, LIBRARY_LIMITS.audio) };
export const cleanName = (value: unknown) => (typeof value === 'string' ? value : '').replace(/[\u0000-\u001f\u007f/\\]+/g, ' ').trim().slice(0, 120) || 'Untitled';

export function registerMediaLibrary(app: FastifyInstance, client: PrismaClient, config: Config, owner: OwnerAccess) {
  const directory = config.MEDIA_DIR ?? defaultMediaDirectory; const limiter = new RateLimiter(2048); let active = 0;
  const idParam = (request: FastifyRequest) => { const id = GameIdSchema.safeParse((request.params as { id?: string }).id); roomAssert(id.success, 'INVALID_COMMAND'); return id.data; };
  const used = async () => (await client.gameMedia.aggregate({ where: { removedAt: null }, _sum: { byteSize: true } }))._sum.byteSize ?? 0;
  const item = (row: { id: string; kind: GameMediaKind; name: string; credit: string | null; contentType: string; byteSize: number; createdAt: Date }) =>
    LibraryItemSchema.parse({ id: row.id, kind: SCENE_KIND[row.kind], name: row.name, credit: row.credit, contentType: row.contentType, byteSize: row.byteSize, createdAt: row.createdAt.toISOString() });

  app.get('/api/host/media', async (request, reply) => {
    try {
      await owner.requireEditor(request);
      const rows = await client.gameMedia.findMany({ where: { removedAt: null }, orderBy: { createdAt: 'desc' }, take: 1000 });
      return { ok: true, data: MediaLibrarySchema.parse({ items: rows.map(item), usedBytes: await used(), limitBytes: LIBRARY_LIMITS.total }) };
    } catch (error) { return owner.fail(reply, error); }
  });

  // The upload streams to disk (never into memory); its body is the file itself, its name in ?name=.
  void app.register(async scope => {
    scope.addContentTypeParser('*', (_request, payload, done) => { done(null, payload); });
    scope.post('/api/host/media', async (request, reply) => {
      const id = randomUUID(); let counted = false; let stored = false;
      try {
        const editor = await owner.requireEditor(request, 'edit');
        roomAssert(limiter.allow(`library:${editor.personId ?? 'owner'}`, 30), 'RATE_LIMITED');
        const declared = Number(request.headers['content-length']);
        if (Number.isFinite(declared) && declared > RULES.max) throw new UploadTooLarge();
        roomAssert(active < MAX_ACTIVE_UPLOADS, 'RATE_LIMITED'); active++; counted = true;
        roomAssert(await used() + (Number.isFinite(declared) ? declared : 0) <= LIBRARY_LIMITS.total, 'STORAGE_FULL');
        const file = await storeUpload(request.body as Readable, directory, LIBRARY_FOLDER, id, RULES);
        roomAssert(file, 'UNSUPPORTED_MEDIA'); stored = true;
        const row = await client.gameMedia.create({ data: { id, kind: KIND[file.kind], contentType: file.contentType, byteSize: file.byteSize, sha256: file.sha256,
          name: cleanName((request.query as { name?: unknown }).name), personId: editor.personId } });
        stored = false;
        app.log.info({ event: 'library_media_added', kind: file.kind, byteSize: file.byteSize }, 'Media added to the library');
        return { ok: true, data: item(row) };
      } catch (error) {
        if (stored) await removeStored(directory, LIBRARY_FOLDER, id).catch(() => undefined);
        // A refused upload must not leave its unread bytes on a reused connection.
        reply.header('connection', 'close');
        return owner.fail(reply, error instanceof UploadTooLarge ? new RoomError('FILE_TOO_LARGE') : error);
      } finally { if (counted) active--; }
    });
  });

  // A new name, or the credit shown when it plays (composer and licence; empty removes it).
  app.put('/api/host/media/:id', async (request, reply) => {
    try {
      await owner.requireEditor(request, 'edit'); const id = idParam(request);
      const parsed = UpdateLibraryItemSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      const changed = await client.gameMedia.updateMany({ where: { id, removedAt: null }, data: {
        ...(parsed.data.name !== undefined ? { name: cleanName(parsed.data.name) } : {}), ...(parsed.data.credit !== undefined ? { credit: parsed.data.credit || null } : {}) } });
      roomAssert(changed.count === 1, 'NOT_FOUND');
      return { ok: true, data: item(await client.gameMedia.findUniqueOrThrow({ where: { id } })) };
    } catch (error) { return owner.fail(reply, error); }
  });
  // Removing: refused while a game's draft or its latest published version still uses the file.
  app.post('/api/host/media/:id/remove', async (request, reply) => {
    try {
      await owner.requireEditor(request, 'edit'); const id = idParam(request);
      const row = await client.gameMedia.findFirst({ where: { id, removedAt: null } }); roomAssert(row, 'NOT_FOUND');
      const pattern = `%"${id}"%`;
      const [drafts, versions] = await Promise.all([
        client.$queryRaw<{ count: bigint }[]>`SELECT count(*)::bigint AS count FROM game_drafts WHERE definition::text LIKE ${pattern}`,
        client.$queryRaw<{ count: bigint }[]>`SELECT count(*)::bigint AS count FROM game_versions v WHERE v.definition::text LIKE ${pattern}
          AND v.number = (SELECT max(w.number) FROM game_versions w WHERE w."gameId" = v."gameId")`,
      ]);
      roomAssert(Number(drafts[0]?.count ?? 0) + Number(versions[0]?.count ?? 0) === 0, 'MEDIA_IN_USE');
      // The file goes first: a row marked removed never points at a file that still exists.
      await removeStored(directory, LIBRARY_FOLDER, id);
      await client.gameMedia.update({ where: { id }, data: { removedAt: new Date() } });
      return { ok: true, data: {} };
    } catch (error) { return owner.fail(reply, error); }
  });

  // For the screens and phones of a room, and the editor's previews. The id is a random UUID that a
  // phone only learns once the scene is on; nothing else about the file or its game is exposed.
  app.get('/api/media/:id', async (request, reply) => {
    try {
      roomAssert(allowedOrigin(request.headers, config), 'ORIGIN_REJECTED');
      roomAssert(limiter.allow(`media:${request.ip}`, 600), 'RATE_LIMITED');
      const id = idParam(request);
      const row = await client.gameMedia.findFirst({ where: { id, removedAt: null }, select: { contentType: true, byteSize: true } }); roomAssert(row, 'NOT_FOUND');
      const path = join(directory, LIBRARY_FOLDER, id);
      const size = await stat(path).then(file => file.size, () => -1); roomAssert(size === row.byteSize, 'NOT_FOUND');
      return sendStored(request, reply, path, size, row.contentType, 'private, max-age=604800, immutable');
    } catch (error) { return owner.fail(reply, error); }
  });
}
