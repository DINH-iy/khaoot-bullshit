import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { GameKeySchema, SubmissionValueSchema } from '@party/contracts';
import type { DecisionReason, StageRun } from '../generated/prisma/client.js';
import type { GameDefinition } from './definition.js';
import { requireGame } from './errors.js';
import { routeEdge, type RouteStage } from './graph.js';
import type { Transaction } from './model.js';
import { gameLineupForRound } from './teams.js';

// Route choices. Votes are ordinary submissions (a `choice` naming an option).
// The voters are fixed when the vote opens. Closing tallies once; the outcome is
// one immutable RouteDecision row, written with the closing command. A recorded
// random pick is stored with its candidates, so nothing is ever drawn twice.
export const RoutePresentationSchema = z.object({ formatVersion: z.literal(1), // No length cap: rooms have no player cap, and whatever is stored must read back.
  voterKeys: z.array(z.string().min(1).max(160)) }).strict();
export const readRoute = (presentation: unknown) => {
  const parsed = RoutePresentationSchema.safeParse((presentation as { route?: unknown } | null)?.route);
  requireGame(parsed.success, 'INVALID_STATE'); return parsed.data;
};
const Counts = z.array(z.object({ optionKey: GameKeySchema, count: z.number().int().min(0) }).strict());
export const RouteSnapshotSchema = z.object({
  formatVersion: z.literal(1), optionKey: GameKeySchema, method: z.enum(['players', 'captains', 'host']), voterCount: z.number().int().min(0),
  counts: Counts, leaders: z.array(GameKeySchema), resolution: z.enum(['majority', 'host', 'default', 'random']),
  random: z.object({ candidates: z.array(GameKeySchema).min(1), index: z.number().int().min(0) }).strict().nullable(),
  closedBy: z.enum(['close', 'timeout', 'decide']),
}).strict();
export type RouteSnapshot = z.infer<typeof RouteSnapshotSchema>;
export type RouteCounts = z.infer<typeof Counts>;
export interface RouteDecisionEffect { stageRunId: string; selectedEdgeKey: string; destinationNodeKey: string; reason: DecisionReason; voteSnapshot: RouteSnapshot }

/** Who may vote, fixed when the vote opens: every present player, each team's captain (one vote per team), or nobody (the host decides). */
export async function openRoute(tx: Transaction, sessionId: string, stage: RouteStage, presentIds: string[]) {
  if (stage.decide.method === 'host') return { eligibility: [], lineupId: null, presentation: { route: { formatVersion: 1, voterKeys: [] } } };
  if (stage.decide.method === 'players') return { eligibility: presentIds, lineupId: null, presentation: { route: { formatVersion: 1, voterKeys: presentIds.map(id => `player:${id}`) } } };
  // Captains: the game's teams (late joiners placed as in any game-team round). A team whose captain is absent gets no vote.
  const lineup = await gameLineupForRound(tx, sessionId, presentIds);
  if (!lineup) return { eligibility: [], lineupId: null, presentation: { route: { formatVersion: 1, voterKeys: [] } } };
  const present = new Set(presentIds);
  const voterKeys = lineup.members.filter(member => member.isCaptain && present.has(member.playerId)).map(member => `team:${member.teamId}`);
  return { eligibility: lineup.members.map(member => member.playerId).filter(id => present.has(id)), lineupId: lineup.id,
    presentation: { route: { formatVersion: 1, voterKeys: [...new Set(voterKeys)] }, teamPlay: { answers: 'captain', points: 'team' } } };
}

/** Valid votes per option, in the order the game lists them. */
export function tallyRoute(stage: RouteStage, votes: { actorKey: string; value: unknown }[], voterKeys: string[]): RouteCounts {
  const allowed = new Set(voterKeys); const counts = new Map(stage.options.map(option => [option.key, 0]));
  for (const vote of votes) {
    const value = SubmissionValueSchema.safeParse(vote.value);
    if (allowed.has(vote.actorKey) && value.success && value.data.kind === 'choice' && counts.has(value.data.choiceKey)) counts.set(value.data.choiceKey, counts.get(value.data.choiceKey)! + 1);
  }
  return stage.options.map(option => ({ optionKey: option.key, count: counts.get(option.key)! }));
}

export type Pending = 'tie' | 'no-votes' | 'host';
export function leadersOf(counts: RouteCounts): string[] {
  const top = Math.max(...counts.map(row => row.count));
  return top === 0 ? [] : counts.filter(row => row.count === top).map(row => row.optionKey);
}
/** Why a closed vote has not decided itself yet, or null when the rules decide it. */
export function pendingReason(counts: RouteCounts, stage: RouteStage): Pending | null {
  if (stage.decide.method === 'host') return 'host';
  const leaders = leadersOf(counts);
  if (leaders.length === 1) return null;
  if (leaders.length === 0) return stage.decide.noVotes === 'host' ? 'no-votes' : null;
  return stage.decide.tie === 'host' ? 'tie' : null;
}

/**
 * The rules for a closed vote: the most votes wins. Nobody voting follows
 * `noVotes`; a tie follows `tie`. A default route only settles a tie when it is
 * among the tied routes, so a default never beats routes people voted for.
 */
export function resolveTally(counts: RouteCounts, stage: RouteStage, draw: (max: number) => number = randomInt):
  { optionKey: string; reason: DecisionReason; resolution: RouteSnapshot['resolution']; leaders: string[]; random: RouteSnapshot['random'] } | { pending: Pending } {
  const pending = pendingReason(counts, stage); if (pending) return { pending };
  if (stage.decide.method === 'host') return { pending: 'host' };
  const leaders = leadersOf(counts);
  const pick = (candidates: string[], reason: DecisionReason) => { const index = draw(candidates.length); return { optionKey: candidates[index]!, reason, resolution: 'random' as const, leaders, random: { candidates, index } }; };
  if (leaders.length === 1) return { optionKey: leaders[0]!, reason: 'VOTE', resolution: 'majority', leaders, random: null };
  if (leaders.length === 0) {
    if (stage.decide.noVotes === 'default') return { optionKey: stage.defaultOptionKey!, reason: 'FALLBACK', resolution: 'default', leaders, random: null };
    return pick(stage.options.map(option => option.key), 'FALLBACK');
  }
  if (stage.decide.tie === 'default' && leaders.includes(stage.defaultOptionKey!)) return { optionKey: stage.defaultOptionKey!, reason: 'TIE_BREAK', resolution: 'default', leaders, random: null };
  return pick(leaders, 'TIE_BREAK');
}

export function decisionFor(definition: GameDefinition, run: StageRun, stage: RouteStage, outcome: { optionKey: string; reason: DecisionReason }, snapshot: Omit<RouteSnapshot, 'formatVersion' | 'optionKey' | 'method'>): RouteDecisionEffect {
  const edge = routeEdge(definition, run.nodeKey, outcome.optionKey); requireGame(edge, 'INVALID_STATE');
  return { stageRunId: run.id, selectedEdgeKey: edge.key, destinationNodeKey: edge.to, reason: outcome.reason,
    voteSnapshot: RouteSnapshotSchema.parse({ formatVersion: 1, optionKey: outcome.optionKey, method: stage.decide.method, ...snapshot }) };
}
export async function countsFor(tx: Transaction, run: StageRun, stage: RouteStage) {
  const route = readRoute(run.presentation);
  const votes = await tx.submission.findMany({ where: { stageRunId: run.id }, select: { actorKey: true, value: true } });
  return { counts: tallyRoute(stage, votes, route.voterKeys), voterCount: route.voterKeys.length };
}
/** Tallies a closing vote. Returns the decision, or null when the host must decide (tie, nobody voted, host method). */
export async function closeRoute(tx: Transaction, definition: GameDefinition, run: StageRun, stage: RouteStage, closedBy: 'close' | 'timeout'): Promise<RouteDecisionEffect | null> {
  const { counts, voterCount } = await countsFor(tx, run, stage);
  const outcome = resolveTally(counts, stage);
  if ('pending' in outcome) return null;
  return decisionFor(definition, run, stage, outcome, { voterCount, counts, leaders: outcome.leaders, resolution: outcome.resolution, random: outcome.random, closedBy });
}
