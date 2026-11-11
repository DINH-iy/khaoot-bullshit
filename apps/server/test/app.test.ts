import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { HealthSchema, ProblemSchema } from '@party/contracts';
import { buildApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { AuthenticationUnavailable, type TokenVerifier } from '../src/auth.js';

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
function make(verifyToken?: TokenVerifier) {
  const app = buildApp(readConfig({ LOG_LEVEL: 'silent' }), verifyToken ? { verifyToken } : {});
  apps.push(app);
  return app;
}
const player: TokenVerifier = async () => ({ subject: 'creator-1', scopes: ['games:write'] });
const headers = { authorization: 'Bearer valid-test-token' };

describe('server boundaries and diagnostics', () => {
  it('keeps liveness separate from readiness', async () => {
    const app = make();
    const live = await app.inject('/api/health/live');
    const ready = await app.inject('/api/health/ready');
    expect(live.statusCode).toBe(200);
    expect(ready.statusCode).toBe(503);
    expect(HealthSchema.parse(ready.json()).checks.authentication).toBe('not_configured');
  });
  it('returns a disabled state when sign-in is unconfigured', async () => {
    const response = await make().inject({ url: '/api/me', headers });
    expect(response.statusCode).toBe(503);
    expect(ProblemSchema.parse(response.json()).error.code).toBe('AUTH_UNAVAILABLE');
  });
  it('requires credentials when verification is configured', async () => {
    const response = await make(player).inject('/api/me');
    expect(response.statusCode).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
  });
  it('returns only the verified identity', async () => {
    const response = await make(player).inject({ url: '/api/me?subject=attacker', headers });
    expect(response.json()).toEqual({ subject: 'creator-1', scopes: ['games:write'] });
  });
  it('checks operational permissions separately from authentication', async () => {
    const response = await make(player).inject({ url: '/api/ops/metrics', headers });
    expect(response.statusCode).toBe(403);
  });
  it('reports bounded metrics to an authorized operator', async () => {
    const app = make(async () => ({ subject: 'operator', scopes: ['ops:read'] }));
    await app.inject('/api/health/live');
    const response = await app.inject({ url: '/api/ops/metrics', headers });
    expect(response.statusCode).toBe(200);
    expect(response.json().requests).toBe(1);
    expect(response.json().durationBuckets).toHaveLength(9);
  });
  it('rejects invalid tokens without exposing verification details', async () => {
    const response = await make(async () => { throw new Error('secret verifier detail'); }).inject({ url: '/api/me', headers });
    expect(response.statusCode).toBe(401);
    expect(response.body).not.toContain('secret verifier detail');
  });
  it('distinguishes provider outage from invalid credentials', async () => {
    const response = await make(async () => { throw new AuthenticationUnavailable(); }).inject({ url: '/api/me', headers });
    expect(response.statusCode).toBe(503);
  });
  it('contains unexpected route failures and keeps serving', async () => {
    const app = make();
    app.get('/test/failure', async () => { throw new Error('private internal detail'); });
    const response = await app.inject('/test/failure');
    expect(response.statusCode).toBe(500);
    expect(ProblemSchema.parse(response.json()).error.code).toBe('INTERNAL_ERROR');
    expect(response.body).not.toContain('private internal detail');
    expect((await app.inject('/api/health/live')).statusCode).toBe(200);
  });
  it('bounds request bodies', async () => {
    const app = make();
    app.post('/test/body', async () => ({ ok: true }));
    const response = await app.inject({ method: 'POST', url: '/test/body', payload: { text: 'x'.repeat(17000) } });
    expect(response.statusCode).toBe(413);
  });
  it('adds timing, generated request IDs, security and no-cache headers', async () => {
    const response = await make().inject({ url: '/api/health/live', headers: { 'x-request-id': 'untrusted' } });
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers['server-timing']).toMatch(/^app;dur=\d+\.\d{2}$/);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
  it('does not log credentials, cookies, query strings, or request bodies', async () => {
    let output = '';
    const stream = new Writable({ write(chunk, _encoding, done) { output += String(chunk); done(); } });
    const app = buildApp(readConfig({ LOG_LEVEL: 'info' }), { logStream: stream, verifyToken: player });
    apps.push(app);
    await app.inject({ url: '/api/me?token=secret-query', headers: { authorization: 'Bearer secret-token', cookie: 'session=secret-cookie' } });
    await app.inject({ url: '/unknown?code=secret-recovery' });
    expect(output).toContain('request_completed');
    for (const secret of ['secret-query', 'secret-token', 'secret-cookie', 'secret-recovery']) expect(output).not.toContain(secret);
  });
});
