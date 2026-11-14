import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { clientAddress } from '../src/client-address.js';

// The address every per-visitor rate limit uses (join, feedback, owner sign-in, people, sockets).
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
function make(trust?: 'true' | 'false') {
  const app = buildApp(readConfig({ LOG_LEVEL: 'silent', ...(trust ? { TRUST_CLOUDFLARE_LOCAL: trust } : {}) }));
  app.get('/test/ip', async request => ({ ip: request.ip }));
  apps.push(app);
  return app;
}
const ipFor = async (app: ReturnType<typeof make>, remoteAddress: string, header?: string) =>
  (await app.inject({ url: '/test/ip', remoteAddress, headers: header === undefined ? {} : { 'cf-connecting-ip': header } })).json<{ ip: string }>().ip;

describe('visitor address behind a local Cloudflare tunnel', () => {
  it('is off by default and then ignores the header', async () => {
    expect(readConfig({}).TRUST_CLOUDFLARE_LOCAL).toBe(false);
    expect(await ipFor(make(), '127.0.0.1', '203.0.113.7')).toBe('127.0.0.1');
    expect(await ipFor(make('false'), '127.0.0.1', '203.0.113.7')).toBe('127.0.0.1');
  });
  it('uses the header when switched on and the connection comes from loopback', async () => {
    const app = make('true');
    expect(await ipFor(app, '127.0.0.1', '203.0.113.7')).toBe('203.0.113.7');
    expect(await ipFor(app, '::1', '2001:DB8::1')).toBe('2001:db8::1');
    expect(await ipFor(app, '::ffff:127.0.0.1', ' 198.51.100.4 ')).toBe('198.51.100.4');
  });
  it('gives different visitors through the tunnel different addresses', async () => {
    const app = make('true');
    expect(await ipFor(app, '127.0.0.1', '203.0.113.7')).not.toBe(await ipFor(app, '127.0.0.1', '203.0.113.8'));
  });
  it('ignores the header from any other peer, even when switched on', async () => {
    const app = make('true');
    expect(await ipFor(app, '192.168.1.20', '127.0.0.1')).toBe('192.168.1.20');
    expect(await ipFor(app, '10.0.0.5', '203.0.113.7')).toBe('10.0.0.5');
    expect(await ipFor(app, '127.0.0.2', '203.0.113.7')).toBe('127.0.0.2');
  });
  it.each(['', '   ', 'not-an-ip', '203.0.113.7, 198.51.100.4', '999.1.1.1', '203.0.113.7:443', 'localhost', `1${'1'.repeat(60)}`])('ignores the invalid header value %j', async value => {
    expect(await ipFor(make('true'), '127.0.0.1', value)).toBe('127.0.0.1');
  });
  it('keeps the peer when the header is missing or repeated', async () => {
    expect(await ipFor(make('true'), '127.0.0.1')).toBe('127.0.0.1');
    expect(clientAddress('127.0.0.1', { 'cf-connecting-ip': ['203.0.113.7', '203.0.113.8'] as unknown as string }, true)).toBe('127.0.0.1');
    expect(clientAddress(undefined, { 'cf-connecting-ip': '203.0.113.7' }, true)).toBeUndefined();
  });
  it('rejects anything but true or false in the configuration', () => {
    expect(() => readConfig({ TRUST_CLOUDFLARE_LOCAL: 'yes' })).toThrow('Invalid configuration');
  });
});
