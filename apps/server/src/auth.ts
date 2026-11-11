import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type JWTPayload } from 'jose';
import { IdentitySchema, type Identity } from '@party/contracts';
import type { Config } from './config.js';

export type TokenVerifier = (token: string) => Promise<Identity>;
export class AuthenticationUnavailable extends Error {}

function identityFromClaims(payload: JWTPayload): Identity {
  if (!payload.sub || !payload.exp) throw new Error('Required token claims missing');
  const scope = payload['scope'];
  if (scope !== undefined && typeof scope !== 'string') throw new Error('Invalid scope claim');
  return IdentitySchema.parse({ subject: payload.sub, scopes: typeof scope === 'string' ? scope.split(' ').filter(Boolean) : [] });
}

export function createTokenVerifier(
  config: Config,
  // Explicit key injection for offline cryptographic tests; never accepted from a request.
  suppliedKey?: JWTVerifyGetKey | CryptoKey | Uint8Array,
): TokenVerifier | undefined {
  if (!config.AUTH_ISSUER || !config.AUTH_AUDIENCE || !config.AUTH_JWKS_URL) return undefined;
  const issuer = config.AUTH_ISSUER;
  const audience = config.AUTH_AUDIENCE;
  const key = suppliedKey ?? createRemoteJWKSet(new URL(config.AUTH_JWKS_URL), { timeoutDuration: 3000, cooldownDuration: 30000 });
  return async token => {
    try {
      const options = { issuer, audience, algorithms: ['RS256'], requiredClaims: ['sub', 'exp', 'iat'], maxTokenAge: '1h', clockTolerance: 5 };
      const result = typeof key === 'function' ? await jwtVerify(token, key, options) : await jwtVerify(token, key, options);
      return identityFromClaims(result.payload);
    } catch (error) {
      if (error instanceof Error && ['JWKSTimeout', 'TypeError'].includes(error.name)) throw new AuthenticationUnavailable('Identity service unavailable');
      throw error;
    }
  };
}
