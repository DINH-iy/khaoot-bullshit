// What is running for this project: app servers, the public link, the databases.
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { projectRoot } from '../database/environment.mjs';
import { projectProcesses } from './processes.mjs';

const line = (label, value) => console.log(`${label.padEnd(26)} ${value}`);
console.log('\nParty game: status\n');
const processes = projectProcesses(projectRoot);
line('Processes', processes.length ? '' : 'none running');
for (const entry of processes) line(`  ${entry.kind}`, `pid ${entry.pid}`);

const health = async (url) => { try { const response = await fetch(url, { signal: AbortSignal.timeout(3000) }); return response.ok ? `up (${(await response.json()).version ?? 'ok'})` : `answers ${response.status}`; } catch { return 'not reachable'; } };
line('App on this computer', await health(`http://127.0.0.1:${process.env.PORT || '3001'}/api/health/live`));
const origin = await readFile(new URL('../../.local/network-origin.json', import.meta.url), 'utf8').then(text => JSON.parse(text).origin).catch(() => null);
const tunnel = processes.some(entry => entry.kind === 'Cloudflare tunnel');
line('Public test link', origin && tunnel ? `${origin} → ${await health(`${origin}/api/health/live`)}` : 'not running');

const docker = spawnSync('docker', ['ps', '--format', '{{.Names}}\t{{.Status}}'], { encoding: 'utf8' });
if (docker.status !== 0) line('Databases', 'Docker is not running');
else {
  const rows = docker.stdout.split('\n').filter(row => row.startsWith('party-game-builder'));
  line('Databases', rows.length ? '' : 'none running');
  for (const row of rows) { const [name, state] = row.split('\t'); line(`  ${name.includes('test') ? 'test database' : 'game database'}`, state); }
}
console.log('\nStop everything with "npm run stop" (add "-- --databases" to stop the databases too).\n');
