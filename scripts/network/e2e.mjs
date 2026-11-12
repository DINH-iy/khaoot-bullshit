import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { loadLocalEnvironment, projectRoot, testDatabaseUrl } from '../database/environment.mjs';
loadLocalEnvironment();
const base = testDatabaseUrl(process.env.TEST_DATABASE_URL);
const name = `network_e2e_${randomUUID().replaceAll('-', '')}_test`;
const target = new URL(base); target.pathname = `/${name}`;
const admin = new pg.Client({ connectionString: base, connectionTimeoutMillis: 3000 });
const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: target.toString(), ROOM_TOKEN_SECRET: 'b'.repeat(64),
  HOST: '127.0.0.1', PORT: '4173', PUBLIC_ORIGIN: 'http://127.0.0.1:4173', SERVE_WEB: 'true', LOG_LEVEL: 'warn' };
let created = false;
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`); created = true;
  console.log('Created isolated browser-test database. Other test and party databases are unaffected.');
  for (const args of [['scripts/database/prisma.mjs', 'migrate', 'deploy'], ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)]]) {
    const result = spawnSync(process.execPath, args, { cwd: projectRoot, env, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) { process.exitCode = result.status ?? 1; break; }
  }
} finally {
  // Drop only the unique disposable DB successfully created by this invocation.
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
}
