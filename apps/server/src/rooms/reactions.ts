import type { Server, Socket } from 'socket.io';
import { ReactionSchema } from '@party/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { Principal } from './gateway.js';
import { readRoomState } from './reclaim.js';

/** Per room: at most 25 a second reach the screen, whatever the per-player limit. */
const ROOM_PER_SECOND = 25;
interface Rules { on: boolean; limit: number; choices: Set<number> }

/**
 * Emoji and stickers from phones, floating up on the shared screen. Passed on
 * at once and never stored. Only players send; only the shared screen and the
 * host receive. The host can switch them off for the room.
 */
export function registerReactions(io: Server, client: PrismaClient) {
  // The room's settings: on or off, reactions per player per 10 seconds, and which reactions are allowed.
  const cached = new Map<string, { at: number; rules: Rules }>();
  const rules = async (sessionId: string): Promise<Rules> => {
    const hit = cached.get(sessionId); if (hit && Date.now() - hit.at < 2000) return hit.rules;
    const room = await client.gameSession.findUnique({ where: { id: sessionId }, select: { state: true, status: true } });
    const state = readRoomState(room?.state);
    const result = { on: Boolean(room && room.status !== 'FINISHED' && state.reactions), limit: state.reactionLimit, choices: new Set(state.reactionChoices) };
    cached.set(sessionId, { at: Date.now(), rules: result }); if (cached.size > 1024) cached.delete(cached.keys().next().value!);
    return result;
  };
  const roomRate = new Map<string, { second: number; count: number }>();
  // Each player's recent reactions (all their phones and tabs together), for the "per 10 seconds" limit.
  const sent = new Map<string, number[]>();
  let next = 0;
  return {
    /** Forget a room's cached setting after the host changed it. */
    settingsChanged(sessionId: string) { cached.delete(sessionId); },
    connect(socket: Socket, principal: Principal) {
      if (principal.actor.role !== 'player') return;
      const playerId = principal.actor.playerId; const sessionId = principal.sessionId;
      socket.on('room.react', (input: unknown) => {
        const now = Date.now(); const parsed = ReactionSchema.safeParse(input); if (!parsed.success) return;
        void rules(sessionId).then(room => {
          if (!room.on || !room.choices.has(parsed.data.reaction)) return;
          const key = `${sessionId}:${playerId}`; const recent = (sent.get(key) ?? []).filter(at => now - at < 10_000);
          if (recent.length >= room.limit) return; recent.push(now); sent.delete(key); sent.set(key, recent); if (sent.size > 4096) sent.delete(sent.keys().next().value!);
          const second = Math.floor(now / 1000); const rate = roomRate.get(sessionId);
          if (rate?.second === second && rate.count >= ROOM_PER_SECOND) return;
          roomRate.set(sessionId, { second, count: rate?.second === second ? rate.count + 1 : 1 }); if (roomRate.size > 1024) roomRate.delete(roomRate.keys().next().value!);
          const message = { id: ++next, playerId, reaction: parsed.data.reaction };
          io.to(`display:${sessionId}`).to(`host:${sessionId}`).emit('room.reaction', message);
        }).catch(() => undefined);
      });
    },
  };
}
