import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { readSessionView } from '../../src/game/views.js';
import { answer, db, fixture, hostCommand, prisma, service, start } from './game-fixture.js';

afterAll(async () => { await db.close(); });
const player = (f: Awaited<ReturnType<typeof fixture>>, index: number) => ({ role: 'player' as const, playerId: f.players[index]!.id });
const view = (f: Awaited<ReturnType<typeof fixture>>, index: number) => readSessionView(prisma, player(f, index), f.sessionId);

describe('reveal, results and score corrections', () => {
  it('keeps the answer, the tally and new scores private until the host reveals the closed stage', async () => {
    const f = await fixture(3); const stageRunId = await start(f);
    await service.execute(player(f, 0), answer(f.sessionId, stageRunId, 'canberra'));
    await service.execute(player(f, 1), answer(f.sessionId, stageRunId, 'sydney'));
    expect((await view(f, 2)).stage).toMatchObject({ submittedCount: 2, eligibleCount: 3, revealed: false, reveal: null });
    await expect(hostCommand(f, 'stage.reveal', { stageRunId })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await hostCommand(f, 'stage.close', { stageRunId });
    for (const index of [0, 1, 2]) { const hidden = await view(f, index); expect(hidden.stage!.reveal).toBeNull(); expect(hidden.standings).toEqual([]); expect(JSON.stringify(hidden)).not.toContain('correctChoiceKey'); }
    const session = await prisma.gameSession.findUniqueOrThrow({ where: { id: f.sessionId } });
    await expect(service.execute(player(f, 0), { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, expectedRevision: session.revision, type: 'stage.reveal', stageRunId })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await hostCommand(f, 'stage.reveal', { stageRunId });
    const shown = await view(f, 2);
    expect(shown.stage).toMatchObject({ revealed: true, reveal: {
      answer: { kind: 'choice', correctChoiceKey: 'canberra', counts: [{ choiceKey: 'sydney', count: 1 }, { choiceKey: 'canberra', count: 1 }] },
      awards: [{ playerId: f.players[0]!.id, amountMilli: '10000' }] } });
    expect(shown.standings).toEqual([{ playerId: f.players[0]!.id, amountMilli: '10000' }]);
    // Other players' individual answers are still never sent.
    expect(shown.ownSubmission).toBeNull();
    await expect(hostCommand(f, 'stage.reveal', { stageRunId })).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('reveals automatically when the host moves on, and shows who has been judged in a challenge', async () => {
    const f = await fixture(2); const stageRunId = await start(f);
    await service.execute(player(f, 0), answer(f.sessionId, stageRunId));
    await hostCommand(f, 'stage.close', { stageRunId });
    const challenge = (await hostCommand(f, 'stage.advance', { stageRunId })).stageRunId!;
    expect((await prisma.stageRun.findUniqueOrThrow({ where: { id: stageRunId } })).revealedAt).not.toBeNull();
    expect((await view(f, 1)).standings).toEqual([{ playerId: f.players[0]!.id, amountMilli: '10000' }]);
    await hostCommand(f, 'stage.close', { stageRunId: challenge });
    await hostCommand(f, 'stage.judge', { stageRunId: challenge, playerId: f.players[1]!.id, amountMilli: '30000' });
    const judging = await view(f, 0);
    expect(judging.stage).toMatchObject({ challenge: { maxAwardMilli: '50000', judgedPlayerIds: [f.players[1]!.id] }, revealed: false });
    expect(judging.standings).toEqual([{ playerId: f.players[0]!.id, amountMilli: '10000' }]);
    await hostCommand(f, 'stage.reveal', { stageRunId: challenge });
    const after = await view(f, 0);
    expect(after.stage!.reveal).toEqual({ answer: null, awards: [{ playerId: f.players[1]!.id, amountMilli: '30000' }], teamAwards: [] });
    expect(new Map(after.standings.map(row => [row.playerId, row.amountMilli]))).toEqual(new Map([[f.players[0]!.id, '10000'], [f.players[1]!.id, '30000']]));
  });

  it('corrects scores with new ledger entries, leaving every earlier award and judgment untouched', async () => {
    const f = await fixture(2);
    const adjust = (index: number, amountMilli: string) => hostCommand(f, 'score.adjust', { playerId: f.players[index]!.id, amountMilli, reason: 'Wrong judgment' });
    await expect(adjust(0, '5000')).rejects.toMatchObject({ code: 'INVALID_STATE' }); // nothing to correct in the lobby
    const stageRunId = await start(f);
    await service.execute(player(f, 0), answer(f.sessionId, stageRunId));
    await hostCommand(f, 'stage.close', { stageRunId });
    await hostCommand(f, 'stage.reveal', { stageRunId });
    const before = await prisma.scoreEntry.findMany({ where: { sessionId: f.sessionId } });

    await adjust(0, '-10000'); await adjust(1, '2500');
    const session = await prisma.gameSession.findUniqueOrThrow({ where: { id: f.sessionId } });
    const forged = { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, expectedRevision: session.revision, type: 'score.adjust', playerId: f.players[1]!.id, amountMilli: '999000', reason: 'Mine' };
    await expect(service.execute(player(f, 1), forged)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(hostCommand(f, 'score.adjust', { playerId: randomUUID(), amountMilli: '1000', reason: 'Nobody' })).rejects.toMatchObject({ code: 'INELIGIBLE' });
    // A retried correction with the same command is applied once.
    const retry = { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, expectedRevision: session.revision, type: 'score.adjust', playerId: f.players[1]!.id, amountMilli: '500', reason: 'Bonus' };
    expect(await service.execute(f.host, retry)).toEqual(await service.execute(f.host, retry));

    const entries = await prisma.scoreEntry.findMany({ where: { sessionId: f.sessionId }, orderBy: { createdAt: 'asc' } });
    expect(entries.filter(entry => entry.kind === 'ADJUSTMENT').map(entry => entry.amountMilli)).toEqual([-10000n, 2500n, 500n]);
    expect(entries.filter(entry => entry.kind === 'AWARD')).toEqual(before);
    expect(new Map((await view(f, 0)).standings.map(row => [row.playerId, row.amountMilli]))).toEqual(new Map([[f.players[0]!.id, '0'], [f.players[1]!.id, '3000']]));
    await expect(prisma.scoreEntry.update({ where: { id: before[0]!.id }, data: { amountMilli: 1n } })).rejects.toThrow();
  });
});
