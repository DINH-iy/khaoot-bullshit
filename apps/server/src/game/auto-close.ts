import type { GameSession } from '../generated/prisma/client.js';
import type { GameDefinition } from './definition.js';
import { locateStage } from './graph.js';
import { EligibilitySchema, type Transaction } from './model.js';
import { readRoute } from './routes.js';
import { readForming, teamContext } from './teams.js';
import { ACCEPTANCE_GRACE_MS, remainingMs, SETTLE_MS, timerColumns } from './timing.js';

/** How long after the last answer the round closes, so everyone sees "all in" before the result. */
export const ALL_IN_CLOSE_MS = 3000;

/**
 * When everyone who can answer has answered, the round ends in about three
 * seconds instead of waiting for its timer (or for the host, in an untimed
 * round). It shortens the timer, which every screen shows, and the normal
 * timed closing does the rest; the host can still add time. A room setting
 * (`autoClose`, on by default) turns it off.
 */
export async function closeSoonWhenAllIn(tx: Transaction, session: GameSession, definition: GameDefinition, stageRunId: string, now: Date): Promise<void> {
  if ((session.state as { autoClose?: unknown } | null)?.autoClose === false) return;
  const stage = await tx.stageRun.findUnique({ where: { id: stageRunId } });
  if (!stage || stage.status !== 'ACTIVE' || readForming(stage.presentation)) return;
  const entry = locateStage(definition, stage.nodeKey, stage.stageKey);
  if (!entry || ['info', 'scoreboard', 'challenge'].includes(entry.stage.kind)) return;
  // Who still has to answer: each eligible player, or each team when its captain answers for it, or the route's voters.
  const eligible = EligibilitySchema.safeParse(stage.eligibility); if (!eligible.success) return;
  const context = await teamContext(tx, stage);
  const needed = entry.stage.kind === 'route' ? readRoute(stage.presentation).voterKeys.length
    : context && context.answers === 'captain' ? new Set(eligible.data.playerIds.map(id => context.teamOf.get(id)).filter(Boolean)).size
    : eligible.data.playerIds.length;
  const answered = await tx.submission.count({ where: { stageRunId: stage.id, slotKey: 'answer' } });
  if (needed === 0 || answered < needed) return;
  // A deadline that closes the round ALL_IN_CLOSE_MS from now, after the usual grace for answers in flight.
  const wanted = ALL_IN_CLOSE_MS - ACCEPTANCE_GRACE_MS - SETTLE_MS;
  const current = remainingMs(stage, now);
  if (current !== null && current <= wanted) return;
  await tx.stageRun.update({ where: { id: stage.id }, data: timerColumns(wanted, false, now) });
}
