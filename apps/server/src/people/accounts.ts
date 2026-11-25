import type { PrismaClient } from '../generated/prisma/client.js';
import { Prisma } from '../generated/prisma/client.js';
import type { Transaction } from '../game/model.js';
import { newToken, RoomError, tokenHash } from '../rooms/security.js';
import { newPersonKey, sealPersonKey } from './keys.js';

// Making a person and signing a phone in as one, shared by the owner's People page
// and the room (a guest making an account while joining, a host-approved name pick).

/** Lower-case name: two people cannot share a name. */
export const nameKey = (name: string) => name.trim().toLowerCase();
export const nameTaken = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
/** A key and its two stored forms: the hash to check it by, and the sealed copy the owner can open. */
export const keyFields = (roomSecret: string) => { const key = newPersonKey(); return { key, data: { linkHash: tokenHash(key), keySealed: sealPersonKey(roomSecret, key) } }; };

/** A new person with a fresh personal key; NAME_TAKEN when the name is in use. */
// `roleId`: the person's role (see roles.ts), or null for a player only; `canEdit` follows it (kept for older readers).
export async function createPerson(db: PrismaClient | Transaction, roomSecret: string, name: string, roleId: string | null = null) {
  const { key, data } = keyFields(roomSecret);
  const person = await db.person.create({ data: { name: name.trim(), nameKey: nameKey(name), roleId, canEdit: roleId !== null, ...data } })
    .catch((error: unknown) => { throw nameTaken(error) ? new RoomError('NAME_TAKEN') : error; });
  return { person, key };
}
/** Signs a phone in as the person: a new device key, for that phone's cookie only. */
export async function addDevice(db: PrismaClient | Transaction, personId: string) {
  const token = newToken();
  await db.personDevice.create({ data: { personId, tokenHash: tokenHash(token) } });
  return token;
}
