import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import type { Config } from '../config.js';
import type { NetworkErrorCode } from '@party/contracts';

export class RoomError extends Error { constructor(public readonly code: NetworkErrorCode) { super(code); this.name = 'RoomError'; } }
export function roomAssert(condition: unknown, code: NetworkErrorCode): asserts condition { if (!condition) throw new RoomError(code); }
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export function joinToken(secret: string, sessionId: string, joinId: string): string { return createHmac('sha256', secret).update(`join:${sessionId}:${joinId}`).digest('base64url'); }
export const cookieName = (sessionId: string, display = false) => `party_${sessionId.replaceAll('-', '')}${display ? '_display' : ''}`;
export function cookieToken(header: string | undefined, sessionId: string, display = false): string | undefined {
  if (!header || header.length > 16384) return undefined;
  const prefix = `${cookieName(sessionId, display)}=`;
  const matches = header.split(';').map(value => value.trim()).filter(value => value.startsWith(prefix));
  if (matches.length !== 1) return undefined;
  const value = matches[0]!.slice(prefix.length);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}
export function roomCookie(config: Config, sessionId: string, token: string, expiresAt: Date, display = false): string {
  return `${cookieName(sessionId, display)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))}${config.PUBLIC_ORIGIN.startsWith('https:') ? '; Secure' : ''}`;
}
export function allowedOrigin(headers: IncomingHttpHeaders, config: Config): boolean {
  if (headers.origin) return headers.origin === config.PUBLIC_ORIGIN;
  // Same-origin polling GETs can omit Origin. Cookies remain independently
  // verified; a non-browser client forging Host does not gain authentication.
  return headers.host === new URL(config.PUBLIC_ORIGIN).host && headers['sec-fetch-site'] !== 'cross-site';
}

// Bounded fixed windows: no room/player state is authoritative in this cache.
export class RateLimiter {
  private readonly windows = new Map<string, { count: number; ends: number }>();
  constructor(private readonly capacity = 4096) {}
  allow(key: string, limit: number, windowMs = 60_000): boolean {
    const now = Date.now(); let entry = this.windows.get(key);
    if (!entry || entry.ends <= now) {
      for (const [id, value] of this.windows) if (value.ends <= now) this.windows.delete(id);
      if (!this.windows.has(key) && this.windows.size >= this.capacity) return false;
      entry = { count: 0, ends: now + windowMs }; this.windows.set(key, entry);
    }
    return ++entry.count <= limit;
  }
}
