import { describe, it, expect } from 'vitest';
import { readConfig } from '../src/config.js';

describe('startup configuration', () => {
  it('allows local scaffolding without enabling authentication', () => {
    expect(readConfig({}).PORT).toBe(3001);
  });
  it.each(['0', '65536', 'invalid'])('rejects invalid port %s', PORT => {
    expect(() => readConfig({ PORT })).toThrow('Invalid configuration');
  });
  it('rejects partially configured authentication', () => {
    expect(() => readConfig({ AUTH_AUDIENCE: 'api' })).toThrow('all three');
  });
  it('refuses production startup without authentication', () => {
    expect(() => readConfig({ NODE_ENV: 'production' })).toThrow('Production requires');
  });
  it('rejects plaintext identity endpoints without disclosing their values', () => {
    expect(() => readConfig({ AUTH_ISSUER: 'http://secret.example/' })).toThrow('HTTPS is required');
    try { readConfig({ AUTH_ISSUER: 'http://secret.example/' }); }
    catch (error) { expect(String(error)).not.toContain('secret.example'); }
  });
});

 it('rejects non-PostgreSQL URLs and excessive pool sizes', () => {
  expect(() => readConfig({ DATABASE_URL: 'https://example.com' })).toThrow('PostgreSQL URL');
  expect(() => readConfig({ DATABASE_POOL_MAX: '500' })).toThrow('Invalid configuration');
 });
