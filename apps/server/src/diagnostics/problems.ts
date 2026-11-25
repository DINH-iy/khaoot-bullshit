import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ServerProblem } from '@party/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';
import { GameError } from '../game/errors.js';
import { RoomError } from '../rooms/security.js';

/**
 * The server's own unexpected errors, saved next to the device logs so the owner sees why a phone was told
 * "That did not work". Expected refusals (TOO_LATE, RATE_LIMITED…) are not problems and are not saved.
 * Saving is fire-and-forget and bounded: the same error is saved once a minute, at most 30 a minute in all,
 * and a slow database never holds up the request that failed.
 */
export type ProblemInput = {
  where: string; error: unknown; actor?: string;
  request?: FastifyRequest; sessionId?: string | null;
};
type ProblemLog = { record(input: ProblemInput): void };
const logs = new WeakMap<FastifyInstance, ProblemLog>();
const REPEAT_MS = 60_000; const PER_MINUTE = 30; const IN_FLIGHT = 4; const STACK_LINES = 6;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The error behind a refusal the browser only saw as GAME_UNAVAILABLE, or undefined for an ordinary refusal. */
export function unexpectedCause(error: unknown): unknown {
  if (error instanceof GameError) return error.code === 'GAME_UNAVAILABLE' ? error.cause ?? error : undefined;
  if (error instanceof RoomError) return error.code === 'GAME_UNAVAILABLE' ? error : undefined;
  return error ?? new Error('Unknown failure');
}

export function describeProblem(where: string, cause: unknown, actor = 'unknown'): ServerProblem {
  const error = cause instanceof Error ? cause : new Error(String(cause));
  const stack = (error.stack ?? '').split('\n').slice(1).map(line => line.trim()).filter(Boolean).slice(0, STACK_LINES).map(line => line.slice(0, 300));
  return { where: where.slice(0, 160), message: `${error.name}: ${error.message}`.replace(/\s+/g, ' ').slice(0, 600), stack, actor };
}

/** "POST /api/arcade/lobbies/:lobbyId/start": the route pattern, never ids, queries or keys. */
export const routeOf = (request: FastifyRequest) => `${request.method} ${request.routeOptions.url ?? 'unmatched'}`;

export function registerProblemLog(app: FastifyInstance, client: PrismaClient | undefined) {
  const recent = new Map<string, number>(); let minute = { ends: 0, count: 0 }; let inFlight = 0;
  logs.set(app, {
    record({ where, error, actor, request, sessionId }) {
      const cause = unexpectedCause(error); if (cause === undefined) return;
      const place = request ? `${routeOf(request)}${where ? ` (${where})` : ''}` : where;
      const problem = describeProblem(place, cause, actor);
      app.log.error({ err: cause, event: 'server_problem', where: problem.where, requestId: request?.id }, 'Unexpected server error');
      if (!client) return;
      const now = Date.now(); const key = `${problem.where}|${problem.message}`;
      if ((recent.get(key) ?? 0) > now) return;
      if (minute.ends <= now) { minute = { ends: now + 60_000, count: 0 }; for (const [id, until] of recent) if (until <= now) recent.delete(id); }
      if (++minute.count > PER_MINUTE || inFlight >= IN_FLIGHT || recent.size > 500) return;
      recent.set(key, now + REPEAT_MS); inFlight++;
      const params = request?.params as { sessionId?: unknown; lobbyId?: unknown; id?: unknown } | undefined;
      const room = sessionId ?? (typeof params?.sessionId === 'string' && uuid.test(params.sessionId) ? params.sessionId : null);
      const lobby = typeof params?.lobbyId === 'string' && uuid.test(params.lobbyId) ? params.lobbyId : null;
      void client.deviceLog.create({ data: {
        id: randomUUID(), source: 'SERVER', reason: 'server_error', summary: `${problem.message.slice(0, 200)} · ${problem.where}`.slice(0, 300),
        sessionId: room, lobbyId: lobby, playerId: null, role: 'server', requestId: request?.id ?? null, details: problem,
      } }).catch(() => app.log.warn({ event: 'server_problem_not_saved' }, 'A server problem could not be saved')).finally(() => { inFlight--; });
    },
  });
}

/** Saves an unexpected error for the owner's logs (and writes it to the server log). Ordinary refusals are skipped. */
export function recordProblem(app: FastifyInstance, input: ProblemInput) { logs.get(app)?.record(input); }
