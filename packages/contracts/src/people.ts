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

/**
 * A person's totals over every real game they played (practice rooms never count):
 * the owner's People page shows them per person and as a leaderboard.
 */
export const PersonStatsSchema = z.object({
  personId: z.uuid(),
  // Finished games (not arcade rounds) with a seat, and how they ended: 1st place (ties share it) and top 3, by own points.
  games: z.number().int().min(0), wins: z.number().int().min(0), podiums: z.number().int().min(0), points: z.number().int(),
  // Answers in quiz and ordering rounds, once revealed: right or wrong. Minigame rounds played.
  right: z.number().int().min(0), wrong: z.number().int().min(0), minigames: z.number().int().min(0),
  arcadeRounds: z.number().int().min(0), arcadeWins: z.number().int().min(0),
  // Side games: challenges (duels between two phones) and rounds of the solo side games.
  duelsWon: z.number().int().min(0), duelsLost: z.number().int().min(0), duelsDrawn: z.number().int().min(0),
  sideRounds: z.number().int().min(0), biggestWin: z.number().int().min(0),
  // Challenges per head-to-head game (only games played at least once), and the main rival: the one challenged most (either way).
  duelGames: z.array(z.object({ game: z.string(), won: z.number().int().min(0), lost: z.number().int().min(0), drawn: z.number().int().min(0) }).strict()),
  rival: z.object({ name: z.string(), personId: z.uuid().nullable(), times: z.number().int().min(1), won: z.number().int().min(0), lost: z.number().int().min(0) }).strict().nullable(),
  favouriteGame: z.object({ title: z.string(), times: z.number().int().min(1) }).strict().nullable(),
  lastGame: z.object({ title: z.string(), at: z.string() }).strict().nullable(),
}).strict();
export type PersonStats = z.infer<typeof PersonStatsSchema>;
export const PeopleStatsSchema = z.object({ stats: z.array(PersonStatsSchema) }).strict();

/**
 * Groups of people (Admin → People → Groups): a name and its members, so the host can add
 * a whole group to a room at once instead of ticking 20 people one by one. Owner only.
 */
export const PersonGroupSchema = z.object({ id: z.uuid(), name: z.string(), personIds: z.array(z.uuid()) }).strict();
export type PersonGroup = z.infer<typeof PersonGroupSchema>;
export const PersonGroupListSchema = z.object({ groups: z.array(PersonGroupSchema) }).strict();
export const NewPersonGroupSchema = z.object({ name: PersonNameSchema }).strict();
/** A new name, the whole member list, or both. Unknown or removed people are left out. */
export const UpdatePersonGroupSchema = z.object({ name: PersonNameSchema.optional(), personIds: z.array(z.uuid()).max(500).optional() }).strict()
  .refine(value => value.name !== undefined || value.personIds !== undefined, 'Nothing to change');
