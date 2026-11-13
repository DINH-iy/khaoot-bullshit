import { execFileSync } from 'node:child_process';

/** The project's own long-running processes, recognised by what they run. Nothing else is ever touched. */
export const KINDS = [
  { kind: 'public link launcher', match: 'scripts/network/public.mjs' },
  { kind: 'local host launcher', match: 'scripts/host/start.mjs' },
  { kind: 'app server', match: 'apps/server/dist/index.js' },
  { kind: 'development server', match: 'apps/server/src/index.ts' },
  { kind: 'web dev server', match: 'vite' },
  { kind: 'Cloudflare tunnel', match: '.local/tools/cloudflared' },
];
export function projectProcesses(root) {
  const lines = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' }).split('\n');
  return lines.map(line => line.trim()).filter(Boolean).map(line => { const [pid, ...rest] = line.split(/\s+/); return { pid: Number(pid), command: rest.join(' ') }; })
    .filter(entry => entry.pid !== process.pid)
    .map(entry => ({ ...entry, kind: KINDS.find(kind => entry.command.includes(kind.match) && (kind.match !== 'vite' || entry.command.includes(root)))?.kind }))
    .filter(entry => entry.kind && !entry.command.includes('scripts/ops/'));
}
