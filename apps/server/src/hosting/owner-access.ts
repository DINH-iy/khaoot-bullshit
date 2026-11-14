import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { RoomReply } from '@party/contracts';
import type { Config } from '../config.js';
import { GameError } from '../game/errors.js';
import { allowedOrigin, namedCookie, RateLimiter, RoomError, roomAssert } from '../rooms/security.js';

// Local owner access: the person running this server holds a private key in an
// HttpOnly cookie scoped to /api/host. It is an explicit non-production
// stand-in for creator sign-in; config refuses the key in production.
export const OWNER_COOKIE = 'party_owner';
const digest = (value: string) => createHash('sha256').update(value).digest();
const status: Partial<Record<string, number>> = { UNAUTHORIZED: 401, AUTH_UNAVAILABLE: 503, RATE_LIMITED: 429, ORIGIN_REJECTED: 403, FORBIDDEN: 403, NOT_FOUND: 404, ROOM_NOT_AVAILABLE: 404, REVISION_CONFLICT: 409, INVALID_DEFINITION: 422, NAME_TAKEN: 409, NOT_ENOUGH_CHIPS: 409, SIDE_GAMES_OFF: 409, SIDE_GAMES_PAUSED: 409 };

export type OwnerBucket = 'menu' | 'claim' | 'edit';
export function createOwnerAccess(app: FastifyInstance, config: Config) {
  const limiter = new RateLimiter(1024);
  const fail = (reply: FastifyReply, error: unknown) => {
    const code = error instanceof RoomError || error instanceof GameError ? error.code : 'GAME_UNAVAILABLE';
    app.log.warn({ event: 'host_request_rejected', code }, 'Host request rejected');
    return reply.code(status[code] ?? (code === 'GAME_UNAVAILABLE' ? 500 : 400)).send({ ok: false, error: { code } } satisfies RoomReply<never>);
  };
  // Each limit has its own counter: a strict key-guessing limit on signing in
  // must not be used up by the owner's ordinary menu and room requests.
  // Editing saves every few keystrokes, and people editing together can share one address.
  const guard = (request: FastifyRequest, bucket: OwnerBucket = 'menu') => {
    roomAssert(request.headers['x-party-request'] === '1' && allowedOrigin(request.headers, config), 'ORIGIN_REJECTED');
    roomAssert(limiter.allow(`host-${bucket}:${request.ip}`, bucket === 'claim' ? 20 : bucket === 'edit' ? 600 : 120), 'RATE_LIMITED');
    roomAssert(config.NODE_ENV !== 'production' && config.LOCAL_OWNER_TOKEN && config.ROOM_TOKEN_SECRET, 'AUTH_UNAVAILABLE');
    return { ownerToken: config.LOCAL_OWNER_TOKEN, roomSecret: config.ROOM_TOKEN_SECRET };
  };
  const isOwner = (expected: string, candidate: string | undefined) => candidate !== undefined && timingSafeEqual(digest(candidate), digest(expected));
  const requireOwner = (request: FastifyRequest, bucket: 'menu' | 'edit' = 'menu') => {
    const settings = guard(request, bucket);
    roomAssert(isOwner(settings.ownerToken, namedCookie(request.headers.cookie, OWNER_COOKIE)), 'UNAUTHORIZED');
    return settings;
  };
  return { fail, guard, isOwner, requireOwner };
}
export type OwnerAccess = ReturnType<typeof createOwnerAccess>;
