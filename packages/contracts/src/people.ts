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

// `roleId`: the person's role (what they may do besides playing); `canEdit` (older form) gives the Editor role.
export const NewPersonSchema = z.object({ name: PersonNameSchema, canEdit: z.boolean().default(false), roleId: z.uuid().nullable().optional() }).strict();
export const RenamePersonSchema = z.object({ name: PersonNameSchema }).strict();
export const PersonEditorSchema = z.object({ canEdit: z.boolean() }).strict();
export const PersonRowSchema = z.object({
  id: z.uuid(), name: z.string(), createdAt: z.string(), devices: z.number().int().min(0), lastSeenAt: z.string().nullable(),
  games: z.number().int().min(0), chips: z.number().int(), wagered: z.number().int().min(0),
  canEdit: z.boolean(),
  // The person's role (null: a player only) and its name.
  roleId: z.uuid().nullable().optional(), roleName: z.string().nullable().optional(),
  // False for people made before keys could be looked up again: make a new key to see one.
  hasKey: z.boolean(),
  // Included only when the owner opens the People directory with keys enabled.
  key: PersonKeySchema.nullable().optional(),
}).strict();
export type PersonRow = z.infer<typeof PersonRowSchema>;
/** People per page in every list of people (Admin → People, groups, a room's people, invites). */
export const PEOPLE_PAGE_SIZE = 50;
/** Asking for a page of people (A–Z): `search` finds names containing it, ignoring capitals. */
export const PeopleQuerySchema = z.object({
  search: z.string().trim().max(40).default(''), page: z.coerce.number().int().min(0).max(100_000).default(0),
  // Only the owner's People page asks for the keys themselves.
  withKeys: z.enum(['0', '1']).default('0'),
}).strict();
export type PeopleQuery = z.input<typeof PeopleQuerySchema>;
/** One page of people; `total` counts everyone matching the search, on every page. */
export const PeoplePageSchema = z.object({ people: z.array(PersonRowSchema).max(PEOPLE_PAGE_SIZE), total: z.number().int().min(0), page: z.number().int().min(0), pageSize: z.number().int().min(1) }).strict();
export type PeoplePage = z.infer<typeof PeoplePageSchema>;
/** The numbers at a glance above the People page, over everyone. */
export const PeopleSummarySchema = z.object({ people: z.number().int().min(0), editors: z.number().int().min(0), seenThisWeek: z.number().int().min(0),
  neverSignedIn: z.number().int().min(0), phones: z.number().int().min(0) }).strict();
export type PeopleSummary = z.infer<typeof PeopleSummarySchema>;
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

/** Share of right answers in whole percent, or null with too few answers to mean anything. */
export const accuracy = (stats: PersonStats, minimum = 1) => stats.right + stats.wrong >= minimum ? Math.round(100 * stats.right / (stats.right + stats.wrong)) : null;
export const winRate = (stats: PersonStats) => stats.games ? Math.round(100 * stats.wins / stats.games) : null;
/**
 * Every number people are ranked by (higher is better), for the leaderboard's columns and titles and the places on
 * a person's page. `accuracy10` needs 10 answers, so one lucky guess does not win it.
 */
export const RANKINGS = {
  games: stats => stats.games, wins: stats => stats.wins, winRate, podiums: stats => stats.podiums, points: stats => stats.points,
  right: stats => stats.right, wrong: stats => stats.wrong, accuracy: stats => accuracy(stats), accuracy10: stats => accuracy(stats, 10),
  minigames: stats => stats.minigames, arcadeWins: stats => stats.arcadeWins, duelsPlayed: stats => stats.duelsWon + stats.duelsLost + stats.duelsDrawn,
  duelsWon: stats => stats.duelsWon, duelsLost: stats => stats.duelsLost, biggestWin: stats => stats.biggestWin,
} satisfies Record<string, (stats: PersonStats) => number | null>;
export type RankingKey = keyof typeof RANKINGS;
const RankingKeySchema = z.enum(Object.keys(RANKINGS) as [RankingKey, ...RankingKey[]]);
/** The leaderboard's titles: the top three for each. */
export const LEADERBOARD_TITLES = ['wins', 'right', 'wrong', 'accuracy10', 'games', 'arcadeWins', 'duelsWon', 'biggestWin'] as const satisfies readonly RankingKey[];
export const LeaderboardQuerySchema = z.object({ sort: RankingKeySchema.default('wins'), page: z.coerce.number().int().min(0).max(100_000).default(0) }).strict();
/** One page of the leaderboard (everyone, sorted by `sort`), with the titles over everyone. */
export const LeaderboardSchema = z.object({
  rows: z.array(z.object({ place: z.number().int().min(1), name: z.string(), stats: PersonStatsSchema }).strict()).max(PEOPLE_PAGE_SIZE),
  total: z.number().int().min(0), page: z.number().int().min(0), pageSize: z.number().int().min(1),
  titles: z.array(z.object({ key: RankingKeySchema, top: z.array(z.object({ personId: z.uuid(), name: z.string(), value: z.number() }).strict()).max(3) }).strict()),
  // False while nobody with a personal key has played anything yet.
  played: z.boolean(),
}).strict();
export type Leaderboard = z.infer<typeof LeaderboardSchema>;
/** One person's totals and their place among everyone for each ranking (null without a number to rank). */
export const PersonStandingSchema = z.object({ stats: PersonStatsSchema, places: z.record(RankingKeySchema, z.number().int().min(1).nullable()), of: z.number().int().min(0) }).strict();
export type PersonStanding = z.infer<typeof PersonStandingSchema>;

/**
 * Groups of people (Admin → People → Groups): a name and its members, so the host can add
 * a whole group to a room at once instead of ticking 20 people one by one. Owner only.
 */
/** Members A–Z: `names[i]` is the name of `personIds[i]`. */
export const PersonGroupSchema = z.object({ id: z.uuid(), name: z.string(), personIds: z.array(z.uuid()), names: z.array(z.string()) }).strict();
/** The most people one group holds. */
export const MAX_GROUP_MEMBERS = 500;
export type PersonGroup = z.infer<typeof PersonGroupSchema>;
export const PersonGroupListSchema = z.object({ groups: z.array(PersonGroupSchema) }).strict();
export const NewPersonGroupSchema = z.object({ name: PersonNameSchema }).strict();
/** A new name, the whole member list, or both. Unknown or removed people are left out. */
export const UpdatePersonGroupSchema = z.object({ name: PersonNameSchema.optional(), personIds: z.array(z.uuid()).max(MAX_GROUP_MEMBERS).optional() }).strict()
  .refine(value => value.name !== undefined || value.personIds !== undefined, 'Nothing to change');
/** Adds (or takes out) everyone whose name contains `search` (everyone when empty), on every page at once. */
export const GroupMatchesSchema = z.object({ search: z.string().trim().max(40), add: z.boolean() }).strict();
