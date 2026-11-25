import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { parseDefinition, type GameDefinition } from '../../../src/game/definition.js';
import { readSessionView } from '../../../src/game/views.js';
import { db, fixture, hostCommand, prisma, service } from '../game-fixture.js';

afterAll(async () => { await db.close(); });
const quiz = (key: string, extra: object = {}) => ({ key, stages: [{ key: 'q', kind: 'collect', prompt: `Question ${key}`, durationMs: 30_000,
  input: { kind: 'choice', options: [{ key: 'canberra', label: 'Canberra' }, { key: 'sydney', label: 'Sydney' }] },
  scoring: { kind: 'correct-choice', correctChoiceKey: 'canberra', awardMilli: '10000' }, ...extra }] });
const game = (nodes: { key: string; stages: object[] }[], extra: object = {}): GameDefinition => parseDefinition({ formatVersion: 1, title: 'Verdicts', startNodeKey: nodes[0]!.key, nodes,
  edges: nodes.slice(1).map((node, index) => ({ key: `e${index}`, from: nodes[index]!.key, to: node.key })), ...extra });
type World = Awaited<ReturnType<typeof fixture>>;
const player = (f: World, index: number) => ({ role: 'player' as const, playerId: f.players[index]!.id });
const submit = async (f: World, index: number, stageRunId: string, choiceKey: string) => (await service.execute(player(f, index), { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type: 'submission.submit', stageRunId, value: { kind: 'choice', choiceKey } })).submissionId!;
const verdict = (f: World, submissionId: string, correct: boolean | null) => hostCommand(f, 'score.verdict', { submissionId, correct });
const totals = async (f: World) => new Map((await readSessionView(prisma, f.host, f.sessionId)).standings.map(row => [row.playerId, row.amountMilli]));
const reveal = async (f: World, index?: number) => (await readSessionView(prisma, index === undefined ? f.host : player(f, index), f.sessionId)).stage!.reveal!;

describe('host verdicts on answers', () => {
  it('counts a wrong answer as correct, takes a right one away, undoes either, and keeps the history', async () => {
    const f = await fixture(3, game([quiz('a')], { finale: { stats: ['mostCorrect', 'mostWrong'] } }));
    const stageRunId = (await hostCommand(f, 'session.start')).stageRunId!;
    const ada = await submit(f, 0, stageRunId, 'canberra'); const ben = await submit(f, 1, stageRunId, 'sydney');
    // Not before the reveal: the round has not been scored for everyone yet.
    await hostCommand(f, 'stage.close', { stageRunId });
    await expect(verdict(f, ben, true)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await hostCommand(f, 'stage.reveal', { stageRunId });
    const [adaId, benId] = [f.players[0]!.id, f.players[1]!.id];
    expect((await reveal(f)).answers).toEqual([
      { submissionId: ada, playerId: adaId, teamId: null, choiceKey: 'canberra', correct: true, verdict: null },
      { submissionId: ben, playerId: benId, teamId: null, choiceKey: 'sydney', correct: false, verdict: null }]);
    // Players never get the host's answer list.
    expect((await reveal(f, 2)).answers).toBeUndefined();

    await verdict(f, ben, true);
    expect((await totals(f)).get(benId)).toBe('10000');
    expect((await reveal(f, 1)).verdicts).toEqual([{ playerId: benId, teamId: null, correct: true }]);
    expect((await reveal(f)).awards.find(row => row.playerId === benId)?.amountMilli).toBe('10000');
    // The same verdict again changes nothing (and is refused), so points are never given twice.
    await expect(verdict(f, ben, true)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await verdict(f, ada, false);
    expect((await totals(f)).get(adaId)).toBe('0');
    // Back to the round's own scoring: Ada's 10 points return, Ben's go.
    await verdict(f, ada, null); await verdict(f, ben, null);
    expect(await totals(f)).toEqual(new Map([[adaId, '10000'], [benId, '0']]));
    expect((await reveal(f)).verdicts).toEqual([]);
    // Every verdict and every point change stays on record, linked to the answer.
    expect(await prisma.answerVerdict.count({ where: { submissionId: { in: [ada, ben] } } })).toBe(4);
    const fixes = await prisma.scoreEntry.findMany({ where: { sessionId: f.sessionId, awardKey: { startsWith: 'verdict:' } }, orderBy: { createdAt: 'asc' } });
    expect(fixes.map(entry => [entry.awardKey.split(':')[1], entry.amountMilli, entry.kind])).toEqual([
      [ben, 10000n, 'ADJUSTMENT'], [ada, -10000n, 'ADJUSTMENT'], [ada, 10000n, 'ADJUSTMENT'], [ben, -10000n, 'ADJUSTMENT']]);
    await expect(prisma.answerVerdict.deleteMany({ where: { submissionId: ben } })).rejects.toThrow();
    // The end awards follow the verdicts: with Ben's answer counted, both have a correct answer and nobody a wrong one.
    await verdict(f, ben, true);
    await hostCommand(f, 'stage.advance', { stageRunId });
    expect((await readSessionView(prisma, f.host, f.sessionId)).awards).toEqual([{ stat: 'mostCorrect', playerIds: expect.arrayContaining([adaId, benId]), value: '1 correct answer' }]);
  });

  it('moves the points of a team answer for the team and its members', async () => {
    const f = await fixture(2, game([quiz('a', { play: { kind: 'teams', lineup: { kind: 'game' }, answers: 'captain', points: 'both' } })],
      { teams: { split: { kind: 'count', teams: 2 }, formation: 'host' } }));
    const stageRunId = (await hostCommand(f, 'session.start')).stageRunId!;
    for (const index of [0, 1]) await hostCommand(f, 'teams.assign', { stageRunId, playerId: f.players[index]!.id, teamIndex: 0 });
    await hostCommand(f, 'teams.captain', { stageRunId, playerId: f.players[0]!.id });
    await hostCommand(f, 'teams.confirm', { stageRunId });
    const answer = await submit(f, 0, stageRunId, 'sydney');
    await hostCommand(f, 'stage.close', { stageRunId }); await hostCommand(f, 'stage.reveal', { stageRunId });
    await verdict(f, answer, true);
    const view = await readSessionView(prisma, player(f, 1), f.sessionId);
    expect(view.teamStandings.map(team => team.amountMilli)).toEqual(['10000']);
    expect((await totals(f))).toEqual(new Map(f.players.map(row => [row.id, '10000'])));
    // The teammate (not the captain) sees the team's answer was counted.
    expect(view.stage!.reveal!.verdicts).toMatchObject([{ playerId: null, correct: true }]);
  });

  it('only works on rounds with a right answer, in this room', async () => {
    const f = await fixture(1, game([{ key: 'w', stages: [{ key: 'q', kind: 'collect', prompt: 'Write', durationMs: null, input: { kind: 'text', maxLength: 50 }, scoring: { kind: 'none' } }] }]));
    const stageRunId = (await hostCommand(f, 'session.start')).stageRunId!;
    const written = (await service.execute(player(f, 0), { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type: 'submission.submit', stageRunId, value: { kind: 'text', text: 'Hi' } })).submissionId!;
    await hostCommand(f, 'stage.close', { stageRunId }); await hostCommand(f, 'stage.reveal', { stageRunId });
    await expect(verdict(f, written, true)).rejects.toMatchObject({ code: 'INVALID_COMMAND' });
    const other = await fixture(1, game([quiz('a')])); await hostCommand(other, 'session.start');
    await expect(verdict(other, written, true)).rejects.toMatchObject({ code: 'INELIGIBLE' });
    // Players cannot overrule anything.
    await expect(service.execute(player(f, 0), { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type: 'score.verdict', expectedRevision: 0, submissionId: written, correct: true })).rejects.toBeTruthy();
  });
});
