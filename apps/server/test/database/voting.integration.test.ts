import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { parseDefinition } from '../../src/game/definition.js';
import { readSessionView } from '../../src/game/views.js';
import { db, fixture, hostCommand, prisma, service } from './game-fixture.js';

afterAll(async () => { await db.close(); });
const game = parseDefinition({
  formatVersion: 1, title: 'Jokes', startNodeKey: 'write',
  nodes: [
    { key: 'write', stages: [{ key: 'joke', kind: 'collect', prompt: 'Write a joke', durationMs: null, input: { kind: 'text', maxLength: 200 }, scoring: { kind: 'none' } }] },
    { key: 'vote', stages: [{ key: 'pick', kind: 'vote', prompt: 'Vote for the best joke', durationMs: null, source: { nodeKey: 'write', stageKey: 'joke' }, awardPerVoteMilli: '5000' }] },
  ],
  edges: [{ key: 'write-to-vote', from: 'write', to: 'vote' }],
});
type World = Awaited<ReturnType<typeof fixture>>;
const actor = (f: World, index: number) => ({ role: 'player' as const, playerId: f.players[index]!.id });
const view = (f: World, index: number) => readSessionView(prisma, actor(f, index), f.sessionId);
const submit = (f: World, index: number, stageRunId: string, value: object) => service.execute(actor(f, index), { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type: 'submission.submit', stageRunId, value });

async function toVote(players = 3) {
  const f = await fixture(players, game);
  const write = (await hostCommand(f, 'session.start')).stageRunId!;
  const jokes = ['Why did the chicken join a band? It had drumsticks.', 'I told a chemistry joke. No reaction.'];
  const ids = [];
  for (const [index, text] of jokes.entries()) ids.push((await submit(f, index, write, { kind: 'text', text })).submissionId!);
  await hostCommand(f, 'stage.close', { stageRunId: write });
  return { f, write, ids, jokes };
}

describe('voting on answers from an earlier round', () => {
  it('refuses definitions whose vote has no earlier unscored text or upload round', () => {
    const broken = (source: object, first: object = game.nodes[0]!.stages[0]!) => ({ ...game, nodes: [{ key: 'write', stages: [first] }, { key: 'vote', stages: [{ ...game.nodes[1]!.stages[0]!, source }] }] });
    expect(() => parseDefinition(broken({ nodeKey: 'write', stageKey: 'missing' }))).toThrow('INVALID_DEFINITION');
    expect(() => parseDefinition(broken({ nodeKey: 'vote', stageKey: 'pick' }))).toThrow('INVALID_DEFINITION');
    expect(() => parseDefinition(broken({ nodeKey: 'write', stageKey: 'joke' }, { key: 'joke', kind: 'collect', prompt: 'Q', durationMs: null, input: { kind: 'choice', options: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }] }, scoring: { kind: 'none' } }))).toThrow('INVALID_DEFINITION');
  });

  it('keeps the voted-on answers nameless until the vote is revealed', async () => {
    const { f, write } = await toVote();
    await expect(hostCommand(f, 'stage.reveal', { stageRunId: write })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect((await view(f, 2)).stage).toMatchObject({ revealAfterVote: true, revealed: false });
    const vote = (await hostCommand(f, 'stage.advance', { stageRunId: write })).stageRunId!;
    expect((await prisma.stageRun.findUniqueOrThrow({ where: { id: write } })).revealedAt).toBeNull();
    const ballots = await Promise.all([0, 1, 2].map(index => view(f, index)));
    for (const ballot of ballots) {
      expect(ballot.stage!.ballot).toHaveLength(2);
      const text = JSON.stringify(ballot.stage!.ballot);
      for (const player of f.players) expect(text).not.toContain(player.id);
    }
    expect(ballots[0]!.stage!.ballot!.filter(entry => entry.own)).toHaveLength(1);
    expect(ballots[2]!.stage!.ballot!.filter(entry => entry.own)).toHaveLength(0);
    // The host and display see the ballot too, but nobody is marked as its author.
    const host = await readSessionView(prisma, f.host, f.sessionId);
    expect(host.stage!.ballot!.every(entry => !entry.own)).toBe(true);
    expect(host.stage!.reveal).toBeNull();
    await hostCommand(f, 'stage.close', { stageRunId: vote });
    await hostCommand(f, 'stage.reveal', { stageRunId: vote });
    expect((await prisma.stageRun.findUniqueOrThrow({ where: { id: write } })).revealedAt).not.toBeNull();
  });

  it('accepts one vote per player for someone else, and gives each author points per vote', async () => {
    const { f, write, ids } = await toVote(4);
    const vote = (await hostCommand(f, 'stage.advance', { stageRunId: write })).stageRunId!;
    await expect(submit(f, 0, vote, { kind: 'vote', submissionId: ids[0] })).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    await expect(submit(f, 2, vote, { kind: 'vote', submissionId: randomUUID() })).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    await expect(submit(f, 2, vote, { kind: 'text', text: 'not a vote' })).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    await expect(submit(f, 2, write, { kind: 'vote', submissionId: ids[0] })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await submit(f, 0, vote, { kind: 'vote', submissionId: ids[1] });
    await submit(f, 2, vote, { kind: 'vote', submissionId: ids[1] });
    await submit(f, 3, vote, { kind: 'vote', submissionId: ids[0] });
    await expect(submit(f, 3, vote, { kind: 'vote', submissionId: ids[1] })).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
    // Authors without a vote of their own still get votes; their own vote stays private.
    const during = await view(f, 1);
    expect(during.stage).toMatchObject({ submittedCount: 3, eligibleCount: 4, reveal: null });
    expect(during.standings).toEqual([]);

    await hostCommand(f, 'stage.close', { stageRunId: vote });
    await hostCommand(f, 'stage.reveal', { stageRunId: vote });
    const after = await view(f, 3);
    expect(after.stage!.reveal!.answer).toEqual({ kind: 'vote', entries: [
      { submissionId: ids[1], playerId: f.players[1]!.id, teamId: null, votes: 2 },
      { submissionId: ids[0], playerId: f.players[0]!.id, teamId: null, votes: 1 },
    ] });
    expect(new Map(after.standings.map(row => [row.playerId, row.amountMilli]))).toEqual(new Map([[f.players[1]!.id, '10000'], [f.players[0]!.id, '5000']]));
    expect(await prisma.scoreEntry.count({ where: { sessionId: f.sessionId } })).toBe(3);
  });
});
