import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from 'node:crypto';
import { PERSON_KEY_ALPHABET } from '@party/contracts';
import { tokenHash } from '../rooms/security.js';

// A person's key: 12 characters from a 32-letter alphabet (60 random bits),
// shown as K7QM-4XPT-9RWD. Short enough to type on a phone, far too many to
// guess through the rate-limited sign-in. The server checks it by its SHA-256
// hash (people.linkHash), like the personal links before it. So the owner can
// look it up again, it is also stored encrypted (AES-256-GCM) with a key derived
// from ROOM_TOKEN_SECRET: a copy of the database alone does not reveal it.
const LENGTH = 12;
const SEALED = 'v1.';

export function newPersonKey() {
  const chars = Array.from({ length: LENGTH }, () => PERSON_KEY_ALPHABET[randomInt(PERSON_KEY_ALPHABET.length)]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}

/**
 * The hash to look a typed key up by. Case, spaces and dashes do not matter, and
 * O/I/L read as 0/1/1. An older 43-character personal link is hashed as it is.
 * Returns null for anything that cannot be a key, so it is never looked up.
 */
export function personKeyHash(input: string): string | null {
  if (/^[A-Za-z0-9_-]{43}$/.test(input)) return tokenHash(input);
  const plain = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (plain.length !== LENGTH || [...plain].some(char => !PERSON_KEY_ALPHABET.includes(char))) return null;
  return tokenHash(`${plain.slice(0, 4)}-${plain.slice(4, 8)}-${plain.slice(8)}`);
}

const sealingKey = (roomSecret: string) => createHash('sha256').update(`person-key:${roomSecret}`).digest();

export function sealPersonKey(roomSecret: string, key: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', sealingKey(roomSecret), iv);
  const body = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()]);
  return SEALED + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

/** The key again, or null when it cannot be opened (for example after ROOM_TOKEN_SECRET changed). */
export function openPersonKey(roomSecret: string, sealed: string | null): string | null {
  if (!sealed?.startsWith(SEALED)) return null;
  try {
    const data = Buffer.from(sealed.slice(SEALED.length), 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', sealingKey(roomSecret), data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
  } catch { return null; }
}
