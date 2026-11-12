import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { parseDefinition, type GameDefinition } from '../../src/game/definition.js';
import { readSessionView } from '../../src/game/views.js';
import { db, fixture, hostCommand, prisma, service } from './game-fixture.js';

afterAll(async () => { await db.close(); });
const quiz = (key: string, play?: object) => ({ key, stages: [{ key: 'q', kind: 'collect', prompt: `Question ${key}`, durationMs: 30_000,
  input: { kind: 'choice', options: [{ key: 'canberra', label: 'Canberra' }, { key: 'sydney', label: 'Sydney' }] },
  scoring: { kind: 'correct-choice', correctChoiceKey: 'canberra', awardMilli: '10000' }, ...(play ? { play } : {}) }] });
const chain = (nodes: { key: string }[]) => nodes.slice(1).map((node, index) => ({ key: `e${index}`, from: nodes[index]!.key, to: node.key }));
function game(nodes: { key: string; stages: object[] }[], extra: object = {}): GameDefinition {
  return parseDefinition({ formatVersion: 1, title: 'Teams', startNodeKey: nodes[0]!.key, nodes, edges: chain(nodes), ...extra });
}
const teams = (answers: string, points: string, lineup: object = { kind: 'game' }) => ({ kind: 'teams', lineup, answers, points });
const two = { split: { kind: 'count', teams: 2 }, formation: 'random' };

type World = Awaited<ReturnType<typeof fixture>>;
const player = (f: World, index: number) => ({ role: 'player' as const, playerId: f.players[index]!.id });
const act = (f: World, index: number, type: string, extra: object) => service.execute(player(f, index), { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type, ...extra });
const answer = (f: World, index: number, stageRunId: string, choiceKey = 'canberra') => act(f, index, 'submission.submit', { stageRunId, value: { kind: 'choice', choiceKey } });
const view = (f: World, index: number) => readSessionView(prisma, player(f, index), f.sessionId);
const hostView = (f: World) => readSessionView(prisma, f.host, f.sessionId);
const close = async (f: World, stageRunId: string) => { await hostCommand(f, 'stage.close', { stageRunId }); await hostCommand(f, 'stage.reveal', { stageRunId }).catch(() => undefined); };
const totals = async (f: World) => new Map((await hostView(f)).teamStandings.map(team => [team.name, team.amountMilli]));
const sizes = async (f: World) => (await hostView(f)).stage!.teams!.teams.map(team => team.memberIds.length);

describe('team rounds', () => {
  it('refuses game teams that are never defined, ambiguous sizes and missing team names', () => {
    expect(() => game([quiz('a', teams('everyone', 'team'))])).toThrow('INVALID_DEFINITION');
    expect(() => game([quiz('a', teams('everyone', 'team', { kind: 'round', form: { split: { kind: 'sizes', sizes: ['rest', 'rest'] }, formation: 'random' } }))])).toThrow('INVALID_DEFINITION');
    expect(() => game([quiz('a')], { teams: { ...two, names: ['Only one'] } })).toThrow('INVALID_DEFINITION');
    expect(() => game([quiz('a')], { teams: { ...two, names: ['Same', 'same'] } })).toThrow('INVALID_DEFINITION');
    expect(() => game([quiz('a', teams('captain', 'both', { kind: 'reform', form: two, carryover: 'fresh' })), quiz('b', teams('captain', 'both'))])).not.toThrow();
  });

  it('proposes random teams, keeps the round closed and untimed until the host confirms, then starts the clock', async () => {
    const f = await fixture(5, game([quiz('a')], { teams: two, play: teams('captain', 'both') }));
    const stageRunId = (await hostCommand(f, 'session.start')).stageRunId!;
    const forming = (await hostView(f)).stage!;
    expect(forming).toMatchObject({ deadlineAt: null, eligibleCount: 0, teams: { forming: true, formation: 'random', scope: 'game', answers: 'captain' } });
    expect((await sizes(f)).sort()).toEqual([2, 3]);
    await expect(answer(f, 0, stageRunId)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    // A team round cannot end before its teams exist; later rounds rely on the lineup.
    await expect(hostCommand(f, 'stage.close', { stageRunId })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(hostCommand(f, 'stage.timer', { stageRunId, change: { kind: 'set', ms: 5000 } })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    // Players cannot change a random proposal; the host can change anything.
    await expect(act(f, 0, 'teams.choose', { stageRunId, teamIndex: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const session = await prisma.gameSession.findUniqueOrThrow({ where: { id: f.sessionId } });
    await expect(service.execute(player(f, 0), { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, expectedRevision: session.revision, type: 'teams.confirm', stageRunId })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    for (const index of [0, 1, 2]) await hostCommand(f, 'teams.assign', { stageRunId, playerId: f.players[index]!.id, teamIndex: 0 });
    await hostCommand(f, 'teams.assign', { stageRunId, playerId: f.players[3]!.id, teamIndex: 1 });
    await hostCommand(f, 'teams.assign', { stageRunId, playerId: f.players[4]!.id, teamIndex: null });
    await hostCommand(f, 'teams.captain', { stageRunId, playerId: f.players[1]!.id });
    expect(await sizes(f)).toEqual([3, 1]);
    expect((await view(f, 4)).stage!.teams).toMatchObject({ unassignedIds: [f.players[4]!.id], ownTeamIndex: null });

    await hostCommand(f, 'teams.confirm', { stageRunId });
    const started = await prisma.stageRun.findUniqueOrThrow({ where: { id: stageRunId } });
    expect(started.deadlineAt!.getTime()).toBeGreaterThan(Date.now() + 25_000);
    const red = (await view(f, 0)).stage!;
    expect(red).toMatchObject({ eligibleCount: 4, teams: { forming: false, ownTeamIndex: expect.any(Number) } });
    const redTeam = red.teams!.teams.find(team => team.index === red.teams!.ownTeamIndex)!;
    expect(redTeam).toMatchObject({ name: 'Red', captainId: f.players[1]!.id });
    expect([...redTeam.memberIds].sort()).toEqual([0, 1, 2].map(index => f.players[index]!.id).sort());
    // The player who sat out cannot answer; only the captain answers for the team.
    await expect(answer(f, 4, stageRunId)).rejects.toMatchObject({ code: 'INELIGIBLE' });
    await expect(answer(f, 0, stageRunId)).rejects.toMatchObject({ code: 'INELIGIBLE' });
    await answer(f, 1, stageRunId);
    await expect(answer(f, 1, stageRunId)).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
    expect((await view(f, 2)).ownSubmission?.value).toEqual({ kind: 'choice', choiceKey: 'canberra' });
    await answer(f, 3, stageRunId, 'sydney');
    await expect(hostCommand(f, 'teams.shuffle', { stageRunId })).rejects.toMatchObject({ code: 'INVALID_STATE' });

    await close(f, stageRunId);
    // "both": the team gets the points and so does every member.
    const after = await hostView(f);
    expect(after.stage!.reveal!.teamAwards).toEqual([{ teamId: redTeam.teamId, amountMilli: '10000' }]);
    expect(new Map(after.standings.map(row => [row.playerId, row.amountMilli]))).toEqual(new Map([0, 1, 2].map(index => [f.players[index]!.id, '10000'])));
    expect(await totals(f)).toEqual(new Map([['Red', '10000'], ['Blue', '0']]));
  });

  it('splits by exact sizes: one against the rest, and two against two with others sitting out', async () => {
    const lone = await fixture(5, game([quiz('a', teams('everyone', 'members', { kind: 'round', form: { split: { kind: 'sizes', sizes: [1, 'rest'] }, formation: 'random' } }))]));
    await hostCommand(lone, 'session.start');
    expect(await sizes(lone)).toEqual([1, 4]);
    const pairs = await fixture(5, game([quiz('a', teams('everyone', 'members', { kind: 'round', form: { split: { kind: 'sizes', sizes: [2, 2] }, formation: 'random', names: ['Left', 'Right'] } }))]));
    const stageRunId = (await hostCommand(pairs, 'session.start')).stageRunId!;
    expect(await sizes(pairs)).toEqual([2, 2]);
    expect((await hostView(pairs)).stage!.teams!.unassignedIds).toHaveLength(1);
    await hostCommand(pairs, 'teams.confirm', { stageRunId });
    expect((await hostView(pairs)).stage!.teams!.teams.map(team => team.name).sort()).toEqual(['Left', 'Right']);
    expect((await hostView(pairs)).stage!.eligibleCount).toBe(4);
  });

  it('lets players pick teams up to a team’s size, while the host can still overrule', async () => {
    const f = await fixture(4, game([quiz('a', teams('everyone', 'team', { kind: 'reform', form: { split: { kind: 'sizes', sizes: [1, 3] }, formation: 'players' }, carryover: 'fresh' }))]));
    const stageRunId = (await hostCommand(f, 'session.start')).stageRunId!;
    expect((await hostView(f)).stage!.teams!.unassignedIds).toHaveLength(4);
    await act(f, 0, 'teams.choose', { stageRunId, teamIndex: 0 });
    await expect(act(f, 1, 'teams.choose', { stageRunId, teamIndex: 0 })).rejects.toMatchObject({ code: 'INELIGIBLE' });
    await act(f, 1, 'teams.choose', { stageRunId, teamIndex: 1 });
    await act(f, 0, 'teams.choose', { stageRunId, teamIndex: 0 }); // choosing your own team again is fine
    await expect(act(f, 2, 'teams.choose', { stageRunId, teamIndex: 7 })).rejects.toMatchObject({ code: 'INVALID_COMMAND' });
    await hostCommand(f, 'teams.assign', { stageRunId, playerId: f.players[2]!.id, teamIndex: 0 });
    expect(await sizes(f)).toEqual([2, 1]);
    await hostCommand(f, 'teams.confirm', { stageRunId });
    // Points to the team only: a correct member answer adds to the team, not the player.
    await answer(f, 0, stageRunId);
    await close(f, stageRunId);
    const after = await hostView(f);
    expect(after.standings).toEqual([]);
    expect(await totals(f)).toEqual(new Map([['Red', '10000'], ['Blue', '0']]));
  });

  it('keeps game teams across rounds, places late joiners, and lets a round override them', async () => {
    const definition = game([quiz('a'), quiz('b'), quiz('c', { kind: 'solo' }),
      { key: 'd', stages: [{ key: 'show', kind: 'challenge', prompt: 'Team challenge', durationMs: null, maxAwardMilli: '20000' }] }], { teams: two, play: teams('everyone', 'both') });
    const f = await fixture(4, definition);
    const first = (await hostCommand(f, 'session.start')).stageRunId!;
    await hostCommand(f, 'teams.confirm', { stageRunId: first });
    const lineup = (await hostView(f)).stage!.teams!.teams.map(team => team.memberIds.length);
    await close(f, first);
    const late = await prisma.sessionPlayer.create({ data: { sessionId: f.sessionId, displayName: 'Late' } });
    const second = (await hostCommand(f, 'stage.advance', { stageRunId: first })).stageRunId!;
    // No new forming: the same teams continue, with the late player in the smallest team.
    const next = (await hostView(f)).stage!;
    expect(next.teams!.forming).toBe(false);
    expect(next.teams!.teams.map(team => team.memberIds.length).reduce((a, b) => a + b)).toBe(lineup.reduce((a, b) => a + b) + 1);
    expect(next.teams!.teams.some(team => team.memberIds.includes(late.id))).toBe(true);
    expect(next.deadlineAt).not.toBeNull();
    await close(f, second);
    const solo = (await hostCommand(f, 'stage.advance', { stageRunId: second })).stageRunId!;
    expect((await hostView(f)).stage!.teams).toBeNull();
    await answer(f, 0, solo);
    await close(f, solo);
    expect((await prisma.scoreEntry.findMany({ where: { stageRunId: solo } })).map(entry => [entry.recipientPlayerId, entry.recipientTeamId])).toEqual([[f.players[0]!.id, null]]);

    // Team challenges are judged per team, once, with a decision recorded for every member.
    const challenge = (await hostCommand(f, 'stage.advance', { stageRunId: solo })).stageRunId!;
    await hostCommand(f, 'stage.close', { stageRunId: challenge });
    const [red, blue] = (await hostView(f)).stage!.teams!.teams;
    await expect(hostCommand(f, 'stage.judge', { stageRunId: challenge, playerId: f.players[0]!.id, amountMilli: '1000' })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await hostCommand(f, 'stage.judgeTeam', { stageRunId: challenge, teamId: red!.teamId, amountMilli: '20000' });
    await hostCommand(f, 'stage.judgeTeam', { stageRunId: challenge, teamId: blue!.teamId, amountMilli: '0' });
    await expect(hostCommand(f, 'stage.judgeTeam', { stageRunId: challenge, teamId: red!.teamId, amountMilli: '5000' })).rejects.toMatchObject({ code: 'ALREADY_JUDGED' });
    expect(await prisma.stageJudgment.count({ where: { stageRunId: challenge } })).toBe(5);
    expect((await hostView(f)).stage!.challenge!.judgedTeamIds.sort()).toEqual([red!.teamId, blue!.teamId].sort());
    const entries = await prisma.scoreEntry.findMany({ where: { stageRunId: challenge } });
    expect(entries.filter(entry => entry.recipientTeamId).map(entry => entry.amountMilli)).toEqual([20000n]);
    expect(entries.filter(entry => entry.recipientPlayerId).map(entry => entry.recipientPlayerId).sort()).toEqual([...red!.memberIds].sort());
  });

  it.each([
    ['keep', (red: bigint) => red],
    ['fresh', () => 0n],
    ['members', (_red: bigint, members: bigint) => members],
  ] as const)('carries team scores over a re-formed lineup with the "%s" rule', async (carryover, expected) => {
    const f = await fixture(4, game([quiz('a'), quiz('b', teams('everyone', 'both', { kind: 'reform', form: { split: { kind: 'count', teams: 2 }, formation: 'host' }, carryover }))],
      { teams: { split: { kind: 'count', teams: 2 }, formation: 'host' }, play: teams('everyone', 'both') }));
    const first = (await hostCommand(f, 'session.start')).stageRunId!;
    // Red: players 0 and 1. Blue: players 2 and 3. Two correct answers for Red.
    for (const [index, team] of [[0, 0], [1, 0], [2, 1], [3, 1]] as const) await hostCommand(f, 'teams.assign', { stageRunId: first, playerId: f.players[index]!.id, teamIndex: team });
    await hostCommand(f, 'teams.confirm', { stageRunId: first });
    await answer(f, 0, first); await answer(f, 1, first); await answer(f, 2, first, 'sydney');
    await close(f, first);
    expect(await totals(f)).toEqual(new Map([['Red', '20000'], ['Blue', '0']]));
    // New Red: players 0 and 2 (individual 10 + 0 points).
    const second = (await hostCommand(f, 'stage.advance', { stageRunId: first })).stageRunId!;
    for (const [index, team] of [[0, 0], [2, 0], [1, 1], [3, 1]] as const) await hostCommand(f, 'teams.assign', { stageRunId: second, playerId: f.players[index]!.id, teamIndex: team });
    await hostCommand(f, 'teams.confirm', { stageRunId: second });
    const now = await totals(f);
    expect(now.get('Red')).toBe(expected(20000n, 10000n).toString());
    expect(now.get('Blue')).toBe(expected(0n, 10000n).toString());
    // History is untouched: the earlier lineup still records the original teams.
    expect(await prisma.teamLineup.count({ where: { sessionId: f.sessionId } })).toBe(2);
  });

  it('never lets a team vote for its own entry, and gives the votes to the team that wrote it', async () => {
    const f = await fixture(4, game([
      { key: 'w', stages: [{ key: 'joke', kind: 'collect', prompt: 'Team joke', durationMs: null, input: { kind: 'text', maxLength: 100 }, scoring: { kind: 'none' } }] },
      { key: 'v', stages: [{ key: 'pick', kind: 'vote', prompt: 'Vote', durationMs: null, source: { nodeKey: 'w', stageKey: 'joke' }, awardPerVoteMilli: '5000', play: { kind: 'solo' } }] },
    ], { teams: { split: { kind: 'count', teams: 2 }, formation: 'host' }, play: teams('captain', 'team') }));
    const write = (await hostCommand(f, 'session.start')).stageRunId!;
    for (const [index, team] of [[0, 0], [1, 0], [2, 1], [3, 1]] as const) await hostCommand(f, 'teams.assign', { stageRunId: write, playerId: f.players[index]!.id, teamIndex: team });
    await hostCommand(f, 'teams.captain', { stageRunId: write, playerId: f.players[0]!.id });
    await hostCommand(f, 'teams.captain', { stageRunId: write, playerId: f.players[2]!.id });
    await hostCommand(f, 'teams.confirm', { stageRunId: write });
    const red = (await act(f, 0, 'submission.submit', { stageRunId: write, value: { kind: 'text', text: 'Red joke' } })).submissionId!;
    const blue = (await act(f, 2, 'submission.submit', { stageRunId: write, value: { kind: 'text', text: 'Blue joke' } })).submissionId!;
    await hostCommand(f, 'stage.close', { stageRunId: write });
    const vote = (await hostCommand(f, 'stage.advance', { stageRunId: write })).stageRunId!;
    const ballot = (await view(f, 1)).stage!.ballot!;
    expect(ballot.find(entry => entry.submissionId === red)!.own).toBe(true);
    expect(ballot.find(entry => entry.submissionId === blue)!.own).toBe(false);
    await expect(act(f, 1, 'submission.submit', { stageRunId: vote, value: { kind: 'vote', submissionId: red } })).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    await act(f, 1, 'submission.submit', { stageRunId: vote, value: { kind: 'vote', submissionId: blue } });
    await act(f, 0, 'submission.submit', { stageRunId: vote, value: { kind: 'vote', submissionId: blue } });
    await act(f, 3, 'submission.submit', { stageRunId: vote, value: { kind: 'vote', submissionId: red } });
    await close(f, vote);
    expect(await totals(f)).toEqual(new Map([['Blue', '10000'], ['Red', '5000']]));
    expect((await hostView(f)).stage!.reveal!.answer).toMatchObject({ kind: 'vote', entries: [{ submissionId: blue, playerId: null, votes: 2 }, { submissionId: red, playerId: null, votes: 1 }] });
  });
});
