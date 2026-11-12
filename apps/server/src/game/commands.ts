import { randomUUID } from 'node:crypto';
import type { GameCommand, SubmissionValue } from '@party/contracts';
import type { GameSession, StageRun } from '../generated/prisma/client.js';
import { executionStages, type GameDefinition, type StageDefinition } from './definition.js';
import { GameError, requireGame } from './errors.js';
import { actorKey, EligibilitySchema, requireHost, type Transaction, type TrustedActor } from './model.js';

export interface Effect {
  stageRunId: string | null;
  submissionId: string | null;
  award?: { playerId: string; amountMilli: bigint; stageRunId: string; awardKey: string; reason: string };
  judgment?: { playerId: string; amountMilli: bigint; stageRunId: string };
}

async function openStage(tx: Transaction, sessionId: string, number: number, definition: GameDefinition): Promise<StageRun> {
  const entry = executionStages(definition)[number - 1];
  requireGame(entry, 'INVALID_STATE');
  const players = await tx.sessionPlayer.findMany({ where: { sessionId, leftAt: null }, select: { id: true }, orderBy: { id: 'asc' } });
  const stage = await tx.stageRun.create({ data: { sessionId, number, nodeKey: entry.nodeKey, stageKey: entry.stage.key,
    eligibility: { formatVersion: 1, playerIds: players.map(player => player.id) } } });
  await tx.gameSession.update({ where: { id: sessionId }, data: { status: 'RUNNING', currentNodeKey: entry.nodeKey } });
  return stage;
}

function validateValue(value: SubmissionValue, stage: StageDefinition): void {
  requireGame(stage.kind === 'collect', 'INVALID_SUBMISSION');
  requireGame(value.kind === stage.input.kind, 'INVALID_SUBMISSION');
  if (value.kind === 'choice') requireGame(stage.input.kind === 'choice' && stage.input.options.some(option => option.key === value.choiceKey), 'INVALID_SUBMISSION');
  if (value.kind === 'text') requireGame(stage.input.kind === 'text' && value.text.length <= stage.input.maxLength, 'INVALID_SUBMISSION');
  requireGame(value.kind !== 'drawing', 'UNSUPPORTED_FEATURE');
}

export async function applyCommand(tx: Transaction, session: GameSession, definition: GameDefinition, actor: TrustedActor, command: GameCommand): Promise<Effect> {
  const empty: Effect = { stageRunId: null, submissionId: null };
  if (command.type === 'session.create') return empty;
  if (command.type !== 'submission.submit') requireHost(actor);
  if (command.type === 'session.start') {
    requireGame(session.status === 'LOBBY', 'INVALID_STATE');
    return { ...empty, stageRunId: (await openStage(tx, session.id, 1, definition)).id };
  }
  if (command.type === 'session.pause' || command.type === 'session.resume') {
    requireGame(session.status === (command.type === 'session.pause' ? 'RUNNING' : 'PAUSED'), 'INVALID_STATE');
    await tx.gameSession.update({ where: { id: session.id }, data: { status: command.type === 'session.pause' ? 'PAUSED' : 'RUNNING' } });
    return empty;
  }
  requireGame(session.status === 'RUNNING', 'INVALID_STATE');
  const stage = await tx.stageRun.findFirst({ where: { sessionId: session.id, id: command.stageRunId } });
  requireGame(stage && stage.nodeKey === session.currentNodeKey, 'INVALID_STATE');
  const latest = await tx.stageRun.findFirst({ where: { sessionId: session.id }, orderBy: { number: 'desc' }, select: { id: true } });
  requireGame(latest?.id === stage.id, 'INVALID_STATE');
  // Number, not node array order or editor layout, identifies this execution.
  const entry = executionStages(definition)[stage.number - 1];
  requireGame(entry && entry.nodeKey === stage.nodeKey && entry.stage.key === stage.stageKey, 'INVALID_STATE');
  if (command.type === 'stage.advance') {
    requireGame(stage.status === 'CLOSED' && latest?.id === stage.id, 'INVALID_STATE');
    if (stage.number === executionStages(definition).length) {
      await tx.gameSession.update({ where: { id: session.id }, data: { status: 'FINISHED', endedAt: new Date(), currentNodeKey: null } });
      return empty;
    }
    return { ...empty, stageRunId: (await openStage(tx, session.id, stage.number + 1, definition)).id };
  }
  if (command.type === 'stage.close') {
    requireGame(stage.status === 'ACTIVE', 'INVALID_STATE');
    await tx.stageRun.update({ where: { id: stage.id }, data: { status: 'CLOSED', closedAt: new Date() } });
    return { ...empty, stageRunId: stage.id };
  }
  const eligible = EligibilitySchema.safeParse(stage.eligibility);
  requireGame(eligible.success, 'INVALID_STATE');
  if (command.type === 'stage.judge') {
    requireGame(stage.status === 'CLOSED' && entry.stage.kind === 'challenge', 'INVALID_STATE');
    requireGame(eligible.data.playerIds.includes(command.playerId), 'INELIGIBLE');
    const amountMilli = BigInt(command.amountMilli);
    requireGame(amountMilli <= BigInt(entry.stage.maxAwardMilli), 'INVALID_SUBMISSION');
    const prior = await tx.stageJudgment.findUnique({ where: { stageRunId_playerId: { stageRunId: stage.id, playerId: command.playerId } } });
    requireGame(!prior, 'ALREADY_JUDGED');
    return { ...empty, stageRunId: stage.id, judgment: { playerId: command.playerId, amountMilli, stageRunId: stage.id },
      ...(amountMilli === 0n ? {} : { award: { playerId: command.playerId, amountMilli, stageRunId: stage.id, awardKey: `judgment:${stage.id}:${command.playerId}`, reason: 'Host judgment' } }) };
  }
  if (command.type === 'submission.submit') {
    requireGame(actor.role === 'player', 'FORBIDDEN');
    requireGame(stage.status === 'ACTIVE', 'INVALID_STATE');
    requireGame(eligible.data.playerIds.includes(actor.playerId), 'INELIGIBLE');
    validateValue(command.value, entry.stage);
    const prior = await tx.submission.findUnique({ where: { stageRunId_actorKey_slotKey: { stageRunId: stage.id, actorKey: actorKey(actor), slotKey: 'answer' } } });
    requireGame(!prior, 'ALREADY_SUBMITTED');
    const submission = await tx.submission.create({ data: { id: randomUUID(), sessionId: session.id, stageRunId: stage.id, actorKey: actorKey(actor), playerId: actor.playerId, value: command.value } });
    const correct = entry.stage.kind === 'collect' && entry.stage.scoring.kind === 'correct-choice' && command.value.kind === 'choice' && command.value.choiceKey === entry.stage.scoring.correctChoiceKey;
    const amountMilli = entry.stage.kind === 'collect' && entry.stage.scoring.kind === 'correct-choice' ? BigInt(entry.stage.scoring.awardMilli) : 0n;
    return { stageRunId: stage.id, submissionId: submission.id,
      ...(correct && amountMilli > 0n ? { award: { playerId: actor.playerId, amountMilli, stageRunId: stage.id, awardKey: `answer:${submission.id}`, reason: 'Correct choice' } } : {}) };
  }
  throw new GameError('INVALID_COMMAND');
}
