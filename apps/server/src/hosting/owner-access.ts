import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { RoomReply } from '@party/contracts';
import type { Config } from '../config.js';
import { GameError } from '../game/errors.js';
import { allowedOrigin, namedCookie, RateLimiter, RoomError, roomAssert } from '../rooms/security.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { personFromCookie } from '../people/identity.js';

// Local owner access: the person running this server holds a private key in an
// HttpOnly cookie scoped to /api/host. It is an explicit non-production
// stand-in for creator sign-in; config refuses the key in production.
// Editors (people with editor rights) can work on the owner's games through
// requireEditor, signed in with their own person cookie; they never host.
export const OWNER_COOKIE = 'party_owner';
const loopback = (address: string | undefined) => address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
const digest = (value: string) => createHash('sha256').update(value).digest();
const status: Partial<Record<string, number>> = { UNAUTHORIZED: 401, AUTH_UNAVAILABLE: 503, RATE_LIMITED: 429, ORIGIN_REJECTED: 403, FORBIDDEN: 403, NOT_FOUND: 404, ROOM_NOT_AVAILABLE: 404, REVISION_CONFLICT: 409, INVALID_DEFINITION: 422, NAME_TAKEN: 409, NOT_ENOUGH_CHIPS: 409, PREFAB_LIMIT: 409, SIDE_GAMES_OFF: 409, SIDE_GAMES_PAUSED: 409, MEDIA_IN_USE: 409, FILE_TOO_LARGE: 413, UNSUPPORTED_MEDIA: 415, STORAGE_FULL: 507 };

export type OwnerBucket = 'menu' | 'claim' | 'edit';
export function createOwnerAccess(app: FastifyInstance, config: Config, client: PrismaClient) {
  const limiter = new RateLimiter(1024);
  const fail = (reply: FastifyReply, error: unknown) => {
    const code = error instanceof RoomError || error instanceof GameError ? error.code : 'GAME_UNAVAILABLE';
    app.log.warn({ event: 'host_request_rejected', code }, 'Host request rejected');
    return reply.code(status[code] ?? (code === 'AUDIO_TOOLS_UNAVAILABLE' ? 503 : code === 'GAME_UNAVAILABLE' ? 500 : 400)).send({ ok: false, error: { code } } satisfies RoomReply<never>);
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
  // The loopback session never carries the private owner key and is only valid on the same local origin.
  const localToken = (settings: ReturnType<typeof guard>, request: FastifyRequest) => {
    if (config.NODE_ENV === 'production' || config.TRUST_CLOUDFLARE_LOCAL || !(config.HOST === 'localhost' || loopback(config.HOST))) return undefined;
    const origin = new URL(config.PUBLIC_ORIGIN);
    if (origin.hostname !== 'localhost' && origin.hostname !== '127.0.0.1') return undefined;
    const { remoteAddress, localAddress } = request.raw.socket;
    if (!loopback(remoteAddress) || !loopback(localAddress)) return undefined;
    const headers = request.headers;
    if (Object.keys(headers).some(name => /^(forwarded$|x-forwarded-|cf-|via$|x-real-ip$)/.test(name))) return undefined;
    const port = origin.port ? `:${origin.port}` : '';
    if (headers.host !== `localhost${port}` && headers.host !== `127.0.0.1${port}`) return undefined;
    const browserOrigin = `${origin.protocol}//${headers.host}`;
    if (headers.origin && headers.origin !== browserOrigin) return undefined;
    return createHmac('sha256', settings.roomSecret).update(`loopback-owner:${browserOrigin}:${settings.ownerToken}`).digest('base64url');
  };
  const hasOwnerCookie = (settings: ReturnType<typeof guard>, request: FastifyRequest) => {
    const cookie = namedCookie(request.headers.cookie, OWNER_COOKIE);
    if (!cookie) return false;
    if (isOwner(settings.ownerToken, cookie)) return true;
    const token = localToken(settings, request);
    return token !== undefined && isOwner(token, cookie);
  };
  const requireOwner = (request: FastifyRequest, bucket: 'menu' | 'edit' = 'menu') => {
    const settings = guard(request, bucket);
    roomAssert(hasOwnerCookie(settings, request), 'UNAUTHORIZED');
    return settings;
  };
  /**
   * Working on games: the owner, or a person the owner gave editor rights to.
   * Checked against the database on every request, so taking the rights away,
   * signing the person's phones out or removing them takes effect at once.
   * Only works where owner access itself works (never in production).
   */
  const requireEditor = async (request: FastifyRequest, bucket: 'menu' | 'edit' = 'menu') => {
    const settings = guard(request, bucket);
    if (hasOwnerCookie(settings, request)) return { ...settings, role: 'owner' as const, personId: null };
    const found = await personFromCookie(client, request.headers.cookie);
    roomAssert(found?.person.canEdit, 'UNAUTHORIZED');
    return { ...settings, role: 'editor' as const, personId: found.person.id };
  };
  return { fail, guard, isOwner, localToken, requireOwner, requireEditor };
}
export type OwnerAccess = ReturnType<typeof createOwnerAccess>;
