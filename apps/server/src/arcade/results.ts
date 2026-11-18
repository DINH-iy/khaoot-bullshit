import { MINIGAMES, MINIGAME_KEYS, isMinigameKey, type MinigameKey, type SessionView } from '@party/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { Transaction } from '../game/model.js';
import { rankValue } from '../minigames/rules.js';
import { lookOf } from './lobbies.js';
import { payArcadeWins } from '../side-games/earnings.js';

// What a round leaves behind: one row per member who played it, from the
// round's revealed results (the host's view of the room). The lobby's running
// total and the all-time leaderboards are sums and bests over these rows.

export interface Seat { memberId: string; playerId: string; personId: string | null }
export interface ResultRow { memberId: string; personId: string | null; place: number | null; pointsMilli: bigint; value: number | null; bestKey: number | null }

/**
 * Each seat's result in a revealed minigame round: the points it was awarded, its place (its team's in a team
 * round), its measured value and, played alone and ranked, the key the leaderboards compare (lower is better).
 * Empty when the round has no revealed minigame results (it ended before anyone played).
 */
export function roundResults(view: SessionView, game: MinigameKey, seats: Seat[]): ResultRow[] {
  const stage = view.stage; const answer = stage?.reveal?.answer;
  if (!stage?.reveal || answer?.kind !== 'minigame') return [];
  const teams = stage.teams && !stage.teams.forming ? stage.teams.teams : null;
  const ranked = MINIGAMES[game].better !== 'none';
  return seats.map(seat => {
    const points = stage.reveal!.awards.filter(award => award.playerId === seat.playerId).reduce((sum, award) => sum + BigInt(award.amountMilli), 0n);
    const own = answer.entries.find(entry => entry.playerId === seat.playerId);
    const team = teams?.find(entry => entry.memberIds.includes(seat.playerId));
    const place = teams ? (team?.teamId ? answer.entries.find(entry => entry.playerId === null && entry.teamId === team.teamId)?.place ?? null : null) : own?.place ?? null;
    const value = own?.value ?? null;
    const bestKey = !teams && ranked && value !== null ? rankValue(game, MINIGAMES[game].defaults, { value }) : null;
    return { memberId: seat.memberId, personId: seat.personId, place, pointsMilli: points < 0n ? 0n : points, value, bestKey };
  });
}

/** Records a round's results once; a second call for the same round adds nothing. */
export async function recordResults(tx: Transaction, roundId: string, game: MinigameKey, rows: ResultRow[]) {
  if (!rows.length) return;
  await tx.arcadeResult.createMany({ data: rows.map(row => ({ roundId, game, ...row })), skipDuplicates: true });
  // Winning a round earns chips (people with an account), once per seat.
  const winners = rows.filter(row => row.place === 1 && row.personId);
  if (!winners.length) return;
  const round = await tx.arcadeRound.findUniqueOrThrow({ where: { id: roundId }, select: { sessionId: true, seats: { where: { memberId: { in: winners.map(row => row.memberId) } }, select: { playerId: true, memberId: true } } } });
  await payArcadeWins(tx, round.sessionId, round.seats.map(seat => ({ playerId: seat.playerId, personId: winners.find(row => row.memberId === seat.memberId)!.personId })));
}

/** The lobby's running total (everyone who played a round here) and its last round's results. */
export async function lobbyScores(client: PrismaClient, lobbyId: string) {
  const [sums, wins, members, last] = await Promise.all([
    client.arcadeResult.groupBy({ by: ['memberId'], where: { round: { lobbyId } }, _sum: { pointsMilli: true }, _count: { _all: true } }),
    client.arcadeResult.groupBy({ by: ['memberId'], where: { round: { lobbyId }, place: 1 }, _count: { _all: true } }),
    client.arcadeMember.findMany({ where: { lobbyId }, select: { id: true, displayName: true, look: true } }),
    client.arcadeRound.findFirst({ where: { lobbyId, endedAt: { not: null }, results: { some: {} } }, orderBy: { number: 'desc' }, include: { results: true } }),
  ]);
  const byId = new Map(members.map(member => [member.id, member]));
  const totals = sums.flatMap(sum => { const member = byId.get(sum.memberId); return member ? [{ memberId: member.id, displayName: member.displayName, look: lookOf(member),
    pointsMilli: (sum._sum.pointsMilli ?? 0n).toString(), wins: wins.find(row => row.memberId === sum.memberId)?._count._all ?? 0, rounds: sum._count._all }] : []; })
    .sort((a, b) => BigInt(b.pointsMilli) === BigInt(a.pointsMilli) ? b.wins - a.wins : BigInt(b.pointsMilli) > BigInt(a.pointsMilli) ? 1 : -1);
  const lastRound = last && isMinigameKey(last.game) ? { number: last.number, game: last.game, teams: last.teams,
    results: last.results.flatMap(result => { const member = byId.get(result.memberId); return member ? [{ memberId: member.id, displayName: member.displayName, look: lookOf(member), place: result.place, pointsMilli: result.pointsMilli.toString(), value: result.value }] : []; })
      .sort((a, b) => (a.place ?? 999) - (b.place ?? 999) || (BigInt(b.pointsMilli) > BigInt(a.pointsMilli) ? 1 : BigInt(b.pointsMilli) < BigInt(a.pointsMilli) ? -1 : 0)) } : null;
  return { totals, lastRound };
}

/** All-time leaderboards for people: the ten best results per minigame (played alone), and the most wins. */
export async function leaderboard(client: PrismaClient) {
  const best = await client.arcadeResult.groupBy({ by: ['game', 'personId'], where: { personId: { not: null }, bestKey: { not: null } }, _min: { bestKey: true } });
  const wins = await client.arcadeResult.groupBy({ by: ['personId'], where: { personId: { not: null }, place: 1 }, _count: { _all: true } });
  const played = await client.arcadeResult.groupBy({ by: ['personId'], where: { personId: { not: null } }, _count: { _all: true }, _sum: { pointsMilli: true } });
  const ids = [...new Set([...best, ...played].map(row => row.personId!))];
  const people = new Map((await client.person.findMany({ where: { id: { in: ids }, removedAt: null }, select: { id: true, name: true } })).map(person => [person.id, person.name]));
  // The value shown: the key itself (ms; for Stop the clock, ms off the target), or turned back for higher-is-better games (taps, roundness).
  const shown = (game: MinigameKey, key: number) => MINIGAMES[game].better === 'higher' ? -key : key;
  return {
    best: MINIGAME_KEYS.filter(game => MINIGAMES[game].better !== 'none').map(game => ({ game, rows: best
      .filter(row => row.game === game && row._min.bestKey !== null && people.has(row.personId!))
      .sort((a, b) => a._min.bestKey! - b._min.bestKey!).slice(0, 10)
      .map(row => ({ name: people.get(row.personId!)!, value: shown(game, row._min.bestKey!) })) })).filter(entry => entry.rows.length),
    wins: played.filter(row => people.has(row.personId!)).map(row => ({ name: people.get(row.personId!)!, wins: wins.find(entry => entry.personId === row.personId)?._count._all ?? 0,
      rounds: row._count._all, pointsMilli: (row._sum.pointsMilli ?? 0n).toString() }))
      .sort((a, b) => b.wins - a.wins || b.rounds - a.rounds).slice(0, 10),
  };
}
