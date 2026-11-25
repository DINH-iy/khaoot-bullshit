import { randomUUID } from 'node:crypto';
import { recordAction } from '../admin/actions.js';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { FontLibrarySchema, FontUploadResultSchema, GameIdSchema, GoogleFontImportSchema, ImportYouTubeAudioSchema, LIBRARY_LIMITS, LibraryItemSchema, MediaLibrarySchema, TrimAudioSchema, UpdateLibraryItemSchema, type FontUploadResult, type SceneMediaKind } from '@party/contracts';
import type { Config } from '../config.js';
import type { GameMediaKind, PrismaClient } from '../generated/prisma/client.js';
import type { OwnerAccess } from '../hosting/owner-access.js';
import { allowedOrigin, RateLimiter, RoomError, roomAssert } from '../rooms/security.js';
import { downloadGoogleFont, FONT_UPLOAD, googleFontFamily } from './fonts.js';
import { withMp3, youtubeVideoUrl } from './audio-tools.js';
import { libraryUsage } from './usage.js';
import { defaultMediaDirectory, removeStored, sendStored, sniffMedia, storeUpload, UploadTooLarge, type UploadRules } from './media.js';

// The media library (contracts/media.ts): the owner and editors upload pictures, videos and songs,
// and scenes use them. Files go to <media folder>/game-media/<id>; the rooms' clean-up never touches them.
export const LIBRARY_FOLDER = 'game-media';
const MAX_ACTIVE_UPLOADS = 2;
const KIND = { image: 'IMAGE', video: 'VIDEO', audio: 'AUDIO', font: 'FONT' } as const satisfies Record<SceneMediaKind | 'font', GameMediaKind>;
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
  let audioJobActive = false;
  const idParam = (request: FastifyRequest) => { const id = GameIdSchema.safeParse((request.params as { id?: string }).id); roomAssert(id.success, 'INVALID_COMMAND'); return id.data; };
  const used = async () => (await client.gameMedia.aggregate({ where: { removedAt: null }, _sum: { byteSize: true } }))._sum.byteSize ?? 0;
  const item = (row: { id: string; kind: GameMediaKind; name: string; credit: string | null; contentType: string; byteSize: number; createdAt: Date }) =>
    LibraryItemSchema.parse({ id: row.id, kind: row.kind.toLowerCase(), name: row.name, credit: row.credit, contentType: row.contentType, byteSize: row.byteSize, createdAt: row.createdAt.toISOString() });
  const fontResult = ({ id, name, alreadyPresent }: FontUploadResult) => FontUploadResultSchema.parse({ id, name, alreadyPresent });

  async function addFile(source: Readable, name: string, personId: string | null, credit: string | null = null, font = false) {
    const id = randomUUID();
    const file = font
      ? await storeUpload(source, directory, LIBRARY_FOLDER, id, FONT_UPLOAD)
      : await storeUpload(source, directory, LIBRARY_FOLDER, id, RULES);
    roomAssert(file, 'UNSUPPORTED_MEDIA');
    let row;
    try {
      row = await client.$transaction(async tx => {
        // Uploads and derived clips share the same quota, even when their final writes overlap.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(519243091)`;
        if (font) {
          const existing = await tx.gameMedia.findFirst({ where: { kind: 'FONT', removedAt: null, sha256: file.sha256 },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
          if (existing) return { ...existing, alreadyPresent: true as const };
        }
        const total = await tx.gameMedia.aggregate({ where: { removedAt: null }, _sum: { byteSize: true } });
        roomAssert((total._sum.byteSize ?? 0) + file.byteSize <= LIBRARY_LIMITS.total, 'STORAGE_FULL');
        return tx.gameMedia.create({ data: { id, kind: KIND[file.kind], contentType: file.contentType, byteSize: file.byteSize,
          sha256: file.sha256, name, credit, personId } });
      }, { isolationLevel: 'ReadCommitted' });
    } catch (error) {
      await removeStored(directory, LIBRARY_FOLDER, id).catch(() => undefined);
      throw error;
    }
    if ('alreadyPresent' in row) await removeStored(directory, LIBRARY_FOLDER, id);
    else app.log.info({ event: 'library_media_added', kind: file.kind, byteSize: file.byteSize }, 'Media added to the library');
    return row;
  }

  async function processAudio<T>(personId: string | null, job: () => Promise<T>) {
    roomAssert(!audioJobActive && limiter.allow(`audio:${personId ?? 'owner'}`, 6), 'RATE_LIMITED');
    audioJobActive = true;
    try {
      roomAssert(await used() < LIBRARY_LIMITS.total, 'STORAGE_FULL');
      return await job();
    } finally { audioJobActive = false; }
  }

  app.get('/api/host/media', async (request, reply) => {
    try {
      await owner.requireEditor(request);
      const [rows, usage] = await Promise.all([
        client.gameMedia.findMany({ where: { removedAt: null, kind: { not: 'FONT' } }, orderBy: { createdAt: 'desc' }, take: 1000 }), libraryUsage(client)]);
      return { ok: true, data: MediaLibrarySchema.parse({ items: rows.map(row => ({ ...item(row), gameIds: usage.byMedia.get(row.id) ?? [] })),
        games: usage.games, usedBytes: await used(), limitBytes: LIBRARY_LIMITS.total }) };
    } catch (error) { return owner.fail(reply, error); }
  });

  app.get('/api/host/fonts', async (request, reply) => {
    try {
      await owner.requireEditor(request);
      const rows = await client.gameMedia.findMany({ where: { removedAt: null, kind: 'FONT' },
        select: { id: true, name: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: 1000 });
      return { ok: true, data: FontLibrarySchema.parse(rows) };
    } catch (error) { return owner.fail(reply, error); }
  });

  // The upload streams to disk (never into memory); its body is the file itself, its name in ?name=.
  void app.register(async scope => {
    scope.addContentTypeParser('*', (_request, payload, done) => { done(null, payload); });
    const upload = async (request: FastifyRequest, reply: FastifyReply, font: boolean) => {
      let counted = false;
      try {
        const editor = await owner.requirePermission(request, 'media.manage', 'edit');
        roomAssert(limiter.allow(`library:${editor.personId ?? 'owner'}`, 30), 'RATE_LIMITED');
        const declared = Number(request.headers['content-length']);
        const rules = font ? FONT_UPLOAD : RULES;
        if (Number.isFinite(declared) && declared > rules.max) throw new UploadTooLarge();
        roomAssert(active < MAX_ACTIVE_UPLOADS, 'RATE_LIMITED'); active++; counted = true;
        // Font duplicates reuse the existing file, so check their quota after fingerprinting.
        if (!font) roomAssert(await used() + (Number.isFinite(declared) ? declared : 0) <= LIBRARY_LIMITS.total, 'STORAGE_FULL');
        const name = cleanName((request.query as { name?: unknown }).name);
        const row = await addFile(request.body as Readable, font ? name.replace(/\.(woff2?|ttf|otf)$/i, '') || name : name, editor.personId, null, font);
        return { ok: true, data: font ? fontResult(row) : item(row) };
      } catch (error) {
        // A refused upload must not leave its unread bytes on a reused connection.
        reply.header('connection', 'close');
        return owner.fail(reply, error instanceof UploadTooLarge ? new RoomError('FILE_TOO_LARGE') : error);
      } finally { if (counted) active--; }
    };
    scope.post('/api/host/media', (request, reply) => upload(request, reply, false));
    scope.post('/api/host/fonts', (request, reply) => upload(request, reply, true));
  });

  app.post('/api/host/fonts/google', async (request, reply) => {
    let counted = false;
    try {
      const editor = await owner.requirePermission(request, 'media.manage', 'edit');
      const input = GoogleFontImportSchema.safeParse(request.body);
      roomAssert(input.success, 'INVALID_COMMAND');
      const family = googleFontFamily(input.data.url);
      roomAssert(family, 'INVALID_COMMAND');
      roomAssert(active < MAX_ACTIVE_UPLOADS && limiter.allow(`fonts:${editor.personId ?? 'owner'}`, 15), 'RATE_LIMITED');
      active++; counted = true;
      const source = await downloadGoogleFont(family);
      const row = await addFile(source, family, editor.personId, `https://fonts.google.com/specimen/${encodeURIComponent(family).replace(/%20/g, '+')}`, true);
      return { ok: true, data: fontResult(row) };
    } catch (error) { return owner.fail(reply, error instanceof UploadTooLarge ? new RoomError('FILE_TOO_LARGE') : error); }
    finally { if (counted) active--; }
  });

  app.post('/api/host/media/youtube', async (request, reply) => {
    try {
      const editor = await owner.requirePermission(request, 'media.manage', 'edit');
      const input = ImportYouTubeAudioSchema.safeParse(request.body);
      roomAssert(input.success, 'INVALID_COMMAND');
      const url = youtubeVideoUrl(input.data.url);
      roomAssert(url, 'INVALID_COMMAND');
      const data = item(await processAudio(editor.personId, () => withMp3({ url },
        path => addFile(createReadStream(path), cleanName(input.data.name), editor.personId, url))));
      return { ok: true, data };
    } catch (error) { return owner.fail(reply, error instanceof UploadTooLarge ? new RoomError('FILE_TOO_LARGE') : error); }
  });

  app.post('/api/host/media/:id/trim', async (request, reply) => {
    try {
      const editor = await owner.requirePermission(request, 'media.manage', 'edit');
      const id = idParam(request);
      const input = TrimAudioSchema.safeParse(request.body);
      roomAssert(input.success, 'INVALID_COMMAND');
      const source = await client.gameMedia.findFirst({ where: { id, removedAt: null } });
      roomAssert(source, 'NOT_FOUND');
      roomAssert(source.kind === 'AUDIO', 'UNSUPPORTED_MEDIA');
      const { start, end, name } = input.data;
      const data = item(await processAudio(editor.personId, () => withMp3({ path: join(directory, LIBRARY_FOLDER, id), start, end },
        path => addFile(createReadStream(path), cleanName(name), editor.personId, source.credit))));
      return { ok: true, data };
    } catch (error) { return owner.fail(reply, error instanceof UploadTooLarge ? new RoomError('FILE_TOO_LARGE') : error); }
  });

  // A new name, or the credit shown when it plays (composer and licence; empty removes it).
  app.put('/api/host/media/:id', async (request, reply) => {
    try {
      await owner.requirePermission(request, 'media.manage', 'edit'); const id = idParam(request);
      const parsed = UpdateLibraryItemSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      const changed = await client.gameMedia.updateMany({ where: { id, removedAt: null, kind: { not: 'FONT' } }, data: {
        ...(parsed.data.name !== undefined ? { name: cleanName(parsed.data.name) } : {}), ...(parsed.data.credit !== undefined ? { credit: parsed.data.credit || null } : {}) } });
      roomAssert(changed.count === 1, 'NOT_FOUND');
      return { ok: true, data: item(await client.gameMedia.findUniqueOrThrow({ where: { id } })) };
    } catch (error) { return owner.fail(reply, error); }
  });
  // Removing: refused while a game's draft or its latest published version still uses the file. Fonts
  // are also kept while a saved scene prefab uses them, since a prefab carries its scenes' looks.
  async function removeItem(id: string, font: boolean) {
    const row = await client.gameMedia.findFirst({ where: { id, removedAt: null, kind: font ? 'FONT' : { not: 'FONT' } } }); roomAssert(row, 'NOT_FOUND');
    const pattern = `%"${id}"%`;
    const [drafts, versions, prefabs, styles] = await Promise.all([
      client.$queryRaw<{ count: bigint }[]>`SELECT count(*)::bigint AS count FROM game_drafts WHERE definition::text LIKE ${pattern}`,
      client.$queryRaw<{ count: bigint }[]>`SELECT count(*)::bigint AS count FROM game_versions v WHERE v.definition::text LIKE ${pattern}
        AND v.number = (SELECT max(w.number) FROM game_versions w WHERE w."gameId" = v."gameId")`,
      font ? client.$queryRaw<{ count: bigint }[]>`SELECT count(*)::bigint AS count FROM scene_prefabs WHERE content::text LIKE ${pattern}` : [],
      font ? client.$queryRaw<{ count: bigint }[]>`SELECT count(*)::bigint AS count FROM theme_styles WHERE theme::text LIKE ${pattern}` : [],
    ]);
    roomAssert([drafts, versions, prefabs, styles].every(rows => Number(rows[0]?.count ?? 0) === 0), 'MEDIA_IN_USE');
    // The file goes first: a row marked removed never points at a file that still exists.
    await removeStored(directory, LIBRARY_FOLDER, id);
    await client.gameMedia.update({ where: { id }, data: { removedAt: new Date() } });
    app.log.info({ event: 'library_media_removed', kind: row.kind.toLowerCase() }, 'Media removed from the library');
  }
  for (const [path, font] of [['/api/host/media/:id/remove', false], ['/api/host/fonts/:id/remove', true]] as const) {
    app.post(path, async (request, reply) => {
      try {
        const access = await owner.requirePermission(request, 'media.manage', 'edit'); const id = idParam(request);
        const name = (await client.gameMedia.findUnique({ where: { id }, select: { name: true } }))?.name ?? id;
        await removeItem(id, font);
        await recordAction(client, access, font ? 'font.removed' : 'media.removed', name);
        return { ok: true, data: {} };
      } catch (error) { return owner.fail(reply, error); }
    });
  }

  // For the screens and phones of a room, and the editor's previews. The id is a random UUID that a
  // phone only learns once the scene is on; nothing else about the file or its game is exposed.
  const serveAsset = async (request: FastifyRequest, reply: FastifyReply, font: boolean) => {
    try {
      roomAssert(allowedOrigin(request.headers, config), 'ORIGIN_REJECTED');
      roomAssert(limiter.allow(`media:${request.ip}`, 600), 'RATE_LIMITED');
      const id = idParam(request);
      const row = await client.gameMedia.findFirst({ where: { id, removedAt: null, kind: font ? 'FONT' : { not: 'FONT' } }, select: { contentType: true, byteSize: true } }); roomAssert(row, 'NOT_FOUND');
      const path = join(directory, LIBRARY_FOLDER, id);
      const size = await stat(path).then(file => file.size, () => -1); roomAssert(size === row.byteSize, 'NOT_FOUND');
      return sendStored(request, reply, path, size, row.contentType, 'private, max-age=604800, immutable');
    } catch (error) { return owner.fail(reply, error); }
  };
  app.get('/api/media/:id', (request, reply) => serveAsset(request, reply, false));
  app.get('/api/fonts/:id', (request, reply) => serveAsset(request, reply, true));
}
