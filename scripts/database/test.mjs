import { spawnSync } from 'node:child_process';
import { loadLocalEnvironment, projectRoot, testDatabaseUrl } from './environment.mjs';
loadLocalEnvironment();
const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: testDatabaseUrl(process.env.TEST_DATABASE_URL) };
for (const args of [
  ['scripts/database/prisma.mjs', 'migrate', 'deploy'],
  ['scripts/database/prisma.mjs', 'migrate', 'deploy'],
  ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.database.config.ts'],
]) {
  const result = spawnSync(process.execPath, args, { cwd: projectRoot, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) { process.exitCode = result.status ?? 1; break; }
}
