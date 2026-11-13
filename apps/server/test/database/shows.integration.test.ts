import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { parseDefinition } from '../../src/game/definition.js';
import { readSessionView } from '../../src/game/views.js';
import { createBreaks } from '../../src/rooms/breaks.js';
import { readRoomState } from '../../src/rooms/reclaim.js';
import type { Principal } from '../../src/rooms/gateway.js';
import { answer, db, fixture, hostCommand, prisma, service } from './game-fixture.js';

afterAll(async () => { await db.close(); });
const quiz = (key: string, extra: Record<string, unknown> = {}) => ({ key, stages: [{ key: 'q', kind: 'collect', prompt: 'Capital?', durationMs: 60_000, input: { kind: 'choice', options: [{ key: 'canberra', label: 'Canberra' }, { key: 'sydney', label: 'Sydney' }] }, scoring: { kind: 'correct-choice', correctChoiceKey: 'canberra', awardMilli: '10000' }, ...extra }] });
const as = (playerId: string) => ({ role: 'player' as const, playerId });

describe('wheel of fortune, awards, breaks and auto-close', () => {
  it('lets only the host spin a scene’s wheel, takes picked entries off it, and keeps the result until a scene clears it', async () => {
    const game = parseDefinition({ formatVersion: 2, title: 'Wheel', startNodeKey: 'a',
      wheels: [{ key: 'forfeits', title: 'Forfeits', removePicked: true, spinSeconds: 3, entries: [{ key: 'sing', label: 'Sing' }, { key: 'dance', label: 'Dance' }] }],
      nodes: [quiz('a', { spin: { wheel: 'forfeits' } }), quiz('b', { spin: { wheel: 'forfeits' } }), quiz('c', { wheelClear: true })],
      edges: [{ key: 'ab', from: 'a', to: 'b' }, { key: 'bc', from: 'b', to: 'c' }] });
    const f = await fixture(1, game);
    const first = (await hostCommand(f, 'session.start')).stageRunId!;
    await expect(service.execute(as(f.players[0]!.id), { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, expectedRevision: 1, type: 'wheel.spin', stageRunId: first })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await readSessionView(prisma, f.host, f.sessionId)).wheel).toEqual({ canSpin: true, spin: null, current: null });
    await hostCommand(f, 'wheel.spin', { stageRunId: first });
    const spun = (await readSessionView(prisma, as(f.players[0]!.id), f.sessionId)).wheel;
    expect(spun.canSpin).toBe(false); // players never spin
    expect(spun.spin).toMatchObject({ title: 'Forfeits', entries: ['Sing', 'Dance'], seconds: 3 });
    expect(spun.current).toEqual({ title: 'Forfeits', label: spun.spin!.label });
    await hostCommand(f, 'stage.close', { stageRunId: first });
    const second = (await hostCommand(f, 'stage.advance', { stageRunId: first })).stageRunId!;
    // The result stays on the next scene; spinning there picks the entry that is left.
    expect((await readSessionView(prisma, f.host, f.sessionId)).wheel).toMatchObject({ spin: null, current: { label: spun.spin!.label } });
    await hostCommand(f, 'wheel.spin', { stageRunId: second });
    const other = (await readSessionView(prisma, f.host, f.sessionId)).wheel.spin!.label;
    expect([spun.spin!.label, other].sort()).toEqual(['Dance', 'Sing']);
    await hostCommand(f, 'stage.close', { stageRunId: second });
    const third = (await hostCommand(f, 'stage.advance', { stageRunId: second })).stageRunId!;
    expect((await readSessionView(prisma, f.host, f.sessionId)).wheel).toEqual({ canSpin: false, spin: null, current: null });
    await expect(hostCommand(f, 'wheel.spin', { stageRunId: third })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(() => parseDefinition({ ...game, nodes: [quiz('a', { spin: { wheel: 'missing' } })], edges: [] })).toThrow();
  });

  it('ends with awards worked out from the saved answers, in the author’s order', async () => {
    const game = parseDefinition({ formatVersion: 2, title: 'Awards', startNodeKey: 'a', finale: { stats: ['mostWrong', 'winner', 'mostCorrect', 'mostVotes'] }, nodes: [quiz('a')], edges: [] });
    const f = await fixture(2, game); const stageRunId = (await hostCommand(f, 'session.start')).stageRunId!;
    expect((await readSessionView(prisma, f.host, f.sessionId)).finale).toBeNull();
    await service.execute(as(f.players[0]!.id), answer(f.sessionId, stageRunId, 'canberra'));
    await service.execute(as(f.players[1]!.id), answer(f.sessionId, stageRunId, 'sydney'));
    await hostCommand(f, 'stage.close', { stageRunId }); await hostCommand(f, 'stage.advance', { stageRunId });
    // "Most votes" has nothing to show in this game and is skipped.
    expect((await readSessionView(prisma, as(f.players[1]!.id), f.sessionId)).finale).toEqual([
      { stat: 'mostWrong', playerIds: [f.players[1]!.id], value: '1 wrong answer' },
      { stat: 'winner', playerIds: [f.players[0]!.id], value: '10 points' },
      { stat: 'mostCorrect', playerIds: [f.players[0]!.id], value: '1 correct answer' }]);
  });

  it('closes a round a few seconds after everyone answered, unless the room switches that off', async () => {
    const game = parseDefinition({ formatVersion: 2, title: 'All in', startNodeKey: 'a', nodes: [quiz('a'), quiz('b')], edges: [{ key: 'ab', from: 'a', to: 'b' }] });
    const f = await fixture(2, game); const first = (await hostCommand(f, 'session.start')).stageRunId!;
    await service.execute(as(f.players[0]!.id), answer(f.sessionId, first));
    const waiting = (await prisma.stageRun.findUniqueOrThrow({ where: { id: first } })).deadlineAt!;
    expect(waiting.getTime() - Date.now()).toBeGreaterThan(50_000); // one of two answered: the minute still runs
    await service.execute(as(f.players[1]!.id), answer(f.sessionId, first));
    const soon = (await prisma.stageRun.findUniqueOrThrow({ where: { id: first } })).deadlineAt!;
    expect(soon.getTime() - Date.now()).toBeLessThan(3000);
    await hostCommand(f, 'stage.close', { stageRunId: first });
    await prisma.gameSession.update({ where: { id: f.sessionId }, data: { state: { autoClose: false } } });
    const second = (await hostCommand(f, 'stage.advance', { stageRunId: first })).stageRunId!;
    for (const player of f.players) await service.execute(as(player.id), answer(f.sessionId, second));
    expect((await prisma.stageRun.findUniqueOrThrow({ where: { id: second } })).deadlineAt!.getTime() - Date.now()).toBeGreaterThan(50_000);
  });

  it('pauses the game for a break when enough players vote, and ends the break when the host continues', async () => {
    const f = await fixture(3, parseDefinition({ formatVersion: 2, title: 'Break', startNodeKey: 'a', nodes: [quiz('a')], edges: [] }));
    await hostCommand(f, 'session.start');
    const breaks = createBreaks(prisma, service);
    const player = (index: number): Principal => ({ id: randomUUID(), sessionId: f.sessionId, role: 'player', actor: as(f.players[index]!.id), expiresAt: new Date(Date.now() + 60_000), source: 'LOCAL' } as unknown as Principal);
    const room = async () => { const session = await prisma.gameSession.findUniqueOrThrow({ where: { id: f.sessionId } }); return { status: session.status, state: readRoomState(session.state) }; };
    await breaks.vote(f.sessionId, player(0), true);
    expect(await room()).toMatchObject({ status: 'RUNNING', state: { breakVoters: [f.players[0]!.id], breakStartedAt: null } }); // 1 of 3 at 50%: two are needed
    await breaks.vote(f.sessionId, player(0), false);
    expect((await room()).state.breakVoters).toEqual([]);
    await breaks.vote(f.sessionId, player(0), true); await breaks.vote(f.sessionId, player(1), true);
    const paused = await room();
    expect(paused.status).toBe('PAUSED'); expect(paused.state.breakStartedAt).not.toBeNull(); expect(paused.state.breakVoters).toEqual([]);
    await expect(breaks.vote(f.sessionId, player(2), true)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await hostCommand(f, 'session.resume');
    expect(await room()).toMatchObject({ status: 'RUNNING', state: { breakStartedAt: null } });
  });
});
