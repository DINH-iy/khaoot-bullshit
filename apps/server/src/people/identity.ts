import type { Config } from '../config.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { namedCookie, tokenHash } from '../rooms/security.js';

// A phone signed in as a person holds a device key in this HttpOnly cookie for
// a year. The personal link itself is never stored on the phone: claiming it
// creates a separate device key, so the owner can sign phones out one by one or all at once.
export const PERSON_COOKIE = 'party_person';
const YEAR_SECONDS = 365 * 24 * 60 * 60;
const SEEN_EVERY_MS = 60 * 60 * 1000;

const secure = (config: Config) => config.PUBLIC_ORIGIN.startsWith('https:') ? '; Secure' : '';
export const personCookie = (config: Config, token: string) => `${PERSON_COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${YEAR_SECONDS}${secure(config)}`;
export const clearPersonCookie = (config: Config) => `${PERSON_COOKIE}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0${secure(config)}`;

/** The person this request's phone is signed in as, or null for a guest. */
export async function personFromCookie(client: PrismaClient, cookie: string | undefined) {
  const token = namedCookie(cookie, PERSON_COOKIE);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const device = await client.personDevice.findUnique({ where: { tokenHash: tokenHash(token) }, include: { person: true } });
  if (!device || device.revokedAt || device.person.removedAt) return null;
  if (Date.now() - device.lastSeenAt.getTime() > SEEN_EVERY_MS) await client.personDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
  return { deviceId: device.id, person: device.person };
}
