// Puts the standard songs (DEFAULT_SONGS in packages/contracts/src/media.ts) in this server's media library.
// Downloads each from its source, checks it is exactly the expected file (SHA-256), and stores it like an
// upload, with its credit. Songs already there are skipped, so running it again is safe. Needs `npm run build`
// first, the database configured in .env, and `unzip` for the one song that comes in a zip.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLocalEnvironment } from '../database/environment.mjs';

loadLocalEnvironment();
if (!process.env.DATABASE_URL) throw new Error('No database configured (DATABASE_URL in .env).');
const { DEFAULT_SONGS } = await import('../../packages/contracts/dist/index.js');
const { createDatabase } = await import('../../apps/server/dist/database/client.js');
const { sniffLibrary, LIBRARY_FOLDER } = await import('../../apps/server/dist/assets/library.js');
const { defaultMediaDirectory, storeBytes } = await import('../../apps/server/dist/assets/media.js');
const directory = process.env.MEDIA_DIR ?? defaultMediaDirectory;
const db = createDatabase(process.env.DATABASE_URL, 2);
// A plain client name; no personal details go to the music sites.
const headers = { 'user-agent': 'party-game-music-setup/1.0' };
const work = await mkdtemp(join(tmpdir(), 'party-default-music-'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function download(song) {
  const response = await fetch(song.url, { headers, signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`${song.title}: the source answered ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!song.zipEntry) return bytes;
  // The song is one file in a zip: taken out with the system's unzip, the zip itself is thrown away.
  const zip = join(work, 'download.zip'); await writeFile(zip, bytes);
  try { return execFileSync('unzip', ['-p', zip, song.zipEntry], { maxBuffer: 64 * 1024 * 1024 }); }
  catch { throw new Error(`${song.title}: could not take ${song.zipEntry} out of the zip (is unzip installed? sudo apt install unzip)`); }
  finally { await rm(zip, { force: true }); }
}

let added = 0; let kept = 0; let failed = 0;
try {
  for (const song of DEFAULT_SONGS) {
    const existing = await db.client.gameMedia.findUnique({ where: { id: song.id } });
    if (existing && !existing.removedAt) { kept++; console.log(`✓ ${song.title} is already in the library`); continue; }
    try {
      const bytes = await download(song);
      if (sha256(bytes) !== song.sha256 || bytes.length !== song.byteSize) throw new Error(`${song.title}: the downloaded file is not the expected one (changed at the source?); nothing stored`);
      const type = sniffLibrary(bytes.subarray(0, 16));
      if (type?.kind !== 'audio') throw new Error(`${song.title}: not a song file`);
      await storeBytes(bytes, directory, LIBRARY_FOLDER, song.id);
      const data = { kind: 'AUDIO', contentType: type.contentType, byteSize: bytes.length, sha256: song.sha256, name: song.title, credit: song.credit, removedAt: null };
      await db.client.gameMedia.upsert({ where: { id: song.id }, create: { id: song.id, ...data }, update: data });
      added++; console.log(`+ ${song.title} added (${(bytes.length / 1048576).toFixed(1)} MB)`);
    } catch (error) { failed++; console.error(`✗ ${error.message}`); }
  }
} finally { await db.close(); await rm(work, { recursive: true, force: true }); }
console.log(`\n${added} added, ${kept} already there${failed ? `, ${failed} failed` : ''}. In the editor: Game settings → Music → Use the standard songs.`);
if (failed) process.exitCode = 1;
