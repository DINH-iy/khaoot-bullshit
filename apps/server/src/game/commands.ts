import { randomInt, randomUUID } from 'node:crypto';
import type { TeamCelebration } from '@party/contracts';
import type { PoolBallBehavior, PoolStart } from '@party/contracts';
import { UNDERCOVER_ROLES, ANIMATION_WORDS, voteChoices, defaultLook, isSharedPrediction, isStepMinigame, MINIGAME_COUNTDOWN_MS, MINIGAMES, ROULETTE_BET_FLOOR, rouletteBetLimit, TEAM_MINIGAMES, PLAYER_COMMANDS, PlayerLookSchema, type GameCommand, type MediaKind, type MinigameSettings, type SubmissionValue } from '@party/contracts';
import type { GameSession, StageRun } from '../generated/prisma/client.js';
import { withRoomWords } from './room-settings.js';
import { drawnStage, effectivePlay, isShowOnly, isVoteSource, judging, minigameRules, stagePlaces, type GameDefinition, type StageDefinition } from './definition.js';
import { earned, revealAwards } from './scoring/place-awards.js';
import { checkBet, decideDuel, duelists, duelPlay, endTimedPool, openDuel, openPoolTryout, openTeamPool, pickDuelists, pickTimedPoolWinner, readDuel } from './duel.js';
import { matchOutcome } from '../head-to-head/match.js';
import { judgeResult, readMinigameRun, startMinigame } from '../minigames/shared/rules.js';
import { CLOCK_SLACK_MS, NO_FAIRNESS } from '../minigames/shared/fairness.js';
import { changeGraphPlayback } from '../minigames/draw-the-graph/playback.js';
import { shiftDotWindow } from '../minigames/count-the-dots/dots.js';
import { relayPlan, TURN_GRACE_MS } from '../minigames/relay-drawing/relay.js';
import { stepDecide, stepMove } from '../minigames/shared/steps/engine.js';
import { dealUndercover, readUndercover, undercoverMove, undercoverWinners } from '../minigames/undercover/rules.js';
import type { LiveSignals } from '../minigames/tap-race/live.js';
import { spinWheel } from './show/wheel.js';
import { firstStage, locateStage, nextStage, type Located, locateRunStage } from './graph.js';
import { closeRoute, countsFor, decisionFor, leadersOf, pendingReason, openRoute, readRoute, type RouteDecisionEffect } from './routes/routes.js';
import { GameError, requireGame } from './errors.js';
import { actorKey, EligibilitySchema, requireHost, VotePresentationSchema, type Transaction, type TrustedActor } from './model.js';
import { acceptsUntil, closesAt, graceFor, MAX_REMAINING_MS, remainingMs, timerColumns } from './timing.js';
import { explainsFirst, readExplain, withReady, withoutExplain } from './explain.js';
import { answerVerdict } from './scoring/verdicts.js';
import { formingCommand, gameLineupForRound, readForming, route, startForming, teamContext, type Award, type TeamContext } from './teams/teams.js';

export interface Effect {
  stageRunId: string | null;
  submissionId: string | null;
  awards?: Award[];
  judgments?: { playerId: string; amountMilli: bigint; stageRunId: string }[];
  decision?: RouteDecisionEffect | null;
  // The host's verdict on one answer, saved with this command.
  verdict?: { submissionId: string; correct: boolean | null };
}

// `number` counts runs in this session (1, 2, 3…); on a branching game it is not a position in the definition.
async function openStage(tx: Transaction, sessionId: string, number: number, entry: Located, definition: GameDefinition, now: Date,
  poolTryout?: { players: [string] | [string, string] | undefined; seconds: number | undefined; ballBehavior: PoolBallBehavior | undefined; start: PoolStart | undefined }): Promise<StageRun> {
  const players = await tx.sessionPlayer.findMany({ where: { sessionId, leftAt: null }, select: { id: true }, orderBy: { id: 'asc' } });
  let presentation = {};
  // A minigame draw in one scene: one of its games is drawn now, once, and kept with the run; from here on the scene
  // is that game (with its own settings and time), here and wherever the run is read (locateRunStage).
  if (entry.stage.kind === 'minigame' && entry.stage.draw) {
    const index = randomInt(entry.stage.draw.length);
    entry = { ...entry, stage: drawnStage(entry.stage, index) };
    presentation = { minigameDraw: { index } };
  }
  if (entry.stage.kind === 'vote') {
    const source = await tx.stageRun.findFirst({ where: { sessionId, nodeKey: entry.stage.source.nodeKey, stageKey: entry.stage.source.stageKey }, orderBy: { number: 'desc' }, select: { id: true } });
    requireGame(source, 'INVALID_STATE'); presentation = { sourceStageRunId: source.id };
  }
  const ids = players.map(player => player.id);
  let lineupId: string | null = null; let eligible = ids; let timed = true;
  let duelStartsImmediately = false;
  let teamDuelUnavailable = false;
  if (entry.stage.kind === 'route') {
    const opened = await openRoute(tx, sessionId, entry.stage, ids);
    presentation = opened.presentation; eligible = opened.eligibility; lineupId = opened.lineupId;
  }
  // Show-only scenes have nobody answering.
  if (isShowOnly(entry.stage)) eligible = [];
  // A Pick teams scene: the game's teams are proposed here and wait, untimed, for the host to confirm them.
  if (entry.stage.kind === 'teams') {
    const teamPlay = { kind: 'teams' as const, lineup: { kind: 'game' as const }, answers: entry.stage.captains ? 'captain' as const : 'everyone' as const, points: 'both' as const };
    presentation = { teamPlay: { answers: teamPlay.answers, points: teamPlay.points }, forming: await startForming(tx, sessionId, entry.stage.form, teamPlay, 'game', entry.stage.carryover ?? 'fresh', ids) };
    eligible = []; timed = false;
  }
  // A duel: everyone but the two duelists bets; when the host picks the pair, betting waits (untimed) until then.
  if (entry.stage.kind === 'duel') {
    if (poolTryout) {
      const poolStage = { ...entry.stage, contest: { kind: 'game' as const, game: 'eight-ball' as const,
        settings: { ...(poolTryout.ballBehavior ? { ballBehavior: poolTryout.ballBehavior } : {}), ...(poolTryout.start ? { start: poolTryout.start } : {}) } } };
      const duel = poolTryout.players ? openPoolTryout(poolStage, poolTryout.players) : openDuel(poolStage, ids).duel;
      requireGame(duel.match?.game === 'eight-ball', 'INELIGIBLE');
      presentation = { duel };
      eligible = [];
      timed = false;
      duelStartsImmediately = true;
    } else if (entry.stage.pick === 'teams') {
      const lineup = await gameLineupForRound(tx, sessionId, ids);
      const duel = openTeamPool(entry.stage, ids, lineup?.members ?? []);
      lineupId = lineup?.id ?? null;
      presentation = { duel };
      eligible = [];
      timed = false;
      duelStartsImmediately = true;
      teamDuelUnavailable = !duel.match;
    } else {
      const opened = openDuel(entry.stage, ids);
      presentation = { duel: opened.duel }; eligible = opened.eligible; timed = opened.timed;
    }
  }
  const play = entry.stage.kind === 'route' || entry.stage.kind === 'duel' || entry.stage.kind === 'teams' || isShowOnly(entry.stage) ? { kind: 'solo' as const } : effectivePlay(definition, entry.stage);
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
      presentation = { ...presentation, teamPlay, forming: await startForming(tx, sessionId, form, play, play.lineup.kind === 'round' ? 'round' : 'game', play.lineup.kind === 'reform' ? play.lineup.carryover : 'fresh', ids) };
      eligible = []; timed = false;
    }
  }
  // A scene that explains itself first waits, untimed (and a minigame unstarted), until the host starts it.
  if (explainsFirst(entry.stage)) { presentation = { ...presentation, explain: { readyIds: [] } }; timed = false; }
  // A minigame starts (after its countdown) as soon as players can play it.
  if (timed) presentation = { ...presentation, ...countdownPresentation(entry.stage, now, eligible, (await tx.gameSession.findUniqueOrThrow({ where: { id: sessionId }, select: { state: true } })).state) };
  const poolSeconds = duelStartsImmediately && !teamDuelUnavailable && entry.stage.kind === 'duel' ? poolTryout?.seconds ?? entry.stage.matchSeconds : undefined;
  const duration = poolSeconds !== undefined ? poolSeconds * 1000 : timed ? await startedDuration(tx, entry.stage, lineupId, presentation, now) : null;
  const stage = await tx.stageRun.create({ data: { sessionId, number, nodeKey: entry.nodeKey, stageKey: entry.stage.key, openedAt: now, presentation, lineupId,
    ...(duelStartsImmediately ? { status: 'CLOSED', closedAt: now, ...(teamDuelUnavailable ? { revealedAt: now } : {}) } : {}),
    ...timerColumns(duration, false, now), eligibility: { formatVersion: 1, playerIds: eligible } } });
  await tx.gameSession.update({ where: { id: sessionId }, data: { status: 'RUNNING', currentNodeKey: entry.nodeKey } });
  return stage;
}

// `roomState`: the room's own state, for the host's own words (Galgje, Undercover) at the start of a round.
const startOf = (stage: Extract<StageDefinition, { kind: 'minigame' }>, now: Date, roomState?: unknown) => {
  const rules = minigameRules(stage);
  return startMinigame(rules.game, withRoomWords(rules.game, rules.settings, roomState), now, undefined, stage.countdownSeconds === undefined ? MINIGAME_COUNTDOWN_MS : stage.countdownSeconds * 1000);
};
/** A run started again (after a pause, or with a new timer) keeps what was drawn for it: Galgje's word. */
const keepDrawn = (run: { hangmanWord?: string | undefined } | null | undefined) => run?.hangmanWord ? { hangmanWord: run.hangmanWord } : {};
function countdownPresentation(stage: StageDefinition, now: Date, playerIds: string[] = [], roomState?: unknown) {
  if (stage.kind === 'minigame') {
    const minigame = startOf(stage, now, roomState); const rules = minigameRules(stage);
    // Undercover: the words and roles are dealt now, kept next to the run (so a pause or a new timer keeps them).
    return { minigame, ...(rules.game === 'undercover' ? { undercover: dealUndercover(withRoomWords(rules.game, rules.settings, roomState) as MinigameSettings<'undercover'>, playerIds, new Date(minigame.startsAt), randomInt) } : {}) };
  }
  if (stage.kind === 'collect' && stage.input.kind === 'drawing' && stage.countdownSeconds)
    return { drawingStartsAt: new Date(now.getTime() + stage.countdownSeconds * 1000).toISOString() };
  return {};
}
function playableDuration(stage: StageDefinition, duration: number | null) {
  if (stage.kind === 'minigame' && (stage.game === 'clap-beat' || stage.game === 'cut-the-line' || stage.game === 'match-the-angle') && duration !== null) {
    return duration + (stage.countdownSeconds === undefined ? MINIGAME_COUNTDOWN_MS : stage.countdownSeconds * 1000);
  }
  return duration === null ? null : duration + ('countdownSeconds' in stage ? (stage.countdownSeconds ?? 0) * 1000 : 0);
}
async function startedDuration(tx: Transaction, stage: StageDefinition, lineupId: string | null, presentation: unknown, now: Date) {
  if (stage.kind === 'minigame' && stage.game === 'count-the-dots') {
    const dots = readMinigameRun(presentation)?.dots;
    requireGame(dots, 'INVALID_STATE');
    return Date.parse(dots.guessAt) - now.getTime() + (stage.durationMs ?? MINIGAMES[stage.game].defaultSeconds * 1000);
  }
  if (stage.kind === 'minigame' && (isSharedPrediction(stage.game) || stage.game === 'draw-the-graph')) {
    const countdown = stage.countdownSeconds === undefined ? MINIGAME_COUNTDOWN_MS : stage.countdownSeconds * 1000;
    return countdown + (stage.durationMs ?? MINIGAMES[stage.game].defaultSeconds * 1000);
  }
  const duration = playableDuration(stage, stage.durationMs);
  if (duration === null || stage.kind !== 'minigame' || stage.game !== 'relay-drawing') return duration;
  const settings = minigameRules(stage).settings as MinigameSettings<'relay-drawing'>;
  if (!settings.animation) return duration;
  const context = await teamContext(tx, { lineupId, presentation });
  const run = readMinigameRun(presentation);
  if (!context || !run) return duration;
  return Math.max(duration, relayPlan(context, settings, run).guessUntil - now.getTime());
}

function drawingStartsAt(presentation: unknown): string | undefined {
  const at = (presentation as { drawingStartsAt?: unknown } | null)?.drawingStartsAt;
  return typeof at === 'string' ? at : undefined;
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

/**
 * The most a host may give one player or team in a judged stage (a challenge, or a writing, upload or drawing
 * round with host points): its maximum, or its 1st place when it pays by place. Null: the host does not judge it.
 */
const judgeLimit = (stage: StageDefinition) => { const rules = judging(stage); if (!rules) return null; const top = stagePlaces(stage)?.[0]; const max = BigInt(rules.maxAwardMilli); return top && BigInt(top) > max ? BigInt(top) : max; };

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
    const seat = await tx.sessionPlayer.update({ where: { id: actor.playerId }, data: { look: command.look } });
    // A person keeps their character for the next game (the parts only; a picture belongs to this room).
    if (seat.personId) { const { picture: _picture, ...parts } = command.look; await tx.person.update({ where: { id: seat.personId }, data: { look: parts } }); }
    return empty;
  }
  if (command.type === 'player.moderate') {
    const player = await tx.sessionPlayer.findFirst({ where: { id: command.playerId, sessionId: session.id, leftAt: null } });
    requireGame(player, 'INELIGIBLE');
    const look = PlayerLookSchema.safeParse(player.look);
    if (command.photoId) requireGame(await tx.asset.count({ where: { id: command.photoId, sessionId: session.id, playerId: player.id, purpose: 'AVATAR', kind: 'IMAGE', removedAt: null } }) === 1, 'INVALID_COMMAND');
    await tx.sessionPlayer.update({ where: { id: player.id }, data: {
      ...(command.displayName ? { displayName: command.displayName } : {}),
      ...(command.photoId ? { look: { ...(look.success ? look.data : defaultLook(player.id)), picture: { assetId: command.photoId, kind: 'photo' } } } : {}),
    } });
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
  const roomState = (session.state ?? {}) as { tryout?: boolean; roomClosed?: boolean; nextRoom?: string | null };
  if (command.type === 'minigame.tryout') {
    requireGame(session.mode === 'REHEARSAL' && roomState.tryout === true, 'FORBIDDEN');
    requireGame(session.status !== 'FINISHED' && !roomState.roomClosed && !roomState.nextRoom, 'INVALID_STATE');
    const chosen = locateStage(definition, command.game, 'play');
    const pool = command.game === 'eight-ball' && chosen?.stage.kind === 'duel' &&
      chosen.stage.contest?.kind === 'game' && chosen.stage.contest.game === 'eight-ball';
    requireGame(chosen && (pool || (chosen.stage.kind === 'minigame' && chosen.stage.game === command.game)), 'INVALID_COMMAND');
    const players = await present(tx, session.id);
    const minPlayers = TEAM_MINIGAMES.some(game => game === command.game) ? 2 : 1;
    requireGame(players.length >= minPlayers, 'INELIGIBLE');
    const poolPlayers = command.poolPlayers ?? (pool && players.length === 1 ? [players[0]!] as [string] : undefined);
    if (poolPlayers) {
      requireGame(pool, 'INVALID_COMMAND');
      requireGame(new Set(poolPlayers).size === poolPlayers.length && poolPlayers.every(id => players.includes(id)), 'INELIGIBLE');
    }
    if (command.poolSeconds !== undefined) requireGame(pool && (poolPlayers?.length ?? players.length) >= 2, 'INVALID_COMMAND');
    if (command.poolBallBehavior !== undefined || command.poolStart !== undefined) requireGame(pool, 'INVALID_COMMAND');
    const previous = await tx.stageRun.findFirst({ where: { sessionId: session.id }, orderBy: { number: 'desc' } });
    if (previous?.status === 'ACTIVE') {
      // An abandoned attempt stays in history without a reveal or a score award.
      await tx.stageRun.update({ where: { id: previous.id }, data: { status: 'CLOSED', closedAt: now, deadlineAt: null, pausedRemainingMs: null } });
    } else if (previous?.deadlineAt || previous?.pausedRemainingMs != null) {
      await tx.stageRun.update({ where: { id: previous.id }, data: timerColumns(null, false, now) });
    }
    if (session.status === 'PAUSED') {
      await tx.gameSession.update({ where: { id: session.id }, data: { state: { ...roomState, breakStartedAt: null, breakVoters: [] } } });
    }
    return { ...empty, stageRunId: (await openStage(tx, session.id, (previous?.number ?? 0) + 1, chosen, definition, now,
      pool ? { players: poolPlayers, seconds: command.poolSeconds, ballBehavior: command.poolBallBehavior, start: command.poolStart } : undefined)).id };
  }
  if (command.type === 'session.start') {
    requireGame(session.status === 'LOBBY' && !roomState.tryout, 'INVALID_STATE');
    return { ...empty, stageRunId: (await openStage(tx, session.id, 1, firstStage(definition), definition, now)).id };
  }
  if (command.type === 'session.pause' || command.type === 'session.resume') {
    requireGame(session.status === (command.type === 'session.pause' ? 'RUNNING' : 'PAUSED'), 'INVALID_STATE');
    const pausing = command.type === 'session.pause';
    // Continuing also ends a break (the room remembers a break in its state) and clears any votes for one.
    const state = session.state && typeof session.state === 'object' && !Array.isArray(session.state) ? session.state as Record<string, unknown> : {};
    await tx.gameSession.update({ where: { id: session.id }, data: { status: pausing ? 'PAUSED' : 'RUNNING', ...(pausing ? {} : { state: { ...state, breakStartedAt: null, breakVoters: [] } as object }) } });
    // A pause freezes the clock; resuming restarts it with the same remainder.
    const active = await tx.stageRun.findFirst({ where: { sessionId: session.id, OR: [{ status: 'ACTIVE' }, { deadlineAt: { not: null } }, { pausedRemainingMs: { not: null } }] }, orderBy: { number: 'desc' } });
    if (active) {
      // A pause stops a running minigame on every phone (they stop playing while the room is paused);
      // resuming gives everyone who has not finished a fresh countdown. Lucky doors keep their secret order.
      const entry = locateRunStage(definition, active); const run = readMinigameRun(active.presentation);
      let restart = {};
      const startsAt = drawingStartsAt(active.presentation);
      if (startsAt) {
        const stored = active.presentation as Record<string, unknown>;
        const remaining = pausing ? Math.max(0, Date.parse(startsAt) - now.getTime()) : Number(stored['pausedDrawingMs'] ?? 0);
        restart = { presentation: { ...stored, drawingStartsAt: new Date(now.getTime() + remaining).toISOString(), pausedDrawingMs: pausing ? remaining : 0 } as object };
      }
      if (pausing && entry?.stage.kind === 'minigame' && entry.stage.game === 'speed-run' && run) {
        const raceElapsedMs = (run.raceElapsedMs ?? 0) + Math.max(0, now.getTime() - Date.parse(run.startsAt));
        restart = { presentation: { ...(active.presentation as object), minigame: { ...run, raceElapsedMs } } };
      }
      if (pausing && entry?.stage.kind === 'minigame' && run?.relayPrompts) {
        restart = { presentation: { ...(active.presentation as object), minigame: { ...run, relayPausedAt: now.toISOString() } } };
      }
      if (run?.dots) {
        const updated = pausing ? { dots: { ...run.dots, pausedAt: now.toISOString() } }
          : shiftDotWindow(run.startsAt, run.dots, Date.parse(run.dots.pausedAt ?? now.toISOString()), now);
        restart = { presentation: { ...(active.presentation as object), minigame: { ...run, ...updated } } };
      } else if (!pausing && run && (run.cutTarget !== undefined || run.angleTarget !== undefined || run.graph)) {
        // Keep the target and let the remaining timer be used entirely for play.
        restart = { presentation: { ...(active.presentation as object), minigame: { ...run, startsAt: now.toISOString() } } };
      } else if (!pausing && entry?.stage.kind === 'minigame' && run) {
        // Step games keep their sides; a running team vote gets its full time again.
        const rules0 = minigameRules(entry.stage);
        const countdownMs = entry.stage.countdownSeconds === undefined ? MINIGAME_COUNTDOWN_MS : entry.stage.countdownSeconds * 1000;
        const steps = run.steps ? Object.fromEntries(Object.entries(run.steps).map(([key, side]) => [key, side.voteEndsAt ? { ...side, voteEndsAt: new Date(now.getTime() + countdownMs + rules0.voteSeconds * 1000).toISOString() } : side])) : null;
        let started = { ...startOf(entry.stage, now), ...keepDrawn(run), doorsMilli: run.doorsMilli, ...(run.coin ? { coin: run.coin } : {}), ...(run.roulette === undefined ? {} : { roulette: run.roulette }), ...(run.raceElapsedMs === undefined ? {} : { raceElapsedMs: run.raceElapsedMs }), ...(run.relayPrompts === undefined ? {} : { relayPrompts: run.relayPrompts }), ...(steps ? { steps } : {}) };
        // Pass the pencil continues at the first turn some team has not drawn yet, with a fresh countdown.
        const rules = minigameRules(entry.stage); const context = rules.game === 'relay-drawing' ? await teamContext(tx, active) : null;
        if (run.relayPausedAt && run.relayPrompts) {
          const paused = Math.max(0, now.getTime() - Date.parse(run.relayPausedAt));
          started = { ...started, startsAt: new Date(Date.parse(run.startsAt) + paused).toISOString() };
        } else if (context) {
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
  if (command.type === 'score.verdict') {
    // Like corrections: during and after the game, on any revealed quiz or ordering round.
    requireGame(session.status !== 'LOBBY', 'INVALID_STATE');
    const result = await answerVerdict(tx, session.id, definition, { commandId: command.commandId, submissionId: command.submissionId, correct: command.correct });
    return { ...empty, awards: result.awards, verdict: result.verdict };
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
  const entry = locateRunStage(definition, stage);
  requireGame(entry, 'INVALID_STATE');
  const choice = entry.stage.kind === 'route' ? entry.stage : null;
  const decided = choice ? await tx.routeDecision.findUnique({ where: { stageRunId: stage.id } }) : null;
  if (command.type === 'wheel.spin') {
    // The host spins the wheel set on this scene, as often as they like while the scene is on.
    await spinWheel(tx, session.id, definition, stage, entry.stage, now);
    return { ...empty, stageRunId: stage.id };
  }
  if (command.type === 'duel.pick') {
    requireGame(entry.stage.kind === 'duel', 'INVALID_STATE');
    const picked = await pickDuelists(tx, stage, entry.stage, command.playerIds, await present(tx, session.id));
    // Betting starts now, with the scene's betting time.
    await tx.stageRun.update({ where: { id: stage.id }, data: { presentation: { ...(stage.presentation as object), duel: picked.duel as object }, eligibility: { formatVersion: 1, playerIds: picked.eligible }, ...timerColumns(entry.stage.durationMs, false, now) } });
    return { ...empty, stageRunId: stage.id };
  }
  if (command.type === 'duel.decide') {
    // Naming the winner closes the betting, pays out and shows the result, in one step.
    requireGame(entry.stage.kind === 'duel', 'INVALID_STATE');
    const duel = readDuel(stage.presentation);
    const decided = await decideDuel(tx, stage, entry.stage, command.winnerId,
      entry.stage.contest?.kind === 'game' && entry.stage.contest.game === 'eight-ball' ? pickTimedPoolWinner(duel, command.winnerId) : duel);
    await tx.stageRun.update({ where: { id: stage.id }, data: { presentation: { ...(stage.presentation as object), duel: decided.duel as object },
      ...(stage.status === 'ACTIVE' ? { status: 'CLOSED', closedAt: now, deadlineAt: null, pausedRemainingMs: null } : {}) } });
    await reveal(tx, { ...stage, status: 'CLOSED' }, now);
    return { ...empty, stageRunId: stage.id, awards: decided.awards };
  }
  if (command.type === 'duel.move' || command.type === 'duel.resign') {
    // A duelist plays the duel's game (after betting has closed). A win names the winner and pays out at once; a draw in Arcade ends the round.
    requireGame(actor.role === 'player' && entry.stage.kind === 'duel', 'INVALID_STATE');
    requireGame(stage.status !== 'CLOSED' || !stage.deadlineAt || now < stage.deadlineAt, 'TOO_LATE');
    const played = duelPlay(stage, actor.playerId, command.type === 'duel.move' ? { move: command.move } : { resign: true });
    if (!played.winnerId) {
      await tx.stageRun.update({ where: { id: stage.id }, data: { presentation: { ...(stage.presentation as object), duel: played.duel as object } } });
      const match = played.duel.match;
      const outcome = match ? matchOutcome(match) : null;
      const pool = match?.game === 'eight-ball';
      const drawEndsRound = outcome?.kind === 'draw' && (pool || await tx.arcadeRound.count({ where: { sessionId: session.id, endedAt: null } }) > 0);
      if (outcome && ((pool && played.duel.practicePlayerId) || drawEndsRound)) {
        await tx.stageRun.update({ where: { id: stage.id }, data: timerColumns(null, false, now) });
        await reveal(tx, stage, now);
      }
      return { ...empty, stageRunId: stage.id };
    }
    const decided = await decideDuel(tx, stage, entry.stage, played.winnerId, played.duel);
    await tx.stageRun.update({ where: { id: stage.id }, data: { ...timerColumns(null, false, now), presentation: { ...(stage.presentation as object), duel: decided.duel as object } } });
    await reveal(tx, stage, now);
    return { ...empty, stageRunId: stage.id, awards: decided.awards };
  }
  if (command.type === 'route.decide') {
    // The host may pick any option, at any time until a route is recorded.
    requireGame(choice, 'INVALID_STATE');
    requireGame(!decided, 'ALREADY_DECIDED');
    requireGame(choice.options.some(option => option.key === command.optionKey), 'INVALID_COMMAND');
    if (stage.status === 'ACTIVE') await tx.stageRun.update({ where: { id: stage.id }, data: { status: 'CLOSED', closedAt: now, deadlineAt: null, pausedRemainingMs: null } });
    const { counts, voterCount } = await countsFor(tx, stage, choice);
    const tie = pendingReason(counts, choice) === 'tie' && leadersOf(counts).includes(command.optionKey);
    // A minigame draw shows its result as it is made, so the host's own pick is announced at once too.
    if (choice.decide.method === 'draw') await reveal(tx, { ...stage, status: 'CLOSED' }, now);
    return { ...empty, stageRunId: stage.id, decision: decisionFor(definition, stage, choice, { optionKey: command.optionKey, reason: tie ? 'TIE_BREAK' : 'HOST' },
      { voterCount, counts, leaders: leadersOf(counts), resolution: 'host', random: null, closedBy: 'decide' }) };
  }
  if (command.type === 'stage.advance') {
    requireGame(!roomState.tryout, 'INVALID_STATE');
    // A show-only scene ends when the host moves on; other stages are closed first.
    // A Pick teams scene ends once its teams are confirmed.
    const done = isShowOnly(entry.stage) || (entry.stage.kind === 'teams' && !readForming(stage.presentation));
    requireGame((stage.status === 'CLOSED' || (stage.status === 'ACTIVE' && done)) && latest?.id === stage.id, 'INVALID_STATE');
    // Moving on makes the finished stage's results public, except answers that a
    // later vote still needs to show without names; the vote's reveal uncovers those.
    // A route goes where its recorded decision says, even after a restart; never a fresh vote.
    const next = nextStage(definition, { nodeKey: stage.nodeKey, stageKey: stage.stageKey }, decided ? { selectedEdgeKey: decided.selectedEdgeKey, destinationNodeKey: decided.destinationNodeKey } : null);
    requireGame(next !== 'DECISION_PENDING', 'DECISION_PENDING');
    if (stage.status === 'ACTIVE') await tx.stageRun.update({ where: { id: stage.id }, data: { status: 'CLOSED', closedAt: now, deadlineAt: null, pausedRemainingMs: null } });
    else if (stage.deadlineAt || stage.pausedRemainingMs !== null) await tx.stageRun.update({ where: { id: stage.id }, data: timerColumns(null, false, now) });
    let awards: Award[] = [];
    if (!stage.revealedAt && !isVoteSource(definition, entry.nodeKey, entry.stage.key)) { await reveal(tx, stage, now); awards = await revealAwards(tx, stage, entry.stage); }
    if (next === 'END') {
      await tx.gameSession.update({ where: { id: session.id }, data: { status: 'FINISHED', endedAt: now, currentNodeKey: null } });
      return { ...empty, awards };
    }
    return { ...empty, awards, stageRunId: (await openStage(tx, session.id, stage.number + 1, next, definition, now)).id };
  }
  if (command.type === 'stage.close' || command.type === 'stage.timeout') {
    if (command.type === 'stage.timeout' && stage.status === 'CLOSED' && entry.stage.kind === 'duel') {
      requireGame(!stage.revealedAt && stage.deadlineAt && now >= stage.deadlineAt, 'INVALID_STATE');
      const timed = endTimedPool(stage);
      requireGame(timed.match, 'INVALID_STATE');
      const outcome = matchOutcome(timed.match);
      const decided = outcome?.kind === 'win' ? await decideDuel(tx, stage, entry.stage, duelists(timed)![outcome.seat], timed) : null;
      await tx.stageRun.update({ where: { id: stage.id }, data: { ...timerColumns(null, false, now), presentation: { ...(stage.presentation as object), duel: (decided?.duel ?? timed) as object } } });
      if (decided) await reveal(tx, stage, now);
      return { ...empty, stageRunId: stage.id, awards: decided?.awards ?? [] };
    }
    requireGame(stage.status === 'ACTIVE', 'INVALID_STATE');
    // Teams must be confirmed before a team round can end: later rounds (and the
    // validator) rely on a lineup existing once a team round has run.
    requireGame(!readForming(stage.presentation), 'INVALID_STATE');
    // Automatic closing can never end a stage early or override a pause/extension.
    if (command.type === 'stage.timeout') requireGame(stage.deadlineAt && now.getTime() >= closesAt(stage.deadlineAt, graceFor(entry.stage)), 'INVALID_STATE');
    const prediction = entry.stage.kind === 'minigame' && isSharedPrediction(entry.stage.game);
    // Heads or Tails may wait for the host to flip (Reveal) instead of landing as the guesses close.
    const flip = prediction && !hostFlips(entry.stage);
    if (prediction) {
      const run = readMinigameRun(stage.presentation);
      requireGame(run?.coin !== undefined || run?.roulette !== undefined, 'INVALID_STATE');
    }
    const poolSeconds = entry.stage.kind === 'duel' && readDuel(stage.presentation)?.match?.game === 'eight-ball' ? entry.stage.matchSeconds : undefined;
    await tx.stageRun.update({ where: { id: stage.id }, data: { status: 'CLOSED', closedAt: now, ...timerColumns(poolSeconds === undefined ? null : poolSeconds * 1000, false, now) } });
    if (flip) {
      await reveal(tx, stage, now);
      return { ...empty, stageRunId: stage.id, awards: await revealAwards(tx, stage, entry.stage) };
    }
    // A route vote tallies once as it closes; a tie or empty vote may wait for the host.
    // A minigame draw is drawn as it closes and shown to everyone at once.
    const decision = choice ? await closeRoute(tx, definition, stage, choice, command.type === 'stage.timeout' ? 'timeout' : 'close') : null;
    if (choice?.decide.method === 'draw') await reveal(tx, stage, now);
    return { ...empty, stageRunId: stage.id, decision };
  }
  const forming = readForming(stage.presentation);
  if (command.type.startsWith('teams.')) {
    requireGame(stage.status === 'ACTIVE' && forming, 'INVALID_STATE');
    if (command.type === 'teams.choose' || command.type === 'teams.vote') requireGame(actor.role === 'player', 'FORBIDDEN');
    const result = await formingCommand(tx, session.id, forming, command as { type: string; playerId?: string; teamIndex?: number | null; method?: 'skill'; color?: string; pick?: string; celebration?: TeamCelebration | null; amountMilli?: string }, actor.role === 'player' ? actor.playerId : null, await present(tx, session.id));
    const { forming: _done, ...rest } = stage.presentation as Record<string, unknown>;
    if ('lineupId' in result) {
      // Confirmed: the round starts now, with its timer, for the players in a team (after its explanation, if it has one).
      const explaining = Boolean(readExplain(rest));
      const started = explaining ? rest : { ...rest, ...countdownPresentation(entry.stage, now, [], session.state) };
      await tx.stageRun.update({ where: { id: stage.id }, data: { lineupId: result.lineupId, presentation: started as object, eligibility: { formatVersion: 1, playerIds: result.playerIds }, ...(explaining ? {} : timerColumns(await startedDuration(tx, entry.stage, result.lineupId, started, now), false, now)) } });
    } else await tx.stageRun.update({ where: { id: stage.id }, data: { presentation: { ...rest, forming: result.forming } as object } });
    return { ...empty, stageRunId: stage.id };
  }
  const explaining = readExplain(stage.presentation);
  if (command.type === 'stage.understood') {
    // A player has read the explanation (once; tapping again changes nothing).
    requireGame(actor.role === 'player' && stage.status === 'ACTIVE' && explaining, 'INVALID_STATE');
    if (!explaining.readyIds.includes(actor.playerId)) await tx.stageRun.update({ where: { id: stage.id }, data: { presentation: withReady(stage.presentation, actor.playerId) } });
    return { ...empty, stageRunId: stage.id };
  }
  if (command.type === 'stage.explained') {
    // The host starts the round: its timer runs from now and a minigame starts its countdown. Teams come first.
    requireGame(stage.status === 'ACTIVE' && explaining && !forming, 'INVALID_STATE');
    const rest = withoutExplain(stage.presentation);
    const started = { ...rest, ...countdownPresentation(entry.stage, now, EligibilitySchema.safeParse(stage.eligibility).data?.playerIds ?? [], session.state) };
    await tx.stageRun.update({ where: { id: stage.id }, data: { presentation: started as object, ...timerColumns(await startedDuration(tx, entry.stage, stage.lineupId, started, now), false, now) } });
    return { ...empty, stageRunId: stage.id };
  }
  if (command.type === 'stage.timer') {
    requireGame(stage.status === 'ACTIVE' && !forming && !explaining, 'INVALID_STATE');
    const current = remainingMs(stage, now);
    const change = command.change;
    requireGame(change.kind !== 'add' || current !== null, 'INVALID_STATE');
    const dots = change.kind === 'set' ? readMinigameRun(stage.presentation)?.dots : undefined;
    // Replacing the guess timer during viewing leaves the rest of the viewing phase intact.
    const beforeGuess = dots ? Math.max(0, Date.parse(dots.guessAt) - (dots.pausedAt ? Date.parse(dots.pausedAt) : now.getTime())) : 0;
    const next = change.kind === 'clear' ? null : change.kind === 'set' ? change.ms + beforeGuess : current! + change.ms;
    requireGame(next === null || next <= MAX_REMAINING_MS, 'INVALID_STATE');
    await tx.stageRun.update({ where: { id: stage.id }, data: timerColumns(next, session.status === 'PAUSED', now) });
    return { ...empty, stageRunId: stage.id };
  }
  if (command.type === 'stage.graphPlayback') {
    requireGame(stage.revealedAt && entry.stage.kind === 'minigame' &&
      entry.stage.game === 'draw-the-graph' && entry.stage.settings?.revealEasing !== 'instant' && readMinigameRun(stage.presentation)?.graph, 'INVALID_STATE');
    const presentation = stage.presentation as Record<string, unknown>;
    const graphPlayback = changeGraphPlayback(presentation, stage.revealedAt, command.action, now);
    await tx.stageRun.update({ where: { id: stage.id }, data: { presentation: { ...presentation, graphPlayback } } });
    return { ...empty, stageRunId: stage.id };
  }
  if (command.type === 'stage.nextResult') {
    requireGame(stage.revealedAt && 'resultCards' in entry.stage && entry.stage.resultCards === 'manual', 'INVALID_STATE');
    const presentation = stage.presentation as Record<string, unknown>;
    const index = typeof presentation['resultCardIndex'] === 'number' ? presentation['resultCardIndex'] : 0;
    const source = VotePresentationSchema.safeParse(stage.presentation);
    const total = await tx.submission.count({ where: { stageRunId: source.success ? source.data.sourceStageRunId : stage.id, slotKey: 'answer' } });
    requireGame(index + 1 < total, 'INVALID_STATE');
    await tx.stageRun.update({ where: { id: stage.id }, data: { presentation: { ...presentation, resultCardIndex: index + 1 } as object } });
    return { ...empty, stageRunId: stage.id };
  }
  if (command.type === 'stage.reveal' || command.type === 'stage.autoReveal') {
    requireGame(stage.status === 'CLOSED' && !stage.revealedAt, 'INVALID_STATE');
    // Announcing a route needs the route to be decided; a duel is shown by naming its winner.
    requireGame(!choice || decided, 'DECISION_PENDING');
    requireGame(entry.stage.kind !== 'duel', 'DECISION_PENDING');
    // Names on answers that are about to be voted on would spoil the anonymous vote.
    requireGame(!isVoteSource(definition, entry.nodeKey, entry.stage.key), 'INVALID_STATE');
    if (command.type === 'stage.autoReveal') {
      const delay = (session.state as { autoRevealSeconds?: number | null } | null)?.autoRevealSeconds;
      requireGame(typeof delay === 'number' && stage.closedAt && now.getTime() >= stage.closedAt.getTime() + delay * 1000 &&
        !isShowOnly(entry.stage) && entry.stage.kind !== 'teams' && !readExplain(stage.presentation) && !hostFlips(entry.stage), 'INVALID_STATE');
      if (entry.stage.kind === 'challenge') {
        const eligible = EligibilitySchema.parse(stage.eligibility).playerIds;
        requireGame(await tx.stageJudgment.count({ where: { stageRunId: stage.id, playerId: { in: eligible } } }) === eligible.length, 'INVALID_STATE');
      }
    }
    await reveal(tx, stage, now);
    return { ...empty, stageRunId: stage.id, awards: await revealAwards(tx, stage, entry.stage) };
  }
  if (command.type === 'stage.reopen') {
    // Once the answer has been shown, or a judgment recorded, the stage stays closed.
    requireGame(stage.status === 'CLOSED' && !stage.revealedAt, 'INVALID_STATE');
    requireGame(entry.stage.kind !== 'duel' || readDuel(stage.presentation)?.match?.game !== 'eight-ball', 'INVALID_STATE');
    // An undecided vote may be reopened (existing votes stay); a recorded route is final.
    requireGame(!decided, 'ALREADY_DECIDED');
    requireGame(await tx.stageJudgment.count({ where: { stageRunId: stage.id } }) === 0, 'ALREADY_JUDGED');
    // A reopened minigame starts again for those who have not played; results already sent stay.
    const previousGame = readMinigameRun(stage.presentation);
    const steps = previousGame?.steps; // A step game keeps what its sides have played.
    const raceTimer = entry.stage.kind === 'minigame' && entry.stage.game === 'speed-run' && previousGame && stage.closedAt
      ? { raceElapsedMs: (previousGame.raceElapsedMs ?? 0) + Math.max(0, stage.closedAt.getTime() - Date.parse(previousGame.startsAt)) }
      : {};
    let restarted = {};
    let duration = command.durationMs;
    if (entry.stage.kind === 'minigame') {
      const run = previousGame?.dots && stage.closedAt
        ? { ...previousGame, ...shiftDotWindow(previousGame.startsAt, previousGame.dots, stage.closedAt.getTime(), now) }
        : previousGame && (previousGame.cutTarget !== undefined || previousGame.angleTarget !== undefined || previousGame.graph)
        ? { ...previousGame, startsAt: now.toISOString() }
        : { ...startOf(entry.stage, now), ...keepDrawn(previousGame), ...raceTimer, ...(steps ? { steps } : {}) };
      if (run.dots && duration !== null) duration += Math.max(0, Date.parse(run.dots.guessAt) - now.getTime());
      const relayContext = previousGame?.relayPrompts ? await teamContext(tx, stage) : null;
      if (previousGame?.relayPrompts && relayContext) {
        const settings = minigameRules(entry.stage).settings as MinigameSettings<'relay-drawing'>;
        const plan = relayPlan(relayContext, settings, previousGame);
        run.startsAt = new Date(Date.parse(run.startsAt) - plan.turns * plan.turnMs).toISOString();
        run.relayPrompts = previousGame.relayPrompts;
      }
      restarted = { presentation: { ...(stage.presentation as object), minigame: run } };
    }
    await tx.stageRun.update({ where: { id: stage.id }, data: { status: 'ACTIVE', closedAt: null, ...restarted, ...timerColumns(duration, false, now) } });
    return { ...empty, stageRunId: stage.id };
  }
  const eligible = EligibilitySchema.safeParse(stage.eligibility);
  requireGame(eligible.success, 'INVALID_STATE');
  const context = await teamContext(tx, stage);
  if (command.type === 'stage.judgeTeam') {
    // One decision per team, recorded for each member so nobody is judged twice.
    // A challenge is judged once closed; an open round with host points once its answers are shown (closed, too).
    const limit = judgeLimit(entry.stage);
    requireGame(stage.status === 'CLOSED' && limit !== null && context, 'INVALID_STATE');
    const members = (context.members.get(command.teamId) ?? []).filter(id => eligible.data.playerIds.includes(id));
    requireGame(members.length, 'INELIGIBLE');
    const amountMilli = BigInt(command.amountMilli);
    requireGame(amountMilli <= limit, 'INVALID_SUBMISSION');
    requireGame(await tx.stageJudgment.count({ where: { stageRunId: stage.id, playerId: { in: members } } }) === 0, 'ALREADY_JUDGED');
    return { ...empty, stageRunId: stage.id, judgments: members.map(playerId => ({ playerId, amountMilli, stageRunId: stage.id })),
      awards: route({ amountMilli, stageRunId: stage.id, awardKey: `judgment:${stage.id}:team:${command.teamId}`, reason: 'Host judgment' }, { teamId: command.teamId }, context) };
  }
  if (command.type === 'stage.judge') {
    const limit = judgeLimit(entry.stage);
    requireGame(stage.status === 'CLOSED' && limit !== null && !context, 'INVALID_STATE');
    requireGame(eligible.data.playerIds.includes(command.playerId), 'INELIGIBLE');
    const amountMilli = BigInt(command.amountMilli);
    requireGame(amountMilli <= limit, 'INVALID_SUBMISSION');
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
  if (command.type === 'minigame.move' || command.type === 'minigame.decide') {
    // A step game (Drive the bus, Lucky doors, Left or right…): see minigames/shared/steps/engine.ts.
    requireGame(stage.status === 'ACTIVE' && entry.stage.kind === 'minigame' && !forming, 'INVALID_STATE');
    const rules = minigameRules(entry.stage); const run = readMinigameRun(stage.presentation);
    requireGame(isStepMinigame(rules.game) && run && now.getTime() >= Date.parse(run.startsAt) - (rules.game === 'speed-run' ? 0 : CLOCK_SLACK_MS), 'INVALID_STATE');
    const play = { tx, sessionId: session.id, stage, rules, context, now };
    // minigame.decide is a host command (checked for every host command above): the server's timer sends it as the host.
    if (command.type === 'minigame.decide') return { ...empty, stageRunId: stage.id, awards: (await stepDecide(play, command.side, command.step, command.now === true)).awards };
    requireGame(actor.role === 'player' && eligible.data.playerIds.includes(actor.playerId), 'INELIGIBLE');
    requireGame(!stage.deadlineAt || now.getTime() <= acceptsUntil(stage.deadlineAt, graceFor(entry.stage)), 'TOO_LATE');
    const moved = await stepMove(play, actor.playerId, command.step, command.option, command.decide === true);
    return { ...empty, stageRunId: stage.id, awards: moved.awards, ...(moved.submissionId ? { submissionId: moved.submissionId } : {}) };
  }
  if (command.type === 'undercover.act') {
    // Undercover / Mr. White: a clue given, a vote, Mr. White's guess, or moving on (see minigames/undercover/rules.ts).
    requireGame(stage.status === 'ACTIVE' && entry.stage.kind === 'minigame' && !explaining, 'INVALID_STATE');
    const rules = minigameRules(entry.stage); const table = readUndercover(stage.presentation); const run = readMinigameRun(stage.presentation);
    requireGame(rules.game === 'undercover' && table && run && now.getTime() >= Date.parse(run.startsAt) - CLOCK_SLACK_MS, 'INVALID_STATE');
    requireGame(actor.role === 'host' || (actor.role === 'player' && eligible.data.playerIds.includes(actor.playerId)), 'INELIGIBLE');
    const next = undercoverMove(table!, rules.settings as MinigameSettings<'undercover'>, command, actor.role === 'player' ? actor.playerId : null, now);
    await tx.stageRun.update({ where: { id: stage.id }, data: { presentation: { ...(stage.presentation as object), undercover: next } as object } });
    if (next.phase !== 'done') return { ...empty, stageRunId: stage.id };
    // Over: every player's role is their result, the winning side marked; the round then closes like any other.
    const winners = undercoverWinners(next);
    for (const [playerId, role] of Object.entries(next.roles)) {
      await tx.submission.create({ data: { id: randomUUID(), sessionId: session.id, stageRunId: stage.id, actorKey: `player:${playerId}`, playerId,
        value: { kind: 'minigame', value: UNDERCOVER_ROLES.indexOf(role), ...(winners.has(playerId) ? { won: true } : {}) } } });
    }
    return { ...empty, stageRunId: stage.id };
  }
  if (command.type === 'submission.submit') {
    requireGame(actor.role === 'player', 'FORBIDDEN');
    requireGame(stage.status === 'ACTIVE', 'INVALID_STATE');
    requireGame(!stage.deadlineAt || now.getTime() <= acceptsUntil(stage.deadlineAt, graceFor(entry.stage)), 'TOO_LATE');
    requireGame(!forming && !explaining, 'INVALID_STATE');
    requireGame(eligible.data.playerIds.includes(actor.playerId), 'INELIGIBLE');
    const startsAt = drawingStartsAt(stage.presentation);
    requireGame(!startsAt || now.getTime() >= Date.parse(startsAt), 'INVALID_STATE');
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
    if (entry.stage.kind === 'duel') {
      requireGame(command.value.kind === 'bet', 'INVALID_SUBMISSION');
      checkBet(stage, command.value.playerId);
      const earlier = await tx.submission.findUnique({ where: { stageRunId_actorKey_slotKey: { stageRunId: stage.id, actorKey: by.actorKey, slotKey: 'answer' } } });
      requireGame(!earlier, 'ALREADY_SUBMITTED');
      const bet = await tx.submission.create({ data: { id: randomUUID(), sessionId: session.id, stageRunId: stage.id, actorKey: by.actorKey, playerId: by.playerId, teamId: by.teamId, value: command.value } });
      return { stageRunId: stage.id, submissionId: bet.id };
    }
    requireGame(command.value.kind !== 'bet', 'INVALID_SUBMISSION');
    if (entry.stage.kind === 'vote') {
      const ballot = VotePresentationSchema.safeParse(stage.presentation);
      const ids = voteChoices(command.value);
      const { awardPerVoteMilli, voteMode, voteLimit } = entry.stage;
      const mode = voteMode ?? 'single';
      const limit = mode === 'single' ? 1 : voteLimit ?? 3;
      requireGame(ballot.success && ids.length > 0 && ids.length <= limit &&
        (mode === 'single' ? command.value.kind === 'vote' : command.value.kind === 'vote-list'), 'INVALID_SUBMISSION');
      const chosen = await tx.submission.findMany({ where: { id: { in: [...ids] }, sessionId: session.id, stageRunId: ballot.data.sourceStageRunId, slotKey: 'answer' } });
      requireGame(chosen.length === ids.length, 'INVALID_SUBMISSION');
      const source = await tx.stageRun.findUniqueOrThrow({ where: { id: ballot.data.sourceStageRunId } });
      const sourceTeams = await teamContext(tx, source);
      const ownTeam = sourceTeams?.teamOf.get(actor.playerId);
      for (const answer of chosen) {
        const authorTeam = answer.teamId ?? (answer.playerId ? sourceTeams?.teamOf.get(answer.playerId) : undefined);
        requireGame(answer.playerId !== actor.playerId && !(authorTeam && ownTeam === authorTeam), 'INVALID_SUBMISSION');
      }
      const earlier = await tx.submission.findUnique({ where: { stageRunId_actorKey_slotKey: { stageRunId: stage.id, actorKey: by.actorKey, slotKey: 'answer' } } });
      requireGame(!earlier, 'ALREADY_SUBMITTED');
      const vote = await tx.submission.create({ data: { id: randomUUID(), sessionId: session.id, stageRunId: stage.id, actorKey: by.actorKey, playerId: by.playerId, teamId: by.teamId, value: command.value } });
      return { stageRunId: stage.id, submissionId: vote.id, awards: chosen.flatMap(answer => {
        const weight = mode === 'ranked' ? limit - ids.indexOf(answer.id) : 1;
        return route({ amountMilli: BigInt(awardPerVoteMilli) * BigInt(weight), stageRunId: stage.id, awardKey: `vote:${vote.id}:${answer.id}`, reason: 'Vote received' }, { playerId: answer.playerId, teamId: answer.teamId }, sourceTeams);
      }) };
    }
    requireGame(voteChoices(command.value).length === 0, 'INVALID_SUBMISSION');
    if (entry.stage.kind === 'minigame') {
      // One result per player (or per team when a captain plays), checked against the clock.
      const claimed = command.value; const run = readMinigameRun(stage.presentation); const rules = minigameRules(entry.stage);
      requireGame(claimed.kind === 'minigame' && run, 'INVALID_SUBMISSION');
      const fair = live && actor.role === 'player' ? { latencyMs: live.latencyMs(session.id, actor.playerId), taps: live.taps(stage.id, run.startsAt, actor.playerId) } : NO_FAIRNESS;
      const value = { kind: 'minigame' as const, ...judgeResult(rules.game, rules.settings, run, claimed, now, fair) };
      if (rules.game === 'red-or-black-roulette' && value.value > 0) {
        // Roulette stakes come from the score the player can see (revealed rounds and corrections), or the round's minimum stake when that is higher.
        const score = await tx.scoreEntry.aggregate({ where: { sessionId: session.id, recipientPlayerId: actor.playerId, OR: [{ stageRunId: null }, { stage: { revealedAt: { not: null } } }] }, _sum: { amountMilli: true } });
        const floor = (rules.settings as MinigameSettings<'red-or-black-roulette'>).betFloor ?? ROULETTE_BET_FLOOR;
        requireGame(value.value <= rouletteBetLimit(Number((score._sum.amountMilli ?? 0n) / 1000n), floor), 'INVALID_SUBMISSION');
      }
      if (rules.game === 'relay-drawing') {
        // Votes open after the last turn, for another team's picture.
        requireGame(context, 'INVALID_STATE');
        const plan = relayPlan(context, rules.settings as MinigameSettings<'relay-drawing'>, run);
        const ownTeam = context.teamOf.get(actor.playerId);
        const animation = plan.animation(ownTeam ?? '');
        requireGame(now.getTime() >= plan.voteAt - (animation ? 0 : CLOCK_SLACK_MS), 'INVALID_STATE');
        requireGame(plan.teams.some(team => team.teamId === value.teamId) && ownTeam !== value.teamId, 'INVALID_SUBMISSION');
        if (animation) {
          requireGame(now.getTime() <= plan.guessUntil + CLOCK_SLACK_MS, 'TOO_LATE');
          requireGame(animation.targetTeamId === value.teamId, 'INVALID_SUBMISSION');
          const target = plan.animation(animation.targetTeamId!);
          requireGame(claimed.value < ANIMATION_WORDS.length && target, 'INVALID_SUBMISSION');
          const drawn = await tx.submission.count({
            where: { stageRunId: stage.id, playerId: { in: context.members.get(animation.targetTeamId!) ?? [] }, slotKey: { startsWith: 'part-' } },
          });
          requireGame(drawn > 0, 'INVALID_SUBMISSION');
          value.value = Number(claimed.value === target!.prompt);
        }
      }
      const prior = await tx.submission.findUnique({ where: { stageRunId_actorKey_slotKey: { stageRunId: stage.id, actorKey: by.actorKey, slotKey: 'answer' } } });
      requireGame(!prior, 'ALREADY_SUBMITTED');
      // For games with a time tiebreak, save the receipt time from before the room lock.
      const submission = await tx.submission.create({ data: { id: randomUUID(), sessionId: session.id, stageRunId: stage.id, actorKey: by.actorKey,
        playerId: by.playerId, teamId: by.teamId, value, ...(rules.tiebreak === 'faster' ? { receivedAt: now } : {}) } });
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

/** Heads or Tails set to wait for the host: the coin is flipped by the host's Reveal, never by closing or auto-reveal. */
function hostFlips(stage: { kind: string; game?: string; settings?: unknown }): boolean {
  return stage.kind === 'minigame' && stage.game === 'heads-or-tails' && (stage.settings as { flip?: string } | undefined)?.flip === 'host';
}
