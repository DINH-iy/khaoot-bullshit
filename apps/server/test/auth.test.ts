import { beforeAll, describe, expect, it } from 'vitest';
import { generateKeyPair, SignJWT } from 'jose';
import { createTokenVerifier } from '../src/auth.js';
import { readConfig } from '../src/config.js';

const issuer = 'https://identity.example/';
const audience = 'party-api';
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
beforeAll(async () => { keys = await generateKeyPair('RS256'); });
const config = readConfig({ AUTH_ISSUER: issuer, AUTH_AUDIENCE: audience, AUTH_JWKS_URL: 'https://identity.example/jwks' });
async function token(options: { audience?: string; issuer?: string; expired?: boolean; scope?: unknown; missingSubject?: boolean } = {}) {
  let jwt = new SignJWT({ scope: options.scope ?? 'games:write' }).setProtectedHeader({ alg: 'RS256' })
    .setIssuer(options.issuer ?? issuer).setAudience(options.audience ?? audience).setIssuedAt()
    .setExpirationTime(options.expired ? Math.floor(Date.now() / 1000) - 60 : '5m');
  if (!options.missingSubject) jwt = jwt.setSubject('creator-1');
  return jwt.sign(keys.privateKey);
}

describe('cryptographic access-token verification', () => {
  it('accepts a correctly signed token for the configured API', async () => {
    const verify = createTokenVerifier(config, keys.publicKey)!;
    await expect(verify(await token())).resolves.toEqual({ subject: 'creator-1', scopes: ['games:write'] });
  });
  it.each([
    { audience: 'browser-id-token' }, { issuer: 'https://other.example/' },
    { expired: true }, { missingSubject: true }, { scope: ['ops:read'] },
  ])('rejects invalid claims %j', async options => {
    await expect(createTokenVerifier(config, keys.publicKey)!(await token(options))).rejects.toThrow();
  });
  it('rejects forged signatures', async () => {
    const otherKeys = await generateKeyPair('RS256');
    await expect(createTokenVerifier(config, otherKeys.publicKey)!(await token())).rejects.toThrow();
  });
  it('rejects malformed tokens', async () => {
    await expect(createTokenVerifier(config, keys.publicKey)!('not-a-token')).rejects.toThrow();
  });
  it('never creates an implicit development bypass', () => {
    expect(createTokenVerifier(readConfig({}))).toBeUndefined();
  });
});
