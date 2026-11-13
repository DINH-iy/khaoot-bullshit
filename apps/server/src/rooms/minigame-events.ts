import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { GameIdSchema, StrokeSchema, type MinigameSettings } from '@party/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';
import { minigameRules, parseDefinition } from '../game/definition.js';
import { locateStage } from '../game/graph.js';
import { EligibilitySchema } from '../game/model.js';
import { readMinigameRun } from '../minigames/rules.js';
import { relayPlan, TURN_GRACE_MS } from '../minigames/relay.js';
import { teamContext } from '../game/teams.js';
import type { Transaction } from '../game/model.js';
import type { Live } from '../minigames/live.js';
import type { Principal } from './gateway.js';

const TapsSchema = z.object({ stageRunId: GameIdSchema, count: z.number().int().min(0).max(10_000) }).strict();
// A stroke being drawn in Pass the pencil, sent while it grows. `count`: how many strokes the drawer has now (undo makes it smaller).
const LiveStrokeSchema = z.object({ stageRunId: GameIdSchema, turn: z.number().int().min(0).max(63), strokeId: z.number().int().min(0).max(599), stroke: StrokeSchema.nullable(), count: z.number().int().min(0).max(600) }).strict();
interface Running { stageRunId: string; game: string; seconds: number; startsAt: string; goAt: string | null; players: Set<string>; relay: { plan: ReturnType<typeof relayPlan>; teamOf: Map<string, string> } | null }

/**
 * Live minigame traffic next to the durable commands: round-trip pings to
 * phones, the running tap count of a tap race (shown on screens as race bars),
 * and the moment of GO in a reaction duel, announced only when it happens.
 */
export function registerMinigameEvents(io: Server, client: PrismaClient, live: Live, log: { warn: (data: object, message: string) => void }) {
  // What is running per room, read at most once a second per room.
  const cache = new Map<string, { at: number; running: Running | null }>();
  const running = async (sessionId: string, fresh = false): Promise<Running | null> => {
    const hit = cache.get(sessionId); if (!fresh && hit && Date.now() - hit.at < 1000) return hit.running;
    const stage = await client.stageRun.findFirst({ where: { sessionId, status: 'ACTIVE', session: { status: 'RUNNING' } }, orderBy: { number: 'desc' }, include: { session: { select: { gameVersion: { select: { definition: true } } } } } });
    let result: Running | null = null;
    const run = stage ? readMinigameRun(stage.presentation) : null;
    if (stage && run) {
      const entry = locateStage(parseDefinition(stage.session.gameVersion.definition), stage.nodeKey, stage.stageKey);
      if (entry?.stage.kind === 'minigame') {
        const rules = minigameRules(entry.stage); const eligible = EligibilitySchema.safeParse(stage.eligibility);
        const context = rules.game === 'relay-drawing' ? await teamContext(client as unknown as Transaction, stage) : null;
        result = { stageRunId: stage.id, game: rules.game, seconds: rules.game === 'tap-race' ? (rules.settings as { seconds: number }).seconds : 0, startsAt: run.startsAt, goAt: run.goAt, players: new Set(eligible.success ? eligible.data.playerIds : []),
          relay: context ? { plan: relayPlan(context, rules.settings as MinigameSettings<'relay-drawing'>, run), teamOf: context.teamOf } : null };
      }
    }
    cache.set(sessionId, { at: Date.now(), running: result }); if (cache.size > 1024) cache.delete(cache.keys().next().value!);
    return result;
  };

  // GO is announced to the room at its moment; one timer per reaction run.
  const scheduled = new Map<string, ReturnType<typeof setTimeout>>();
  const scheduleGo = async (sessionId: string) => {
    const current = await running(sessionId, true);
    if (!current?.goAt) return;
    const key = `${current.stageRunId}:${current.goAt}`; if (scheduled.has(key)) return;
    const timer = setTimeout(() => { scheduled.delete(key); io.to(`session:${sessionId}`).emit('minigame.go', { stageRunId: current.stageRunId, goAt: current.goAt }); },
      Math.max(0, Date.parse(current.goAt) - Date.now()));
    timer.unref(); scheduled.set(key, timer);
    for (const old of [...scheduled.keys()].slice(0, Math.max(0, scheduled.size - 256))) { clearTimeout(scheduled.get(old)!); scheduled.delete(old); }
  };

  // Race bars: at most four updates a second per race.
  const lastProgress = new Map<string, number>();
  const broadcastProgress = (sessionId: string, stageRunId: string) => {
    const at = Date.now(); if (at - (lastProgress.get(stageRunId) ?? 0) < 250) return; lastProgress.set(stageRunId, at);
    if (lastProgress.size > 256) lastProgress.delete(lastProgress.keys().next().value!);
    io.to(`session:${sessionId}`).emit('minigame.progress', { stageRunId, counts: live.progress(stageRunId) });
  };

  // Each connected phone's ping, by room: measured on connecting, every few seconds, and at once when a minigame starts,
  // so fresh delays are known before anyone plays (also right after a restart, when every room resumes with a countdown).
  const pingers = new Map<string, Set<() => void>>(); const started = new Map<string, string>();
  return {
    /** Call after a room changed: a minigame that just (re)started gets fresh delay measurements, and a reaction duel its GO. */
    roomChanged(sessionId: string) {
      void running(sessionId, true).then(current => {
        if (!current || started.get(sessionId) === current.startsAt) return;
        started.set(sessionId, current.startsAt); if (started.size > 1024) started.delete(started.keys().next().value!);
        for (const ping of pingers.get(sessionId) ?? []) ping();
      }).catch(() => undefined);
      void scheduleGo(sessionId).catch(() => log.warn({ event: 'minigame_go_unavailable' }, 'Could not schedule GO'));
    },
    connect(socket: Socket, principal: Principal) {
      if (principal.actor.role !== 'player') return () => {};
      const playerId = principal.actor.playerId; const sessionId = principal.sessionId;
      // Round trips measured by the server itself, so a phone cannot report a made-up delay (it can only be slower).
      const measure = () => { const start = performance.now(); socket.timeout(3000).emit('room.ping', {}, (error: Error | null) => { if (!error) live.recordLatency(sessionId, playerId, performance.now() - start); }); };
      const ping = setInterval(measure, 4000); ping.unref(); measure();
      const room = pingers.get(sessionId) ?? new Set(); room.add(measure); pingers.set(sessionId, room);
      // Live strokes: only the team's drawer for the running turn, at most ~12 updates a second, passed on to everyone else in the room.
      let lastStroke = 0;
      socket.on('drawing.stroke', (input: unknown) => {
        const at = Date.now(); if (at - lastStroke < 80) return; lastStroke = at;
        const parsed = LiveStrokeSchema.safeParse(input); if (!parsed.success) return;
        void running(sessionId).then(current => {
          const relay = current?.relay; if (!relay || current.stageRunId !== parsed.data.stageRunId) return;
          const teamId = relay.teamOf.get(playerId); const window = relay.plan.turnWindow(parsed.data.turn);
          if (!teamId || parsed.data.turn >= relay.plan.turns || relay.plan.drawerOf(teamId, parsed.data.turn) !== playerId || at < window.from - 2000 || at > window.until + TURN_GRACE_MS) return;
          socket.to(`session:${sessionId}`).emit('drawing.live', { ...parsed.data, teamId, playerId });
        }).catch(() => undefined);
      });
      let lastTap = 0;
      socket.on('minigame.taps', (input: unknown) => {
        const at = Date.now(); if (at - lastTap < 100) return; lastTap = at;
        const parsed = TapsSchema.safeParse(input); if (!parsed.success) return;
        void running(sessionId).then(current => {
          if (!current || current.game !== 'tap-race' || current.stageRunId !== parsed.data.stageRunId || !current.players.has(playerId)) return;
          if (live.recordTaps(current.stageRunId, current.startsAt, current.seconds, playerId, parsed.data.count) !== null) broadcastProgress(sessionId, current.stageRunId);
        }).catch(() => undefined);
      });
      return () => { clearInterval(ping); room.delete(measure); if (!room.size) pingers.delete(sessionId); };
    },
    close() { for (const timer of scheduled.values()) clearTimeout(timer); scheduled.clear(); },
  };
}
