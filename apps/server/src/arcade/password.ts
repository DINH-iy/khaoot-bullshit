import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { roomAssert } from '../rooms/security.js';

let pending = 0;
async function derive(password: string, salt: Buffer): Promise<Buffer> {
  // Bound the work queued across addresses as well as each route's per-address limit.
  roomAssert(pending < 8, 'RATE_LIMITED');
  pending++;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, 32, (error, key) => error ? reject(error) : resolve(key));
    });
  } finally { pending--; }
}

export async function hashLobbyPassword(password: string) {
  const salt = randomBytes(16);
  return `v1:${salt.toString('hex')}:${(await derive(password, salt)).toString('hex')}`;
}

export async function matchesLobbyPassword(password: string | undefined, stored: string) {
  const parts = /^v1:([a-f0-9]{32}):([a-f0-9]{64})$/.exec(stored);
  if (!parts || !password) return false;
  const actual = await derive(password, Buffer.from(parts[1]!, 'hex'));
  return timingSafeEqual(actual, Buffer.from(parts[2]!, 'hex'));
}
