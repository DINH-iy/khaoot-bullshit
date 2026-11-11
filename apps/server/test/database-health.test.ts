import { afterEach, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import type { DatabaseHealth } from '../src/database/client.js';

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
function create(available: boolean) {
  let checks = 0;
  let closed = false;
  const database: DatabaseHealth = {
    async check() { checks++; if (!available) throw new Error('private database connection detail'); },
    async close() { closed = true; },
    snapshot() { return { poolMax: 5, totalConnections: 1, idleConnections: 1, waitingRequests: 0, lastCheckMs: 2, healthy: available }; },
  };
  const app = buildApp(readConfig({ LOG_LEVEL: 'silent' }), { database, verifyToken: async () => ({ subject: 'operator', scopes: ['ops:read'] }) });
  apps.push(app);
  return { app, checks: () => checks, closed: () => closed };
}
it('liveness never depends on database availability', async () => {
  const f = create(false);
  expect((await f.app.inject('/api/health/live')).statusCode).toBe(200);
  expect(f.checks()).toBe(0);
});
it('readiness checks database connectivity and authentication configuration', async () => {
  const f = create(true);
  const response = await f.app.inject('/api/health/ready');
  expect(response.statusCode).toBe(200);
  expect(response.json().checks.database).toBe('available');
  expect(f.checks()).toBe(1);
});
it('a database outage returns unavailable without exposing connection details', async () => {
  const f = create(false);
  const response = await f.app.inject('/api/health/ready');
  expect(response.statusCode).toBe(503);
  expect(response.json().checks.database).toBe('unavailable');
  expect(response.body).not.toContain('private database');
});
it('exposes pool measurements only through authorized operational metrics', async () => {
  const f = create(true);
  const response = await f.app.inject({ url: '/api/ops/metrics', headers: { authorization: 'Bearer test-token' } });
  expect(response.statusCode).toBe(200);
  expect(response.json().database).toEqual({ poolMax: 5, totalConnections: 1, idleConnections: 1, waitingRequests: 0, lastCheckMs: 2, healthy: true });
});
it('closes the database pool with the server', async () => {
  const f = create(true);
  await f.app.ready();
  await f.app.close();
  expect(f.closed()).toBe(true);
});
