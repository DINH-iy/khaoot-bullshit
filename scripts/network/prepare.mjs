import { randomBytes } from 'node:crypto';
import { readFile, appendFile, mkdir, writeFile, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadLocalEnvironment, projectRoot } from '../database/environment.mjs';
loadLocalEnvironment();
const database = process.env.DATABASE_URL;
if (process.env.NODE_ENV === 'production' || !database || !new URL(database).pathname.endsWith('_dev') || !['127.0.0.1', 'localhost'].includes(new URL(database).hostname)) throw new Error('Rehearsal provisioning requires the explicit local development database.');
const envPath = resolve(projectRoot, '.env');
await readFile(envPath); // Never silently create an incomplete environment.
if (!process.env.ROOM_TOKEN_SECRET) {
  const secret = randomBytes(32).toString('hex');
  await appendFile(envPath, `\nROOM_TOKEN_SECRET=${secret}\n`, { mode: 0o600 }); await chmod(envPath, 0o600);
  process.env.ROOM_TOKEN_SECRET = secret;
}
const { createDatabase } = await import('../../apps/server/src/database/client.ts');
const { provisionRehearsal } = await import('../../apps/server/src/rooms/rehearsal.ts');
const db = createDatabase(database);
try {
  const access = await provisionRehearsal(db.client);
  const directory = resolve(projectRoot, '.local'); await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(resolve(directory, 'network-rehearsal.json'), JSON.stringify(access), { mode: 0o600 });
  console.log(`Prepared test room ${access.roomCode}. Host access is in ignored local storage; no secret printed.`);
} finally { await db.close(); }
