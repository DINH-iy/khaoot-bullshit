import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadLocalEnvironment, projectRoot } from '../database/environment.mjs';
loadLocalEnvironment();
if (process.env.NODE_ENV === 'production') throw new Error('This is a temporary rehearsal launcher, not production deployment.');
const access = JSON.parse(await readFile(resolve(projectRoot, '.local/network-rehearsal.json'), 'utf8'));
if (new Date(access.expiresAt).getTime() <= Date.now()) throw new Error('Prepare a fresh rehearsal room first.');
const executable = process.env.CLOUDFLARED_BIN || resolve(projectRoot, '.local/tools/cloudflared');
const children = new Set(); let stopping = false; let server; let origin; let buffer = ''; let restarting = false; let generation = 0;
const runId = randomUUID();
let tunnelLog = ''; let logTimer;
function recordTunnelLog(chunk) {
  tunnelLog = (tunnelLog + String(chunk)).slice(-65536);
  if (!logTimer) {
    logTimer = setTimeout(() => {
      logTimer = undefined;
      void writeFile(resolve(projectRoot, '.local/network-tunnel.log'), tunnelLog, { mode: 0o600 }).catch(() => console.warn('Tunnel diagnostic log unavailable.'));
    }, 500);
    logTimer.unref();
  }
}
function stop() { if (stopping) return; stopping = true; for (const child of children) child.kill('SIGTERM'); }
process.once('SIGINT', stop); process.once('SIGTERM', stop);
process.on('SIGUSR2', () => { if (server && !stopping && !restarting) { restarting = true; server.kill('SIGTERM'); } });
async function startServer() {
  const version = `network-${runId}-${++generation}`;
  await writeFile(resolve(projectRoot, '.local/network-run.json'), JSON.stringify({ pid: process.pid, origin, version, runId }), { mode: 0o600 });
  server = spawn(process.execPath, ['--env-file-if-exists=.env', 'apps/server/dist/index.js'], { cwd: projectRoot, env: { ...process.env, HOST: '127.0.0.1', PORT: '3001', PUBLIC_ORIGIN: origin, SERVE_WEB: 'true', APP_VERSION: version }, stdio: 'inherit' }); children.add(server);
  const instance = server;
  instance.on('exit', code => { children.delete(instance); if (restarting && !stopping) { restarting = false; void startServer().catch(() => { process.exitCode = 1; stop(); }); } else { if (code) process.exitCode = 1; stop(); } });
  instance.on('error', () => { process.exitCode = 1; stop(); });
}
const tunnel = spawn(executable, ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', 'http://127.0.0.1:3001'], { cwd: projectRoot, stdio: ['ignore', 'ignore', 'pipe'] }); children.add(tunnel);
const deadline = setTimeout(() => { console.error('Tunnel did not become ready. Check internet access and the cloudflared installation.'); process.exitCode = 1; stop(); }, 45000);
tunnel.on('error', () => { clearTimeout(deadline); console.error('Install cloudflared first; see docs/testing/network-checkpoint.md.'); process.exitCode = 1; stop(); });
tunnel.on('exit', () => { clearTimeout(deadline); stop(); });
tunnel.stderr.on('data', chunk => {
  recordTunnelLog(chunk);
  buffer = (buffer + String(chunk)).slice(-8000);
  const found = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (origin || !found) return; origin = found[0]; clearTimeout(deadline);
  void (async () => {
    await mkdir(resolve(projectRoot, '.local'), { recursive: true, mode: 0o700 });
    await writeFile(resolve(projectRoot, '.local/network-origin.json'), JSON.stringify({ origin }), { mode: 0o600 });
    await startServer();
    const ends = Date.now() + 20000;
    while (!stopping && Date.now() < ends) {
      try { const response = await fetch('http://127.0.0.1:3001/api/health/live'); if (response.ok) { console.log(`\nPHONE PLAYER LINK: ${origin}/?code=${access.roomCode}\nOpen the host on this laptop with: npm run network:host\nKeep this process running. Wi-Fi and 5G use the same HTTPS link.\n`); return; } } catch { /* bounded readiness retry */ }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    console.error('Backend did not become ready.'); process.exitCode = 1; stop();
  })().catch(() => { console.error('Could not start the public rehearsal.'); process.exitCode = 1; stop(); });
});
