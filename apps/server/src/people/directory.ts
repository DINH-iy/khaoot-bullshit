import { LEADERBOARD_TITLES, PEOPLE_PAGE_SIZE, RANKINGS, type PersonStats, type RankingKey } from '@party/contracts';
import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import type { Transaction } from '../game/model.js';
import { openPersonKey } from './keys.js';
import { peopleStats } from './stats.js';

// The owner's people, a page at a time (A–Z, optionally searched), however many there are:
// the People page, groups, a room's "Add people" and the editor's invites all read these pages.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Stats are worked out for this many people per batch, so no query grows with everyone at once. */
const STATS_BATCH = 500;

const active = (): Prisma.PersonWhereInput => ({ removedAt: null });
/**
 * Active people whose name contains `search`, ignoring capitals and accents ("anouk" finds "Anoúk"), as SQL for
 * `people`. The search is a value, never SQL; LIKE's own wildcards in it are taken literally.
 */
export const nameMatches = (search: string) => search
  ? Prisma.sql`"removedAt" IS NULL AND unaccent(lower(name)) LIKE '%' || unaccent(lower(${search.replace(/[\\%_]/g, character => `\\${character}`)})) || '%'`
  : Prisma.sql`"removedAt" IS NULL`;
/** Ids of active people matching a search (see nameMatches), A–Z, one page or all. */
export async function matchingIds(db: PrismaClient | Transaction, search: string, page?: { skip: number; take: number }): Promise<string[]> {
  const limit = page ? Prisma.sql`LIMIT ${page.take} OFFSET ${page.skip}` : Prisma.empty;
  return (await db.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM people WHERE ${nameMatches(search)} ORDER BY name, id ${limit}`).map(row => row.id);
}
const rowSelect = {
  id: true, name: true, createdAt: true, canEdit: true, keySealed: true,
  devices: { where: { revokedAt: null }, select: { lastSeenAt: true } },
  _count: { select: { players: true } },
} as const;
type RowSource = Prisma.PersonGetPayload<{ select: typeof rowSelect }>;

/** People as the pages show them: phones, last seen, games, chips and (for the People page) their key. */
async function toRows(client: PrismaClient, people: RowSource[], keys: string | null) {
  const sums = people.length ? await client.chipEntry.groupBy({ by: ['personId', 'reason'], where: { personId: { in: people.map(person => person.id) } }, _sum: { amount: true } }) : [];
  const total = (id: string, reasons: string[]) => sums.filter(row => row.personId === id && reasons.includes(row.reason)).reduce((sum, row) => sum + (row._sum.amount ?? 0), 0);
  return people.map(person => ({
    id: person.id, name: person.name, createdAt: person.createdAt.toISOString(), devices: person.devices.length,
    lastSeenAt: person.devices.reduce<Date | null>((latest, device) => !latest || device.lastSeenAt > latest ? device.lastSeenAt : latest, null)?.toISOString() ?? null,
    games: person._count.players, chips: total(person.id, ['START', 'REFILL', 'BET', 'PAYOUT']), wagered: -total(person.id, ['BET']),
    canEdit: person.canEdit, hasKey: person.keySealed !== null,
    ...(keys ? { key: openPersonKey(keys, person.keySealed) } : {}),
  }));
}

/** One page of people A–Z; `keys` is the room secret when the keys themselves are wanted. */
export async function peoplePage(client: PrismaClient, query: { search: string; page: number }, keys: string | null) {
  const [ids, [counted]] = await Promise.all([
    matchingIds(client, query.search, { skip: query.page * PEOPLE_PAGE_SIZE, take: PEOPLE_PAGE_SIZE }),
    client.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total FROM people WHERE ${nameMatches(query.search)}`,
  ]);
  const found = new Map((await client.person.findMany({ where: { id: { in: ids } }, select: rowSelect })).map(person => [person.id, person]));
  const people = ids.map(id => found.get(id)).filter(person => person !== undefined);
  return { people: await toRows(client, people, keys), total: counted?.total ?? 0, page: query.page, pageSize: PEOPLE_PAGE_SIZE };
}

/** One person, or null when there is no such (active) person. */
export async function personRow(client: PrismaClient, id: string, keys: string) {
  const person = await client.person.findFirst({ where: { id, removedAt: null }, select: rowSelect });
  return person ? (await toRows(client, [person], keys))[0]! : null;
}

export async function peopleSummary(client: PrismaClient, now = new Date()) {
  const signedIn = { some: { revokedAt: null } };
  const [people, editors, seenThisWeek, neverSignedIn, phones] = await Promise.all([
    client.person.count({ where: active() }),
    client.person.count({ where: { ...active(), canEdit: true } }),
    client.person.count({ where: { ...active(), devices: { some: { revokedAt: null, lastSeenAt: { gt: new Date(now.getTime() - WEEK_MS) } } } } }),
    client.person.count({ where: { ...active(), NOT: { devices: signedIn } } }),
    client.personDevice.count({ where: { revokedAt: null, person: active() } }),
  ]);
  return { people, editors, seenThisWeek, neverSignedIn, phones };
}

/** Everyone's totals with their names, worked out in batches. */
async function everyone(client: PrismaClient) {
  const people: { id: string; name: string }[] = []; let cursor: string | undefined;
  for (;;) {
    const batch = await client.person.findMany({ where: active(), orderBy: { id: 'asc' }, take: STATS_BATCH, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}), select: { id: true, name: true } });
    people.push(...batch); if (batch.length < STATS_BATCH) break; cursor = batch.at(-1)!.id;
  }
  const stats: PersonStats[] = [];
  for (let start = 0; start < people.length; start += STATS_BATCH) stats.push(...await peopleStats(client, people.slice(start, start + STATS_BATCH).map(person => person.id)));
  const names = new Map(people.map(person => [person.id, person.name]));
  return stats.map(row => ({ stats: row, name: names.get(row.personId)! }));
}

/** Place among everyone: 1 + how many have more (ties share it); null without a number. */
const placeOf = (all: PersonStats[], mine: PersonStats, key: RankingKey) => {
  const value = RANKINGS[key](mine);
  return value ? 1 + all.filter(row => (RANKINGS[key](row) ?? -1) > value).length : null;
};

/** One page of everyone sorted by `sort` (then points, then name), and the top three of each title. */
export async function leaderboard(client: PrismaClient, query: { sort: RankingKey; page: number }) {
  const all = await everyone(client); const pick = RANKINGS[query.sort]; const stats = all.map(row => row.stats);
  const sorted = [...all].sort((a, b) => (pick(b.stats) ?? -1) - (pick(a.stats) ?? -1) || b.stats.points - a.stats.points || a.name.localeCompare(b.name));
  const rows = sorted.slice(query.page * PEOPLE_PAGE_SIZE, (query.page + 1) * PEOPLE_PAGE_SIZE)
    .map(row => ({ place: 1 + sorted.filter(other => (pick(other.stats) ?? -1) > (pick(row.stats) ?? -1)).length, name: row.name, stats: row.stats }));
  const titles = LEADERBOARD_TITLES.map(key => ({ key, top: all.map(row => ({ personId: row.stats.personId, name: row.name, value: RANKINGS[key](row.stats) }))
    .filter((row): row is { personId: string; name: string; value: number } => !!row.value)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)).slice(0, 3) }));
  const played = stats.some(row => row.games || row.arcadeRounds || row.duelsWon + row.duelsLost + row.duelsDrawn || row.sideRounds);
  return { rows, total: all.length, page: query.page, pageSize: PEOPLE_PAGE_SIZE, titles, played };
}

/** One person's totals and their place among everyone for each ranking. Null when there is no such person. */
export async function standing(client: PrismaClient, id: string) {
  const all = (await everyone(client)).map(row => row.stats); const mine = all.find(row => row.personId === id);
  if (!mine) return null;
  return { stats: mine, places: Object.fromEntries((Object.keys(RANKINGS) as RankingKey[]).map(key => [key, placeOf(all, mine, key)])), of: all.length };
}
