import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { parseDefinition } from '../../../src/game/definition.js';
import { readSessionView } from '../../../src/game/views.js';
import { db, fixture, hostCommand, prisma, service } from '../game-fixture.js';

// Duels, through the real command service: who may bet, what is paid, and duels played as a game.
afterAll(async () => { await db.close(); });
type World = Awaited<ReturnType<typeof fixture>>;
const actor = (f: World, index: number) => ({ role: 'player' as const, playerId: f.players[index]!.id });
const player = (f: World, index: number, type: string, extra: object) => service.execute(actor(f, index), { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type, ...extra });
const bet = (f: World, index: number, stageRunId: string, on: number) => player(f, index, 'submission.submit', { stageRunId, value: { kind: 'bet', playerId: f.players[on]!.id } });
const totals = async (f: World) => {
  const rows = await prisma.scoreEntry.groupBy({ by: ['recipientPlayerId'], where: { sessionId: f.sessionId }, _sum: { amountMilli: true } });
  return f.players.map(entry => (rows.find(row => row.recipientPlayerId === entry.id)?._sum.amountMilli ?? 0n).toString());
};
const duelGame = (stage: object) => parseDefinition({ formatVersion: 2, title: 'Duel', startNodeKey: 'duel', edges: [], nodes: [{ key: 'duel', stages: [{ key: 'main', kind: 'duel', prompt: 'Rock paper scissors at the table!', durationMs: null, betMilli: '1000', ...stage }] }] });

describe('a duel the host decides', () => {
  it('waits for the host’s pair, lets only the others bet once on a duelist, and pays the winner, the loser’s place and right bets once', async () => {
    const f = await fixture(5, duelGame({ pick: 'host', places: { kind: 'list', pointsMilli: ['10000', '2000'] } }));
    const stage = (await hostCommand(f, 'session.start')).stageRunId!;
    expect((await prisma.stageRun.findUniqueOrThrow({ where: { id: stage } })).deadlineAt).toBeNull();
    await expect(bet(f, 2, stage, 0)).rejects.toThrow();
    await hostCommand(f, 'duel.pick', { stageRunId: stage, playerIds: [f.players[0]!.id, f.players[1]!.id] });
    await expect(bet(f, 0, stage, 0)).rejects.toThrow('INELIGIBLE');
    await expect(bet(f, 2, stage, 3)).rejects.toThrow('INVALID_SUBMISSION');
    await bet(f, 2, stage, 0); await bet(f, 3, stage, 1); await bet(f, 4, stage, 0);
    await expect(bet(f, 2, stage, 1)).rejects.toThrow('ALREADY_SUBMITTED');
    // Bets are in: the pair can no longer change.
    await expect(hostCommand(f, 'duel.pick', { stageRunId: stage, playerIds: [f.players[2]!.id, f.players[3]!.id] })).rejects.toThrow('ALREADY_SUBMITTED');
    // Nothing shown before the winner is named.
    await expect(hostCommand(f, 'stage.reveal', { stageRunId: stage })).rejects.toThrow();
    await hostCommand(f, 'duel.decide', { stageRunId: stage, winnerId: f.players[0]!.id });
    expect(await totals(f)).toEqual(['10000', '2000', '1000', '0', '1000']);
    const view = await readSessionView(prisma, actor(f, 3), f.sessionId);
    expect(view.stage).toMatchObject({ status: 'CLOSED', revealed: true, duel: { winnerId: f.players[0]!.id, bets: [{ count: 2 }, { count: 1 }] } });
    await expect(hostCommand(f, 'duel.decide', { stageRunId: stage, winnerId: f.players[1]!.id })).rejects.toThrow('ALREADY_DECIDED');
    expect(await totals(f)).toEqual(['10000', '2000', '1000', '0', '1000']);
  });

  it('picks a random pair when the scene says so; the others bet', async () => {
    const f = await fixture(4, duelGame({ pick: 'random' }));
    const stage = (await hostCommand(f, 'session.start')).stageRunId!;
    const view = await readSessionView(prisma, f.host, f.sessionId);
    const pair = view.stage!.duel!.duelistIds!;
    expect(new Set(pair).size).toBe(2); expect(view.stage!.eligibleCount).toBe(2);
    await expect(hostCommand(f, 'duel.decide', { stageRunId: stage, winnerId: f.players.find(entry => !pair.includes(entry.id))!.id })).rejects.toThrow('INVALID_COMMAND');
  });
});

describe('a duel played as a game', () => {
  it('lets the duelists play only after betting closes, and pays out as soon as the game is won', async () => {
    const f = await fixture(3, duelGame({ pick: 'host', contest: { kind: 'game', game: 'tictactoe' } }));
    const stage = (await hostCommand(f, 'session.start')).stageRunId!;
    await hostCommand(f, 'duel.pick', { stageRunId: stage, playerIds: [f.players[0]!.id, f.players[1]!.id] });
    await bet(f, 2, stage, 0);
    const move = (index: number, cell: number) => player(f, index, 'duel.move', { stageRunId: stage, move: { game: 'tictactoe', cell } });
    await expect(move(0, 4)).rejects.toThrow('INVALID_STATE');
    await hostCommand(f, 'stage.close', { stageRunId: stage });
    await expect(move(1, 4)).rejects.toThrow('INVALID_SUBMISSION');
    await expect(move(2, 4)).rejects.toThrow('INELIGIBLE');
    for (const [index, cell] of [[0, 0], [1, 3], [0, 1], [1, 4]] as const) await move(index, cell);
    expect(await totals(f)).toEqual(['0', '0', '0']);
    await move(0, 2);
    expect(await totals(f)).toEqual(['10000', '0', '1000']);
    expect((await readSessionView(prisma, actor(f, 2), f.sessionId)).stage).toMatchObject({ revealed: true, duel: { winnerId: f.players[0]!.id, contest: { kind: 'game', view: { outcome: { kind: 'win', seat: 0 } } } } });
    await expect(move(1, 5)).rejects.toThrow('INVALID_STATE');
  });

  it('keeps a hidden pick hidden from the other duelist, and lets a duelist resign', async () => {
    const f = await fixture(2, duelGame({ pick: 'host', contest: { kind: 'game', game: 'rps', settings: { firstTo: 1 } } }));
    const stage = (await hostCommand(f, 'session.start')).stageRunId!;
    await hostCommand(f, 'duel.pick', { stageRunId: stage, playerIds: [f.players[0]!.id, f.players[1]!.id] });
    await hostCommand(f, 'stage.close', { stageRunId: stage });
    await player(f, 0, 'duel.move', { stageRunId: stage, move: { game: 'rps', pick: 'scissors' } });
    expect(JSON.stringify((await readSessionView(prisma, actor(f, 1), f.sessionId)).stage!.duel)).not.toContain('scissors');
    expect(JSON.stringify((await readSessionView(prisma, f.host, f.sessionId)).stage!.duel)).not.toContain('scissors');
    await player(f, 1, 'duel.resign', { stageRunId: stage });
    expect(await totals(f)).toEqual(['10000', '0']);
  });

  it('refuses a duel whose game settings do not fit', () => {
    expect(() => duelGame({ pick: 'host', contest: { kind: 'game', game: 'rps', settings: { firstTo: 99 } } })).toThrow('INVALID_DEFINITION');
  });
});
