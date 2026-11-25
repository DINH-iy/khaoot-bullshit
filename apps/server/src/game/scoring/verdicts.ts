import { SubmissionValueSchema } from '@party/contracts';
import { requireGame } from '../errors.js';
import { locateRunStage } from '../graph.js';
import type { GameDefinition, StageDefinition } from '../definition.js';
import type { Transaction } from '../model.js';
import { route, teamContext, type Award } from '../teams/teams.js';
import { earned } from './place-awards.js';

// The host overrules a quiz or ordering round on one answer, after the reveal: "count as correct", "not correct
// after all", or back to the round's own scoring. Each verdict is a new answer_verdicts row (the latest counts);
// the points that change are ADJUSTMENT entries in the score ledger, keyed by the answer, so the answer's points
// always end up exactly where the verdict puts them, however often the host changes their mind.

/** Rounds with a right answer, where an answer can be overruled. */
export const checkable = (stage: StageDefinition | undefined): stage is Extract<StageDefinition, { kind: 'collect' }> =>
  stage?.kind === 'collect' && (stage.scoring.kind === 'correct-choice' || stage.scoring.kind === 'correct-order');

/** Whether the round itself scored this answer as correct. */
export function scoredCorrect(stage: StageDefinition, value: unknown): boolean {
  const parsed = SubmissionValueSchema.safeParse(value);
  return parsed.success && earned(stage, parsed.data) !== null;
}

/** The host's current verdict per answer (only answers that have one; null: back to the round's scoring). */
export async function latestVerdicts(tx: Transaction, sessionId: string, submissionIds: string[]): Promise<Map<string, boolean | null>> {
  if (!submissionIds.length) return new Map();
  const rows = await tx.answerVerdict.findMany({ where: { sessionId, submissionId: { in: submissionIds } }, orderBy: { revision: 'asc' }, select: { submissionId: true, correct: true } });
  return new Map(rows.map(row => [row.submissionId, row.correct]));
}

/** Whether an answer counts as correct now: the host's verdict, else the round's own scoring. */
export const countsAsCorrect = (verdict: boolean | null | undefined, scored: boolean) => verdict ?? scored;

const recipient = (entry: { playerId?: string | null | undefined; teamId?: string | null | undefined }) => entry.playerId ? `p:${entry.playerId}` : `t:${entry.teamId}`;

/**
 * Records the host's verdict on one answer and returns the ledger entries that move its points to where the
 * verdict puts them: correct earns what a right answer earns in that round (not the speed places, which were
 * handed out at the reveal); not correct earns nothing; back to the round's scoring restores what it gave.
 */
export async function answerVerdict(tx: Transaction, sessionId: string, definition: GameDefinition, command: { commandId: string; submissionId: string; correct: boolean | null }): Promise<{ awards: Award[]; verdict: { submissionId: string; correct: boolean | null } }> {
  const submission = await tx.submission.findFirst({ where: { id: command.submissionId, sessionId, slotKey: 'answer' }, include: { stage: true } });
  requireGame(submission, 'INELIGIBLE');
  const stage = submission.stage;
  requireGame(stage.revealedAt, 'INVALID_STATE');
  const located = locateRunStage(definition, stage)?.stage;
  requireGame(checkable(located), 'INVALID_COMMAND');
  const scored = scoredCorrect(located, submission.value);
  const before = (await latestVerdicts(tx, sessionId, [submission.id])).get(submission.id) ?? null;
  // A verdict the round already agrees with means: back to the round's own scoring. The same verdict again changes nothing.
  const verdict = command.correct === scored ? null : command.correct;
  requireGame(verdict !== before, 'INVALID_STATE');

  const entries = await tx.scoreEntry.findMany({ where: { sessionId, OR: [
    { awardKey: { startsWith: `answer:${submission.id}` } }, { awardKey: { startsWith: `place:${stage.id}:${submission.id}` } }, { awardKey: { startsWith: `verdict:${submission.id}:` } },
  ] }, select: { awardKey: true, recipientPlayerId: true, recipientTeamId: true, lineupId: true, amountMilli: true } });
  const now = new Map<string, bigint>(); const original = new Map<string, bigint>(); const lineups = new Map<string, string | null>();
  for (const entry of entries) {
    const key = recipient({ playerId: entry.recipientPlayerId, teamId: entry.recipientTeamId });
    now.set(key, (now.get(key) ?? 0n) + entry.amountMilli); lineups.set(key, entry.lineupId);
    if (!entry.awardKey.startsWith('verdict:')) original.set(key, (original.get(key) ?? 0n) + entry.amountMilli);
  }
  const context = await teamContext(tx, stage);
  const wanted = new Map<string, bigint>();
  if (verdict === null) for (const [key, amount] of original) wanted.set(key, amount);
  if (verdict === true) {
    const right = route({ amountMilli: BigInt('awardMilli' in located.scoring ? located.scoring.awardMilli : '0'), stageRunId: stage.id, awardKey: 'verdict', reason: 'verdict' }, { playerId: submission.playerId, teamId: submission.teamId }, context);
    for (const award of right) { wanted.set(recipient(award), award.amountMilli); if (award.lineupId) lineups.set(recipient(award), award.lineupId); }
  }
  const reason = verdict === true ? 'Answer accepted by the host' : verdict === false ? 'Answer not accepted by the host' : 'Back to the round’s own scoring';
  const awards: Award[] = [...new Set([...now.keys(), ...wanted.keys()])].flatMap(key => {
    const delta = (wanted.get(key) ?? 0n) - (now.get(key) ?? 0n); if (delta === 0n) return [];
    const target = key.startsWith('p:') ? { playerId: key.slice(2) } : { teamId: key.slice(2), lineupId: lineups.get(key) ?? context?.lineupId ?? '' };
    return [{ ...target, amountMilli: delta, stageRunId: stage.id, awardKey: `verdict:${submission.id}:${command.commandId}:${key}`, reason, kind: 'ADJUSTMENT' as const }];
  });
  return { awards, verdict: { submissionId: submission.id, correct: verdict } };
}

/** Every answer of a revealed quiz or ordering round, for the host to overrule one. */
export async function hostAnswers(tx: Transaction, sessionId: string, stageRunId: string, stage: StageDefinition) {
  if (!checkable(stage)) return undefined;
  const rows = await tx.submission.findMany({ where: { stageRunId, slotKey: 'answer' }, select: { id: true, playerId: true, teamId: true, value: true }, orderBy: { receivedAt: 'asc' } });
  const verdicts = await latestVerdicts(tx, sessionId, rows.map(row => row.id));
  return rows.map(row => {
    const value = SubmissionValueSchema.safeParse(row.value);
    const answered = value.success && value.data.kind === 'choice' ? { choiceKey: value.data.choiceKey } : value.success && value.data.kind === 'order' ? { keys: value.data.keys } : {};
    return { submissionId: row.id, playerId: row.playerId, teamId: row.teamId, ...answered, correct: scoredCorrect(stage, row.value), verdict: verdicts.get(row.id) ?? null };
  });
}

/** The overruled answers of a revealed round, for every screen. */
export async function publicVerdicts(tx: Transaction, sessionId: string, stageRunId: string) {
  const rows = await tx.submission.findMany({ where: { stageRunId, slotKey: 'answer', verdicts: { some: {} } }, select: { id: true, playerId: true, teamId: true } });
  const verdicts = await latestVerdicts(tx, sessionId, rows.map(row => row.id));
  return rows.flatMap(row => { const correct = verdicts.get(row.id); return correct === null || correct === undefined ? [] : [{ playerId: row.playerId, teamId: row.teamId, correct }]; });
}
