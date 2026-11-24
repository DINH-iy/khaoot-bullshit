import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { parseDefinition, type GameDefinition } from '../../../src/game/definition.js';
import { readSessionView } from '../../../src/game/views.js';
import { db, fixture, hostCommand, prisma, service } from '../game-fixture.js';

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
// Commands players may also send carry no revision, from the host too (as the room screen sends them).
const hostColor = (f: World, extra: object) => service.execute(f.host, { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type: 'teams.color', ...extra });
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

  it('makes the game teams in a Pick teams scene: players choose, the host adds and removes teams, later rounds play in them', async () => {
    const pick = { key: 'pick', stages: [{ key: 'teams', kind: 'teams', prompt: 'Pick your teams', durationMs: null, form: { split: { kind: 'count', teams: 2 }, formation: 'players' }, captains: true }] };
    const f = await fixture(4, game([pick, quiz('a', teams('captain', 'team')), quiz('b', { kind: 'solo' })]));
    const stageRunId = (await hostCommand(f, 'session.start')).stageRunId!;
    expect((await hostView(f)).stage).toMatchObject({ kind: 'teams', teams: { forming: true, formation: 'players', scope: 'game', answers: 'captain' } });
    // Not before the teams are confirmed.
    await expect(hostCommand(f, 'stage.advance', { stageRunId })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    // A third team, then the empty second one goes again: the third moves up.
    await hostCommand(f, 'teams.add', { stageRunId });
    expect((await hostView(f)).stage!.teams!.teams.map(team => team.name)).toEqual(['Red', 'Blue', 'Green']);
    for (const [index, team] of [[0, 0], [1, 0], [2, 2], [3, 2]] as const) await act(f, index, 'teams.choose', { stageRunId, teamIndex: team });
    await hostCommand(f, 'teams.remove', { stageRunId, teamIndex: 1 });
    expect((await hostView(f)).stage!.teams!.teams.map(team => [team.name, team.memberIds.length])).toEqual([['Red', 2], ['Green', 2]]);
    await hostCommand(f, 'teams.captain', { stageRunId, playerId: f.players[0]!.id });
    await hostCommand(f, 'teams.confirm', { stageRunId });
    // Confirmed: the scene asks nothing more, the host moves on, and the next round plays in these teams.
    const round = (await hostCommand(f, 'stage.advance', { stageRunId })).stageRunId!;
    expect((await hostView(f)).stage!.teams).toMatchObject({ forming: false, answers: 'captain' });
    expect((await hostView(f)).stage!.teams!.teams.map(team => team.name)).toEqual(['Red', 'Green']);
    await answer(f, 0, round);
    await close(f, round);
    expect(await totals(f)).toEqual(new Map([['Red', '10000'], ['Green', '0']]));
    // At least one team stays, and never more than twelve.
    const again = await fixture(2, game([{ key: 'pick', stages: [{ ...pick.stages[0]!, form: { split: { kind: 'count', teams: 2 }, formation: 'random' } }] }]));
    const run = (await hostCommand(again, 'session.start')).stageRunId!;
    await hostCommand(again, 'teams.remove', { stageRunId: run, teamIndex: 0 });
    await expect(hostCommand(again, 'teams.remove', { stageRunId: run, teamIndex: 0 })).rejects.toMatchObject({ code: 'INVALID_COMMAND' });
    for (let count = 1; count < 12; count++) await hostCommand(again, 'teams.add', { stageRunId: run });
    await expect(hostCommand(again, 'teams.add', { stageRunId: run })).rejects.toMatchObject({ code: 'INVALID_COMMAND' });
  });

  it('gives teams colours: the host picks any colour, a team picks a swatch for itself when allowed; two teams never share one, and the colour stays', async () => {
    const pickScene = (colors?: 'teams') => ({ key: 'pick', stages: [{ key: 'teams', kind: 'teams', prompt: 'Pick your teams', durationMs: null, form: { split: { kind: 'count', teams: 2 }, formation: 'players', ...(colors ? { colors } : {}) } }] });
    const f = await fixture(3, game([pickScene('teams'), quiz('a', teams('everyone', 'team'))]));
    const stageRunId = (await hostCommand(f, 'session.start')).stageRunId!;
    const colors = async () => (await hostView(f)).stage!.teams!.teams.map(team => team.color);
    // Named after a colour: that colour; the view says the teams may pick.
    expect(await colors()).toEqual(['#e8505b', '#36a2eb']);
    expect((await view(f, 0)).stage!.teams!.colorsBy).toBe('teams');
    for (const [index, team] of [[0, 0], [1, 1], [2, 1]] as const) await act(f, index, 'teams.choose', { stageRunId, teamIndex: team });
    // A member picks one of the swatches for their own team; not another team's, not any colour, not one in use.
    await act(f, 0, 'teams.color', { stageRunId, teamIndex: 0, color: '#2bb3a3' });
    await expect(act(f, 0, 'teams.color', { stageRunId, teamIndex: 1, color: '#f28c28' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(act(f, 1, 'teams.color', { stageRunId, teamIndex: 1, color: '#123456' })).rejects.toMatchObject({ code: 'INVALID_COMMAND' });
    await expect(act(f, 1, 'teams.color', { stageRunId, teamIndex: 1, color: '#2bb3a3' })).rejects.toMatchObject({ code: 'INVALID_COMMAND' });
    // The host picks any colour (not one another team has).
    await hostColor(f, { stageRunId, teamIndex: 1, color: '#123456' });
    await expect(hostColor(f, { stageRunId, teamIndex: 1, color: '#2bb3a3' })).rejects.toMatchObject({ code: 'INVALID_COMMAND' });
    expect(await colors()).toEqual(['#2bb3a3', '#123456']);
    // Kept once the teams are made: the next round, the team totals and the stored teams.
    await hostCommand(f, 'teams.confirm', { stageRunId });
    await hostCommand(f, 'stage.advance', { stageRunId });
    expect(await colors()).toEqual(['#2bb3a3', '#123456']);
    // Red picked teal, so it is called Teal now; Blue's own colour has no name, so Blue keeps its name.
    expect((await hostView(f)).stage!.teams!.teams.map(team => team.name)).toEqual(['Teal', 'Blue']);
    expect((await hostView(f)).teamStandings.map(team => [team.name, team.color]).sort()).toEqual([['Blue', '#123456'], ['Teal', '#2bb3a3']]);
    expect((await prisma.sessionTeam.findMany({ where: { sessionId: f.sessionId }, orderBy: { name: 'asc' } })).map(team => team.color)).toEqual(['#123456', '#2bb3a3']);
    // Without the setting only the host picks, and a new team gets a colour nobody uses.
    const hostOnly = await fixture(1, game([pickScene()]));
    const run = (await hostCommand(hostOnly, 'session.start')).stageRunId!;
    await act(hostOnly, 0, 'teams.choose', { stageRunId: run, teamIndex: 0 });
    await expect(act(hostOnly, 0, 'teams.color', { stageRunId: run, teamIndex: 0, color: '#2bb3a3' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await hostColor(hostOnly, { stageRunId: run, teamIndex: 0, color: '#5fb84a' });
    await hostCommand(hostOnly, 'teams.add', { stageRunId: run });
    const added = (await readSessionView(prisma, hostOnly.host, hostOnly.sessionId)).stage!.teams!.teams.map(team => team.color);
    expect(new Set(added).size).toBe(3);
  });

  it('refuses a round in the game teams with no Pick teams scene before it', () => {
    expect(() => game([quiz('a', teams('everyone', 'team'))])).toThrow('INVALID_DEFINITION');
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

  it('carries on when players leave a team empty: the round, the next team round and a vote all work', async () => {
    const pick = { kind: 'reform', form: { split: { kind: 'count', teams: 2 }, formation: 'players' }, carryover: 'members' };
    const f = await fixture(3, game([
      { key: 'w', stages: [{ key: 'joke', kind: 'collect', prompt: 'Team joke', durationMs: 60_000, input: { kind: 'text', maxLength: 100 }, scoring: { kind: 'none' }, play: teams('captain', 'team', pick) }] },
      { key: 'v', stages: [{ key: 'pick', kind: 'vote', prompt: 'Vote', durationMs: 30_000, source: { nodeKey: 'w', stageKey: 'joke' }, awardPerVoteMilli: '5000', play: { kind: 'solo' } }] },
      quiz('q', teams('everyone', 'team')),
    ], { teams: two, play: teams('everyone', 'team') }));
    const write = (await hostCommand(f, 'session.start')).stageRunId!;
    for (const index of [0, 1, 2]) await act(f, index, 'teams.choose', { stageRunId: write, teamIndex: 0 });
    await hostCommand(f, 'teams.confirm', { stageRunId: write });
    const captain = (await hostView(f)).stage!.teams!.teams[0]!.captainId!;
    await act(f, f.players.findIndex(p => p.id === captain), 'submission.submit', { stageRunId: write, value: { kind: 'text', text: 'Only joke' } });
    await close(f, write);
    const vote = (await hostCommand(f, 'stage.advance', { stageRunId: write })).stageRunId!;
    await close(f, vote);
    const quizRun = (await hostCommand(f, 'stage.advance', { stageRunId: vote })).stageRunId!;
    expect((await hostView(f)).stage!.teams).toMatchObject({ forming: false });
    await answer(f, 0, quizRun);
    await close(f, quizRun);
  });
});

it('balances teams by revealed individual performance, including submitted answers worth zero', async () => {
  const pick = { key: 'pick', stages: [{
    key: 'main', kind: 'teams', prompt: 'Make teams', durationMs: null,
    form: { split: { kind: 'count', teams: 2 }, formation: 'skill' },
  }] };
  const f = await fixture(4, game([quiz('warmup'), pick]));
  const warmup = (await hostCommand(f, 'session.start')).stageRunId!;
  for (let index = 0; index < 4; index++) await answer(f, index, warmup, index < 2 ? 'canberra' : 'sydney');
  await close(f, warmup);
  const stageRunId = (await hostCommand(f, 'stage.advance', { stageRunId: warmup })).stageRunId!;
  const winners = new Set(f.players.slice(0, 2).map(entry => entry.id));
  const check = async () => {
    const proposed = (await hostView(f)).stage!.teams!;
    expect(proposed.formation).toBe('skill');
    expect(proposed.teams.map(team => team.memberIds.length)).toEqual([2, 2]);
    expect(proposed.teams.map(team => team.memberIds.filter(id => winners.has(id)).length)).toEqual([1, 1]);
  };
  await check();
  await expect(act(f, 0, 'teams.shuffle', { stageRunId, method: 'skill' })).rejects.toBeDefined();
  await hostCommand(f, 'teams.shuffle', { stageRunId, method: 'skill' });
  await check();
});
