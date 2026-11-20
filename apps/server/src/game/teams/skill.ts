import type { Transaction } from '../model.js';

/**
 * Use recent revealed individual awards. Percentile ranks keep games with
 * different scoring scales comparable. One neutral observation tempers sparse history.
 */
export async function teamRatings(tx: Transaction, sessionId: string, playerIds: string[]): Promise<Map<string, number>> {
  if (!playerIds.length) return new Map();
  const seats = await tx.sessionPlayer.findMany({ where: { sessionId, id: { in: playerIds } }, select: { id: true, personId: true } });
  const known = [...new Set(seats.flatMap(seat => seat.personId ? [seat.personId] : []))];
  const host = await tx.gameSession.findUniqueOrThrow({ where: { id: sessionId }, select: { hostId: true } });
  const previous = known.length ? await tx.gameSession.findMany({
    where: { id: { not: sessionId }, hostId: host.hostId, status: 'FINISHED', mode: 'LIVE', players: { some: { personId: { in: known } } } },
    orderBy: { endedAt: 'desc' }, take: 8, select: { id: true },
  }) : [];
  const rooms = [sessionId, ...previous.map(room => room.id)];
  const [awards, participants, players] = await Promise.all([
    tx.scoreEntry.groupBy({
      by: ['sessionId', 'recipientPlayerId'],
      where: { sessionId: { in: rooms }, recipientPlayerId: { not: null }, kind: 'AWARD', stage: { revealedAt: { not: null } } },
      _sum: { amountMilli: true },
    }),
    tx.submission.groupBy({
      by: ['sessionId', 'playerId'],
      where: { sessionId: { in: rooms }, slotKey: 'answer', playerId: { not: null }, stage: {
        revealedAt: { not: null }, scores: { some: { recipientPlayerId: { not: null }, kind: 'AWARD' } },
      } },
    }),
    tx.sessionPlayer.findMany({ where: { sessionId: { in: rooms }, OR: [{ id: { in: playerIds } }, { personId: { in: known } }] },
      select: { id: true, personId: true } }),
  ]);
  const observations = new Map<string, number[]>();
  const identities = new Map(players.map(player => [player.id, player.personId ?? player.id]));
  for (const room of rooms) {
    const points = new Map(participants.filter(entry => entry.sessionId === room).map(entry => [entry.playerId!, 0n]));
    for (const award of awards) if (award.sessionId === room) points.set(award.recipientPlayerId!, award._sum.amountMilli ?? 0n);
    const ranked = [...points].sort((a, b) => a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);
    if (ranked.length < 2) continue;
    const recorded = new Set<string>();
    for (let first = 0; first < ranked.length;) {
      let last = first + 1;
      while (last < ranked.length && ranked[last]![1] === ranked[first]![1]) last++;
      const rating = (first + last - 1) / (2 * (ranked.length - 1));
      for (const [playerId] of ranked.slice(first, last)) {
        const identity = identities.get(playerId);
        if (!identity || recorded.has(identity)) continue;
        recorded.add(identity);
        const values = observations.get(identity) ?? [];
        values.push(rating);
        observations.set(identity, values);
      }
      first = last;
    }
  }
  return new Map(seats.map(seat => {
    const values = observations.get(seat.personId ?? seat.id) ?? [];
    return [seat.id, (values.reduce((sum, value) => sum + value, 0) + 0.5) / (values.length + 1)];
  }));
}

/** Preserve team capacities. Spread high and low ratings against each team's expected average. */
export function skillTeams(players: string[], sizes: number[], ratings: ReadonlyMap<string, number>) {
  const included = players.slice(0, sizes.reduce((sum, size) => sum + size, 0));
  const average = included.reduce((sum, player) => sum + (ratings.get(player) ?? 0.5), 0) / Math.max(1, included.length);
  const assignment: Record<string, number | null> = Object.fromEntries(players.map(id => [id, null]));
  const teams = sizes.map((capacity, index) => ({ capacity, index, used: 0, difference: 0 })).filter(team => team.capacity > 0);
  const deltas = included.map(id => ({ id, delta: (ratings.get(id) ?? 0.5) - average }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  for (const { id, delta } of deltas) {
    const available = teams.filter(team => team.used < team.capacity);
    const direction = delta < 0 ? -1 : 1;
    const team = available.sort((a, b) => direction * (a.difference / a.capacity - b.difference / b.capacity)
      || a.used / a.capacity - b.used / b.capacity)[0]!;
    team.used++;
    team.difference += delta;
    assignment[id] = team.index;
  }
  return assignment;
}
