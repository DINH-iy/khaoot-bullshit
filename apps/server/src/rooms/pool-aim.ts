import type { Socket } from 'socket.io';
import { PoolAimSchema } from '@party/contracts';
import type { Principal } from './gateway.js';

/** Aim updates one phone may relay per second; extra ones are dropped (the next one carries the newest aim). */
const PER_SECOND = 20;

/**
 * The 8-ball shooter's aim while they line up, passed on at once to everyone else in the room
 * so they see a ghost cue. Never stored: it only matters until the shot is taken. The server
 * adds who sent it; screens draw it only when it comes from the player whose turn it is.
 */
export function registerPoolAim() {
  return {
    connect(socket: Socket, principal: Principal) {
      if (principal.actor.role !== 'player') return;
      const playerId = principal.actor.playerId; const sessionId = principal.sessionId;
      let second = 0; let count = 0;
      socket.on('room.pool-aim', (input: unknown) => {
        const now = Math.floor(Date.now() / 1000);
        if (now !== second) { second = now; count = 0; }
        if (++count > PER_SECOND) return;
        const parsed = PoolAimSchema.safeParse(input); if (!parsed.success) return;
        socket.to(`session:${sessionId}`).volatile.emit('room.pool-aim', { ...parsed.data, playerId });
      });
    },
  };
}
