import { randomUUID } from 'node:crypto';
import type { PrismaClient, StageRun } from '../generated/prisma/client.js';
import { GameError } from './errors.js';
import type { TrustedActor } from './model.js';

// Deadline policy. Devices show the nominal deadline. The server compares its
// own receipt time, never a client timestamp, and accepts an answer received up
// to ACCEPTANCE_GRACE_MS later to absorb ordinary phone/network delay. The stage
// then closes SETTLE_MS after acceptance ends, so an on-time answer still
// waiting for the room lock commits before results become visible.
export const ACCEPTANCE_GRACE_MS = 1000;
export const SETTLE_MS = 250;
export const MAX_REMAINING_MS = 24 * 60 * 60 * 1000;
export type Clock = () => Date;

// A drawing still in progress when time runs out is sent by the phone at that moment: it first stores the
// drawing, then answers with it. Two requests take longer than one tap, so drawing rounds get more grace.
export const DRAWING_GRACE_MS = 3000;
/** How long after the deadline a round still takes answers: longer for drawings (see above). */
export const graceFor = (stage: { kind: string; input?: { kind: string } }) => stage.kind === 'collect' && stage.input?.kind === 'drawing' ? DRAWING_GRACE_MS : ACCEPTANCE_GRACE_MS;
export const acceptsUntil = (deadlineAt: Date, grace = ACCEPTANCE_GRACE_MS) => deadlineAt.getTime() + grace;
export const closesAt = (deadlineAt: Date, grace = ACCEPTANCE_GRACE_MS) => acceptsUntil(deadlineAt, grace) + SETTLE_MS;

/** Remaining nominal time of an active stage, or null when it has no limit. */
export function remainingMs(stage: Pick<StageRun, 'deadlineAt' | 'pausedRemainingMs'>, now: Date): number | null {
  if (stage.pausedRemainingMs !== null) return stage.pausedRemainingMs;
  return stage.deadlineAt ? Math.max(0, stage.deadlineAt.getTime() - now.getTime()) : null;
}
/** Columns for a remaining time; a paused room stores the frozen remainder. */
export function timerColumns(remaining: number | null, paused: boolean, now: Date) {
  if (remaining === null) return { deadlineAt: null, pausedRemainingMs: null };
  return paused ? { deadlineAt: null, pausedRemainingMs: remaining } : { deadlineAt: new Date(now.getTime() + remaining), pausedRemainingMs: null };
}

interface TimeoutExecutor { execute(actor: TrustedActor, input: unknown): Promise<unknown> }
const RETRY_AFTER_MS = 30_000;
/**
 * Closes running stages whose deadline, grace and settle time have passed. The
 * deadline lives in PostgreSQL, so this survives restarts and needs no timer
 * per room. Bounded per pass; a room the host just changed is simply skipped.
 * A room whose close fails is retried after a pause and never blocks the others.
 */
export async function closeExpiredStages(client: PrismaClient, service: TimeoutExecutor, clock: Clock = () => new Date(), backoff: Map<string, number> = new Map()): Promise<{ closed: number; failed: number }> {
  const at = clock().getTime();
  for (const [id, until] of backoff) if (until <= at) backoff.delete(id);
  // Rounds with a longer grace (drawings) are found here too early; their close refuses until it is due, and a later pass closes them.
  const cutoff = new Date(at - ACCEPTANCE_GRACE_MS - SETTLE_MS);
  const due = await client.stageRun.findMany({ where: { status: 'ACTIVE', deadlineAt: { lte: cutoff }, session: { status: 'RUNNING' }, ...(backoff.size ? { id: { notIn: [...backoff.keys()] } } : {}) },
    select: { id: true, sessionId: true, session: { select: { hostId: true } } }, orderBy: { deadlineAt: 'asc' }, take: 50 });
  let closed = 0; let failed = 0;
  for (const stage of due) {
    try {
      await service.execute({ role: 'host', creatorId: stage.session.hostId }, { formatVersion: 1, type: 'stage.timeout', sessionId: stage.sessionId, commandId: randomUUID(), stageRunId: stage.id });
      closed++;
    } catch (error) {
      // The host paused, extended or closed it first; the next pass re-reads.
      if (error instanceof GameError && error.code === 'INVALID_STATE') continue;
      failed++;
      if (backoff.size < 1000) backoff.set(stage.id, at + RETRY_AFTER_MS);
    }
  }
  return { closed, failed };
}
