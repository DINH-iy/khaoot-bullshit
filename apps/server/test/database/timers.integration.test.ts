import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { parseDefinition } from '../../src/game/definition.js';
import { createGameService } from '../../src/game/service.js';
import { ACCEPTANCE_GRACE_MS, SETTLE_MS, closeExpiredStages } from '../../src/game/timing.js';
import { readSessionView } from '../../src/game/views.js';
import { answer, db, fixture, prisma } from './game-fixture.js';

const DURATION = 20_000;
const timed = parseDefinition({
  formatVersion: 1, title: 'Timed', startNodeKey: 'quiz',
  nodes: [
    { key: 'quiz', stages: [{ key: 'answer', kind: 'collect', prompt: 'Capital?', durationMs: DURATION,
      input: { kind: 'choice', options: [{ key: 'sydney', label: 'Sydney' }, { key: 'canberra', label: 'Canberra' }] },
      scoring: { kind: 'correct-choice', correctChoiceKey: 'canberra', awardMilli: '10000' } }] },
    { key: 'challenge', stages: [{ key: 'perform', kind: 'challenge', prompt: 'Perform', durationMs: null, maxAwardMilli: '5000' }] },
  ],
  edges: [{ key: 'quiz-to-challenge', from: 'quiz', to: 'challenge' }],
});
// A controlled server clock: deadline rules are exercised at exact milliseconds.
async function world(players = 2) {
  let now = Date.now();
  const clock = () => new Date(now);
  const service = createGameService(prisma, undefined, clock);
  const f = await fixture(players, timed);
  const host = async (type: string, extra: Record<string, unknown> = {}) => {
    const session = await prisma.gameSession.findUniqueOrThrow({ where: { id: f.sessionId } });
    return service.execute(f.host, { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, expectedRevision: session.revision, type, ...extra });
  };
  const player = (index: number) => ({ role: 'player' as const, playerId: f.players[index]!.id });
  const stageRunId = (await host('session.start')).stageRunId!;
  const stage = () => prisma.stageRun.findUniqueOrThrow({ where: { id: stageRunId } });
  const timer = (change: Record<string, unknown>) => host('stage.timer', { stageRunId, change });
  return { f, service, clock, host, player, stageRunId, stage, timer, start: now, advance: (ms: number) => { now += ms; }, at: () => now,
    submit: (index: number, choice = 'canberra') => service.execute(player(index), answer(f.sessionId, stageRunId, choice)),
    sweep: () => closeExpiredStages(prisma, service, clock) };
}
afterAll(async () => { await db.close(); });

describe('timed stages', () => {
  it('accepts answers through the grace period by server receipt time, then closes after the settle delay', async () => {
    const w = await world();
    expect((await w.stage()).deadlineAt?.getTime()).toBe(w.start + DURATION);
    const view = await readSessionView(prisma, w.player(0), w.f.sessionId, w.clock);
    expect(view.stage).toMatchObject({ deadlineAt: new Date(w.start + DURATION).toISOString(), pausedRemainingMs: null });
    expect(view.serverTime).toBe(new Date(w.start).toISOString());

    w.advance(DURATION + ACCEPTANCE_GRACE_MS);
    await expect(w.submit(0)).resolves.toMatchObject({ type: 'submission.submit' });
    w.advance(1);
    await expect(w.submit(1)).rejects.toMatchObject({ code: 'TOO_LATE' });
    expect(await prisma.submission.count({ where: { stageRunId: w.stageRunId } })).toBe(1);

    // Nobody, including the automatic closer, can end the stage before it is due.
    const timeout = { formatVersion: 1, commandId: randomUUID(), sessionId: w.f.sessionId, type: 'stage.timeout', stageRunId: w.stageRunId };
    await expect(w.service.execute(w.f.host, timeout)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(w.service.execute(w.player(1), { ...timeout, commandId: randomUUID() })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await w.sweep();
    expect((await w.stage()).status).toBe('ACTIVE');
    // Results stay hidden until acceptance has really ended.
    expect((await readSessionView(prisma, w.player(1), w.f.sessionId, w.clock)).standings).toEqual([]);

    w.advance(SETTLE_MS - 1);
    await w.sweep();
    expect(await w.stage()).toMatchObject({ status: 'CLOSED', deadlineAt: null, closedAt: new Date(w.at()) });
    await w.sweep();
    expect(await prisma.auditEvent.count({ where: { sessionId: w.f.sessionId, kind: 'stage.timeout' } })).toBe(1);
    await w.host('stage.reveal', { stageRunId: w.stageRunId });
    expect((await readSessionView(prisma, w.player(1), w.f.sessionId, w.clock)).standings).toEqual([{ playerId: w.f.players[0]!.id, amountMilli: '10000' }]);
    expect(await prisma.scoreEntry.count({ where: { sessionId: w.f.sessionId } })).toBe(1);
  });

  it('keeps the host in control: pause freezes the clock and time can be added, replaced or removed', async () => {
    const w = await world();
    w.advance(5000);
    await w.host('session.pause');
    expect(await w.stage()).toMatchObject({ deadlineAt: null, pausedRemainingMs: 15_000 });
    w.advance(10 * 60_000);
    await w.sweep();
    expect((await w.stage()).status).toBe('ACTIVE');
    await w.timer({ kind: 'add', ms: 30_000 });
    expect((await w.stage()).pausedRemainingMs).toBe(45_000);
    expect((await readSessionView(prisma, w.player(0), w.f.sessionId, w.clock)).stage).toMatchObject({ deadlineAt: null, pausedRemainingMs: 45_000 });
    await w.host('session.resume');
    expect(await w.stage()).toMatchObject({ deadlineAt: new Date(w.at() + 45_000), pausedRemainingMs: null });

    await w.timer({ kind: 'set', ms: 10_000 });
    expect((await w.stage()).deadlineAt?.getTime()).toBe(w.at() + 10_000);
    await w.timer({ kind: 'clear' });
    expect(await w.stage()).toMatchObject({ deadlineAt: null, pausedRemainingMs: null });
    w.advance(3_600_000);
    await w.sweep();
    expect((await w.stage()).status).toBe('ACTIVE');
    await expect(w.timer({ kind: 'add', ms: 30_000 })).rejects.toMatchObject({ code: 'INVALID_STATE' });

    // Players cannot touch the clock, and a stale host screen cannot overwrite a newer change.
    const session = await prisma.gameSession.findUniqueOrThrow({ where: { id: w.f.sessionId } });
    const change = { formatVersion: 1, sessionId: w.f.sessionId, type: 'stage.timer', stageRunId: w.stageRunId, change: { kind: 'set', ms: 1000 } };
    await expect(w.service.execute(w.player(0), { ...change, commandId: randomUUID(), expectedRevision: session.revision })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(w.service.execute(w.f.host, { ...change, commandId: randomUUID(), expectedRevision: session.revision - 1 })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect((await w.stage()).deadlineAt).toBeNull();
  });

  it('lets a host extension win over a due automatic close and rescue a clock that ran out during an outage', async () => {
    const w = await world();
    w.advance(DURATION + ACCEPTANCE_GRACE_MS + SETTLE_MS + 5000);
    await expect(w.submit(0)).rejects.toMatchObject({ code: 'TOO_LATE' });
    await w.timer({ kind: 'add', ms: 30_000 });
    await w.sweep();
    expect(await w.stage()).toMatchObject({ status: 'ACTIVE', deadlineAt: new Date(w.at() + 30_000) });
    await expect(w.submit(0)).resolves.toMatchObject({ type: 'submission.submit' });

    // Restart recovery pauses the room; whatever time was lost, the host can restore it.
    w.advance(120_000);
    await w.host('session.pause');
    expect((await w.stage()).pausedRemainingMs).toBe(0);
    await w.timer({ kind: 'set', ms: 15_000 });
    await w.host('session.resume');
    await expect(w.submit(1, 'sydney')).resolves.toMatchObject({ type: 'submission.submit' });
    expect(await prisma.scoreEntry.count({ where: { sessionId: w.f.sessionId } })).toBe(1);
  });

  it('reopens a closed stage without duplicate answers or scores, but never a judged one', async () => {
    const w = await world();
    await w.submit(0);
    await w.host('stage.close', { stageRunId: w.stageRunId });
    await w.host('stage.reopen', { stageRunId: w.stageRunId, durationMs: 30_000 });
    expect(await w.stage()).toMatchObject({ status: 'ACTIVE', closedAt: null, deadlineAt: new Date(w.at() + 30_000) });
    expect((await readSessionView(prisma, w.player(1), w.f.sessionId, w.clock)).standings).toEqual([]);
    await expect(w.submit(0)).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
    await w.submit(1);
    w.advance(30_000 + ACCEPTANCE_GRACE_MS + SETTLE_MS);
    await w.sweep();
    expect((await w.stage()).status).toBe('CLOSED');
    expect(await prisma.scoreEntry.count({ where: { sessionId: w.f.sessionId } })).toBe(2);
    // Once the answer has been shown, reopening would let people answer knowing it.
    await w.host('stage.reveal', { stageRunId: w.stageRunId });
    await expect(w.host('stage.reopen', { stageRunId: w.stageRunId, durationMs: null })).rejects.toMatchObject({ code: 'INVALID_STATE' });

    const challenge = (await w.host('stage.advance', { stageRunId: w.stageRunId })).stageRunId!;
    expect((await prisma.stageRun.findUniqueOrThrow({ where: { id: challenge } })).deadlineAt).toBeNull();
    await expect(w.host('stage.reopen', { stageRunId: w.stageRunId, durationMs: null })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await w.host('stage.close', { stageRunId: challenge });
    await w.host('stage.judge', { stageRunId: challenge, playerId: w.f.players[0]!.id, amountMilli: '5000' });
    await expect(w.host('stage.reopen', { stageRunId: challenge, durationMs: null })).rejects.toMatchObject({ code: 'ALREADY_JUDGED' });
    expect((await prisma.stageRun.findUniqueOrThrow({ where: { id: challenge } })).status).toBe('CLOSED');
  });

  it('scores an ordering round only for the exact order and never sends the authored order to a phone', async () => {
    const keys = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'];
    const definition = parseDefinition({ formatVersion: 1, title: 'Order', startNodeKey: 'n', edges: [], nodes: [{ key: 'n', stages: [{ key: 's', kind: 'collect', prompt: 'Sort', durationMs: null,
      input: { kind: 'order', items: keys.map(key => ({ key, label: key.toUpperCase() })) }, scoring: { kind: 'correct-order', correctOrder: keys, awardMilli: '20000' } }] }] });
    const f = await fixture(8, definition); const service = createGameService(prisma);
    const session = await prisma.gameSession.findUniqueOrThrow({ where: { id: f.sessionId } });
    const stageRunId = (await service.execute(f.host, { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, expectedRevision: session.revision, type: 'session.start' })).stageRunId!;
    const player = (index: number) => ({ role: 'player' as const, playerId: f.players[index]!.id });
    const submit = (index: number, order: string[]) => service.execute(player(index), { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type: 'submission.submit', stageRunId, value: { kind: 'order', keys: order } });

    const shown = await Promise.all(f.players.map(async (_, index) => { const input = (await readSessionView(prisma, player(index), f.sessionId)).stage!.input!; return input.kind === 'order' ? input.items.map(item => item.key) : []; }));
    for (const order of shown) expect([...order].sort()).toEqual(keys);
    // Eight players do not all receive the answer order (chance of a false failure is below 1e-22).
    expect(shown.some(order => order.join() !== keys.join())).toBe(true);
    expect(new Set(shown.map(order => order.join())).size).toBeGreaterThan(1);
    const again = (await readSessionView(prisma, player(0), f.sessionId)).stage!.input!;
    expect(again.kind === 'order' && again.items.map(item => item.key)).toEqual(shown[0]);
    expect(JSON.stringify(await readSessionView(prisma, player(0), f.sessionId))).not.toContain('correctOrder');

    for (const invalid of [keys.slice(1), [...keys.slice(1), 'k2'], [...keys.slice(1), 'zz'], [...keys, 'k1']]) await expect(submit(0, invalid)).rejects.toMatchObject({ code: expect.stringMatching(/INVALID_(SUBMISSION|COMMAND)/) });
    await expect(service.execute(player(0), { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type: 'submission.submit', stageRunId, value: { kind: 'choice', choiceKey: 'k1' } })).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    await submit(0, keys);
    await submit(1, [...keys].reverse());
    await submit(2, ['k2', 'k1', ...keys.slice(2)]);
    await expect(submit(0, keys)).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
    const scores = await prisma.scoreEntry.findMany({ where: { sessionId: f.sessionId } });
    expect(scores.map(score => [score.recipientPlayerId, score.amountMilli, score.reason])).toEqual([[f.players[0]!.id, 20000n, 'Correct order']]);
  });
});
