// One command to host on this computer: builds, starts the server with the web
// app, and opens the host menu already signed in as the owner. Players on other
// networks need the public launcher (npm run network:public) instead.
import { spawn, spawnSync } from 'node:child_process';
import { loadLocalEnvironment, projectRoot } from '../database/environment.mjs';
import { ensureHostSecrets, hostMenuUrl, openBrowser } from './owner.mjs';

loadLocalEnvironment();
const ownerToken = await ensureHostSecrets();
if (!process.env.DATABASE_URL) throw new Error('No database configured. Run "npm run db:env" and "npm run db:up" first.');
const run = (args, label) => {
  const result = spawnSync(process.execPath, args, { cwd: projectRoot, stdio: ['ignore', 'ignore', 'inherit'] });
  if (result.status !== 0) { console.error(label); process.exit(1); }
};
if (!process.argv.includes('--no-build')) {
  console.log('Building the app…');
  const built = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: projectRoot, stdio: ['ignore', 'ignore', 'inherit'] });
  if (built.status !== 0) { console.error('The build failed. Run "npm run build" to see why.'); process.exit(1); }
}
// Read-only check: this launcher never migrates or resets a database itself.
run(['scripts/database/prisma.mjs', 'migrate', 'status'], 'The database is not reachable or has pending migrations. Run "npm run db:up" and "npm run db:migrate:deploy", then try again.');

const port = process.env.PORT || '3001';
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['apps/server/dist/index.js'], { cwd: projectRoot, stdio: 'inherit',
  env: { ...process.env, HOST: '127.0.0.1', PORT: port, PUBLIC_ORIGIN: origin, SERVE_WEB: 'true' } });
let stopping = false;
const stop = () => { if (!stopping) { stopping = true; server.kill('SIGTERM'); } };
process.once('SIGINT', stop); process.once('SIGTERM', stop);
server.on('exit', code => { if (!stopping && code) process.exitCode = 1; stopping = true; });
server.on('error', () => { console.error('The server could not be started.'); process.exitCode = 1; });

const ends = Date.now() + 20000; let ready = false;
while (!stopping && Date.now() < ends) {
  try { if ((await fetch(`${origin}/api/health/live`, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch { /* bounded readiness retry */ }
  await new Promise(done => setTimeout(done, 250));
}
if (!ready) { if (!stopping) console.error('The server did not become ready.'); process.exitCode = 1; stop(); }
else {
  const opened = process.argv.includes('--no-open') ? false : await openBrowser(hostMenuUrl(origin, ownerToken));
  console.log(`\n${opened ? 'The host menu is open in your browser.' : `Open the host menu from the private owner link (kept in .env as LOCAL_OWNER_TOKEN): ${origin}/?host=1#owner=…`}\nThis mode is for this computer only. Keep this window running; press Ctrl+C to stop.\n`);
}
