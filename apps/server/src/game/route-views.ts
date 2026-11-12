import type { StageRun } from '../generated/prisma/client.js';
import type { RouteStage } from './graph.js';
import type { Transaction } from './model.js';
import { countsFor, leadersOf, pendingReason, readRoute, RouteSnapshotSchema } from './routes.js';

const reasons = { VOTE: 'vote', HOST: 'host', TIE_BREAK: 'tie-break', FALLBACK: 'fallback' } as const;

/**
 * A route choice for one viewer. The host sees counts, why it is waiting and
 * the decision as soon as they exist. Players and the shared screen see counts
 * only as the game allows, and the decision only once the host announces it.
 * Destinations, later scenes and the tie rules are never sent.
 */
export async function routeView(tx: Transaction, run: StageRun, stage: RouteStage, viewer: { host: boolean; answerKey: string | null; voted: boolean }, sessionRunning: boolean) {
  const route = readRoute(run.presentation);
  const { counts } = await countsFor(tx, run, stage);
  const decision = await tx.routeDecision.findUnique({ where: { stageRunId: run.id } });
  const revealed = Boolean(run.revealedAt);
  const policy = stage.decide.method === 'host' ? 'never' : stage.decide.counts;
  const showCounts = viewer.host || policy === 'live' || (policy === 'reveal' && revealed);
  const snapshot = decision ? RouteSnapshotSchema.parse(decision.voteSnapshot) : null;
  const waiting = run.status === 'CLOSED' && !decision ? pendingReason(counts, stage) ?? null : null;
  return {
    view: {
      method: stage.decide.method, options: stage.options,
      canVote: !viewer.host && run.status === 'ACTIVE' && sessionRunning && !viewer.voted && viewer.answerKey !== null && route.voterKeys.includes(viewer.answerKey),
      counts: showCounts ? counts : null,
      pending: viewer.host ? waiting : null, leaders: viewer.host && waiting ? leadersOf(counts) : null,
      decision: snapshot && decision && (viewer.host || revealed) ? { optionKey: snapshot.optionKey, reason: reasons[decision.reason], resolution: snapshot.resolution } : null,
    },
    voterCount: route.voterKeys.length,
  };
}
