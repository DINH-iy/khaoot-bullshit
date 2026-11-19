import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { LIBRARY_LIMITS, MAX_AUDIO_CLIP_SECONDS } from '@party/contracts';
import { RoomError } from '../rooms/security.js';
import { UploadTooLarge } from './media.js';

const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;
const VIDEO_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
const DOWNLOAD_LIMIT = 64 * 1024 * 1024;
const AUDIO_FORMATS = 'mov,matroska,webm,mp3,ogg,wav,flac';
const localTools = fileURLToPath(new URL('../../../../.local/tools/audio/', import.meta.url));

/** Only a video ID crosses the boundary into the downloader's URL. */
export function youtubeVideoUrl(value: string): string | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return null;
  let id: string | null = null;
  if (url.hostname === 'youtu.be') id = /^\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null;
  if (VIDEO_HOSTS.has(url.hostname)) {
    id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:shorts|embed|live)\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null;
  }
  return id && VIDEO_ID.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
}

// No shell, inherited app credentials, user config or downloader plugins.
function launch(command: string, args: string[], cwd: string, signal: AbortSignal) {
  const child = spawn(command, args, {
    cwd, signal, killSignal: 'SIGKILL', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
    env: { PATH: [localTools, process.env.PATH].filter(Boolean).join(delimiter), SystemRoot: process.env.SystemRoot },
  });
  const complete = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error('Audio tool failed')));
  });
  return { child, complete };
}

async function downloadAudio(url: string, workspace: string, path: string, signal: AbortSignal) {
  const { child, complete } = launch('yt-dlp', [
    '--ignore-config', '--no-plugin-dirs', '--no-cache-dir', '--no-playlist', '--no-progress',
    '--js-runtimes', 'node', '--use-extractors', 'youtube', '--socket-timeout', '10', '--retries', '1',
    '--match-filters', `duration <= ${MAX_AUDIO_CLIP_SECONDS} & !is_live`,
    '--max-filesize', String(DOWNLOAD_LIMIT),
    '-f', 'bestaudio[ext=webm][protocol=https]/bestaudio[ext=m4a][protocol=https]', '-o', '-', '--', url,
  ], workspace, signal);
  let bytes = 0;
  const limit = new Transform({ transform(chunk: Buffer, _encoding, done) {
    bytes += chunk.length;
    if (bytes > DOWNLOAD_LIMIT) done(new UploadTooLarge());
    else done(null, chunk);
  } });
  const writing = pipeline(child.stdout, limit, createWriteStream(path, { flags: 'wx', mode: 0o600 }), { signal });
  try { await Promise.all([writing, complete]); }
  catch (error) {
    child.kill('SIGKILL');
    await Promise.allSettled([writing, complete]);
    throw error;
  }
}

type AudioSource = { url: string } | { path: string; start: number; end: number };

/** One bounded job, with scratch files discarded before the request finishes. */
export async function withMp3<T>(source: AudioSource, keep: (path: string) => Promise<T>): Promise<T> {
  const importing = 'url' in source;
  const workspace = await mkdtemp(join(tmpdir(), 'party-audio-'));
  const signal = AbortSignal.timeout(75_000);
  const input = importing ? join(workspace, 'source') : source.path;
  const output = join(workspace, 'clip.mp3');
  try {
    try {
      if (importing) await downloadAudio(source.url, workspace, input, signal);
      const duration = importing ? MAX_AUDIO_CLIP_SECONDS : (Math.round(source.end * 1000) - Math.round(source.start * 1000)) / 1000;
      const { child, complete } = launch('ffmpeg', [
        '-nostdin', '-v', 'error', '-xerror', '-abort_on', 'empty_output',
        '-protocol_whitelist', 'file', '-format_whitelist', AUDIO_FORMATS,
        ...(!importing ? ['-ss', source.start.toFixed(3)] : []),
        '-threads', '1', '-i', input, '-t', duration.toFixed(3),
        '-map', '0:a:0', '-map_metadata', '-1', '-map_chapters', '-1',
        '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', '-threads', '1',
        '-fs', String(LIBRARY_LIMITS.audio + 1), '-f', 'mp3', output,
      ], workspace, signal);
      child.stdout.resume();
      await complete;
    } catch (error) {
      if (error instanceof UploadTooLarge) throw error;
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new RoomError('AUDIO_TOOLS_UNAVAILABLE');
      throw new RoomError(importing ? 'AUDIO_IMPORT_FAILED' : 'AUDIO_TRIM_FAILED');
    }
    return await keep(output);
  } finally { await rm(workspace, { recursive: true, force: true }); }
}
