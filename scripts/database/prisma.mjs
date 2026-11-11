import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { loadLocalEnvironment, serverRoot } from './environment.mjs';
loadLocalEnvironment();
const args = process.argv.slice(2);
const offline = ['generate', 'validate', 'format'].includes(args[0]) || args[0] === 'migrate' && args[1] === 'diff';
if (!offline && !process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
if (args[0] === 'migrate' && args[1] === 'dev') {
  const url = new URL(process.env.DATABASE_URL);
  if (process.env.NODE_ENV === 'production' || !decodeURIComponent(url.pathname).endsWith('_dev') || !['localhost','127.0.0.1','postgres'].includes(url.hostname)) {
    throw new Error('Development migrations require a local database ending in _dev.');
  }
}
if (args.includes('reset') || args[0] === 'db' && args[1] === 'push') throw new Error('Reset and schema push are not exposed by this migration wrapper.');
const require = createRequire(new URL('../../apps/server/package.json', import.meta.url));
const packagePath = require.resolve('prisma/package.json');
const cli = resolve(dirname(packagePath), require(packagePath).bin.prisma);
const result = spawnSync(process.execPath, [cli, ...args], { cwd: serverRoot, env: process.env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
