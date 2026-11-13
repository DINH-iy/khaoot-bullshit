import type { Server, Socket } from 'socket.io';
import { ReactionSchema } from '@party/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { Principal } from './gateway.js';
import { readRoomState } from './reclaim.js';

/** Per player: a burst of 6, then one every 300 ms. Per room: at most 25 a second reach the screen. */
const BURST = 6; const REFILL_MS = 300; const ROOM_PER_SECOND = 25;

/**
 * Emoji and stickers from phones, floating up on the shared screen. Passed on
 * at once and never stored. Only players send; only the shared screen and the
 * host receive. The host can switch them off for the room.
 */
export function registerReactions(io: Server, client: PrismaClient) {
  const allowed = new Map<string, { at: number; on: boolean }>();
  const enabled = async (sessionId: string) => {
    const hit = allowed.get(sessionId); if (hit && Date.now() - hit.at < 2000) return hit.on;
    const room = await client.gameSession.findUnique({ where: { id: sessionId }, select: { state: true, status: true } });
    const on = Boolean(room && room.status !== 'FINISHED' && readRoomState(room.state).reactions);
    allowed.set(sessionId, { at: Date.now(), on }); if (allowed.size > 1024) allowed.delete(allowed.keys().next().value!);
    return on;
  };
  const roomRate = new Map<string, { second: number; count: number }>();
  let next = 0;
  return {
    /** Forget a room's cached setting after the host changed it. */
    settingsChanged(sessionId: string) { allowed.delete(sessionId); },
    connect(socket: Socket, principal: Principal) {
      if (principal.actor.role !== 'player') return;
      const playerId = principal.actor.playerId; const sessionId = principal.sessionId;
      let tokens = BURST; let refilled = Date.now();
      socket.on('room.react', (input: unknown) => {
        const now = Date.now(); tokens = Math.min(BURST, tokens + (now - refilled) / REFILL_MS); refilled = now;
        if (tokens < 1) return; tokens -= 1;
        const parsed = ReactionSchema.safeParse(input); if (!parsed.success) return;
        const second = Math.floor(now / 1000); const rate = roomRate.get(sessionId);
        if (rate?.second === second && rate.count >= ROOM_PER_SECOND) return;
        roomRate.set(sessionId, { second, count: rate?.second === second ? rate.count + 1 : 1 }); if (roomRate.size > 1024) roomRate.delete(roomRate.keys().next().value!);
        void enabled(sessionId).then(on => {
          if (!on) return;
          const message = { id: ++next, playerId, reaction: parsed.data.reaction };
          io.to(`display:${sessionId}`).to(`host:${sessionId}`).emit('room.reaction', message);
        }).catch(() => undefined);
      });
    },
  };
}
