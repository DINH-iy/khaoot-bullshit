import type { Transaction } from '../model.js';
import { teamStandings } from './team-views.js';
import { LineupInfoSchema, type Forming } from './teams.js';

// Where new game teams start when they are made again with "share out" or "host sets" (the other rules
// are counted live in teamStandings). The start is fixed when the host confirms the teams and stored on
// the lineup by team name, so a later lineup replaces it and the same points are never added twice.

const revealedOnly = { OR: [{ stageRunId: null }, { stage: { revealedAt: { not: null } } }] };

/** Each player's own total so far (revealed scores and host corrections only). */
export async function playerTotals(tx: Transaction, sessionId: string): Promise<Map<string, bigint>> {
  const rows = await tx.scoreEntry.groupBy({ by: ['recipientPlayerId'], where: { sessionId, recipientPlayerId: { not: null }, ...revealedOnly }, _sum: { amountMilli: true }, orderBy: { recipientPlayerId: 'asc' } });
  return new Map(rows.map(row => [row.recipientPlayerId!, row._sum.amountMilli ?? 0n]));
}

/**
 * Each player's share of their old team's total: the total divided equally over the team's members (rounded
 * down to a thousandth of a point; the rest of the division is dropped). Players without an old team share nothing.
 */
export async function oldTeamShares(tx: Transaction, sessionId: string): Promise<Map<string, bigint>> {
  const shares = new Map<string, bigint>();
  for (const team of await teamStandings(tx, sessionId, await playerTotals(tx, sessionId))) {
    if (!team.memberIds.length) continue;
    const share = BigInt(team.amountMilli) / BigInt(team.memberIds.length);
    for (const id of team.memberIds) shares.set(id, share);
  }
  return shares;
}

/** What each proposed team would start with (by team index), or null when the rule counts live. */
export async function proposedStarts(tx: Transaction, sessionId: string, forming: Forming, presentIds: string[]): Promise<bigint[] | null> {
  if (forming.scope !== 'game') return null;
  if (forming.carryover === 'manual') return forming.teams.map((_, index) => BigInt(forming.startTotals?.[String(index)] ?? '0'));
  if (forming.carryover !== 'redistribute') return null;
  const shares = await oldTeamShares(tx, sessionId);
  return forming.teams.map((_, index) => presentIds.filter(id => forming.assignment[id] === index).reduce((total, id) => total + (shares.get(id) ?? 0n), 0n));
}

/** The fixed start of a lineup made with "share out" or "host sets": team name -> thousandths of a point. */
export function lineupStart(lineup: { carryover: unknown }): Map<string, bigint> {
  const info = LineupInfoSchema.safeParse(lineup.carryover);
  return new Map(Object.entries(info.success ? info.data.start ?? {} : {}).map(([name, amount]) => [name, BigInt(amount)]));
}
