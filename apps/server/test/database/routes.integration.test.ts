import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { parseDefinition } from '../../src/game/definition.js';
import { createGameService } from '../../src/game/service.js';
import { closeExpiredStages, ACCEPTANCE_GRACE_MS, SETTLE_MS } from '../../src/game/timing.js';
import { readSessionView } from '../../src/game/views.js';
import { db, fixture, hostCommand, prisma, service } from './game-fixture.js';

afterAll(async () => { await db.close(); });
const quiz = (key: string) => ({ key, stages: [{ key: 'q', kind: 'collect', prompt: `Scene ${key}`, durationMs: null,
  input: { kind: 'choice', options: [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }] }, scoring: { kind: 'correct-choice', correctChoiceKey: 'yes', awardMilli: '1000' } }] });
type Decide = { method: 'host' } | { method: 'players' | 'captains'; tie: string; noVotes: string; counts: string };
function branching(decide: Decide, extra: { defaultOptionKey?: string; durationMs?: number | null; teams?: boolean } = {}) {
  return parseDefinition({
    formatVersion: 2, title: 'Branches', startNodeKey: 'start',
    ...(extra.teams ? { teams: { split: { kind: 'count', teams: 2 }, formation: 'host' } } : {}),
    nodes: [
      extra.teams ? { key: 'start', stages: [{ ...quiz('start').stages[0], play: { kind: 'teams', lineup: { kind: 'game' }, answers: 'everyone', points: 'members' } }] } : quiz('start'),
      { key: 'choose', stages: [{ key: 'pick', kind: 'route', prompt: 'Music or physical?', durationMs: extra.durationMs === undefined ? (decide.method === 'host' ? null : 20_000) : extra.durationMs,
        options: [{ key: 'music', label: 'Music' }, { key: 'physical', label: 'Physical' }], decide, ...(extra.defaultOptionKey ? { defaultOptionKey: extra.defaultOptionKey } : {}) }] },
      quiz('music'), quiz('physical'), quiz('finale'),
    ],
    edges: [{ key: 'to-choice', from: 'start', to: 'choose' }, { key: 'secret-music-edge', from: 'choose', to: 'music', option: 'music' },
      { key: 'secret-physical-edge', from: 'choose', to: 'physical', option: 'physical' }, { key: 'm-f', from: 'music', to: 'finale' }, { key: 'p-f', from: 'physical', to: 'finale' }],
  });
}
const players = (tie = 'host', noVotes = 'host', counts = 'reveal') => ({ method: 'players' as const, tie, noVotes, counts });
type World = Awaited<ReturnType<typeof fixture>>;
const actor = (f: World, index: number) => ({ role: 'player' as const, playerId: f.players[index]!.id });
const voteFor = (f: World, index: number, stageRunId: string, choiceKey: string) => service.execute(actor(f, index), { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type: 'submission.submit', stageRunId, value: { kind: 'choice', choiceKey } });
const decision = (stageRunId: string) => prisma.routeDecision.findUnique({ where: { stageRunId } });
async function atChoice(definition = branching(players()), count = 3) {
  const f = await fixture(count, definition);
  const start = (await hostCommand(f, 'session.start')).stageRunId!;
  if (definition.teams) {
    for (const [index, player] of f.players.entries()) await hostCommand(f, 'teams.assign', { stageRunId: start, playerId: player.id, teamIndex: index % 2 });
    await hostCommand(f, 'teams.captain', { stageRunId: start, playerId: f.players[0]!.id });
    await hostCommand(f, 'teams.captain', { stageRunId: start, playerId: f.players[1]!.id });
    await hostCommand(f, 'teams.confirm', { stageRunId: start });
  }
  await hostCommand(f, 'stage.close', { stageRunId: start });
  const choice = (await hostCommand(f, 'stage.advance', { stageRunId: start })).stageRunId!;
  return { f, choice };
}
const runs = async (sessionId: string) => (await prisma.stageRun.findMany({ where: { sessionId }, orderBy: { number: 'asc' } })).map(run => [run.number, run.nodeKey]);

describe('route choices', () => {
  it('decides by majority on close, follows that route, rejoins once and finishes', async () => {
    const { f, choice } = await atChoice();
    await voteFor(f, 0, choice, 'physical'); await voteFor(f, 1, choice, 'physical'); await voteFor(f, 2, choice, 'music');
    const closed = await hostCommand(f, 'stage.close', { stageRunId: choice });
    const row = await decision(choice);
    expect(row).toMatchObject({ selectedEdgeKey: 'secret-physical-edge', destinationNodeKey: 'physical', reason: 'VOTE' });
    expect(row!.voteSnapshot).toMatchObject({ optionKey: 'physical', counts: [{ optionKey: 'music', count: 1 }, { optionKey: 'physical', count: 2 }], resolution: 'majority', random: null, closedBy: 'close', voterCount: 3 });
    expect((await prisma.gameCommand.findUniqueOrThrow({ where: { id: row!.commandId } })).commandKey).toBeDefined();
    expect(closed.type).toBe('stage.close');
    const branch = (await hostCommand(f, 'stage.advance', { stageRunId: choice })).stageRunId!;
    await hostCommand(f, 'stage.close', { stageRunId: branch });
    const finale = (await hostCommand(f, 'stage.advance', { stageRunId: branch })).stageRunId!;
    await hostCommand(f, 'stage.close', { stageRunId: finale });
    await hostCommand(f, 'stage.advance', { stageRunId: finale });
    expect(await runs(f.sessionId)).toEqual([[1, 'start'], [2, 'choose'], [3, 'physical'], [4, 'finale']]);
    expect((await prisma.gameSession.findUniqueOrThrow({ where: { id: f.sessionId } })).status).toBe('FINISHED');
    expect(await prisma.scoreEntry.count({ where: { stageRunId: choice } })).toBe(0);
  });

  it('decides exactly once, however often or concurrently it is closed', async () => {
    const { f, choice } = await atChoice(branching(players('random', 'random')));
    await voteFor(f, 0, choice, 'music');
    const session = await prisma.gameSession.findUniqueOrThrow({ where: { id: f.sessionId } });
    const close = { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, expectedRevision: session.revision, type: 'stage.close', stageRunId: choice };
    const outcomes = await Promise.allSettled([
      service.execute(f.host, close),
      service.execute(f.host, { ...close, commandId: randomUUID(), type: 'route.decide', optionKey: 'physical' }),
      service.execute(f.host, { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type: 'stage.timeout', stageRunId: choice }),
    ]);
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.routeDecision.count({ where: { stageRunId: choice } })).toBe(1);
    // A retry of the same close returns its receipt; a different payload under that key is refused.
    if (outcomes[0]!.status === 'fulfilled') {
      expect(await service.execute(f.host, close)).toEqual(outcomes[0]!.value);
      await expect(service.execute(f.host, { ...close, type: 'stage.reveal' })).rejects.toMatchObject({ code: 'COMMAND_KEY_REUSED' });
    }
    await expect(hostCommand(f, 'stage.close', { stageRunId: choice })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(hostCommand(f, 'route.decide', { stageRunId: choice, optionKey: 'music' })).rejects.toMatchObject({ code: 'ALREADY_DECIDED' });
    // The database itself refuses a second decision or any change to the first.
    const row = (await decision(choice))!;
    await expect(prisma.routeDecision.create({ data: { sessionId: f.sessionId, stageRunId: choice, commandId: row.commandId, selectedEdgeKey: 'x', destinationNodeKey: 'music', reason: 'HOST', voteSnapshot: {} } })).rejects.toThrow();
    await expect(prisma.routeDecision.update({ where: { id: row.id }, data: { destinationNodeKey: 'music' } })).rejects.toThrow();
    await expect(prisma.routeDecision.delete({ where: { id: row.id } })).rejects.toThrow();
  });

  it('lets the host choose any route while voting, on a tie, or when nobody voted, but only the host', async () => {
    const { f, choice } = await atChoice();
    await voteFor(f, 0, choice, 'music');
    const session = await prisma.gameSession.findUniqueOrThrow({ where: { id: f.sessionId } });
    await expect(service.execute(actor(f, 1), { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, expectedRevision: session.revision, type: 'route.decide', stageRunId: choice, optionKey: 'physical' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(service.execute(f.host, { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, expectedRevision: session.revision - 1, type: 'route.decide', stageRunId: choice, optionKey: 'physical' })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    await expect(hostCommand(f, 'route.decide', { stageRunId: choice, optionKey: 'nowhere' })).rejects.toMatchObject({ code: 'INVALID_COMMAND' });
    // Choosing while voting closes the vote; the leading option does not bind the host.
    await hostCommand(f, 'route.decide', { stageRunId: choice, optionKey: 'physical' });
    expect(await decision(choice)).toMatchObject({ destinationNodeKey: 'physical', reason: 'HOST' });
    expect((await decision(choice))!.voteSnapshot).toMatchObject({ resolution: 'host', closedBy: 'decide', counts: [{ optionKey: 'music', count: 1 }, { optionKey: 'physical', count: 0 }] });
    await expect(voteFor(f, 1, choice, 'music')).rejects.toMatchObject({ code: 'INVALID_STATE' });

    const tie = await atChoice();
    await voteFor(tie.f, 0, tie.choice, 'music'); await voteFor(tie.f, 1, tie.choice, 'physical');
    await hostCommand(tie.f, 'stage.close', { stageRunId: tie.choice });
    expect(await decision(tie.choice)).toBeNull();
    const waiting = await readSessionView(prisma, tie.f.host, tie.f.sessionId);
    expect(waiting.stage!.route).toMatchObject({ pending: 'tie', leaders: ['music', 'physical'], decision: null });
    await expect(hostCommand(tie.f, 'stage.advance', { stageRunId: tie.choice })).rejects.toMatchObject({ code: 'DECISION_PENDING' });
    await expect(hostCommand(tie.f, 'stage.reveal', { stageRunId: tie.choice })).rejects.toMatchObject({ code: 'DECISION_PENDING' });
    await hostCommand(tie.f, 'route.decide', { stageRunId: tie.choice, optionKey: 'music' });
    expect(await decision(tie.choice)).toMatchObject({ reason: 'TIE_BREAK', destinationNodeKey: 'music' });

    const empty = await atChoice();
    await hostCommand(empty.f, 'stage.close', { stageRunId: empty.choice });
    expect((await readSessionView(prisma, empty.f.host, empty.f.sessionId)).stage!.route!.pending).toBe('no-votes');
  });

  it('records automatic tie-breaks and empty-vote defaults, and keeps following them', async () => {
    const random = await atChoice(branching(players('random', 'host')));
    await voteFor(random.f, 0, random.choice, 'music'); await voteFor(random.f, 1, random.choice, 'physical');
    await hostCommand(random.f, 'stage.close', { stageRunId: random.choice });
    const drawn = (await decision(random.choice))!;
    expect(drawn.reason).toBe('TIE_BREAK');
    const snapshot = drawn.voteSnapshot as { optionKey: string; random: { candidates: string[]; index: number } };
    expect(snapshot.random.candidates).toEqual(['music', 'physical']);
    expect(snapshot.optionKey).toBe(snapshot.random.candidates[snapshot.random.index]);
    for (let read = 0; read < 3; read++) expect((await readSessionView(prisma, random.f.host, random.f.sessionId)).stage!.route!.decision!.optionKey).toBe(snapshot.optionKey);
    const next = (await hostCommand(random.f, 'stage.advance', { stageRunId: random.choice })).stageRunId!;
    expect((await prisma.stageRun.findUniqueOrThrow({ where: { id: next } })).nodeKey).toBe(drawn.destinationNodeKey);

    const fallback = await atChoice(branching(players('host', 'default'), { defaultOptionKey: 'physical' }));
    await hostCommand(fallback.f, 'stage.close', { stageRunId: fallback.choice });
    expect(await decision(fallback.choice)).toMatchObject({ reason: 'FALLBACK', destinationNodeKey: 'physical' });
  });

  it('reopens an undecided vote with its votes kept, but never a decided one', async () => {
    const { f, choice } = await atChoice();
    await voteFor(f, 0, choice, 'music'); await voteFor(f, 1, choice, 'physical');
    await hostCommand(f, 'stage.close', { stageRunId: choice });
    await hostCommand(f, 'stage.reopen', { stageRunId: choice, durationMs: 30_000 });
    await expect(voteFor(f, 0, choice, 'physical')).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
    await voteFor(f, 2, choice, 'music');
    await hostCommand(f, 'stage.close', { stageRunId: choice });
    expect(await decision(choice)).toMatchObject({ reason: 'VOTE', destinationNodeKey: 'music' });
    await expect(hostCommand(f, 'stage.reopen', { stageRunId: choice, durationMs: null })).rejects.toMatchObject({ code: 'ALREADY_DECIDED' });
  });

  it('fixes the voters when voting opens: late joiners do not vote, leavers still count, invalid votes are refused', async () => {
    const { f, choice } = await atChoice(branching(players('host', 'host', 'live')));
    // A large room must not break the vote: voter lists have no cap.
    const many = Array.from({ length: 1200 }, (_, index) => `player:00000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
    const run = await prisma.stageRun.findUniqueOrThrow({ where: { id: choice } });
    const original = run.presentation;
    await prisma.stageRun.update({ where: { id: choice }, data: { presentation: { ...(original as object), route: { formatVersion: 1, voterKeys: [...((original as { route: { voterKeys: string[] } }).route.voterKeys), ...many] } } } });
    expect((await readSessionView(prisma, f.host, f.sessionId)).stage!.eligibleCount).toBe(1203);
    await prisma.stageRun.update({ where: { id: choice }, data: { presentation: original as object } });
    const late = await prisma.sessionPlayer.create({ data: { sessionId: f.sessionId, displayName: 'Late' } });
    await expect(service.execute({ role: 'player', playerId: late.id }, { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type: 'submission.submit', stageRunId: choice, value: { kind: 'choice', choiceKey: 'music' } })).rejects.toMatchObject({ code: 'INELIGIBLE' });
    expect((await readSessionView(prisma, { role: 'player', playerId: late.id }, f.sessionId)).stage!.route!.canVote).toBe(false);
    await expect(voteFor(f, 0, choice, 'nowhere')).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    await expect(service.execute(actor(f, 0), { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type: 'submission.submit', stageRunId: choice, value: { kind: 'text', text: 'music' } })).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    await voteFor(f, 0, choice, 'music'); await voteFor(f, 1, choice, 'music'); await voteFor(f, 2, choice, 'physical');
    await prisma.sessionPlayer.update({ where: { id: f.players[1]!.id }, data: { leftAt: new Date() } });
    await hostCommand(f, 'stage.close', { stageRunId: choice });
    expect(await decision(choice)).toMatchObject({ destinationNodeKey: 'music', reason: 'VOTE' });
  });

  it('gives each team one captain vote', async () => {
    const { f, choice } = await atChoice(branching({ method: 'captains', tie: 'host', noVotes: 'host', counts: 'live' }, { teams: true }), 4);
    // Players 0 and 1 are the captains of the two teams; only they are offered a vote.
    expect((await readSessionView(prisma, actor(f, 0), f.sessionId)).stage!.route!.canVote).toBe(true);
    expect((await readSessionView(prisma, actor(f, 2), f.sessionId)).stage!.route!.canVote).toBe(false);
    await expect(voteFor(f, 2, choice, 'music')).rejects.toMatchObject({ code: 'INELIGIBLE' });
    await voteFor(f, 0, choice, 'physical');
    await expect(voteFor(f, 0, choice, 'music')).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
    const teammate = await readSessionView(prisma, actor(f, 2), f.sessionId);
    expect(teammate.ownSubmission).not.toBeNull();
    expect(teammate.stage).toMatchObject({ eligibleCount: 2, submittedCount: 1 });
    await voteFor(f, 1, choice, 'physical');
    await hostCommand(f, 'stage.close', { stageRunId: choice });
    expect((await decision(choice))!.voteSnapshot).toMatchObject({ method: 'captains', voterCount: 2, counts: [{ optionKey: 'music', count: 0 }, { optionKey: 'physical', count: 2 }] });
  });

  it('closes a timed vote at its deadline, extends it when the host adds time, and skips paused rooms', async () => {
    let now = Date.now(); const clock = () => new Date(now); const timed = createGameService(prisma, undefined, clock);
    const { f, choice } = await atChoice(branching(players('random', 'random')));
    await timed.execute(actor(f, 0), { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type: 'submission.submit', stageRunId: choice, value: { kind: 'choice', choiceKey: 'music' } });
    now += 20_000 + ACCEPTANCE_GRACE_MS + SETTLE_MS + 10;
    await hostCommand(f, 'session.pause');
    await closeExpiredStages(prisma, timed, clock);
    expect(await decision(choice)).toBeNull();
    await hostCommand(f, 'session.resume');
    await hostCommand(f, 'stage.timer', { stageRunId: choice, change: { kind: 'add', ms: 60_000 } });
    await closeExpiredStages(prisma, timed, clock);
    expect(await decision(choice)).toBeNull();
    now += 120_000;
    await closeExpiredStages(prisma, timed, clock);
    expect((await decision(choice))!.voteSnapshot).toMatchObject({ closedBy: 'timeout', optionKey: 'music' });
  });

  it('shows counts and the decision only as allowed, and never where the routes lead', async () => {
    for (const counts of ['live', 'reveal', 'never'] as const) {
      const { f, choice } = await atChoice(branching(players('host', 'host', counts)));
      await voteFor(f, 0, choice, 'music');
      const phone = async () => (await readSessionView(prisma, actor(f, 1), f.sessionId)).stage!.route!;
      expect((await phone()).counts === null).toBe(counts !== 'live');
      expect((await readSessionView(prisma, f.host, f.sessionId)).stage!.route!.counts).toEqual([{ optionKey: 'music', count: 1 }, { optionKey: 'physical', count: 0 }]);
      await hostCommand(f, 'stage.close', { stageRunId: choice });
      expect((await phone()).decision).toBeNull();
      expect((await readSessionView(prisma, f.host, f.sessionId)).stage!.route!.decision).toMatchObject({ optionKey: 'music', reason: 'vote' });
      await hostCommand(f, 'stage.reveal', { stageRunId: choice });
      const shown = await phone();
      expect(shown.decision).toMatchObject({ optionKey: 'music', resolution: 'majority' });
      expect(shown.counts === null).toBe(counts === 'never');
      expect(shown.pending).toBeNull();
      const json = JSON.stringify(await readSessionView(prisma, actor(f, 1), f.sessionId));
      for (const secret of ['secret-music-edge', 'secret-physical-edge', 'Scene music', 'Scene physical', 'finale', 'tie', 'noVotes']) expect(json).not.toContain(secret);
    }
  });

  it('lets a host decide alone, without votes or a timer', async () => {
    const { f, choice } = await atChoice(branching({ method: 'host' }));
    expect((await readSessionView(prisma, actor(f, 0), f.sessionId)).stage).toMatchObject({ input: null, deadlineAt: null, route: { method: 'host', canVote: false } });
    await expect(voteFor(f, 0, choice, 'music')).rejects.toMatchObject({ code: 'INELIGIBLE' });
    await hostCommand(f, 'stage.close', { stageRunId: choice });
    expect((await readSessionView(prisma, f.host, f.sessionId)).stage!.route!.pending).toBe('host');
    await hostCommand(f, 'route.decide', { stageRunId: choice, optionKey: 'physical' });
    expect(await decision(choice)).toMatchObject({ reason: 'HOST', destinationNodeKey: 'physical' });
  });

  it('refuses a format 2 game stored with the wrong format number', async () => {
    const definition = branching(players());
    const creator = await prisma.creator.create({ data: { issuer: 'https://identity.example/', subject: randomUUID() } });
    const game = await prisma.game.create({ data: { creatorId: creator.id, title: 'Mislabelled' } });
    const { contentHash } = await import('../../src/game/definition.js');
    const version = await prisma.gameVersion.create({ data: { gameId: game.id, number: 1, definition, contentHash: contentHash(definition), createdById: creator.id } });
    await expect(service.execute({ role: 'host', creatorId: creator.id }, { formatVersion: 1, sessionId: randomUUID(), commandId: randomUUID(), type: 'session.create', gameVersionId: version.id, mode: 'REHEARSAL', expectedRevision: 0 })).rejects.toMatchObject({ code: 'INVALID_DEFINITION' });
  });
});
