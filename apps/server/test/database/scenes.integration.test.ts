import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { parseDefinition } from '../../src/game/definition.js';
import { createGameService } from '../../src/game/service.js';
import { ACCEPTANCE_GRACE_MS, closeExpiredStages, SETTLE_MS } from '../../src/game/timing.js';
import { readSessionView } from '../../src/game/views.js';
import { db, fixture, hostCommand, prisma, service } from './game-fixture.js';

afterAll(async () => { await db.close(); });
const game = parseDefinition({
  formatVersion: 1, title: 'Show', startNodeKey: 'intro',
  nodes: [
    { key: 'intro', stages: [{ key: 'cutscene', kind: 'info', title: 'FRIDAY NIGHT.', prompt: 'Welcome to the show', durationMs: 30_000 }] },
    { key: 'quiz', stages: [{ key: 'q', kind: 'collect', prompt: 'Capital?', durationMs: null, input: { kind: 'choice', options: [{ key: 'canberra', label: 'Canberra' }, { key: 'sydney', label: 'Sydney' }] }, scoring: { kind: 'correct-choice', correctChoiceKey: 'canberra', awardMilli: '10000' } }] },
    { key: 'board', stages: [{ key: 'scores', kind: 'scoreboard', prompt: 'Standings after round one', show: 'players', durationMs: null }] },
  ],
  edges: [{ key: 'a', from: 'intro', to: 'quiz' }, { key: 'b', from: 'quiz', to: 'board' }],
});

describe('show-only scenes', () => {
  it('shows an info scene to everyone, takes no answers, and lets the host move straight on', async () => {
    const f = await fixture(2, game);
    const intro = (await hostCommand(f, 'session.start')).stageRunId!;
    const phone = await readSessionView(prisma, { role: 'player', playerId: f.players[0]!.id }, f.sessionId);
    expect(phone.stage).toMatchObject({ kind: 'info', prompt: 'Welcome to the show', info: { title: 'FRIDAY NIGHT.' }, scoreboard: null, input: null, eligibleCount: 0, deadlineAt: expect.any(String) });
    await expect(service.execute({ role: 'player', playerId: f.players[0]!.id }, { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type: 'submission.submit', stageRunId: intro, value: { kind: 'text', text: 'hi' } })).rejects.toMatchObject({ code: 'INELIGIBLE' });
    // No close needed: Next ends the scene and opens the next one.
    const quiz = (await hostCommand(f, 'stage.advance', { stageRunId: intro })).stageRunId!;
    expect(await prisma.stageRun.findUniqueOrThrow({ where: { id: intro } })).toMatchObject({ status: 'CLOSED', revealedAt: expect.any(Date), deadlineAt: null });
    await service.execute({ role: 'player', playerId: f.players[0]!.id }, { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type: 'submission.submit', stageRunId: quiz, value: { kind: 'choice', choiceKey: 'canberra' } });
    await hostCommand(f, 'stage.close', { stageRunId: quiz });
    const board = (await hostCommand(f, 'stage.advance', { stageRunId: quiz })).stageRunId!;
    const standings = await readSessionView(prisma, { role: 'player', playerId: f.players[1]!.id }, f.sessionId);
    expect(standings.stage).toMatchObject({ kind: 'scoreboard', scoreboard: { show: 'players' }, info: null });
    // Moving on revealed the quiz, so its points are on the scoreboard.
    expect(standings.standings).toEqual([{ playerId: f.players[0]!.id, amountMilli: '10000' }]);
    await hostCommand(f, 'stage.advance', { stageRunId: board });
    expect((await prisma.gameSession.findUniqueOrThrow({ where: { id: f.sessionId } })).status).toBe('FINISHED');
  });

  it('lets the countdown end an info scene without moving on by itself', async () => {
    let now = Date.now(); const clock = () => new Date(now); const timed = createGameService(prisma, undefined, clock);
    const f = await fixture(1, game);
    const intro = (await hostCommand(f, 'session.start')).stageRunId!;
    now = Date.now() + 30_000 + ACCEPTANCE_GRACE_MS + SETTLE_MS + 1000;
    await closeExpiredStages(prisma, timed, clock);
    expect((await prisma.stageRun.findUniqueOrThrow({ where: { id: intro } })).status).toBe('CLOSED');
    expect(await prisma.stageRun.count({ where: { sessionId: f.sessionId } })).toBe(1);
    // The host's Next uses the real clock, which is now behind the close time: like a server clock stepping back.
    await hostCommand(f, 'stage.advance', { stageRunId: intro });
    expect(await prisma.stageRun.count({ where: { sessionId: f.sessionId } })).toBe(2);
    const revealed = await prisma.stageRun.findUniqueOrThrow({ where: { id: intro } });
    expect(revealed.revealedAt!.getTime()).toBeGreaterThanOrEqual(revealed.closedAt!.getTime());
  });
});
