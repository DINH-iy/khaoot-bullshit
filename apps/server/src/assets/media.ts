import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import type { AssetKind } from '../generated/prisma/client.js';

export interface MediaType { kind: AssetKind; contentType: string }
// Per-kind size limits. Nothing is transcoded: the Pi stores and serves the
// verified original, so limits are what keeps memory, disk and mobile data bounded.
export const MEDIA_LIMITS: Record<AssetKind, number> = { IMAGE: 8 * 1024 * 1024, GIF: 12 * 1024 * 1024, VIDEO: 40 * 1024 * 1024 };
export const MAX_UPLOAD_BYTES = Math.max(...Object.values(MEDIA_LIMITS));
export const SESSION_MEDIA_BYTES = 1024 * 1024 * 1024;
export const UPLOAD_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'];
export const defaultMediaDirectory = fileURLToPath(new URL('../../../../.local/media/', import.meta.url));

/**
 * Identifies a file by its leading bytes. The declared content type and file
 * name are never trusted. SVG, HTML, HEIC/AVIF and everything else is refused.
 */
export function sniffMedia(head: Uint8Array): MediaType | null {
  const ascii = (start: number, length: number) => String.fromCharCode(...head.subarray(start, start + length));
  const starts = (...bytes: number[]) => bytes.every((byte, index) => head[index] === byte);
  if (head.length < 12) return null;
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { kind: 'IMAGE', contentType: 'image/png' };
  if (starts(0xff, 0xd8, 0xff)) return { kind: 'IMAGE', contentType: 'image/jpeg' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return { kind: 'IMAGE', contentType: 'image/webp' };
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return { kind: 'GIF', contentType: 'image/gif' };
  if (starts(0x1a, 0x45, 0xdf, 0xa3)) return { kind: 'VIDEO', contentType: 'video/webm' };
  if (ascii(4, 4) === 'ftyp') {
    const brand = ascii(8, 4);
    if (brand === 'qt  ') return { kind: 'VIDEO', contentType: 'video/quicktime' };
    // ISO media brands used by phone and browser video. Still-image brands (heic, avif, mif1…) are refused.
    if (['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'MSNV', '3gp4', '3gp5', 'dash', 'mmp4'].includes(brand)) return { kind: 'VIDEO', contentType: 'video/mp4' };
  }
  return null;
}

export class UploadTooLarge extends Error {}
export const assetPath = (directory: string, sessionId: string, assetId: string) => join(directory, sessionId, assetId);

/**
 * Streams an upload to disk without holding it in memory, stopping at the byte
 * limit, then identifies it from the stored bytes. Returns null (and leaves no
 * file) when it is not supported media or exceeds its kind's limit.
 */
export async function storeUpload(source: Readable, directory: string, sessionId: string, assetId: string): Promise<(MediaType & { byteSize: number; sha256: string }) | null> {
  const folder = join(directory, sessionId); const target = join(folder, assetId); const partial = `${target}.part`;
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const hash = createHash('sha256'); let byteSize = 0;
  const meter = new Transform({ transform(chunk: Buffer, _encoding, done) {
    byteSize += chunk.length;
    if (byteSize > MAX_UPLOAD_BYTES) { done(new UploadTooLarge()); return; }
    hash.update(chunk); done(null, chunk);
  } });
  try {
    await pipeline(source, meter, createWriteStream(partial, { mode: 0o600, flags: 'wx' }));
    const file = await open(partial, 'r'); const head = Buffer.alloc(16);
    try { await file.read(head, 0, 16, 0); } finally { await file.close(); }
    const type = byteSize >= 12 ? sniffMedia(head) : null;
    if (!type) { await rm(partial, { force: true }); return null; }
    if (byteSize > MEDIA_LIMITS[type.kind]) throw new UploadTooLarge();
    await rename(partial, target);
    return { ...type, byteSize, sha256: hash.digest('hex') };
  } catch (error) { await rm(partial, { force: true }); throw error; }
}
export const removeStored = (directory: string, sessionId: string, assetId: string) => rm(assetPath(directory, sessionId, assetId), { force: true });
