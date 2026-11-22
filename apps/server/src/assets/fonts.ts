import { Readable } from 'node:stream';
import { FONT_FILE_MAX } from '@party/contracts';
import { RoomError, roomAssert } from '../rooms/security.js';
import type { UploadRules } from './media.js';

function sniffFont(head: Uint8Array, size: number): { kind: 'font'; contentType: string } | null {
  if (head.length < 12) return null;
  const header = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const signature = header.getUint32(0);
  const sfnt = signature === 0x00010000 || signature === 0x4f54544f; // TrueType or OpenType CFF.
  if (sfnt) {
    const tables = header.getUint16(4);
    return tables > 0 && 12 + tables * 16 < size
      ? { kind: 'font', contentType: signature === 0x00010000 ? 'font/ttf' : 'font/otf' } : null;
  }
  const woff2 = signature === 0x774f4632;
  if (!woff2 && signature !== 0x774f4646) return null;
  const minimum = woff2 ? 48 : 44;
  if (head.length < minimum || header.getUint32(8) !== size || size <= minimum) return null;
  const tables = header.getUint16(12);
  const expandedSize = header.getUint32(16);
  if (!tables || expandedSize < 12 + tables * 16 || expandedSize > 32 * 1024 * 1024) return null;
  if (woff2 ? header.getUint32(20) >= size - minimum : size <= minimum + tables * 20) return null;
  return { kind: 'font', contentType: woff2 ? 'font/woff2' : 'font/woff' };
}

export const FONT_UPLOAD: UploadRules<{ kind: 'font'; contentType: string }> = {
  sniff: sniffFont, limit: () => FONT_FILE_MAX, max: FONT_FILE_MAX,
};

export function googleFontFamily(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  let family: string | undefined;
  if (url.hostname === 'fonts.google.com') {
    const specimen = /^\/specimen\/([^/]+)\/?$/.exec(url.pathname)?.[1];
    if (specimen) {
      try { family = decodeURIComponent(specimen.replace(/\+/g, ' ')); } catch { return null; }
    }
  }
  const share = url.hostname === 'fonts.google.com' && url.pathname === '/share';
  const stylesheet = url.hostname === 'fonts.googleapis.com' && ['/css', '/css2'].includes(url.pathname);
  if (share || stylesheet) {
    const families = url.searchParams.getAll(share ? 'selection.family' : 'family');
    if (families.length === 1 && !families[0]!.includes('|')) family = families[0]!.split(':', 1)[0];
  }
  const name = family?.trim().replace(/ +/g, ' ');
  return name && /^[\p{L}\p{N} .-]{1,120}$/u.test(name) ? name : null;
}

function responseStream(response: Response) {
  if (!response.ok || !response.body) throw new RoomError('FONT_IMPORT_FAILED');
  return Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
}

export async function downloadGoogleFont(family: string) {
  try {
    const signal = AbortSignal.timeout(10000);
    const cssUrl = new URL('https://fonts.googleapis.com/css2');
    cssUrl.searchParams.set('family', family);
    const css = await fetch(cssUrl, { redirect: 'error', signal });
    let text = '';
    for await (const chunk of responseStream(css).setEncoding('utf8')) {
      text += chunk;
      roomAssert(text.length <= 32768, 'FONT_IMPORT_FAILED');
    }
    // The default stylesheet returned to a non-browser client has one full regular font file.
    const matches = [...text.matchAll(/src:\s*url\(["']?(https:\/\/[^\s)"']+)["']?\)/g)];
    roomAssert(matches.length === 1 && !/unicode-range\s*:/.test(text), 'FONT_IMPORT_FAILED');
    const file = new URL(matches[0]![1]!);
    roomAssert(file.hostname === 'fonts.gstatic.com' && !file.port && !file.username && !file.password && file.pathname.startsWith('/s/'), 'FONT_IMPORT_FAILED');
    return responseStream(await fetch(file, { redirect: 'error', signal }));
  } catch {
    throw new RoomError('FONT_IMPORT_FAILED');
  }
}
