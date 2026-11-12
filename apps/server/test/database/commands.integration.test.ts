import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { readSessionView } from '../../src/game/views.js';
import { createGameService } from '../../src/game/service.js';
import { parseDefinition } from '../../src/game/definition.js';
import { preparedGame } from '../../src/game/prepared-game.js';
import { answer, db, fixture, hostCommand, prisma, service, start } from './game-fixture.js';

afterAll(async () => { await db.close(); });

describe('durable game commands', () => {
  it('creates once and replays the original receipt after the session advances', async () => {
    const f = await fixture();
    await start(f);
    expect(await service.execute(f.host, f.create)).toEqual(f.receipt);
    expect(await prisma.gameSession.count({ where: { id: f.sessionId } })).toBe(1);
    await expect(service.execute(f.host, { ...f.create, mode: 'LIVE' })).rejects.toMatchObject({ code: 'COMMAND_KEY_REUSED' });
  });
  it('saves an answer, score, command, audit, revision and notifications atomically; retries do not repeat effects', async () => {
    const f = await fixture();
    const stageRunId = await start(f);
    const command = answer(f.sessionId, stageRunId);
    const actor = { role: 'player' as const, playerId: f.players[0]!.id };
    const receipts = await Promise.all([service.execute(actor, command), service.execute(actor, command)]);
    expect(receipts[0]).toEqual(receipts[1]);
    expect(receipts[0]).not.toHaveProperty('amountMilli');
    expect(await prisma.submission.count({ where: { stageRunId } })).toBe(1);
    expect(await prisma.scoreEntry.count({ where: { stageRunId } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { sessionId: f.sessionId, kind: 'submission.submit' } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { sessionId: f.sessionId, revision: receipts[0]!.revision } })).toBe(4);
    expect((await prisma.gameSession.findUniqueOrThrow({ where: { id: f.sessionId } })).revision).toBe(receipts[0]!.revision);
    await expect(service.execute(actor, { ...command, value: { kind: 'choice', choiceKey: 'sydney' } })).rejects.toMatchObject({ code: 'COMMAND_KEY_REUSED' });
    await expect(service.execute(actor, { ...command, commandId: randomUUID() })).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
  });
  it('handles twenty concurrent players without rejecting answers for unrelated revision changes', async () => {
    const f = await fixture(20);
    const stage = await start(f);
    const receipts = await Promise.all(f.players.map(player => service.execute({ role: 'player', playerId: player.id }, answer(f.sessionId, stage))));
    expect(new Set(receipts.map(receipt => receipt.revision)).size).toBe(20);
    expect(await prisma.submission.count({ where: { stageRunId: stage } })).toBe(20);
    expect((await prisma.scoreEntry.aggregate({ where: { sessionId: f.sessionId }, _sum: { amountMilli: true } }))._sum.amountMilli).toBe(200000n);
  });
  it('prevents cross-room actions, host impersonation, stale revisions and invalid inputs', async () => {
    const f = await fixture(); const other = await fixture();
    const stageRunId = await start(f);
    const player = { role: 'player' as const, playerId: f.players[0]!.id };
    await expect(service.execute(other.host, answer(f.sessionId, stageRunId))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(service.execute({ role: 'player', playerId: other.players[0]!.id }, answer(f.sessionId, stageRunId))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(service.execute(player, { formatVersion: 1, type: 'stage.close', commandId: randomUUID(), sessionId: f.sessionId, expectedRevision: 2, stageRunId })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(hostCommand(f, 'stage.close', { stageRunId, expectedRevision: 0 })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    await expect(service.execute(player, answer(f.sessionId, stageRunId, 'missing'))).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    await expect(service.execute(player, { ...answer(f.sessionId, stageRunId), value: { kind: 'text', text: 'wrong input' } })).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    expect(await prisma.submission.count({ where: { stageRunId } })).toBe(0);
  });
  it('excludes late joiners from the locked stage eligibility and admits them at the next stage', async () => {
    const f = await fixture(); const stageRunId = await start(f);
    const late = await prisma.sessionPlayer.create({ data: { sessionId: f.sessionId, displayName: 'Late player' } });
    await expect(service.execute({ role: 'player', playerId: late.id }, answer(f.sessionId, stageRunId))).rejects.toMatchObject({ code: 'INELIGIBLE' });
    await hostCommand(f, 'stage.close', { stageRunId });
    const next = await hostCommand(f, 'stage.advance', { stageRunId });
    const stage = await prisma.stageRun.findUniqueOrThrow({ where: { id: next.stageRunId! } });
    expect(stage.eligibility).toMatchObject({ playerIds: expect.arrayContaining([late.id]) });
  });
  it('hides answer keys, future prompts, other answers and open-stage points from safe views/outbox', async () => {
    const f = await fixture(); const stageRunId = await start(f);
    const actor = { role: 'player' as const, playerId: f.players[0]!.id };
    await service.execute(actor, answer(f.sessionId, stageRunId));
    const own = await readSessionView(prisma, actor, f.sessionId);
    const other = await readSessionView(prisma, { role: 'player', playerId: f.players[1]!.id }, f.sessionId);
    const host = await readSessionView(prisma, f.host, f.sessionId);
    expect(own.ownSubmission?.value).toEqual({ kind: 'choice', choiceKey: 'canberra' });
    expect(other.ownSubmission).toBeNull(); expect(host.ownSubmission).toBeNull(); expect(own.standings).toEqual([]);
    for (const view of [own, other, host]) {
      expect(JSON.stringify(view)).not.toContain('correctChoiceKey');
      expect(JSON.stringify(view)).not.toContain('best excuse');
    }
    const outbox = await prisma.outboxEvent.findMany({ where: { sessionId: f.sessionId } });
    expect(JSON.stringify(outbox)).not.toContain('canberra');
    await hostCommand(f, 'stage.close', { stageRunId });
    expect((await readSessionView(prisma, actor, f.sessionId)).standings).toEqual([{ playerId: actor.playerId, amountMilli: '10000' }]);
  });
  it('records zero/nonzero judgments once and completes a prepared game without duplicate scoring', async () => {
    const f = await fixture(); let stageRunId = await start(f);
    await hostCommand(f, 'stage.close', { stageRunId });
    stageRunId = (await hostCommand(f, 'stage.advance', { stageRunId })).stageRunId!;
    await hostCommand(f, 'stage.close', { stageRunId });
    await hostCommand(f, 'stage.judge', { stageRunId, playerId: f.players[0]!.id, amountMilli: '0' });
    await expect(hostCommand(f, 'stage.judge', { stageRunId, playerId: f.players[0]!.id, amountMilli: '1000' })).rejects.toMatchObject({ code: 'ALREADY_JUDGED' });
    await expect(hostCommand(f, 'stage.judge', { stageRunId, playerId: f.players[1]!.id, amountMilli: '50001' })).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    await hostCommand(f, 'stage.judge', { stageRunId, playerId: f.players[1]!.id, amountMilli: '50000' });
    expect(await prisma.stageJudgment.count({ where: { stageRunId } })).toBe(2);
    const judgment = await prisma.stageJudgment.findFirstOrThrow({ where: { stageRunId } });
    await expect(prisma.stageJudgment.update({ where: { id: judgment.id }, data: { amountMilli: 1n } })).rejects.toThrow();
    expect(await prisma.scoreEntry.count({ where: { stageRunId } })).toBe(1);
    stageRunId = (await hostCommand(f, 'stage.advance', { stageRunId })).stageRunId!;
    const result = await service.execute({ role: 'player', playerId: f.players[0]!.id }, { formatVersion: 1, type: 'submission.submit', commandId: randomUUID(), sessionId: f.sessionId, stageRunId, value: { kind: 'text', text: 'The dog ate my calendar.' } });
    expect(result.submissionId).toBeTruthy();
    await hostCommand(f, 'stage.close', { stageRunId }); await hostCommand(f, 'stage.advance', { stageRunId });
    expect((await readSessionView(prisma, f.host, f.sessionId)).status).toBe('FINISHED');
    await expect(hostCommand(f, 'session.resume')).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
  it('serializes conflicting host actions and supports an explicit paused recovery state', async () => {
    const f = await fixture(); const stageRunId = await start(f);
    const expectedRevision = (await prisma.gameSession.findUniqueOrThrow({ where: { id: f.sessionId } })).revision;
    const base = { formatVersion: 1, sessionId: f.sessionId, expectedRevision };
    const results = await Promise.allSettled([
      service.execute(f.host, { ...base, commandId: randomUUID(), type: 'stage.close', stageRunId }),
      service.execute(f.host, { ...base, commandId: randomUUID(), type: 'session.pause' }),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toMatchObject([{ reason: { code: 'REVISION_CONFLICT' } }]);
    const state = await prisma.gameSession.findUniqueOrThrow({ where: { id: f.sessionId } });
    if (state.status === 'RUNNING') await hostCommand(f, 'session.pause');
    await expect(service.execute({ role: 'player', playerId: f.players[0]!.id }, answer(f.sessionId, stageRunId))).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await hostCommand(f, 'session.resume');
  });
  it('rejects stale stage IDs even when successive stages share the same node', async () => {
    const definition = structuredClone(preparedGame);
    definition.nodes[0]!.stages = [
      { key: 'first', kind: 'challenge', prompt: 'First', durationMs: null, maxAwardMilli: '1000' },
      { key: 'second', kind: 'challenge', prompt: 'Second', durationMs: null, maxAwardMilli: '1000' },
    ];
    const f = await fixture(2, parseDefinition(definition)); const first = await start(f);
    await hostCommand(f, 'stage.close', { stageRunId: first });
    const second = (await hostCommand(f, 'stage.advance', { stageRunId: first })).stageRunId!;
    expect(second).not.toBe(first);
    await expect(hostCommand(f, 'stage.judge', { stageRunId: first, playerId: f.players[0]!.id, amountMilli: '1000' })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(hostCommand(f, 'stage.advance', { stageRunId: first })).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
  it('rolls all effects back when notification persistence fails, then accepts a safe retry', async () => {
    const f = await fixture(); const stageRunId = await start(f);
    const command = answer(f.sessionId, stageRunId);
    const actor = { role: 'player' as const, playerId: f.players[0]!.id };
    const before = await prisma.gameSession.findUniqueOrThrow({ where: { id: f.sessionId } });
    const constraint = `fail_${randomUUID().replaceAll('-', '')}`;
    // Test-only DDL on the dedicated disposable DB; UUIDs generate all SQL text.
    await prisma.$executeRawUnsafe(`ALTER TABLE outbox_events ADD CONSTRAINT "${constraint}" CHECK ("sessionId" <> '${f.sessionId}'::uuid) NOT VALID`);
    try { await expect(service.execute(actor, command)).rejects.toMatchObject({ code: 'GAME_UNAVAILABLE' }); }
    finally { await prisma.$executeRawUnsafe(`ALTER TABLE outbox_events DROP CONSTRAINT "${constraint}"`); }
    expect(await prisma.submission.count({ where: { stageRunId } })).toBe(0);
    expect(await prisma.scoreEntry.count({ where: { stageRunId } })).toBe(0);
    expect(await prisma.gameCommand.count({ where: { sessionId: f.sessionId, commandKey: command.commandId } })).toBe(0);
    expect((await prisma.gameSession.findUniqueOrThrow({ where: { id: f.sessionId } })).revision).toBe(before.revision);
    await expect(service.execute(actor, command)).resolves.toHaveProperty('submissionId');
  });
  it('reports sanitized durations and isolates a failing telemetry observer', async () => {
    const f = await fixture(); const stageRunId = await start(f);
    const observations: unknown[] = [];
    const monitored = createGameService(prisma, event => { observations.push(event); throw new Error('Telemetry down'); });
    const actor = { role: 'player' as const, playerId: f.players[0]!.id }; const command = answer(f.sessionId, stageRunId);
    await monitored.execute(actor, command); await monitored.execute(actor, command);
    expect(observations).toMatchObject([{ outcome: 'COMMITTED', durationMs: expect.any(Number) }, { outcome: 'REPLAYED', durationMs: expect.any(Number) }]);
    expect(JSON.stringify(observations)).not.toContain('canberra');
  });
});
