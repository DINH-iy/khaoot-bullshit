import type { Server, Socket } from 'socket.io';
import { MediaControlSchema } from '@party/contracts';
import type { Principal } from './gateway.js';

/** Controls one host may send per second; more are dropped. */
const PER_SECOND = 5;

/**
 * The host's play, pause and restart for the scene's video, song or YouTube clip: passed on at once to the
 * shared screen, which plays the room's media. Never stored; the room pause stays the way to stop everything.
 */
export function registerMediaControl(io: Server) {
  let next = 0;
  return {
    connect(socket: Socket, principal: Principal) {
      if (principal.role !== 'host') return;
      const sessionId = principal.sessionId; let second = 0; let count = 0;
      socket.on('room.mediaControl', (input: unknown) => {
        const now = Math.floor(Date.now() / 1000);
        if (now !== second) { second = now; count = 0; }
        if (++count > PER_SECOND) return;
        const parsed = MediaControlSchema.safeParse(input); if (!parsed.success) return;
        io.to(`display:${sessionId}`).emit('room.mediaControl', { ...parsed.data, id: ++next });
      });
    },
  };
}
