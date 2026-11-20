import { ballotTally } from './ballot.js';
import { isSharedPrediction, SubmissionValueSchema, type SubmissionValue } from '@party/contracts';
import type { StageRun } from '../../generated/prisma/client.js';
import { minigameRules, stagePlaces, type StageDefinition } from '../definition.js';
import { minigameOutcome } from '../../minigames/shared/outcome.js';
import { places, readMinigameRun } from '../../minigames/shared/rules.js';
import { route, teamContext, type Award } from '../teams/teams.js';
import { VotePresentationSchema, type Transaction } from '../model.js';

/** The points a correct answer earns as it comes in (quiz and ordering rounds). */
export function earned(stage: StageDefinition, value: SubmissionValue): { amountMilli: bigint; reason: string } | null {
  if (stage.kind !== 'collect') return null;
  const rule = stage.scoring;
  if (rule.kind === 'correct-choice' && value.kind === 'choice' && value.choiceKey === rule.correctChoiceKey) return { amountMilli: BigInt(rule.awardMilli), reason: 'Correct choice' };
  if (rule.kind === 'correct-order' && value.kind === 'order' && value.keys.length === rule.correctOrder.length && value.keys.every((key, index) => key === rule.correctOrder[index])) return { amountMilli: BigInt(rule.awardMilli), reason: 'Correct order' };
  return null;
}

/**
 * Points given once, as a stage is revealed (after everyone has answered):
 * a minigame's places; the fastest correct answers of a quiz or ordering round;
 * the most-voted answers of a vote. Equal results share a place and its points.
 * Award keys are per stage and answer, so a stage can never pay twice.
 */
export async function revealAwards(tx: Transaction, stage: StageRun, definition: StageDefinition): Promise<Award[]> {
  if (definition.kind === 'minigame') {
    const rows = await tx.submission.findMany({ where: { stageRunId: stage.id, slotKey: 'answer' }, select: { playerId: true, teamId: true, value: true, receivedAt: true }, orderBy: { receivedAt: 'asc' } });
    const run = isSharedPrediction(definition.game) ? readMinigameRun(stage.presentation) : undefined;
    return minigameOutcome(minigameRules(definition), rows, await teamContext(tx, stage), stage.id, run).awards;
  }
  const points = stagePlaces(definition);
  if (!points) return [];
  const pointsFor = (place: number | undefined) => place === undefined ? 0n : BigInt(points[place - 1] ?? '0');
  if (definition.kind === 'collect') {
    const rows = await tx.submission.findMany({ where: { stageRunId: stage.id, slotKey: 'answer' }, select: { id: true, playerId: true, teamId: true, receivedAt: true, value: true }, orderBy: { receivedAt: 'asc' } });
    const correct = rows.filter(row => { const value = SubmissionValueSchema.safeParse(row.value); return value.success && earned(definition, value.data) !== null; });
    const placed = places(correct, row => row.receivedAt.getTime());
    const context = await teamContext(tx, stage);
    return correct.flatMap(row => route({ amountMilli: pointsFor(placed.get(row)), stageRunId: stage.id, awardKey: `place:${stage.id}:${row.id}`, reason: `Fastest correct: place ${placed.get(row)}` }, { playerId: row.playerId, teamId: row.teamId }, context));
  }
  if (definition.kind === 'vote') {
    const ballot = VotePresentationSchema.safeParse(stage.presentation);
    if (!ballot.success) return [];
    const candidates = await tx.submission.findMany({ where: { stageRunId: ballot.data.sourceStageRunId, slotKey: 'answer' }, select: { id: true, playerId: true, teamId: true } });
    const votes = await tx.submission.findMany({ where: { stageRunId: stage.id, slotKey: 'answer' }, select: { value: true } });
    const totalsByAnswer = ballotTally(definition, votes);
    // Only answers with at least one vote take a place.
    const tally = candidates.map(candidate => ({ ...candidate, votes: totalsByAnswer.get(candidate.id) ?? 0 })).filter(entry => entry.votes > 0);
    const placed = places(tally, entry => -entry.votes);
    const sourceTeams = await teamContext(tx, await tx.stageRun.findUniqueOrThrow({ where: { id: ballot.data.sourceStageRunId } }));
    return tally.flatMap(entry => route({ amountMilli: pointsFor(placed.get(entry)), stageRunId: stage.id, awardKey: `place:${stage.id}:${entry.id}`, reason: `Most votes: place ${placed.get(entry)}` }, { playerId: entry.playerId, teamId: entry.teamId }, sourceTeams));
  }
  // A challenge's places are given by the host, one judgment at a time.
  return [];
}
