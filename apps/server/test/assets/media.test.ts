import { describe, expect, it } from 'vitest';
import { sniffMedia } from '../../src/assets/media.js';

const bytes = (...parts: (string | number[])[]) => Buffer.concat(parts.map(part => typeof part === 'string' ? Buffer.from(part, 'latin1') : Buffer.from(part)));
const pad = (buffer: Buffer) => Buffer.concat([buffer, Buffer.alloc(16)]);
describe('media identification by content', () => {
  it('recognises supported pictures, GIFs and videos from their leading bytes', () => {
    expect(sniffMedia(pad(bytes([0x89], 'PNG\r\n', [0x1a, 0x0a])))).toEqual({ kind: 'IMAGE', contentType: 'image/png' });
    expect(sniffMedia(pad(bytes([0xff, 0xd8, 0xff, 0xe0])))).toEqual({ kind: 'IMAGE', contentType: 'image/jpeg' });
    expect(sniffMedia(pad(bytes('RIFF', [1, 2, 3, 4], 'WEBP')))).toEqual({ kind: 'IMAGE', contentType: 'image/webp' });
    expect(sniffMedia(pad(bytes('GIF89a')))).toEqual({ kind: 'GIF', contentType: 'image/gif' });
    expect(sniffMedia(pad(bytes([0, 0, 0, 0x18], 'ftypmp42')))).toEqual({ kind: 'VIDEO', contentType: 'video/mp4' });
    expect(sniffMedia(pad(bytes([0, 0, 0, 0x14], 'ftypqt  ')))).toEqual({ kind: 'VIDEO', contentType: 'video/quicktime' });
    expect(sniffMedia(pad(bytes([0x1a, 0x45, 0xdf, 0xa3])))).toEqual({ kind: 'VIDEO', contentType: 'video/webm' });
  });
  it('refuses scripts, documents, unsupported image containers and truncated files', () => {
    for (const refused of ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', '<!doctype html><script>alert(1)</script>', '%PDF-1.7 ................', 'MZ..............', 'RIFF....WAVEfmt ', 'GIF90a..........']) expect(sniffMedia(Buffer.from(refused))).toBeNull();
    for (const brand of ['heic', 'avif', 'mif1', 'evil']) expect(sniffMedia(pad(bytes([0, 0, 0, 0x18], `ftyp${brand}`)))).toBeNull();
    expect(sniffMedia(bytes([0x89], 'PNG'))).toBeNull();
  });
});
