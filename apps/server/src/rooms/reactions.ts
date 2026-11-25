import type { Server, Socket } from 'socket.io';
import { DEFAULT_SOUNDBOARD, REACTIONS, ReactionSchema, SOUND_COOLDOWN_SECONDS, SOUND_MAX_SECONDS, SoundRequestSchema } from '@party/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { Principal } from './gateway.js';
import { readRoomState } from './reclaim.js';

/** Per room: at most 25 a second reach the screen, whatever the per-player limit. */
const ROOM_PER_SECOND = 25;
interface Rules { on: boolean; finished: boolean; limit: number; choices: Set<number>; own: number; sounds: boolean; soundCount: number }

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
    const room = await client.gameSession.findUnique({ where: { id: sessionId }, select: { state: true, status: true, gameVersion: { select: { definition: true } } } });
    const state = readRoomState(room?.state);
    // The game's own reactions and sounds (the definition was checked when it was saved): only how many there are matters here.
    const definition = room?.gameVersion.definition as { ownReactions?: unknown[]; soundboard?: unknown[] } | undefined;
    const result = { on: Boolean(room && !state.roomClosed && state.reactions), finished: room?.status === 'FINISHED', limit: state.reactionLimit, choices: new Set(state.reactionChoices),
      own: Array.isArray(definition?.ownReactions) ? definition.ownReactions.length : 0,
      sounds: Boolean(room && !state.roomClosed && state.soundboard), soundCount: Array.isArray(definition?.soundboard) ? definition.soundboard.length : DEFAULT_SOUNDBOARD.length };
    cached.set(sessionId, { at: Date.now(), rules: result }); if (cached.size > 1024) cached.delete(cached.keys().next().value!);
    return result;
  };
  const roomRate = new Map<string, { second: number; count: number }>();
  // The soundboard: when each player may play again, and until when the room's current sound plays.
  const soundAt = new Map<string, number>(); const playingUntil = new Map<string, number>();
  // Each player's recent reactions (all their phones and tabs together), for the "per 10 seconds" limit.
  const sent = new Map<string, number[]>();
  let next = 0;
  // How many reactions each player sent, per room, for the end-of-game show. In memory: a restart starts counting again.
  const totals = new Map<string, Map<string, number>>();
  return {
    /** Forget a room's cached setting after the host changed it. */
    settingsChanged(sessionId: string) { cached.delete(sessionId); },
    /** The players who reacted most in this room, and how often; null when nobody did. */
    most(sessionId: string): { playerIds: string[]; count: number } | null {
      const room = totals.get(sessionId); if (!room?.size) return null; const count = Math.max(...room.values());
      return { playerIds: [...room.entries()].filter(([, value]) => value === count).map(([id]) => id), count };
    },
    async showText(sessionId: string, playerId: string, text: string) {
      const settings = await rules(sessionId);
      if (!settings.on || !settings.finished) return false;
      io.to(`display:${sessionId}`).to(`host:${sessionId}`).emit('room.reaction', { id: ++next, playerId, text: text.slice(0, 60) });
      return true;
    },
    connect(socket: Socket, principal: Principal) {
      if (principal.actor.role !== 'player') return;
      const playerId = principal.actor.playerId; const sessionId = principal.sessionId;
      // A sound on the shared screen: one at a time in the room, and each player waits between two.
      socket.on('room.sound', (input: unknown) => {
        const now = Date.now(); const parsed = SoundRequestSchema.safeParse(input); if (!parsed.success) return;
        void rules(sessionId).then(room => {
          if (!room.sounds || parsed.data.sound >= room.soundCount) return;
          const key = `${sessionId}:${playerId}`;
          if ((soundAt.get(key) ?? 0) > now || (playingUntil.get(sessionId) ?? 0) > now) { socket.emit('room.soundBusy', { until: Math.max(soundAt.get(key) ?? 0, playingUntil.get(sessionId) ?? 0) }); return; }
          soundAt.set(key, now + SOUND_COOLDOWN_SECONDS * 1000); playingUntil.set(sessionId, now + SOUND_MAX_SECONDS * 1000);
          if (soundAt.size > 4096) soundAt.delete(soundAt.keys().next().value!); if (playingUntil.size > 1024) playingUntil.delete(playingUntil.keys().next().value!);
          socket.emit('room.soundSent', { until: now + SOUND_COOLDOWN_SECONDS * 1000 });
          io.to(`display:${sessionId}`).to(`host:${sessionId}`).emit('room.sound', { id: ++next, playerId, sound: parsed.data.sound });
        }).catch(() => undefined);
      });
      socket.on('room.react', (input: unknown) => {
        const now = Date.now(); const parsed = ReactionSchema.safeParse(input); if (!parsed.success) return;
        void rules(sessionId).then(room => {
          // A standard reaction the host allows, or one of the game's own (always allowed while reactions are on).
          const reaction = parsed.data.reaction;
          if (!room.on || (reaction < REACTIONS.length ? !room.choices.has(reaction) : reaction - REACTIONS.length >= room.own)) return;
          const key = `${sessionId}:${playerId}`; const recent = (sent.get(key) ?? []).filter(at => now - at < 10_000);
          if (recent.length >= room.limit) return; recent.push(now); sent.delete(key); sent.set(key, recent); if (sent.size > 4096) sent.delete(sent.keys().next().value!);
          const second = Math.floor(now / 1000); const rate = roomRate.get(sessionId);
          if (rate?.second === second && rate.count >= ROOM_PER_SECOND) return;
          roomRate.set(sessionId, { second, count: rate?.second === second ? rate.count + 1 : 1 }); if (roomRate.size > 1024) roomRate.delete(roomRate.keys().next().value!);
          if (!room.finished) {
            const counts = totals.get(sessionId) ?? new Map<string, number>();
            counts.set(playerId, (counts.get(playerId) ?? 0) + 1);
            totals.set(sessionId, counts);
            if (totals.size > 512) totals.delete(totals.keys().next().value!);
          }
          const message = { id: ++next, playerId, reaction: parsed.data.reaction };
          io.to(`display:${sessionId}`).to(`host:${sessionId}`).emit('room.reaction', message);
        }).catch(() => undefined);
      });
    },
  };
}
