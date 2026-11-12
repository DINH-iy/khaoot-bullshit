import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { appendFile, chmod, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { projectRoot } from '../database/environment.mjs';

/** Generates missing local hosting secrets into the ignored .env; never prints them. */
export async function ensureHostSecrets() {
  if (process.env.NODE_ENV === 'production') throw new Error('Local owner hosting is not available in production. Configure creator sign-in instead.');
  const envPath = resolve(projectRoot, '.env');
  await readFile(envPath).catch(() => { throw new Error('No .env file found. Run "npm run db:env" first.'); });
  const missing = [];
  if (!process.env.ROOM_TOKEN_SECRET) { process.env.ROOM_TOKEN_SECRET = randomBytes(32).toString('hex'); missing.push(`ROOM_TOKEN_SECRET=${process.env.ROOM_TOKEN_SECRET}`); }
  if (!process.env.LOCAL_OWNER_TOKEN) { process.env.LOCAL_OWNER_TOKEN = randomBytes(32).toString('base64url'); missing.push(`LOCAL_OWNER_TOKEN=${process.env.LOCAL_OWNER_TOKEN}`); }
  if (missing.length) { await appendFile(envPath, `\n${missing.join('\n')}\n`, { mode: 0o600 }); await chmod(envPath, 0o600); }
  return process.env.LOCAL_OWNER_TOKEN;
}
export const hostMenuUrl = (origin, ownerToken) => `${origin}/?host=1#owner=${ownerToken}`;
export function openBrowser(url) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  return new Promise(done => {
    const child = spawn(command, [url], { cwd: projectRoot, stdio: 'ignore' });
    child.on('error', () => done(false)); child.on('exit', code => done(code === 0));
  });
}
