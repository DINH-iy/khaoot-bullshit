import type { PrismaClient } from '../generated/prisma/client.js';

/** For a round's room: its arcade lobby, and whether this player is the lobby's leader. Null for every other room. */
export async function arcadeLink(client: PrismaClient, sessionId: string, playerId: string | null) {
  const round = await client.arcadeRound.findUnique({ where: { sessionId }, select: { id: true, lobbyId: true, lobby: { select: { leaderId: true } } } });
  if (!round) return null;
  const leaderSeat = round.lobby.leaderId && playerId ? await client.arcadeSeat.findUnique({ where: { roundId_memberId: { roundId: round.id, memberId: round.lobby.leaderId } }, select: { playerId: true } }) : null;
  return { lobbyId: round.lobbyId, leader: Boolean(leaderSeat && leaderSeat.playerId === playerId) };
}
