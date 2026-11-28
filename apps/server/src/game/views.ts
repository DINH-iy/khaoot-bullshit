import { ballotTally } from './scoring/ballot.js';
import { introView, readExplain } from './explain.js';
import { scenePlaceAwards, DEFAULT_SOUNDBOARD, isStepMinigame, type MinigameSettings, type Presentation, mergePresentationTexts, GameIdSchema, sceneMediaUrl, SessionViewSchema, type PublicMusic, type YouTubeClip, type SceneMedia, type SceneMusic, SubmissionValueSchema, type SessionView } from '@party/contracts';
import { stepView } from '../minigames/shared/steps/engine.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createHash } from 'node:crypto';
import { isVoteSource, judging, minigameRules, parseDefinition, stagePlaces, type StageDefinition } from './definition.js';
import { duelView } from './duel.js';
import { readMinigameRun } from '../minigames/shared/rules.js';
import { readGraphPlayback } from '../minigames/draw-the-graph/playback.js';
import { graphHue } from '../minigames/draw-the-graph/graph.js';
import { readUndercover, undercoverOwn, undercoverView } from '../minigames/undercover/rules.js';
import { relayPlan } from '../minigames/relay-drawing/relay.js';
import { wheelView } from './show/wheel.js';
import { finaleSlides } from './show/finale.js';
import { minigameOutcome } from '../minigames/shared/outcome.js';
import { locateRunStage } from './graph.js';
import { routeView } from './routes/route-views.js';
import { GameError, requireGame } from './errors.js';
import type { Clock } from './timing.js';
import { checkable, hostAnswers, publicVerdicts } from './scoring/verdicts.js';
import { answerKeyFor, stageTeams, teamContext, teamStandings } from './teams/team-views.js';
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
async function relayView(tx: Transaction, stageRunId: string, plan: ReturnType<typeof relayPlan>, teamOf: Map<string, string>, viewer: string | null, revealed: boolean) {
  const names = new Map((await tx.sessionTeam.findMany({ where: { id: { in: plan.teams.map(team => team.teamId) } }, select: { id: true, name: true } })).map(team => [team.id, team.name]));
  const parts = await tx.submission.findMany({ where: { stageRunId, slotKey: { startsWith: 'part-' } }, select: { playerId: true, slotKey: true, value: true }, orderBy: { receivedAt: 'asc' } });
  const animation = viewer ? plan.animation(teamOf.get(viewer) ?? '') : undefined;
  return { ...(animation ? { animation } : {}), ...(plan.teams.some(team => plan.animation(team.teamId)) ? { guessUntil: new Date(plan.guessUntil).toISOString() } : {}), turns: plan.turns, voteAt: new Date(plan.voteAt).toISOString(), teams: plan.teams.map(team => {
    const word = revealed ? plan.animation(team.teamId)?.prompt : undefined;
    return { teamId: team.teamId, name: names.get(team.teamId) ?? 'Team', ...(word === undefined ? {} : { word }), drawers: team.members,
      parts: parts.filter(part => part.playerId && teamOf.get(part.playerId) === team.teamId).flatMap(part => {
        const value = SubmissionValueSchema.safeParse(part.value);
        return value.success && value.data.kind === 'drawing' ? [{ turn: Number(part.slotKey.slice(5)), assetId: value.data.assetId }] : [];
      }).sort((a, b) => a.turn - b.turn) };
  }) };
}

type Look = Presentation | undefined;
/** What the room shows: the scene's texts and animations replace the game's key by key; the themes are layered on the client. */
export function viewPresentation(game: Look, scene: Look) {
  return { ...mergePresentationTexts(game, scene), ...(game?.phoneMenuIcons ? { phoneMenuIcons: game.phoneMenuIcons } : {}), animations: { ...(game?.animations ?? {}), ...(scene?.animations ?? {}) }, themes: [game?.theme, scene?.theme].filter(Boolean) };
}

export async function readSessionView(client: PrismaClient, trustedActor: TrustedActor, sessionId: string, clock: Clock = () => new Date(),
  { pictureOnPhone = false }: { pictureOnPhone?: boolean } = {}): Promise<SessionView> {
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
      const entry = current ? locateRunStage(definition, current) : null;
      requireGame(!current || entry, 'INVALID_STATE');
      const context = current ? await teamContext(tx, current) : null;
      const viewer = actor.data.role === 'player' ? actor.data.playerId : null;
      const own = current && viewer ? await tx.submission.findUnique({ where: { stageRunId_actorKey_slotKey: { stageRunId: current.id, actorKey: answerKeyFor(context, viewer, actorKey(actor.data)), slotKey: 'answer' } } }) : null;
      const totals = await tx.scoreEntry.groupBy({ by: ['recipientPlayerId'], where: { sessionId: session.id, OR: [{ stageRunId: null }, { stage: { revealedAt: { not: null } } }] }, _sum: { amountMilli: true }, orderBy: { recipientPlayerId: 'asc' } });
      const stageEntry = entry?.stage;
      const eligible = current ? EligibilitySchema.safeParse(current.eligibility) : null;
      // Only answers count; the turns of a relay drawing are parts, not answers.
      const submissions = current ? await tx.submission.findMany({ where: { stageRunId: current.id, slotKey: 'answer' }, select: { value: true } }) : [];
      const judged = current && stageEntry && judging(stageEntry) ? await tx.stageJudgment.findMany({ where: { stageRunId: current.id }, select: { playerId: true }, orderBy: { playerId: 'asc' } }) : [];
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
      const totalsByAnswer = stageEntry?.kind === 'vote' && revealed ? ballotTally(stageEntry, submissions) : null;
      // A minigame shows its settings and start times while it runs; places (and what was behind each door) only once revealed.
      const rules = stageEntry?.kind === 'minigame' ? minigameRules(stageEntry) : null;
      const run = rules && current ? readMinigameRun(current.presentation) : null;
      const dotRun = run?.dots;
      const graph = run?.graph;
      const graphChart = graph ? { visible: graph.visible, startLabel: graph.startLabel, splitLabel: graph.splitLabel,
        endLabel: graph.endLabel, yLabel: graph.yLabel, scale: graph.scale, splitAt: graph.splitAt } : null;
      const graphColors = graph && eligible?.success
        ? new Map(eligible.data.playerIds.map((id, index) => [id, graphHue(graph.seed, index)])) : null;
      const ownGraphHue = viewer ? graphColors?.get(viewer) : undefined;
      const sharedScreen = actor.data.role !== 'player';
      // What the screen shows (the dots to count and their reveal) goes to the phones when no screen is watching.
      const showsPicture = sharedScreen || pictureOnPhone;
      const revealEasing = showsPicture && (rules?.game === 'count-the-dots' || rules?.game === 'draw-the-graph')
        ? (rules.settings as MinigameSettings<'count-the-dots' | 'draw-the-graph'>).revealEasing : undefined;
      const showPattern = showsPicture && current?.status === 'ACTIVE' && session.status === 'RUNNING'
        && dotRun && clock().getTime() < Date.parse(dotRun.guessAt);
      // A step game: every side's progress (secrets never; a team's vote counts only for its own members and the host).
      const steps = rules && isStepMinigame(rules.game) && current ? await stepView(tx, current, rules, context, eligible?.success ? eligible.data.playerIds : [], { playerId: viewer, host: actor.data.role === 'host' }) : null;
      const relay = rules?.game === 'relay-drawing' && run && context && current ? await relayView(tx, current.id, relayPlan(context, rules.settings as MinigameSettings<'relay-drawing'>, run), context.teamOf, viewer, revealed) : null;
      // Undercover: the table everyone sees, and only this viewer's own word.
      const undercoverTable = rules?.game === 'undercover' && current ? readUndercover(current.presentation) : null;
      const revealSettings = revealEasing === undefined ? {} : { revealEasing };
      const minigame = rules ? { game: rules.game, settings: rules.game === 'draw-the-graph' ? revealSettings
        : rules.game === 'count-the-dots' ? { viewSeconds: (rules.settings as MinigameSettings<'count-the-dots'>).viewSeconds, ...revealSettings }
        // Galgje: never the author's word list (one of them is the answer).
        : rules.game === 'hangman' ? { lives: (rules.settings as MinigameSettings<'hangman'>).lives }
        : rules.game === 'undercover' ? (({ pairs: _pairs, ...shown }) => shown)(rules.settings as MinigameSettings<'undercover'>)
        : rules.settings, relay, steps, ...(undercoverTable ? { undercover: { view: undercoverView(undercoverTable), ...(viewer && undercoverOwn(undercoverTable, viewer) ? { own: undercoverOwn(undercoverTable, viewer)! } : {}) } } : {}), startsAt: current?.status === 'ACTIVE' ? run?.startsAt ?? null : null, // GO is never sent ahead of time, so a phone cannot tap at a known moment.
        ...(run?.cutTarget === undefined ? {} : { cutTarget: run.cutTarget }),
        ...(rules.tiebreak === 'faster' ? { tiebreak: 'faster' as const } : {}),
        ...(rules.scoring ? { scoring: rules.scoring } : {}),
        ...(run?.angleTarget === undefined ? {} : { angleTarget: run.angleTarget }),
        ...(graphChart ? { graph: { chart: graphChart, ...(ownGraphHue === undefined ? {} : { hue: ownGraphHue }) } } : {}),
        ...(dotRun ? { dots: { guessAt: dotRun.guessAt, ...(showPattern ? { pattern: dotRun.pattern } : {}) } } : {}),
        // A paused room shows no GO: continuing restarts the duel with a fresh countdown and a new GO.
        goAt: current?.status === 'ACTIVE' && session.status === 'RUNNING' && run?.goAt &&Date.parse(run.goAt) <= clock().getTime() ? run.goAt : null } : null;
      const minigameAnswer = rules && revealed ? { kind: 'minigame', game: rules.game, doorsMilli: run?.doorsMilli ?? null,
        ...(graph && graphChart ? { graph: { ...graphChart, hidden: graph.hidden, source: graph.source, sourceNote: graph.sourceNote, sourceUrl: graph.sourceUrl } } : {}),
        ...(dotRun ? { dotCount: dotRun.pattern.length } : {}),
        ...(dotRun && showsPicture && current?.revealedAt ? { dotReveal: {
          pattern: dotRun.pattern, startedAt: current.revealedAt.toISOString(),
        } } : {}),
        ...(run?.coin ? { coin: run.coin } : {}),
        ...(run?.roulette === undefined ? {} : { roulette: run.roulette }),
        ...(run?.hangmanWord ? { word: run.hangmanWord } : {}),
        ...(undercoverTable ? { undercover: { words: undercoverTable.words, roles: Object.entries(undercoverTable.roles).map(([playerId, role]) => ({ playerId, role })), winner: undercoverTable.winner, ...(undercoverTable.guess ? { guess: undercoverTable.guess } : {}) } } : {}),
        entries: minigameOutcome(rules, await tx.submission.findMany({ where: { stageRunId: current!.id, slotKey: 'answer' }, select: { playerId: true, teamId: true, value: true, receivedAt: true }, orderBy: { receivedAt: 'asc' } }), context, current!.id, run).entries.map(result => {
          const hue = result.playerId ? graphColors?.get(result.playerId) : undefined;
          return hue === undefined ? result : { ...result, graphHue: hue };
        }) } : null;
      let ownValue = own ? SubmissionValueSchema.parse(own.value) : null;
      if (!revealed && rules?.game === 'count-the-dots' && ownValue?.kind === 'minigame') {
        // The scored error would let a player infer the correct count before the reveal.
        ownValue = { kind: 'minigame', value: ownValue.dotGuess ?? 0 };
      }
      if (!revealed && rules?.game === 'draw-the-graph' && ownValue?.kind === 'minigame') {
        // A score is feedback about the hidden line. Only the player's own drawing may be shown early.
        ownValue = { kind: 'minigame', value: 0, graphLine: ownValue.graphLine };
      }
      if (!revealed && rules?.game === 'relay-drawing' && (rules.settings as MinigameSettings<'relay-drawing'>).animation && own) {
        ownValue = { kind: 'minigame', value: 0 };
      }
      const voteAnswer = revealed && voteSource?.success ? { kind: 'vote', entries: candidates.map(candidate => ({ submissionId: candidate.id, playerId: candidate.playerId, teamId: candidate.teamId, votes: totalsByAnswer?.get(candidate.id) ?? 0 })).sort((a, b) => b.votes - a.votes || (a.submissionId < b.submissionId ? -1 : 1)) } : null;
      return SessionViewSchema.parse({ formatVersion: 1, sessionId: session.id, revision: session.revision, status: session.status, title: definition.title,
        stage: current && entry ? { id: current.id, nodeKey: current.nodeKey, stageKey: current.stageKey, kind: entry.stage.kind, prompt: entry.stage.prompt, translations: entry.stage.translations,
          input: entry.stage.kind === 'collect' ? publicInput(entry.stage.input, `${current.id}:${actorKey(actor.data)}`)
            : entry.stage.kind === 'route' && entry.stage.decide.method !== 'host' && entry.stage.decide.method !== 'draw' ? { kind: 'choice', layout: 'tiles', options: entry.stage.options } : null, status: current.status,
          timerMs: 'durationMs' in entry.stage && typeof entry.stage.durationMs === 'number' ? entry.stage.durationMs : null,
          deadlineAt: !current.revealedAt ? current.deadlineAt?.toISOString() ?? null : null, pausedRemainingMs: !current.revealedAt ? current.pausedRemainingMs : null,
          submittedCount: submissions.length, eligibleCount: choice ? choice.voterCount : eligible?.success ? eligible.data.playerIds.length : 0,
          // The host's judging: a challenge, or a writing, upload or drawing round with host points.
          challenge: judging(entry.stage) ? { maxAwardMilli: judging(entry.stage)!.maxAwardMilli, placesMilli: stagePlaces(entry.stage), judgedPlayerIds: judged.map(row => row.playerId), judgedTeamIds: [...new Set(judged.map(row => context?.teamOf.get(row.playerId)).filter(id => id !== undefined))] } : null,
          teams, route: choice?.view ?? null,
          explain: current.status === 'ACTIVE' && readExplain(current.presentation) ? introView(entry.stage, readExplain(current.presentation)!.readyIds) : null,
          youtube: entry.stage.youtube,
          mediaLayout: entry.stage.mediaLayout,
          textBoxes: entry.stage.textBoxes,
          ...(entry.stage.textBoxes?.some(box => box.source === 'places') && stageEntry ? { boxPlaceAwards: scenePlaceAwards(stageEntry) } : {}),
          slideImages: entry.stage.slideImages,
          textBoxPhoneColumns: entry.stage.textBoxPhoneColumns,
          ...(actor.data.role === 'host' && entry.stage.hostNotes?.trim() ? { hostNotes: entry.stage.hostNotes } : {}),
          promptStyle: entry.stage.promptStyle,
          titleStyle: entry.stage.kind === 'info' ? entry.stage.titleStyle : undefined,
          media: entry.stage.media ? { ...entry.stage.media, url: sceneMediaUrl(entry.stage.media.id) } : null,
          info: entry.stage.kind === 'info' ? { title: entry.stage.title } : null, scoreboard: entry.stage.kind === 'scoreboard' ? { show: entry.stage.show } : null,
          ...(current.status === 'ACTIVE' && session.status === 'RUNNING' && typeof (current.presentation as { drawingStartsAt?: unknown }).drawingStartsAt === 'string'
            ? { countdownUntil: (current.presentation as { drawingStartsAt: string }).drawingStartsAt } : {}),
          ballot, ...(entry.stage.kind === 'vote' ? { voteMode: entry.stage.voteMode ?? 'single', voteLimit: entry.stage.voteMode && entry.stage.voteMode !== 'single' ? entry.stage.voteLimit ?? 3 : 1 } : {}),
          ...('resultCards' in entry.stage && entry.stage.resultCards !== undefined && current.revealedAt ? { resultCards: { mode: entry.stage.resultCards, revealedAt: current.revealedAt.toISOString(), index: (current.presentation as { resultCardIndex?: number }).resultCardIndex ?? 0 } } : {}), minigame, duel: entry.stage.kind === 'duel' ? await duelView(tx, current, entry.stage, viewer) : null, revealAfterVote: entry.stage.kind !== 'route' && isVoteSource(definition, current.nodeKey, current.stageKey),
          ...(graph && current.revealedAt && sharedScreen && revealEasing !== 'instant' ? { graphPlayback: readGraphPlayback(current.presentation, current.revealedAt) } : {}),
          revealed, reveal: revealed ? { answer: voteAnswer ?? minigameAnswer ?? answer, awards: awards.map(row => ({ playerId: row.recipientPlayerId!, amountMilli: (row._sum.amountMilli ?? 0n).toString() })),
            teamAwards: teamAwards.map(row => ({ teamId: row.recipientTeamId!, amountMilli: (row._sum.amountMilli ?? 0n).toString() })),
            ...(checkable(entry.stage) ? { verdicts: await publicVerdicts(tx, session.id, current.id), ...(actor.data.role === 'host' && !actor.data.actingPlayerId ? { answers: await hostAnswers(tx, session.id, current.id, entry.stage) } : {}) } : {}) } : null } : null,
        serverTime: clock().toISOString(),
        ownSubmission: own && ownValue ? { id: own.id, value: ownValue } : null,
        standings: totals.filter(row => row.recipientPlayerId !== null).map(row => ({ playerId: row.recipientPlayerId!, amountMilli: (row._sum.amountMilli ?? 0n).toString() })),
        teamStandings: await teamStandings(tx, session.id, playerTotals),
        presentation: viewPresentation(definition.presentation, entry?.stage.presentation),
        wheel: await wheelView(tx, session.id, definition, current, actor.data.role === 'host'),
        ...(definition.phoneEffects ? { phoneEffects: true } : {}),
        party: { reactions: definition.ownReactions ?? [], sounds: definition.soundboard ?? DEFAULT_SOUNDBOARD },
        music: musicView(definition, current && entry ? entry.stage : null, await songInfo(tx, definition, current && entry ? entry.stage : null)),
        awards: session.status === 'FINISHED' ? await finaleSlides(tx, session.id, definition) : null,
      });
    }, { isolationLevel: 'RepeatableRead', maxWait: 2000, timeout: 5000 });
  } catch (error) { throw error instanceof GameError ? error : new GameError('GAME_UNAVAILABLE', { cause: error }); }
}

type SongInfo = Map<string, { title: string; credit: string | null }>;
/** Titles and credits of the songs the room may play now, from the library (removed songs are left out). */
async function songInfo(tx: { gameMedia: { findMany: (args: { where: { id: { in: string[] }; removedAt: null }; select: { id: true; name: true; credit: true } }) => Promise<{ id: string; name: string; credit: string | null }[]> } },
  definition: { music?: { tracks: { id: string }[] } | undefined }, stage: { music?: SceneMusic | undefined } | null): Promise<SongInfo> {
  const ids = [...(definition.music?.tracks ?? []).map(track => track.id), ...(stage?.music?.mode === 'play' ? [stage.music.track.id] : [])];
  if (!ids.length) return new Map();
  const rows = await tx.gameMedia.findMany({ where: { id: { in: [...new Set(ids)] }, removedAt: null }, select: { id: true, name: true, credit: true } });
  return new Map(rows.map(row => [row.id, { title: row.name.replace(/\.(mp3|m4a|ogg|wav|flac)$/i, ''), credit: row.credit }]));
}
/**
 * The room's music: the game's playlist and what the scene on screen does with it (contracts/media.ts).
 * Null when nothing would ever play: no playlist and no song of the scene's own.
 */
export function musicView(definition: { music?: { tracks: { id: string }[]; shuffle?: boolean | undefined; fade?: boolean | undefined } | undefined }, stage: { music?: SceneMusic | undefined; media?: SceneMedia | undefined; youtube?: YouTubeClip | undefined } | null, songs: SongInfo): PublicMusic | null {
  const song = (id: string) => { const info = songs.get(id); return info ? { id, url: sceneMediaUrl(id), title: info.title, credit: info.credit } : null; };
  const playlist = (definition.music?.tracks ?? []).map(track => song(track.id)).filter(entry => entry !== null);
  const music = stage?.music ?? { mode: 'keep' as const };
  const own = music.mode === 'play' ? song(music.track.id) : null;
  if (!playlist.length && !own) return null;
  return { playlist, scene: { mode: music.mode === 'play' && !own ? 'keep' : music.mode, track: own }, duck: Boolean(stage?.youtube) || stage?.media?.kind === 'video' || stage?.media?.kind === 'audio',
    ...(definition.music?.shuffle ? { shuffle: true } : {}), ...(definition.music?.fade ? { fade: true } : {}) };
}
