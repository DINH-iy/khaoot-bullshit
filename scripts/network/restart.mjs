import { readFile } from 'node:fs/promises';
const run = JSON.parse(await readFile(new URL('../../.local/network-run.json', import.meta.url), 'utf8'));
const before = await fetch('http://127.0.0.1:3001/api/health/live', { signal: AbortSignal.timeout(3000) }).then(response => response.json());
if (before.version !== run.version) throw new Error('The recorded rehearsal process does not match the running backend. No signal sent.');
process.kill(run.pid, 'SIGUSR2');
const deadline = Date.now() + 15000;
let restarted = false;
while (Date.now() < deadline) {
  try {
    const health = await fetch('http://127.0.0.1:3001/api/health/live', { signal: AbortSignal.timeout(1000) }).then(response => response.json());
    if (health.version.startsWith(`network-${run.runId}-`) && health.version !== run.version) { restarted = true; break; }
  } catch { /* expected brief outage */ }
  await new Promise(resolve => setTimeout(resolve, 200));
}
if (!restarted) throw new Error('Backend restart was not confirmed. Inspect the rehearsal launcher.');
console.log('Backend restarted; public URL preserved. Connected rooms should recover paused for host review.');
