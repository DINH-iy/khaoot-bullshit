import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { parseDefinition } from '../../../src/game/definition.js';
import { db, fixture, hostCommand, prisma, service } from '../game-fixture.js';

// Points by place, paid through the real command service and ledger.
afterAll(async () => { await db.close(); });
type World = Awaited<ReturnType<typeof fixture>>;
const actor = (f: World, index: number) => ({ role: 'player' as const, playerId: f.players[index]!.id });
const submit = (f: World, index: number, stageRunId: string, value: object) => service.execute(actor(f, index), { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type: 'submission.submit', stageRunId, value });
const totals = async (f: World) => {
  const rows = await prisma.scoreEntry.groupBy({ by: ['recipientPlayerId'], where: { sessionId: f.sessionId }, _sum: { amountMilli: true } });
  return f.players.map(player => (rows.find(row => row.recipientPlayerId === player.id)?._sum.amountMilli ?? 0n).toString());
};
const places = { kind: 'list', pointsMilli: ['10000', '5000'] };

describe('points by place', () => {
  it('give the fastest correct answers their place on top of the points for being correct, once, at the reveal', async () => {
    const quiz = parseDefinition({ formatVersion: 1, title: 'Fast', startNodeKey: 'q', edges: [], nodes: [{ key: 'q', stages: [{ key: 'main', kind: 'collect', prompt: 'Capital of Australia?', durationMs: null,
      input: { kind: 'choice', options: [{ key: 'canberra', label: 'Canberra' }, { key: 'sydney', label: 'Sydney' }] }, scoring: { kind: 'correct-choice', correctChoiceKey: 'canberra', awardMilli: '1000', places } }] }] });
    const f = await fixture(4, quiz); const stage = (await hostCommand(f, 'session.start')).stageRunId!;
    // Player 2 is wrong; players 3, 1 and 4 are right, in that order.
    await submit(f, 1, stage, { kind: 'choice', choiceKey: 'sydney' });
    await submit(f, 2, stage, { kind: 'choice', choiceKey: 'canberra' });
    await submit(f, 0, stage, { kind: 'choice', choiceKey: 'canberra' });
    await submit(f, 3, stage, { kind: 'choice', choiceKey: 'canberra' });
    expect(await totals(f)).toEqual(['1000', '0', '1000', '1000']);
    await hostCommand(f, 'stage.close', { stageRunId: stage });
    await hostCommand(f, 'stage.reveal', { stageRunId: stage });
    expect(await totals(f)).toEqual(['6000', '0', '11000', '1000']);
    // Moving on after the reveal pays nothing more.
    await hostCommand(f, 'stage.advance', { stageRunId: stage });
    expect(await totals(f)).toEqual(['6000', '0', '11000', '1000']);
  });

  it('give the most-voted answers their place; equal votes share the place', async () => {
    const vote = parseDefinition({ formatVersion: 1, title: 'Votes', startNodeKey: 'write', edges: [{ key: 'w-v', from: 'write', to: 'vote' }], nodes: [
      { key: 'write', stages: [{ key: 'joke', kind: 'collect', prompt: 'Joke', durationMs: null, input: { kind: 'text', maxLength: 200 }, scoring: { kind: 'none' } }] },
      { key: 'vote', stages: [{ key: 'pick', kind: 'vote', prompt: 'Best?', durationMs: null, source: { nodeKey: 'write', stageKey: 'joke' }, awardPerVoteMilli: '0', places }] }] });
    const f = await fixture(5, vote); const write = (await hostCommand(f, 'session.start')).stageRunId!;
    const jokes = [];
    for (const index of [0, 1, 2]) jokes.push((await submit(f, index, write, { kind: 'text', text: `Joke ${index}` })).submissionId!);
    await hostCommand(f, 'stage.close', { stageRunId: write });
    const ballot = (await hostCommand(f, 'stage.advance', { stageRunId: write })).stageRunId!;
    // Jokes 0 and 1 get two votes each, joke 2 one: 0 and 1 share 1st place, joke 2 is 3rd (no points for 3rd here).
    await submit(f, 3, ballot, { kind: 'vote', submissionId: jokes[0] });
    await submit(f, 4, ballot, { kind: 'vote', submissionId: jokes[0] });
    await submit(f, 0, ballot, { kind: 'vote', submissionId: jokes[1] });
    await submit(f, 2, ballot, { kind: 'vote', submissionId: jokes[1] });
    await submit(f, 1, ballot, { kind: 'vote', submissionId: jokes[2] });
    await hostCommand(f, 'stage.close', { stageRunId: ballot });
    await hostCommand(f, 'stage.reveal', { stageRunId: ballot });
    expect(await totals(f)).toEqual(['10000', '10000', '0', '0', '0']);
  });

  it('let the host give a challenge place even above the challenge maximum, but never above 1st place', async () => {
    const challenge = parseDefinition({ formatVersion: 1, title: 'Dare', startNodeKey: 'c', edges: [], nodes: [{ key: 'c', stages: [{ key: 'main', kind: 'challenge', prompt: 'Sing!', durationMs: null, maxAwardMilli: '0', places }] }] });
    const f = await fixture(2, challenge); const stage = (await hostCommand(f, 'session.start')).stageRunId!;
    await hostCommand(f, 'stage.close', { stageRunId: stage });
    await expect(hostCommand(f, 'stage.judge', { stageRunId: stage, playerId: f.players[0]!.id, amountMilli: '10001' })).rejects.toThrow('INVALID_SUBMISSION');
    await hostCommand(f, 'stage.judge', { stageRunId: stage, playerId: f.players[0]!.id, amountMilli: '10000' });
    await hostCommand(f, 'stage.judge', { stageRunId: stage, playerId: f.players[1]!.id, amountMilli: '5000' });
    expect(await totals(f)).toEqual(['10000', '5000']);
  });
});
