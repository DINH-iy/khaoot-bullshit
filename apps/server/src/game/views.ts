import { GameIdSchema, SessionViewSchema, SubmissionValueSchema, type SessionView } from '@party/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createHash } from 'node:crypto';
import { isVoteSource, parseDefinition, type StageDefinition } from './definition.js';
import { locateStage } from './graph.js';
import { routeView } from './route-views.js';
import { GameError, requireGame } from './errors.js';
import type { Clock } from './timing.js';
import { answerKeyFor, stageTeams, teamContext, teamStandings } from './team-views.js';
import { actorKey, authorize, EligibilitySchema, TrustedActorSchema, VotePresentationSchema, type TrustedActor } from './model.js';

type Input = Extract<StageDefinition, { kind: 'collect' }>['input'];
// The stored item order may be the answer. Each viewer gets a stable shuffle,
// identical after a refresh, that reveals nothing about the authored order.
function publicInput(input: Input, seed: string): Input {
  if (input.kind !== 'order') return input;
  const rank = (key: string) => createHash('sha256').update(`${seed}:${key}`).digest('hex');
  return { ...input, items: [...input.items].sort((a, b) => rank(a.key) < rank(b.key) ? -1 : 1) };
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
      const submissions = current ? await tx.submission.findMany({ where: { stageRunId: current.id }, select: { value: true } }) : [];
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
        : stageEntry.input.kind === 'order' ? { kind: 'order', correctOrder: stageEntry.scoring.kind === 'correct-order' ? stageEntry.scoring.correctOrder : null } : null;
      // A vote stage shows the earlier round's answers as an anonymous ballot.
      const voteSource = current && stageEntry?.kind === 'vote' ? VotePresentationSchema.safeParse(current.presentation) : null;
      requireGame(!voteSource || voteSource.success, 'INVALID_STATE');
      const candidates = voteSource?.success ? await tx.submission.findMany({ where: { stageRunId: voteSource.data.sourceStageRunId }, select: { id: true, playerId: true, teamId: true, value: true, asset: { select: { id: true, kind: true } } } }) : [];
      const sourceRun = voteSource?.success ? await tx.stageRun.findUniqueOrThrow({ where: { id: voteSource.data.sourceStageRunId } }) : null;
      const sourceTeams = sourceRun ? await teamContext(tx, sourceRun) : null;
      const viewerSourceTeam = viewer ? sourceTeams?.teamOf.get(viewer) : undefined;
      // Your own entry, or one from your team in a team round, is marked and cannot be voted for.
      const ownEntry = (candidate: { playerId: string | null; teamId: string | null }) => Boolean(viewer && (candidate.playerId === viewer || (viewerSourceTeam && (candidate.teamId ?? (candidate.playerId ? sourceTeams?.teamOf.get(candidate.playerId) : undefined)) === viewerSourceTeam)));
      const seed = current ? `${current.id}:${actorKey(actor.data)}` : '';
      const order = (id: string) => createHash('sha256').update(`${seed}:${id}`).digest('hex');
      const ballot = voteSource?.success ? candidates.map(candidate => {
        const value = SubmissionValueSchema.parse(candidate.value);
        const content = value.kind === 'text' ? { kind: 'text', text: value.text } : candidate.asset ? { kind: 'media', assetId: candidate.asset.id, mediaKind: candidate.asset.kind.toLowerCase() } : null;
        return content ? { submissionId: candidate.id, own: ownEntry(candidate), content } : null;
      }).filter(entry => entry !== null).sort((a, b) => order(a.submissionId) < order(b.submissionId) ? -1 : 1) : null;
      const votesFor = (submissionId: string) => submissions.filter(row => { const value = SubmissionValueSchema.safeParse(row.value); return value.success && value.data.kind === 'vote' && value.data.submissionId === submissionId; }).length;
      const voteAnswer = revealed && voteSource?.success ? { kind: 'vote', entries: candidates.map(candidate => ({ submissionId: candidate.id, playerId: candidate.playerId, teamId: candidate.teamId, votes: votesFor(candidate.id) })).sort((a, b) => b.votes - a.votes || (a.submissionId < b.submissionId ? -1 : 1)) } : null;
      return SessionViewSchema.parse({ formatVersion: 1, sessionId: session.id, revision: session.revision, status: session.status, title: definition.title,
        stage: current && entry ? { id: current.id, nodeKey: current.nodeKey, stageKey: current.stageKey, kind: entry.stage.kind, prompt: entry.stage.prompt,
          input: entry.stage.kind === 'collect' ? publicInput(entry.stage.input, `${current.id}:${actorKey(actor.data)}`)
            : entry.stage.kind === 'route' && entry.stage.decide.method !== 'host' ? { kind: 'choice', layout: 'tiles', options: entry.stage.options } : null, status: current.status,
          deadlineAt: current.status === 'ACTIVE' ? current.deadlineAt?.toISOString() ?? null : null, pausedRemainingMs: current.status === 'ACTIVE' ? current.pausedRemainingMs : null,
          submittedCount: submissions.length, eligibleCount: choice ? choice.voterCount : eligible?.success ? eligible.data.playerIds.length : 0,
          challenge: entry.stage.kind === 'challenge' ? { maxAwardMilli: entry.stage.maxAwardMilli, judgedPlayerIds: judged.map(row => row.playerId), judgedTeamIds: [...new Set(judged.map(row => context?.teamOf.get(row.playerId)).filter(id => id !== undefined))] } : null,
          teams, route: choice?.view ?? null,
          ballot, revealAfterVote: entry.stage.kind !== 'route' && isVoteSource(definition, current.nodeKey, current.stageKey),
          revealed, reveal: revealed ? { answer: voteAnswer ?? answer, awards: awards.map(row => ({ playerId: row.recipientPlayerId!, amountMilli: (row._sum.amountMilli ?? 0n).toString() })),
            teamAwards: teamAwards.map(row => ({ teamId: row.recipientTeamId!, amountMilli: (row._sum.amountMilli ?? 0n).toString() })) } : null } : null,
        serverTime: clock().toISOString(),
        ownSubmission: own ? { id: own.id, value: SubmissionValueSchema.parse(own.value) } : null,
        standings: totals.filter(row => row.recipientPlayerId !== null).map(row => ({ playerId: row.recipientPlayerId!, amountMilli: (row._sum.amountMilli ?? 0n).toString() })),
        teamStandings: await teamStandings(tx, session.id, playerTotals),
      });
    }, { isolationLevel: 'RepeatableRead', maxWait: 2000, timeout: 5000 });
  } catch (error) { throw error instanceof GameError ? error : new GameError('GAME_UNAVAILABLE'); }
}
