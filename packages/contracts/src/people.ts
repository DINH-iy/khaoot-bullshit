import { z } from 'zod';
import { PlayerLookSchema } from './players.js';

/**
 * People: accounts the owner makes for regular players, so a phone always
 * joins as the same person (name, look and chips across games). The owner
 * hands out a personal link; opening it signs that phone in. No passwords.
 */
export const PersonNameSchema = z.string().trim().min(1).max(40);
export const PersonLinkTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const ClaimPersonSchema = z.object({ token: PersonLinkTokenSchema }).strict();
/** Who this phone is, if anyone. */
export const MeSchema = z.object({ person: z.object({ id: z.uuid(), name: z.string(), look: PlayerLookSchema.nullable() }).strict().nullable() }).strict();
export type Me = z.infer<typeof MeSchema>;

export const NewPersonSchema = z.object({ name: PersonNameSchema }).strict();
export const RenamePersonSchema = z.object({ name: PersonNameSchema }).strict();
export const PersonRowSchema = z.object({
  id: z.uuid(), name: z.string(), createdAt: z.string(), devices: z.number().int().min(0), lastSeenAt: z.string().nullable(),
  games: z.number().int().min(0), chips: z.number().int(), wagered: z.number().int().min(0),
}).strict();
export type PersonRow = z.infer<typeof PersonRowSchema>;
export const PeopleListSchema = z.object({ people: z.array(PersonRowSchema) }).strict();
/** A fresh personal link: shown once, to give to that person. */
export const PersonLinkSchema = z.object({ id: z.uuid(), name: z.string(), token: PersonLinkTokenSchema }).strict();
export type PersonLink = z.infer<typeof PersonLinkSchema>;
