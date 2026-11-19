import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TrimAudioSchema } from '@party/contracts';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { withMp3, youtubeVideoUrl } from '../../src/assets/audio-tools.js';
import { registerMediaLibrary } from '../../src/assets/library.js';
import { readConfig } from '../../src/config.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createOwnerAccess } from '../../src/hosting/owner-access.js';

vi.mock(import('../../src/assets/audio-tools.js'), async original => ({ ...await original(), withMp3: vi.fn() }));

const id = 'a1_bc-DEF23';
const url = `https://www.youtube.com/watch?v=${id}`;

describe('audio library editing', () => {
  it.each([
    `https://youtu.be/${id}?si=example`,
    `https://www.youtube.com/watch?v=${id}&list=PL-example`,
    `https://www.youtube.com/shorts/${id}`,
    `https://music.youtube.com/watch?v=${id}`,
  ])('canonicalizes a single video link %s', link => {
    expect(youtubeVideoUrl(link)).toBe(url);
  });

  it.each([
    'https://www.youtube.com/playlist?list=PL-example',
    `https://www.youtube.com.evil.test/watch?v=${id}`,
    `https://www.youtube.com@127.0.0.1/watch?v=${id}`,
    `https://name@www.youtube.com/watch?v=${id}`,
    `https://www.youtube.com:8443/watch?v=${id}`,
    `http://youtu.be/${id}`,
    `https://www.youtube.com/redirect?q=https://example.com/${id}`,
    `https://www.youtube.com/watch?v=${id}%0A`,
  ])('rejects anything other than a direct HTTPS video link %s', link => {
    expect(youtubeVideoUrl(link)).toBeNull();
  });

  it('accepts a tenth of a second and refuses reversed and oversized cuts', () => {
    expect(TrimAudioSchema.safeParse({ name: 'Clip', start: 1.1, end: 1.2 }).success).toBe(true);
    expect(TrimAudioSchema.safeParse({ name: 'Clip', start: 20, end: 10 }).success).toBe(false);
    expect(TrimAudioSchema.safeParse({ name: 'Clip', start: 0, end: 1201 }).success).toBe(false);
  });

  it('authorizes processing, saves reusable MP3s with credits, and removes failed writes', async () => {
    const mediaDir = await mkdtemp(join(tmpdir(), 'party-audio-library-test-'));
    const app = Fastify();
    try {
      const token = 'a'.repeat(43);
      const config = readConfig({ NODE_ENV: 'test', LOCAL_OWNER_TOKEN: token, ROOM_TOKEN_SECRET: 'a'.repeat(64), MEDIA_DIR: mediaDir });
      const gameMedia = {
        aggregate: vi.fn(async () => ({ _sum: { byteSize: 0 } })),
        create: vi.fn(async ({ data }: { data: object }) => ({ ...data, createdAt: new Date() })),
        findFirst: vi.fn(),
      };
      const transaction = { gameMedia, $executeRaw: vi.fn() };
      const db = { gameMedia, $transaction: (run: (tx: typeof transaction) => unknown) => run(transaction) } as unknown as PrismaClient;
      registerMediaLibrary(app, db, config, createOwnerAccess(app, config, db));
      const output = join(mediaDir, 'fixture.mp3');
      await writeFile(output, Buffer.concat([Buffer.from('ID3'), Buffer.alloc(100)]));
      vi.mocked(withMp3).mockImplementation(async (_source, keep) => keep(output));

      const headers = { 'x-party-request': '1', origin: config.PUBLIC_ORIGIN };
      const post = (path: string, payload: object, signedIn = true) => app.inject({
        method: 'POST', url: `/api/host/media${path}`, payload,
        headers: signedIn ? { ...headers, cookie: `party_owner=${token}` } : headers,
      });
      const importRequest = { url: `https://youtu.be/${id}`, name: 'Music', permission: true };
      const trimRequest = { name: 'Music clip', start: 3, end: 6 };
      expect((await post('/youtube', importRequest, false)).statusCode).toBe(401);
      expect((await post(`/${randomUUID()}/trim`, trimRequest, false)).statusCode).toBe(401);
      expect((await post('/youtube', { ...importRequest, permission: false })).statusCode).toBe(400);
      expect(withMp3).not.toHaveBeenCalled();

      const imported = (await post('/youtube', importRequest)).json().data;
      expect(imported).toMatchObject({ kind: 'audio', contentType: 'audio/mpeg', name: 'Music', credit: url });
      gameMedia.findFirst.mockResolvedValueOnce({ kind: 'AUDIO', credit: 'Composer, CC BY' });
      const clip = (await post(`/${imported.id}/trim`, trimRequest)).json().data;
      expect(clip).toMatchObject({ kind: 'audio', contentType: 'audio/mpeg', name: 'Music clip', credit: 'Composer, CC BY' });
      expect(clip.id).not.toBe(imported.id);
      expect(withMp3).toHaveBeenCalledWith({ url }, expect.any(Function));
      expect(withMp3).toHaveBeenCalledWith({ path: join(mediaDir, 'game-media', imported.id), start: 3, end: 6 }, expect.any(Function));

      gameMedia.create.mockRejectedValueOnce(new Error('Database write failed'));
      expect((await post('/youtube', importRequest)).statusCode).toBe(500);
      expect((await readdir(join(mediaDir, 'game-media'))).sort()).toEqual([imported.id, clip.id].sort());
    } finally {
      await app.close();
      await rm(mediaDir, { recursive: true, force: true });
    }
  });
});
