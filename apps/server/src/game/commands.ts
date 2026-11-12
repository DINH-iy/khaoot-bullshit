import { randomUUID } from 'node:crypto';
import { PLAYER_COMMANDS, type GameCommand, type MediaKind, type SubmissionValue } from '@party/contracts';
import type { GameSession, StageRun } from '../generated/prisma/client.js';
import { effectivePlay, isShowOnly, isVoteSource, type GameDefinition, type StageDefinition } from './definition.js';
import { firstStage, locateStage, nextStage, type Located } from './graph.js';
import { closeRoute, countsFor, decisionFor, leadersOf, pendingReason, openRoute, readRoute, type RouteDecisionEffect } from './routes.js';
import { GameError, requireGame } from './errors.js';
import { actorKey, EligibilitySchema, requireHost, VotePresentationSchema, type Transaction, type TrustedActor } from './model.js';
import { acceptsUntil, closesAt, MAX_REMAINING_MS, remainingMs, timerColumns } from './timing.js';
import { formingCommand, gameLineupForRound, readForming, route, startForming, teamContext, type Award, type TeamContext } from './teams.js';

export interface Effect {
  stageRunId: string | null;
  submissionId: string | null;
  awards?: Award[];
  judgments?: { playerId: string; amountMilli: bigint; stageRunId: string }[];
  decision?: RouteDecisionEffect | null;
}

// `number` counts runs in this session (1, 2, 3…); on a branching game it is not a position in the definition.
async function openStage(tx: Transaction, sessionId: string, number: number, entry: Located, definition: GameDefinition, now: Date): Promise<StageRun> {
  const players = await tx.sessionPlayer.findMany({ where: { sessionId, leftAt: null }, select: { id: true }, orderBy: { id: 'asc' } });
  let presentation = {};
  if (entry.stage.kind === 'vote') {
    const source = await tx.stageRun.findFirst({ where: { sessionId, nodeKey: entry.stage.source.nodeKey, stageKey: entry.stage.source.stageKey }, orderBy: { number: 'desc' }, select: { id: true } });
    requireGame(source, 'INVALID_STATE'); presentation = { sourceStageRunId: source.id };
  }
  const ids = players.map(player => player.id);
  let lineupId: string | null = null; let eligible = ids; let timed = true;
  if (entry.stage.kind === 'route') {
    const opened = await openRoute(tx, sessionId, entry.stage, ids);
    presentation = opened.presentation; eligible = opened.eligibility; lineupId = opened.lineupId;
  }
  // Show-only scenes have nobody answering.
  if (isShowOnly(entry.stage)) eligible = [];
  const play = entry.stage.kind === 'route' || isShowOnly(entry.stage) ? { kind: 'solo' as const } : effectivePlay(definition, entry.stage);
  if (play.kind === 'teams') {
    const teamPlay = { answers: play.answers, points: play.points };
    const existing = play.lineup.kind === 'game' ? await gameLineupForRound(tx, sessionId, ids) : null;
    if (existing) {
      lineupId = existing.id; eligible = existing.members.map(member => member.playerId).filter(id => ids.includes(id));
      presentation = { ...presentation, teamPlay };
    } else {
      // A new lineup: the stage waits, untimed and closed to answers, until the host confirms the teams.
      const form = play.lineup.kind === 'game' ? definition.teams : play.lineup.form;
      requireGame(form, 'INVALID_DEFINITION');
      presentation = { ...presentation, teamPlay, forming: startForming(form, play, play.lineup.kind === 'round' ? 'round' : 'game', play.lineup.kind === 'reform' ? play.lineup.carryover : 'fresh', ids) };
      eligible = []; timed = false;
    }
  }
  const stage = await tx.stageRun.create({ data: { sessionId, number, nodeKey: entry.nodeKey, stageKey: entry.stage.key, openedAt: now, presentation, lineupId,
    ...timerColumns(timed ? entry.stage.durationMs : null, false, now), eligibility: { formatVersion: 1, playerIds: eligible } } });
  await tx.gameSession.update({ where: { id: sessionId }, data: { status: 'RUNNING', currentNodeKey: entry.nodeKey } });
  return stage;
}

/** Reveals a stage; revealing a vote also puts names on the answers that were voted on. */
// Never stamped before the close, even if the server clock stepped back since.
const notBefore = (closedAt: Date | null, now: Date) => closedAt && closedAt > now ? closedAt : now;
async function reveal(tx: Transaction, stage: StageRun, now: Date): Promise<void> {
  const current = await tx.stageRun.findUniqueOrThrow({ where: { id: stage.id }, select: { closedAt: true } });
  await tx.stageRun.update({ where: { id: stage.id }, data: { revealedAt: notBefore(current.closedAt, now) } });
  const vote = VotePresentationSchema.safeParse(stage.presentation);
  if (!vote.success) return;
  const source = await tx.stageRun.findFirst({ where: { id: vote.data.sourceStageRunId, sessionId: stage.sessionId, status: 'CLOSED', revealedAt: null }, select: { id: true, closedAt: true } });
  if (source) await tx.stageRun.update({ where: { id: source.id }, data: { revealedAt: notBefore(source.closedAt, now) } });
}

async function present(tx: Transaction, sessionId: string) {
  return (await tx.sessionPlayer.findMany({ where: { sessionId, leftAt: null }, select: { id: true }, orderBy: { joinedAt: 'asc' } })).map(player => player.id);
}
/** Who answers: a player, or the team when its captain answers for it. */
function answerer(actor: Extract<TrustedActor, { role: 'player' }>, context: TeamContext | null) {
  if (!context || context.answers === 'everyone') return { actorKey: actorKey(actor), playerId: actor.playerId, teamId: null };
  const teamId = context.teamOf.get(actor.playerId);
  requireGame(teamId && context.captainOf.get(teamId) === actor.playerId, 'INELIGIBLE');
  return { actorKey: `team:${teamId}`, playerId: null, teamId };
}

function validateValue(value: SubmissionValue, stage: StageDefinition): void {
  requireGame(stage.kind === 'collect', 'INVALID_SUBMISSION');
  requireGame(value.kind === stage.input.kind, 'INVALID_SUBMISSION');
  if (value.kind === 'choice') requireGame(stage.input.kind === 'choice' && stage.input.options.some(option => option.key === value.choiceKey), 'INVALID_SUBMISSION');
  if (value.kind === 'text') requireGame(stage.input.kind === 'text' && value.text.length <= stage.input.maxLength, 'INVALID_SUBMISSION');
  if (value.kind === 'order') {
    // Exactly one of each item: no omissions, repeats or invented keys.
    const keys = stage.input.kind === 'order' ? stage.input.items.map(item => item.key) : [];
    requireGame(value.keys.length === keys.length && new Set(value.keys).size === keys.length && value.keys.every(key => keys.includes(key)), 'INVALID_SUBMISSION');
  }
  requireGame(value.kind !== 'drawing', 'UNSUPPORTED_FEATURE');
}

function earned(stage: StageDefinition, value: SubmissionValue): { amountMilli: bigint; reason: string } | null {
  if (stage.kind !== 'collect') return null;
  const rule = stage.scoring;
  if (rule.kind === 'correct-choice' && value.kind === 'choice' && value.choiceKey === rule.correctChoiceKey) return { amountMilli: BigInt(rule.awardMilli), reason: 'Correct choice' };
  if (rule.kind === 'correct-order' && value.kind === 'order' && value.keys.length === rule.correctOrder.length && value.keys.every((key, index) => key === rule.correctOrder[index])) return { amountMilli: BigInt(rule.awardMilli), reason: 'Correct order' };
  return null;
}

// `now` is the server receipt time, taken before waiting for the room lock.
export async function applyCommand(tx: Transaction, session: GameSession, definition: GameDefinition, actor: TrustedActor, command: GameCommand, now: Date): Promise<Effect> {
  const empty: Effect = { stageRunId: null, submissionId: null };
  if (command.type === 'session.create') return empty;
  if (!PLAYER_COMMANDS.includes(command.type)) requireHost(actor);
  if (command.type === 'session.start') {
    requireGame(session.status === 'LOBBY', 'INVALID_STATE');
    return { ...empty, stageRunId: (await openStage(tx, session.id, 1, firstStage(definition), definition, now)).id };
  }
  if (command.type === 'session.pause' || command.type === 'session.resume') {
    requireGame(session.status === (command.type === 'session.pause' ? 'RUNNING' : 'PAUSED'), 'INVALID_STATE');
    const pausing = command.type === 'session.pause';
    await tx.gameSession.update({ where: { id: session.id }, data: { status: pausing ? 'PAUSED' : 'RUNNING' } });
    // A pause freezes the clock; resuming restarts it with the same remainder.
    const active = await tx.stageRun.findFirst({ where: { sessionId: session.id, status: 'ACTIVE' } });
    if (active) await tx.stageRun.update({ where: { id: active.id }, data: timerColumns(remainingMs(active, now), pausing, now) });
    return empty;
  }
  if (command.type === 'score.adjust') {
    // Corrections work during and after the game, and for players who have left.
    requireGame(session.status !== 'LOBBY', 'INVALID_STATE');
    const player = await tx.sessionPlayer.findFirst({ where: { id: command.playerId, sessionId: session.id }, select: { id: true } });
    requireGame(player, 'INELIGIBLE');
    return { ...empty, awards: [{ playerId: player.id, amountMilli: BigInt(command.amountMilli), stageRunId: null, awardKey: `adjust:${command.commandId}`, reason: command.reason, kind: 'ADJUSTMENT' }] };
  }
  requireGame(session.status === 'RUNNING' || (command.type === 'stage.timer' && session.status === 'PAUSED'), 'INVALID_STATE');
  const stage = await tx.stageRun.findFirst({ where: { sessionId: session.id, id: command.stageRunId } });
  requireGame(stage && stage.nodeKey === session.currentNodeKey, 'INVALID_STATE');
  const latest = await tx.stageRun.findFirst({ where: { sessionId: session.id }, orderBy: { number: 'desc' }, select: { id: true } });
  requireGame(latest?.id === stage.id, 'INVALID_STATE');
  // The run names its node and stage; the definition (immutable for the session) supplies the rules.
  const entry = locateStage(definition, stage.nodeKey, stage.stageKey);
  requireGame(entry, 'INVALID_STATE');
  const choice = entry.stage.kind === 'route' ? entry.stage : null;
  const decided = choice ? await tx.routeDecision.findUnique({ where: { stageRunId: stage.id } }) : null;
  if (command.type === 'route.decide') {
    // The host may pick any option, at any time until a route is recorded.
    requireGame(choice, 'INVALID_STATE');
    requireGame(!decided, 'ALREADY_DECIDED');
    requireGame(choice.options.some(option => option.key === command.optionKey), 'INVALID_COMMAND');
    if (stage.status === 'ACTIVE') await tx.stageRun.update({ where: { id: stage.id }, data: { status: 'CLOSED', closedAt: now, deadlineAt: null, pausedRemainingMs: null } });
    const { counts, voterCount } = await countsFor(tx, stage, choice);
    const tie = pendingReason(counts, choice) === 'tie' && leadersOf(counts).includes(command.optionKey);
    return { ...empty, stageRunId: stage.id, decision: decisionFor(definition, stage, choice, { optionKey: command.optionKey, reason: tie ? 'TIE_BREAK' : 'HOST' },
      { voterCount, counts, leaders: leadersOf(counts), resolution: 'host', random: null, closedBy: 'decide' }) };
  }
  if (command.type === 'stage.advance') {
    // A show-only scene ends when the host moves on; other stages are closed first.
    requireGame((stage.status === 'CLOSED' || (stage.status === 'ACTIVE' && isShowOnly(entry.stage))) && latest?.id === stage.id, 'INVALID_STATE');
    // Moving on makes the finished stage's results public, except answers that a
    // later vote still needs to show without names; the vote's reveal uncovers those.
    // A route goes where its recorded decision says, even after a restart; never a fresh vote.
    const next = nextStage(definition, { nodeKey: stage.nodeKey, stageKey: stage.stageKey }, decided ? { selectedEdgeKey: decided.selectedEdgeKey, destinationNodeKey: decided.destinationNodeKey } : null);
    requireGame(next !== 'DECISION_PENDING', 'DECISION_PENDING');
    if (stage.status === 'ACTIVE') await tx.stageRun.update({ where: { id: stage.id }, data: { status: 'CLOSED', closedAt: now, deadlineAt: null, pausedRemainingMs: null } });
    if (!stage.revealedAt && !isVoteSource(definition, entry.nodeKey, entry.stage.key)) await reveal(tx, stage, now);
    if (next === 'END') {
      await tx.gameSession.update({ where: { id: session.id }, data: { status: 'FINISHED', endedAt: now, currentNodeKey: null } });
      return empty;
    }
    return { ...empty, stageRunId: (await openStage(tx, session.id, stage.number + 1, next, definition, now)).id };
  }
  if (command.type === 'stage.close' || command.type === 'stage.timeout') {
    requireGame(stage.status === 'ACTIVE', 'INVALID_STATE');
    // Teams must be confirmed before a team round can end: later rounds (and the
    // validator) rely on a lineup existing once a team round has run.
    requireGame(!readForming(stage.presentation), 'INVALID_STATE');
    // Automatic closing can never end a stage early or override a pause/extension.
    if (command.type === 'stage.timeout') requireGame(stage.deadlineAt && now.getTime() >= closesAt(stage.deadlineAt), 'INVALID_STATE');
    await tx.stageRun.update({ where: { id: stage.id }, data: { status: 'CLOSED', closedAt: now, deadlineAt: null, pausedRemainingMs: null } });
    // A route vote tallies once as it closes; a tie or empty vote may wait for the host.
    return { ...empty, stageRunId: stage.id, decision: choice ? await closeRoute(tx, definition, stage, choice, command.type === 'stage.timeout' ? 'timeout' : 'close') : null };
  }
  const forming = readForming(stage.presentation);
  if (command.type.startsWith('teams.')) {
    requireGame(stage.status === 'ACTIVE' && forming, 'INVALID_STATE');
    if (command.type === 'teams.choose') requireGame(actor.role === 'player', 'FORBIDDEN');
    const result = await formingCommand(tx, session.id, forming, command as { type: string; playerId?: string; teamIndex?: number | null }, actor.role === 'player' ? actor.playerId : null, await present(tx, session.id));
    const { forming: _done, ...rest } = stage.presentation as Record<string, unknown>;
    if ('lineupId' in result) {
      // Confirmed: the round starts now, with its timer, for the players in a team.
      await tx.stageRun.update({ where: { id: stage.id }, data: { lineupId: result.lineupId, presentation: rest as object, eligibility: { formatVersion: 1, playerIds: result.playerIds }, ...timerColumns(entry.stage.durationMs, false, now) } });
    } else await tx.stageRun.update({ where: { id: stage.id }, data: { presentation: { ...rest, forming: result.forming } as object } });
    return { ...empty, stageRunId: stage.id };
  }
  if (command.type === 'stage.timer') {
    requireGame(stage.status === 'ACTIVE' && !forming, 'INVALID_STATE');
    const current = remainingMs(stage, now);
    const change = command.change;
    requireGame(change.kind !== 'add' || current !== null, 'INVALID_STATE');
    const next = change.kind === 'clear' ? null : change.kind === 'set' ? change.ms : current! + change.ms;
    requireGame(next === null || next <= MAX_REMAINING_MS, 'INVALID_STATE');
    await tx.stageRun.update({ where: { id: stage.id }, data: timerColumns(next, session.status === 'PAUSED', now) });
    return { ...empty, stageRunId: stage.id };
  }
  if (command.type === 'stage.reveal') {
    requireGame(stage.status === 'CLOSED' && !stage.revealedAt, 'INVALID_STATE');
    // Announcing a route needs the route to be decided.
    requireGame(!choice || decided, 'DECISION_PENDING');
    // Names on answers that are about to be voted on would spoil the anonymous vote.
    requireGame(!isVoteSource(definition, entry.nodeKey, entry.stage.key), 'INVALID_STATE');
    await reveal(tx, stage, now);
    return { ...empty, stageRunId: stage.id };
  }
  if (command.type === 'stage.reopen') {
    // Once the answer has been shown, or a judgment recorded, the stage stays closed.
    requireGame(stage.status === 'CLOSED' && !stage.revealedAt, 'INVALID_STATE');
    // An undecided vote may be reopened (existing votes stay); a recorded route is final.
    requireGame(!decided, 'ALREADY_DECIDED');
    requireGame(await tx.stageJudgment.count({ where: { stageRunId: stage.id } }) === 0, 'ALREADY_JUDGED');
    await tx.stageRun.update({ where: { id: stage.id }, data: { status: 'ACTIVE', closedAt: null, ...timerColumns(command.durationMs, false, now) } });
    return { ...empty, stageRunId: stage.id };
  }
  const eligible = EligibilitySchema.safeParse(stage.eligibility);
  requireGame(eligible.success, 'INVALID_STATE');
  const context = await teamContext(tx, stage);
  if (command.type === 'stage.judgeTeam') {
    // One decision per team, recorded for each member so nobody is judged twice.
    requireGame(stage.status === 'CLOSED' && entry.stage.kind === 'challenge' && context, 'INVALID_STATE');
    const members = (context.members.get(command.teamId) ?? []).filter(id => eligible.data.playerIds.includes(id));
    requireGame(members.length, 'INELIGIBLE');
    const amountMilli = BigInt(command.amountMilli);
    requireGame(amountMilli <= BigInt(entry.stage.maxAwardMilli), 'INVALID_SUBMISSION');
    requireGame(await tx.stageJudgment.count({ where: { stageRunId: stage.id, playerId: { in: members } } }) === 0, 'ALREADY_JUDGED');
    return { ...empty, stageRunId: stage.id, judgments: members.map(playerId => ({ playerId, amountMilli, stageRunId: stage.id })),
      awards: route({ amountMilli, stageRunId: stage.id, awardKey: `judgment:${stage.id}:team:${command.teamId}`, reason: 'Host judgment' }, { teamId: command.teamId }, context) };
  }
  if (command.type === 'stage.judge') {
    requireGame(stage.status === 'CLOSED' && entry.stage.kind === 'challenge' && !context, 'INVALID_STATE');
    requireGame(eligible.data.playerIds.includes(command.playerId), 'INELIGIBLE');
    const amountMilli = BigInt(command.amountMilli);
    requireGame(amountMilli <= BigInt(entry.stage.maxAwardMilli), 'INVALID_SUBMISSION');
    const prior = await tx.stageJudgment.findUnique({ where: { stageRunId_playerId: { stageRunId: stage.id, playerId: command.playerId } } });
    requireGame(!prior, 'ALREADY_JUDGED');
    return { ...empty, stageRunId: stage.id, judgments: [{ playerId: command.playerId, amountMilli, stageRunId: stage.id }],
      awards: route({ amountMilli, stageRunId: stage.id, awardKey: `judgment:${stage.id}:${command.playerId}`, reason: 'Host judgment' }, { playerId: command.playerId }, null) };
  }
  if (command.type === 'submission.submit') {
    requireGame(actor.role === 'player', 'FORBIDDEN');
    requireGame(stage.status === 'ACTIVE', 'INVALID_STATE');
    requireGame(!stage.deadlineAt || now.getTime() <= acceptsUntil(stage.deadlineAt), 'TOO_LATE');
    requireGame(!forming, 'INVALID_STATE');
    requireGame(eligible.data.playerIds.includes(actor.playerId), 'INELIGIBLE');
    const by = answerer(actor, context);
    if (choice) {
      const value = command.value;
      requireGame(value.kind === 'choice' && choice.options.some(option => option.key === value.choiceKey), 'INVALID_SUBMISSION');
      requireGame(readRoute(stage.presentation).voterKeys.includes(by.actorKey), 'INELIGIBLE');
      const earlier = await tx.submission.findUnique({ where: { stageRunId_actorKey_slotKey: { stageRunId: stage.id, actorKey: by.actorKey, slotKey: 'answer' } } });
      requireGame(!earlier, 'ALREADY_SUBMITTED');
      const vote = await tx.submission.create({ data: { id: randomUUID(), sessionId: session.id, stageRunId: stage.id, actorKey: by.actorKey, playerId: by.playerId, teamId: by.teamId, value } });
      return { stageRunId: stage.id, submissionId: vote.id };
    }
    if (entry.stage.kind === 'vote') {
      const ballot = VotePresentationSchema.safeParse(stage.presentation);
      requireGame(ballot.success && command.value.kind === 'vote', 'INVALID_SUBMISSION');
      const chosen = await tx.submission.findFirst({ where: { id: command.value.submissionId, sessionId: session.id, stageRunId: ballot.data.sourceStageRunId } });
      requireGame(chosen && (chosen.playerId || chosen.teamId), 'INVALID_SUBMISSION');
      // Never for your own answer, nor (in a team round) for your own team's.
      const source = await tx.stageRun.findUniqueOrThrow({ where: { id: ballot.data.sourceStageRunId } });
      const sourceTeams = await teamContext(tx, source);
      const authorTeam = chosen.teamId ?? (chosen.playerId ? sourceTeams?.teamOf.get(chosen.playerId) : undefined);
      requireGame(chosen.playerId !== actor.playerId && !(authorTeam && sourceTeams?.teamOf.get(actor.playerId) === authorTeam), 'INVALID_SUBMISSION');
      const earlier = await tx.submission.findUnique({ where: { stageRunId_actorKey_slotKey: { stageRunId: stage.id, actorKey: by.actorKey, slotKey: 'answer' } } });
      requireGame(!earlier, 'ALREADY_SUBMITTED');
      const vote = await tx.submission.create({ data: { id: randomUUID(), sessionId: session.id, stageRunId: stage.id, actorKey: by.actorKey, playerId: by.playerId, teamId: by.teamId, value: command.value } });
      // Votes score the way the voted-on round scores its answers.
      return { stageRunId: stage.id, submissionId: vote.id,
        awards: route({ amountMilli: BigInt(entry.stage.awardPerVoteMilli), stageRunId: stage.id, awardKey: `vote:${vote.id}`, reason: 'Vote received' }, { playerId: chosen.playerId, teamId: chosen.teamId }, sourceTeams) };
    }
    requireGame(command.value.kind !== 'vote', 'INVALID_SUBMISSION');
    validateValue(command.value, entry.stage);
    // An upload answers only the stage it was made for, by the player who made it, once.
    const asset = command.value.kind === 'media' ? await tx.asset.findFirst({ where: { id: command.value.assetId, sessionId: session.id, stageRunId: stage.id, playerId: actor.playerId, submissionId: null } }) : null;
    if (command.value.kind === 'media') requireGame(asset && entry.stage.kind === 'collect' && entry.stage.input.kind === 'media' && entry.stage.input.accept.includes(asset.kind.toLowerCase() as MediaKind), 'INVALID_SUBMISSION');
    const prior = await tx.submission.findUnique({ where: { stageRunId_actorKey_slotKey: { stageRunId: stage.id, actorKey: by.actorKey, slotKey: 'answer' } } });
    requireGame(!prior, 'ALREADY_SUBMITTED');
    const submission = await tx.submission.create({ data: { id: randomUUID(), sessionId: session.id, stageRunId: stage.id, actorKey: by.actorKey, playerId: by.playerId, teamId: by.teamId, value: command.value } });
    if (asset) await tx.asset.update({ where: { id: asset.id }, data: { submissionId: submission.id } });
    const result = earned(entry.stage, command.value);
    return { stageRunId: stage.id, submissionId: submission.id,
      awards: result ? route({ ...result, stageRunId: stage.id, awardKey: `answer:${submission.id}` }, { playerId: by.playerId ?? actor.playerId, teamId: by.teamId }, context) : [] };
  }
  throw new GameError('INVALID_COMMAND');
}
