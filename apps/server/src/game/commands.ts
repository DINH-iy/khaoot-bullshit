import { randomUUID } from 'node:crypto';
import { PLAYER_COMMANDS, PlayerLookSchema, type GameCommand, type MediaKind, type MinigameSettings, type SubmissionValue } from '@party/contracts';
import type { GameSession, StageRun } from '../generated/prisma/client.js';
import { effectivePlay, isShowOnly, isVoteSource, minigameRules, type GameDefinition, type StageDefinition } from './definition.js';
import { CLOCK_SLACK_MS, judgeResult, NO_FAIRNESS, readMinigameRun, startMinigame } from '../minigames/rules.js';
import { relayPlan, TURN_GRACE_MS } from '../minigames/relay.js';
import type { LiveSignals } from '../minigames/live.js';
import { minigameOutcome } from '../minigames/outcome.js';
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
  // A minigame starts (after its countdown) as soon as players can play it.
  if (entry.stage.kind === 'minigame' && timed) presentation = { ...presentation, minigame: startOf(entry.stage, now) };
  const stage = await tx.stageRun.create({ data: { sessionId, number, nodeKey: entry.nodeKey, stageKey: entry.stage.key, openedAt: now, presentation, lineupId,
    ...timerColumns(timed ? entry.stage.durationMs : null, false, now), eligibility: { formatVersion: 1, playerIds: eligible } } });
  await tx.gameSession.update({ where: { id: sessionId }, data: { status: 'RUNNING', currentNodeKey: entry.nodeKey } });
  return stage;
}

const startOf = (stage: StageDefinition, now: Date) => { const rules = minigameRules(stage as Extract<StageDefinition, { kind: 'minigame' }>); return startMinigame(rules.game, rules.settings, now); };

/** Placement points of a minigame, given once as it is revealed (after everyone has played). */
async function minigameAwards(tx: Transaction, stage: StageRun, definition: StageDefinition): Promise<Award[]> {
  if (definition.kind !== 'minigame') return [];
  const rows = await tx.submission.findMany({ where: { stageRunId: stage.id, slotKey: 'answer' }, select: { playerId: true, teamId: true, value: true }, orderBy: { receivedAt: 'asc' } });
  return minigameOutcome(minigameRules(definition), rows, await teamContext(tx, stage), stage.id).awards;
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
}

function earned(stage: StageDefinition, value: SubmissionValue): { amountMilli: bigint; reason: string } | null {
  if (stage.kind !== 'collect') return null;
  const rule = stage.scoring;
  if (rule.kind === 'correct-choice' && value.kind === 'choice' && value.choiceKey === rule.correctChoiceKey) return { amountMilli: BigInt(rule.awardMilli), reason: 'Correct choice' };
  if (rule.kind === 'correct-order' && value.kind === 'order' && value.keys.length === rule.correctOrder.length && value.keys.every((key, index) => key === rule.correctOrder[index])) return { amountMilli: BigInt(rule.awardMilli), reason: 'Correct order' };
  return null;
}

// `now` is the server receipt time, taken before waiting for the room lock.
export async function applyCommand(tx: Transaction, session: GameSession, definition: GameDefinition, actor: TrustedActor, command: GameCommand, now: Date, live?: LiveSignals): Promise<Effect> {
  const empty: Effect = { stageRunId: null, submissionId: null };
  if (command.type === 'session.create') return empty;
  if (!PLAYER_COMMANDS.includes(command.type)) requireHost(actor);
  if (command.type === 'player.look') {
    // Built-in parts only (checked by the command schema); allowed in the lobby, during and after the game.
    requireGame(actor.role === 'player', 'FORBIDDEN');
    // A picture must be this player's own, stored as a picture, of the right kind.
    const picture = command.look.picture;
    if (picture) requireGame(await tx.asset.count({ where: { id: picture.assetId, sessionId: session.id, playerId: actor.playerId, purpose: 'AVATAR', removedAt: null, kind: picture.kind === 'photo' ? 'IMAGE' : 'DRAWING' } }) === 1, 'INVALID_COMMAND');
    await tx.sessionPlayer.update({ where: { id: actor.playerId }, data: { look: command.look } });
    return empty;
  }
  if (command.type === 'player.removePicture') {
    // Moderation: the host can always take a picture away; the player keeps their character.
    const player = await tx.sessionPlayer.findFirst({ where: { id: command.playerId, sessionId: session.id }, select: { id: true, look: true } });
    requireGame(player, 'INELIGIBLE');
    const look = PlayerLookSchema.safeParse(player.look);
    if (look.success && look.data.picture) { const { picture: _removed, ...rest } = look.data; await tx.sessionPlayer.update({ where: { id: player.id }, data: { look: rest } }); }
    return empty;
  }
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
    if (active) {
      // A pause stops a running minigame on every phone (they stop playing while the room is paused);
      // resuming gives everyone who has not finished a fresh countdown. Lucky doors keep their secret order.
      const entry = locateStage(definition, active.nodeKey, active.stageKey); const run = readMinigameRun(active.presentation);
      let restart = {};
      if (!pausing && entry?.stage.kind === 'minigame' && run) {
        let started = { ...startOf(entry.stage, now), doorsMilli: run.doorsMilli };
        // Pass the pencil continues at the first turn some team has not drawn yet, with a fresh countdown.
        const rules = minigameRules(entry.stage); const context = rules.game === 'relay-drawing' ? await teamContext(tx, active) : null;
        if (context) {
          const plan = relayPlan(context, rules.settings as MinigameSettings<'relay-drawing'>, run);
          const parts = await tx.submission.findMany({ where: { stageRunId: active.id, slotKey: { startsWith: 'part-' } }, select: { playerId: true, slotKey: true } });
          const done = (teamId: string, turn: number) => parts.some(part => part.playerId && context.teamOf.get(part.playerId) === teamId && part.slotKey === `part-${turn}`);
          const next = Array.from({ length: plan.turns }, (_, turn) => turn).find(turn => plan.teams.some(team => !done(team.teamId, turn))) ?? plan.turns;
          started = { ...started, startsAt: new Date(Date.parse(started.startsAt) - next * plan.turnMs).toISOString() };
        }
        restart = { presentation: { ...(active.presentation as object), minigame: started } };
      }
      await tx.stageRun.update({ where: { id: active.id }, data: { ...timerColumns(remainingMs(active, now), pausing, now), ...restart } });
    }
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
    let awards: Award[] = [];
    if (!stage.revealedAt && !isVoteSource(definition, entry.nodeKey, entry.stage.key)) { await reveal(tx, stage, now); awards = await minigameAwards(tx, stage, entry.stage); }
    if (next === 'END') {
      await tx.gameSession.update({ where: { id: session.id }, data: { status: 'FINISHED', endedAt: now, currentNodeKey: null } });
      return { ...empty, awards };
    }
    return { ...empty, awards, stageRunId: (await openStage(tx, session.id, stage.number + 1, next, definition, now)).id };
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
      const started = entry.stage.kind === 'minigame' ? { ...rest, minigame: startOf(entry.stage, now) } : rest;
      await tx.stageRun.update({ where: { id: stage.id }, data: { lineupId: result.lineupId, presentation: started as object, eligibility: { formatVersion: 1, playerIds: result.playerIds }, ...timerColumns(entry.stage.durationMs, false, now) } });
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
    return { ...empty, stageRunId: stage.id, awards: await minigameAwards(tx, stage, entry.stage) };
  }
  if (command.type === 'stage.reopen') {
    // Once the answer has been shown, or a judgment recorded, the stage stays closed.
    requireGame(stage.status === 'CLOSED' && !stage.revealedAt, 'INVALID_STATE');
    // An undecided vote may be reopened (existing votes stay); a recorded route is final.
    requireGame(!decided, 'ALREADY_DECIDED');
    requireGame(await tx.stageJudgment.count({ where: { stageRunId: stage.id } }) === 0, 'ALREADY_JUDGED');
    // A reopened minigame starts again for those who have not played; results already sent stay.
    const restarted = entry.stage.kind === 'minigame' ? { presentation: { ...(stage.presentation as object), minigame: startOf(entry.stage, now) } } : {};
    await tx.stageRun.update({ where: { id: stage.id }, data: { status: 'ACTIVE', closedAt: null, ...restarted, ...timerColumns(command.durationMs, false, now) } });
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
  if (command.type === 'minigame.part') {
    // One turn of Pass the pencil: only the team's drawer for that turn, during (or just after) that turn.
    requireGame(actor.role === 'player' && stage.status === 'ACTIVE' && entry.stage.kind === 'minigame' && context, 'INVALID_STATE');
    const rules = minigameRules(entry.stage); const run = readMinigameRun(stage.presentation);
    requireGame(rules.game === 'relay-drawing' && run, 'INVALID_STATE');
    const plan = relayPlan(context, rules.settings as MinigameSettings<'relay-drawing'>, run);
    const teamId = context.teamOf.get(actor.playerId);
    requireGame(teamId && command.turn < plan.turns && plan.drawerOf(teamId, command.turn) === actor.playerId, 'INELIGIBLE');
    const window = plan.turnWindow(command.turn);
    requireGame(now.getTime() >= window.from - CLOCK_SLACK_MS, 'INVALID_STATE');
    requireGame(now.getTime() <= window.until + TURN_GRACE_MS, 'TOO_LATE');
    const asset = await tx.asset.findFirst({ where: { id: command.assetId, sessionId: session.id, stageRunId: stage.id, playerId: actor.playerId, submissionId: null, kind: 'DRAWING', removedAt: null } });
    requireGame(asset, 'INVALID_SUBMISSION');
    const slotKey = `part-${command.turn}`;
    requireGame(!await tx.submission.findUnique({ where: { stageRunId_actorKey_slotKey: { stageRunId: stage.id, actorKey: actorKey(actor), slotKey } } }), 'ALREADY_SUBMITTED');
    const part = await tx.submission.create({ data: { id: randomUUID(), sessionId: session.id, stageRunId: stage.id, actorKey: actorKey(actor), slotKey, playerId: actor.playerId, value: { kind: 'drawing', assetId: asset.id } } });
    await tx.asset.update({ where: { id: asset.id }, data: { submissionId: part.id } });
    return { stageRunId: stage.id, submissionId: part.id };
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
    if (entry.stage.kind === 'minigame') {
      // One result per player (or per team when a captain plays), checked against the clock.
      const claimed = command.value; const run = readMinigameRun(stage.presentation); const rules = minigameRules(entry.stage);
      requireGame(claimed.kind === 'minigame' && run, 'INVALID_SUBMISSION');
      const fair = live && actor.role === 'player' ? { latencyMs: live.latencyMs(session.id, actor.playerId), taps: live.taps(stage.id, run.startsAt, actor.playerId) } : NO_FAIRNESS;
      const value = { kind: 'minigame' as const, ...judgeResult(rules.game, rules.settings, run, claimed, now, fair) };
      if (rules.game === 'relay-drawing') {
        // Votes open after the last turn, for another team's picture.
        requireGame(context, 'INVALID_STATE');
        const plan = relayPlan(context, rules.settings as MinigameSettings<'relay-drawing'>, run);
        requireGame(now.getTime() >= plan.voteAt - CLOCK_SLACK_MS, 'INVALID_STATE');
        requireGame(plan.teams.some(team => team.teamId === value.teamId) && context.teamOf.get(actor.playerId) !== value.teamId, 'INVALID_SUBMISSION');
      }
      const prior = await tx.submission.findUnique({ where: { stageRunId_actorKey_slotKey: { stageRunId: stage.id, actorKey: by.actorKey, slotKey: 'answer' } } });
      requireGame(!prior, 'ALREADY_SUBMITTED');
      const submission = await tx.submission.create({ data: { id: randomUUID(), sessionId: session.id, stageRunId: stage.id, actorKey: by.actorKey, playerId: by.playerId, teamId: by.teamId, value } });
      // Lucky doors pay out the door's points straight away (shown at the reveal); other minigames pay by place at the reveal.
      const door = rules.game === 'lucky-doors' ? BigInt(run.doorsMilli![value.value]!) : 0n;
      return { stageRunId: stage.id, submissionId: submission.id,
        awards: door ? route({ amountMilli: door, stageRunId: stage.id, awardKey: `answer:${submission.id}`, reason: 'Lucky door' }, { playerId: by.playerId ?? actor.playerId, teamId: by.teamId }, context) : [] };
    }
    validateValue(command.value, entry.stage);
    // An upload answers only the stage it was made for, by the player who made it, once.
    const stored = command.value.kind === 'media' || command.value.kind === 'drawing' ? command.value.assetId : null;
    const asset = stored ? await tx.asset.findFirst({ where: { id: stored, sessionId: session.id, stageRunId: stage.id, playerId: actor.playerId, submissionId: null, purpose: 'ANSWER', removedAt: null } }) : null;
    if (command.value.kind === 'media') requireGame(asset && asset.kind !== 'DRAWING' && entry.stage.kind === 'collect' && entry.stage.input.kind === 'media' && entry.stage.input.accept.includes(asset.kind.toLowerCase() as MediaKind), 'INVALID_SUBMISSION');
    if (command.value.kind === 'drawing') requireGame(asset && asset.kind === 'DRAWING' && entry.stage.kind === 'collect' && entry.stage.input.kind === 'drawing', 'INVALID_SUBMISSION');
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
