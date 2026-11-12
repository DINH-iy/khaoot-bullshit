import { afterEach, describe, expect, it, vi } from 'vitest';
import { readConfig } from '../../src/config.js';
import { allowedOrigin, cookieName, cookieToken, joinToken, newToken, RateLimiter, roomCookie, tokenHash } from '../../src/rooms/security.js';

afterEach(() => vi.useRealTimers());
describe('room admission security', () => {
  const config = readConfig({ PUBLIC_ORIGIN: 'https://party.example' }); const sessionId = '00000000-0000-4000-8000-000000000001';
  it('accepts only the exact browser origin; CORS is not used as authentication', () => {
    expect(allowedOrigin({ origin: 'https://party.example' }, config)).toBe(true);
    expect(allowedOrigin({ origin: 'https://party.example.evil.test', host: 'party.example' }, config)).toBe(false);
    expect(allowedOrigin({ host: 'party.example', 'sec-fetch-site': 'cross-site' }, config)).toBe(false);
    expect(allowedOrigin({ host: 'party.example' }, config)).toBe(true);
  });
  it('uses separate HttpOnly secure display cookies and rejects duplicate/invalid cookie values', () => {
    const token = newToken(); const cookie = roomCookie(config, sessionId, token, new Date(Date.now() + 10000));
    expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('SameSite=Strict'); expect(cookie).toContain('Secure');
    expect(cookieToken(cookie, sessionId)).toBe(token);
    expect(cookieToken(cookie + '; ' + cookie, sessionId)).toBeUndefined();
    expect(cookieToken(`${cookieName(sessionId)}=bad`, sessionId)).toBeUndefined();
    expect(cookieToken(roomCookie(config, sessionId, token, new Date(Date.now() + 10000), true), sessionId)).toBeUndefined();
  });
  it('derives opaque retry-safe guest credentials without storing raw tokens', () => {
    const secret = 'a'.repeat(64); const token = joinToken(secret, sessionId, 'opaque-join-id');
    expect(token).toHaveLength(43); expect(tokenHash(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(token).toBe(joinToken(secret, sessionId, 'opaque-join-id'));
    expect(token).not.toBe(joinToken(secret, sessionId, 'different-join-id'));
  });
  it('bounds rate-limit state and expires old windows', () => {
    vi.useFakeTimers(); const limiter = new RateLimiter(2);
    expect(limiter.allow('one', 1)).toBe(true); expect(limiter.allow('one', 1)).toBe(false);
    expect(limiter.allow('two', 1)).toBe(true); expect(limiter.allow('three', 1)).toBe(false);
    vi.advanceTimersByTime(60001); expect(limiter.allow('three', 1)).toBe(true);
  });
  it('requires HTTPS and room secrets in production while never generating an auth bypass', () => {
    expect(() => readConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://localhost/party', AUTH_ISSUER: 'https://id.example', AUTH_AUDIENCE: 'api', AUTH_JWKS_URL: 'https://id.example/keys' })).toThrow('Production requires');
  });
});
