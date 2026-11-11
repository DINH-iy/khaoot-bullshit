import { spawnSync } from 'node:child_process';
import { loadLocalEnvironment, projectRoot } from './environment.mjs';
loadLocalEnvironment();
const result = spawnSync('docker', ['compose', '--env-file', '.env', '-f', 'infra/database/compose.yaml', '--profile', 'test', ...process.argv.slice(2)], { cwd: projectRoot, env: process.env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
