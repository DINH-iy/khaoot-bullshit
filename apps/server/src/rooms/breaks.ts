import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client.js';
import { authorize } from '../game/model.js';
import type { createGameService } from '../game/service.js';
import { lockRoom, recordRoomChange, type Principal } from './gateway.js';
import { readRoomState, type RoomState } from './reclaim.js';
import { roomAssert } from './security.js';

/** Players needed for a break: the room's percentage of the players in the room, at least one. */
export const breakVotesNeeded = (percent: number, players: number) => Math.max(1, Math.ceil(players * percent / 100));

/**
 * A break pauses the game where it is, for everyone, until the host
 * continues. Players vote for one from their phone; it starts when enough of
 * them agree. The host can call one at any time. The pause itself is the
 * normal audited pause command; the room only remembers that it is a break.
 */
export function createBreaks(client: PrismaClient, service: ReturnType<typeof createGameService>) {
  const start = async (sessionId: string) => {
    // The pause may meet a newer revision (an answer just came in): look again once.
    for (let attempt = 0; attempt < 3; attempt++) {
      const session = await client.gameSession.findUniqueOrThrow({ where: { id: sessionId }, select: { hostId: true, revision: true, status: true } });
      if (session.status !== 'RUNNING') return;
      try { await service.execute({ role: 'host', creatorId: session.hostId }, { formatVersion: 1, type: 'session.pause', sessionId, commandId: randomUUID(), expectedRevision: session.revision }); return; }
      catch { /* try again with the new revision */ }
    }
  };
  const update = async (sessionId: string, principal: Principal, change: (state: RoomState, players: number) => RoomState | null) => {
    const begins = await client.$transaction(async tx => {
      await lockRoom(tx, sessionId);
      const session = await tx.gameSession.findUniqueOrThrow({ where: { id: sessionId } }); await authorize(tx, session, principal.actor);
      roomAssert(session.status === 'RUNNING', 'INVALID_STATE');
      const players = await tx.sessionPlayer.count({ where: { sessionId, leftAt: null } });
      const before = readRoomState(session.state); const next = change(before, players); if (!next) return false;
      await tx.gameSession.update({ where: { id: sessionId }, data: { state: { ...next } } });
      await recordRoomChange(tx, sessionId, 'room.break');
      return Boolean(next.breakStartedAt && !before.breakStartedAt);
    });
    if (begins) await start(sessionId);
  };
  return {
    /** A player adds or withdraws their vote; enough votes start the break. */
    vote(sessionId: string, principal: Principal, wants: boolean) {
      roomAssert(principal.actor.role === 'player', 'FORBIDDEN'); const playerId = principal.actor.playerId;
      return update(sessionId, principal, (state, players) => {
        roomAssert(state.breakVotes, 'FORBIDDEN');
        const voters = [...new Set([...state.breakVoters.filter(id => id !== playerId), ...(wants ? [playerId] : [])])];
        return voters.length >= breakVotesNeeded(state.breakPercent, players) ? { ...state, breakVoters: [], breakStartedAt: new Date().toISOString() } : { ...state, breakVoters: voters };
      });
    },
    /** The host calls a break. */
    call(sessionId: string, principal: Principal) {
      roomAssert(principal.role === 'host', 'FORBIDDEN');
      return update(sessionId, principal, state => ({ ...state, breakVoters: [], breakStartedAt: new Date().toISOString() }));
    },
  };
}
