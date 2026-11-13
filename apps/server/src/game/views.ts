import { type MinigameSettings, type Presentation, GameIdSchema, SessionViewSchema, SubmissionValueSchema, type SessionView } from '@party/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createHash } from 'node:crypto';
import { isVoteSource, minigameRules, parseDefinition, type StageDefinition } from './definition.js';
import { readMinigameRun } from '../minigames/rules.js';
import { relayPlan } from '../minigames/relay.js';
import { wheelView } from './wheel.js';
import { finaleSlides } from './finale.js';
import { minigameOutcome } from '../minigames/outcome.js';
import { locateStage } from './graph.js';
import { routeView } from './route-views.js';
import { GameError, requireGame } from './errors.js';
import type { Clock } from './timing.js';
import { answerKeyFor, stageTeams, teamContext, teamStandings } from './team-views.js';
import { actorKey, authorize, EligibilitySchema, TrustedActorSchema, VotePresentationSchema, type Transaction, type TrustedActor } from './model.js';

type Input = Extract<StageDefinition, { kind: 'collect' }>['input'];
// The stored item order may be the answer. Each viewer gets a stable shuffle,
// identical after a refresh, that reveals nothing about the authored order.
function publicInput(input: Input, seed: string): Input {
  if (input.kind !== 'order') return input;
  const rank = (key: string) => createHash('sha256').update(`${seed}:${key}`).digest('hex');
  return { ...input, items: [...input.items].sort((a, b) => rank(a.key) < rank(b.key) ? -1 : 1) };
}

/** Pass the pencil as screens see it: the turns, each team's drawers in turn order and the parts drawn so far. */
async function relayView(tx: Transaction, stageRunId: string, plan: ReturnType<typeof relayPlan>, teamOf: Map<string, string>) {
  const names = new Map((await tx.sessionTeam.findMany({ where: { id: { in: plan.teams.map(team => team.teamId) } }, select: { id: true, name: true } })).map(team => [team.id, team.name]));
  const parts = await tx.submission.findMany({ where: { stageRunId, slotKey: { startsWith: 'part-' } }, select: { playerId: true, slotKey: true, value: true }, orderBy: { receivedAt: 'asc' } });
  return { turns: plan.turns, voteAt: new Date(plan.voteAt).toISOString(), teams: plan.teams.map(team => ({ teamId: team.teamId, name: names.get(team.teamId) ?? 'Team', drawers: team.members,
    parts: parts.filter(part => part.playerId && teamOf.get(part.playerId) === team.teamId).flatMap(part => { const value = SubmissionValueSchema.safeParse(part.value); return value.success && value.data.kind === 'drawing' ? [{ turn: Number(part.slotKey.slice(5)), assetId: value.data.assetId }] : []; }).sort((a, b) => a.turn - b.turn) })) };
}

type Look = Presentation | undefined;
/** What the room shows: the scene's texts and animations replace the game's key by key; the themes are layered on the client. */
export function viewPresentation(game: Look, scene: Look) {
  return { texts: { ...(game?.texts ?? {}), ...(scene?.texts ?? {}) }, animations: { ...(game?.animations ?? {}), ...(scene?.animations ?? {}) }, themes: [game?.theme, scene?.theme].filter(Boolean) };
}

export async function readSessionView(client: PrismaClient, trustedActor: TrustedActor, sessionId: string, clock: Clock = () => new Date()): Promise<SessionView> {
  try {
    const actor = TrustedActorSchema.safeParse(trustedActor);
    const id = GameIdSchema.safeParse(sessionId);
    requireGame(actor.success && id.success, 'FORBIDDEN');
    return await client.$transaction(async tx => {
      const session = await tx.gameSession.findUnique({ where: { id: id.data }, include: { gameVersion: true } });
      requireGame(session, 'NOT_FOUND');
      await authorize(tx, session, actor.data);
      const definition = parseDefinition(session.gameVersion.definition);
      const current = session.status === 'LOBBY' || session.status === 'FINISHED' ? null : await tx.stageRun.findFirst({ where: { sessionId: session.id }, orderBy: { number: 'desc' } });
      const entry = current ? locateStage(definition, current.nodeKey, current.stageKey) : null;
      requireGame(!current || entry, 'INVALID_STATE');
      const context = current ? await teamContext(tx, current) : null;
      const viewer = actor.data.role === 'player' ? actor.data.playerId : null;
      const own = current && viewer ? await tx.submission.findUnique({ where: { stageRunId_actorKey_slotKey: { stageRunId: current.id, actorKey: answerKeyFor(context, viewer, actorKey(actor.data)), slotKey: 'answer' } } }) : null;
      const totals = await tx.scoreEntry.groupBy({ by: ['recipientPlayerId'], where: { sessionId: session.id, OR: [{ stageRunId: null }, { stage: { revealedAt: { not: null } } }] }, _sum: { amountMilli: true }, orderBy: { recipientPlayerId: 'asc' } });
      const stageEntry = entry?.stage;
      const eligible = current ? EligibilitySchema.safeParse(current.eligibility) : null;
      // Only answers count; the turns of a relay drawing are parts, not answers.
      const submissions = current ? await tx.submission.findMany({ where: { stageRunId: current.id, slotKey: 'answer' }, select: { value: true } }) : [];
      const judged = current && stageEntry?.kind === 'challenge' ? await tx.stageJudgment.findMany({ where: { stageRunId: current.id }, select: { playerId: true }, orderBy: { playerId: 'asc' } }) : [];
      const revealed = Boolean(current?.revealedAt);
      const awards = current && revealed ? await tx.scoreEntry.groupBy({ by: ['recipientPlayerId'], where: { stageRunId: current.id, recipientPlayerId: { not: null } }, _sum: { amountMilli: true }, orderBy: { recipientPlayerId: 'asc' } }) : [];
      const teamAwards = current && revealed ? await tx.scoreEntry.groupBy({ by: ['recipientTeamId'], where: { stageRunId: current.id, recipientTeamId: { not: null } }, _sum: { amountMilli: true }, orderBy: { recipientTeamId: 'asc' } }) : [];
      const teams = current ? await stageTeams(tx, current, viewer, context) : null;
      const choice = current && entry?.stage.kind === 'route' ? await routeView(tx, current, entry.stage, { host: actor.data.role === 'host', answerKey: viewer && (!context || context.answers === 'everyone' || context.captainOf.get(context.teamOf.get(viewer) ?? '') === viewer) ? answerKeyFor(context, viewer, actorKey(actor.data)) : null, voted: Boolean(own) }, session.status === 'RUNNING') : null;
      const playerTotals = new Map(totals.filter(row => row.recipientPlayerId !== null).map(row => [row.recipientPlayerId!, row._sum.amountMilli ?? 0n]));
      const answer = !revealed || stageEntry?.kind !== 'collect' ? null
        : stageEntry.input.kind === 'choice' ? { kind: 'choice', correctChoiceKey: stageEntry.scoring.kind === 'correct-choice' ? stageEntry.scoring.correctChoiceKey : null,
          counts: stageEntry.input.options.map(option => ({ choiceKey: option.key, count: submissions.filter(row => { const value = SubmissionValueSchema.safeParse(row.value); return value.success && value.data.kind === 'choice' && value.data.choiceKey === option.key; }).length })) }
        : stageEntry.input.kind === 'media' ? { kind: 'media', entries: (await tx.asset.findMany({ where: { stageRunId: current!.id, submissionId: { not: null } }, select: { id: true, playerId: true, kind: true }, orderBy: { createdAt: 'asc' } })).map(asset => ({ playerId: asset.playerId, assetId: asset.id, mediaKind: asset.kind.toLowerCase() })) }
        : stageEntry.input.kind === 'drawing' ? { kind: 'drawing', entries: (await tx.submission.findMany({ where: { stageRunId: current!.id, slotKey: 'answer' }, select: { playerId: true, teamId: true, value: true }, orderBy: { receivedAt: 'asc' } }))
          .map(row => { const value = SubmissionValueSchema.safeParse(row.value); return value.success && value.data.kind === 'drawing' ? { playerId: row.playerId, teamId: row.teamId, assetId: value.data.assetId } : null; }).filter(entry => entry !== null) }
        : stageEntry.input.kind === 'order' ? { kind: 'order', correctOrder: stageEntry.scoring.kind === 'correct-order' ? stageEntry.scoring.correctOrder : null } : null;
      // A vote stage shows the earlier round's answers as an anonymous ballot.
      const voteSource = current && stageEntry?.kind === 'vote' ? VotePresentationSchema.safeParse(current.presentation) : null;
      requireGame(!voteSource || voteSource.success, 'INVALID_STATE');
      const candidates = voteSource?.success ? await tx.submission.findMany({ where: { stageRunId: voteSource.data.sourceStageRunId, slotKey: 'answer' }, select: { id: true, playerId: true, teamId: true, value: true, asset: { select: { id: true, kind: true } } } }) : [];
      const sourceRun = voteSource?.success ? await tx.stageRun.findUniqueOrThrow({ where: { id: voteSource.data.sourceStageRunId } }) : null;
      const sourceTeams = sourceRun ? await teamContext(tx, sourceRun) : null;
      const viewerSourceTeam = viewer ? sourceTeams?.teamOf.get(viewer) : undefined;
      // Your own entry, or one from your team in a team round, is marked and cannot be voted for.
      const ownEntry = (candidate: { playerId: string | null; teamId: string | null }) => Boolean(viewer && (candidate.playerId === viewer || (viewerSourceTeam && (candidate.teamId ?? (candidate.playerId ? sourceTeams?.teamOf.get(candidate.playerId) : undefined)) === viewerSourceTeam)));
      const seed = current ? `${current.id}:${actorKey(actor.data)}` : '';
      const order = (id: string) => createHash('sha256').update(`${seed}:${id}`).digest('hex');
      const ballot = voteSource?.success ? candidates.map(candidate => {
        const value = SubmissionValueSchema.parse(candidate.value);
        const content = value.kind === 'text' ? { kind: 'text', text: value.text } : candidate.asset?.kind === 'DRAWING' ? { kind: 'drawing', assetId: candidate.asset.id } : candidate.asset ? { kind: 'media', assetId: candidate.asset.id, mediaKind: candidate.asset.kind.toLowerCase() } : null;
        return content ? { submissionId: candidate.id, own: ownEntry(candidate), content } : null;
      }).filter(entry => entry !== null).sort((a, b) => order(a.submissionId) < order(b.submissionId) ? -1 : 1) : null;
      const votesFor = (submissionId: string) => submissions.filter(row => { const value = SubmissionValueSchema.safeParse(row.value); return value.success && value.data.kind === 'vote' && value.data.submissionId === submissionId; }).length;
      // A minigame shows its settings and start times while it runs; places (and what was behind each door) only once revealed.
      const rules = stageEntry?.kind === 'minigame' ? minigameRules(stageEntry) : null;
      const run = rules && current ? readMinigameRun(current.presentation) : null;
      const relay = rules?.game === 'relay-drawing' && run && context && current ? await relayView(tx, current.id, relayPlan(context, rules.settings as MinigameSettings<'relay-drawing'>, run), context.teamOf) : null;
      const minigame = rules ? { game: rules.game, settings: rules.settings, relay, startsAt: current?.status === 'ACTIVE' ? run?.startsAt ?? null : null, // GO is never sent ahead of time, so a phone cannot tap at a known moment.
        goAt: current?.status === 'ACTIVE' && run?.goAt && Date.parse(run.goAt) <= clock().getTime() ? run.goAt : null } : null;
      const minigameAnswer = rules && revealed ? { kind: 'minigame', game: rules.game, doorsMilli: run?.doorsMilli ?? null,
        entries: minigameOutcome(rules, await tx.submission.findMany({ where: { stageRunId: current!.id, slotKey: 'answer' }, select: { playerId: true, teamId: true, value: true }, orderBy: { receivedAt: 'asc' } }), context, current!.id).entries } : null;
      const voteAnswer = revealed && voteSource?.success ? { kind: 'vote', entries: candidates.map(candidate => ({ submissionId: candidate.id, playerId: candidate.playerId, teamId: candidate.teamId, votes: votesFor(candidate.id) })).sort((a, b) => b.votes - a.votes || (a.submissionId < b.submissionId ? -1 : 1)) } : null;
      return SessionViewSchema.parse({ formatVersion: 1, sessionId: session.id, revision: session.revision, status: session.status, title: definition.title,
        stage: current && entry ? { id: current.id, nodeKey: current.nodeKey, stageKey: current.stageKey, kind: entry.stage.kind, prompt: entry.stage.prompt,
          input: entry.stage.kind === 'collect' ? publicInput(entry.stage.input, `${current.id}:${actorKey(actor.data)}`)
            : entry.stage.kind === 'route' && entry.stage.decide.method !== 'host' ? { kind: 'choice', layout: 'tiles', options: entry.stage.options } : null, status: current.status,
          deadlineAt: current.status === 'ACTIVE' ? current.deadlineAt?.toISOString() ?? null : null, pausedRemainingMs: current.status === 'ACTIVE' ? current.pausedRemainingMs : null,
          submittedCount: submissions.length, eligibleCount: choice ? choice.voterCount : eligible?.success ? eligible.data.playerIds.length : 0,
          challenge: entry.stage.kind === 'challenge' ? { maxAwardMilli: entry.stage.maxAwardMilli, judgedPlayerIds: judged.map(row => row.playerId), judgedTeamIds: [...new Set(judged.map(row => context?.teamOf.get(row.playerId)).filter(id => id !== undefined))] } : null,
          teams, route: choice?.view ?? null,
          info: entry.stage.kind === 'info' ? { title: entry.stage.title } : null, scoreboard: entry.stage.kind === 'scoreboard' ? { show: entry.stage.show } : null,
          ballot, minigame, revealAfterVote: entry.stage.kind !== 'route' && isVoteSource(definition, current.nodeKey, current.stageKey),
          revealed, reveal: revealed ? { answer: voteAnswer ?? minigameAnswer ?? answer, awards: awards.map(row => ({ playerId: row.recipientPlayerId!, amountMilli: (row._sum.amountMilli ?? 0n).toString() })),
            teamAwards: teamAwards.map(row => ({ teamId: row.recipientTeamId!, amountMilli: (row._sum.amountMilli ?? 0n).toString() })) } : null } : null,
        serverTime: clock().toISOString(),
        ownSubmission: own ? { id: own.id, value: SubmissionValueSchema.parse(own.value) } : null,
        standings: totals.filter(row => row.recipientPlayerId !== null).map(row => ({ playerId: row.recipientPlayerId!, amountMilli: (row._sum.amountMilli ?? 0n).toString() })),
        teamStandings: await teamStandings(tx, session.id, playerTotals),
        presentation: viewPresentation(definition.presentation, entry?.stage.presentation),
        wheel: await wheelView(tx, session.id, definition, current, actor.data.role === 'host'),
        finale: session.status === 'FINISHED' ? await finaleSlides(tx, session.id, definition) : null,
      });
    }, { isolationLevel: 'RepeatableRead', maxWait: 2000, timeout: 5000 });
  } catch (error) { throw error instanceof GameError ? error : new GameError('GAME_UNAVAILABLE'); }
}
