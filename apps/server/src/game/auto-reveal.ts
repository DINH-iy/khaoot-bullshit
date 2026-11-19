import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { TrustedActor } from './model.js';
import { GameError } from './errors.js';

export async function revealDueStages(client: PrismaClient, service: { execute(actor: TrustedActor, input: unknown): Promise<unknown> },
  deferred: Map<string, number>, now = new Date()) {
  for (const [id, until] of deferred) if (until <= now.getTime()) deferred.delete(id);
  const skipped = [...deferred.keys()];
  const due = await client.$queryRaw<{ id: string; sessionId: string; hostId: string }[]>`
    SELECT stage.id, room.id AS "sessionId", room."hostId"
    FROM game_sessions room
    CROSS JOIN LATERAL (
      SELECT id, status, "revealedAt", "closedAt" FROM stage_runs
      WHERE "sessionId" = room.id ORDER BY number DESC LIMIT 1
    ) stage
    WHERE room.status = 'RUNNING' AND stage.status = 'CLOSED' AND stage."revealedAt" IS NULL
      AND jsonb_typeof(room.state->'autoRevealSeconds') = 'number'
      AND stage."closedAt" + make_interval(secs => (room.state->>'autoRevealSeconds')::double precision) <= ${now}
      AND NOT (stage.id::text = ANY(${skipped}::text[]))
    ORDER BY stage."closedAt" LIMIT 30`;
  for (const stage of due) {
    try {
      await service.execute({ role: 'host', creatorId: stage.hostId },
        { formatVersion: 1, type: 'stage.autoReveal', commandId: randomUUID(), sessionId: stage.sessionId, stageRunId: stage.id });
    } catch (cause) {
      if (!(cause instanceof GameError)) throw cause;
      if (deferred.size < 1000) deferred.set(stage.id, now.getTime() + (cause.code === 'INVALID_STATE' || cause.code === 'DECISION_PENDING' ? 1000 : 5000));
    }
  }
}
