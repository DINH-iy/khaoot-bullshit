import { z } from 'zod';
import { PlayerLookSchema } from './players.js';

/**
 * People: accounts the owner makes for regular players, so a phone always
 * joins as the same person (name, look and chips across games). Each person
 * has one personal key (like K7QM-4XPT-9RWD): typed on the join screen, or
 * inside their personal link. The owner can look it up again. Optionally a
 * person may edit games (never host rooms or use the admin menu).
 */
export const PersonNameSchema = z.string().trim().min(1).max(40);
/** Crockford base32 without I, L, O and U, so it reads and types without confusion. */
export const PERSON_KEY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const PersonKeySchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
/** A typed key (any case, spaces or dashes) or an older 43-character personal link. The server normalises it. */
export const ClaimPersonSchema = z.object({ token: z.string().min(1).max(64) }).strict();
/** Who this phone is, if anyone. */
export const MeSchema = z.object({ person: z.object({ id: z.uuid(), name: z.string(), look: PlayerLookSchema.nullable(), canEdit: z.boolean() }).strict().nullable() }).strict();
export type Me = z.infer<typeof MeSchema>;

export const NewPersonSchema = z.object({ name: PersonNameSchema, canEdit: z.boolean().default(false) }).strict();
export const RenamePersonSchema = z.object({ name: PersonNameSchema }).strict();
export const PersonEditorSchema = z.object({ canEdit: z.boolean() }).strict();
export const PersonRowSchema = z.object({
  id: z.uuid(), name: z.string(), createdAt: z.string(), devices: z.number().int().min(0), lastSeenAt: z.string().nullable(),
  games: z.number().int().min(0), chips: z.number().int(), wagered: z.number().int().min(0),
  canEdit: z.boolean(),
  // False for people made before keys could be looked up again: make a new key to see one.
  hasKey: z.boolean(),
}).strict();
export type PersonRow = z.infer<typeof PersonRowSchema>;
export const PeopleListSchema = z.object({ people: z.array(PersonRowSchema) }).strict();
/** A person's key, for the owner: shown after adding, after a new key, or when looked up. */
export const PersonKeyViewSchema = z.object({ id: z.uuid(), name: z.string(), key: PersonKeySchema }).strict();
export type PersonKeyView = z.infer<typeof PersonKeyViewSchema>;
