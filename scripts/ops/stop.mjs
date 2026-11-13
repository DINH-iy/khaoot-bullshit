// Stops this project's servers and public link, gently, and (with --databases) its database containers.
// Never deletes anything: games, players, media and database data all stay.
import { spawnSync } from 'node:child_process';
import { projectRoot } from '../database/environment.mjs';
import { projectProcesses } from './processes.mjs';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let running = projectProcesses(projectRoot);
if (!running.length) console.log('No app servers or public link running.');
// Launchers first: they stop their own server and tunnel cleanly.
for (const order of [['public link launcher', 'local host launcher'], ['app server', 'development server', 'web dev server', 'Cloudflare tunnel']]) {
  for (const entry of running.filter(item => order.includes(item.kind))) { try { process.kill(entry.pid, 'SIGTERM'); console.log(`Stopping ${entry.kind} (pid ${entry.pid})`); } catch { /* already gone */ } }
  await wait(1500); running = projectProcesses(projectRoot);
}
for (let attempt = 0; attempt < 10 && running.length; attempt++) { await wait(500); running = projectProcesses(projectRoot); }
for (const entry of running) { console.log(`Still running after 6 s, forcing: ${entry.kind} (pid ${entry.pid})`); try { process.kill(entry.pid, 'SIGKILL'); } catch { /* gone */ } }
if (process.argv.includes('--databases')) {
  const result = spawnSync(process.execPath, ['scripts/database/compose.mjs', 'stop'], { cwd: projectRoot, stdio: 'inherit' });
  console.log(result.status === 0 ? 'Databases stopped (their data is kept).' : 'Could not stop the databases; is Docker running?');
} else console.log('Databases left running. Add "-- --databases" to stop them as well.');
console.log('Done. The public test link (if any) no longer works; a new start gives a new link.');
