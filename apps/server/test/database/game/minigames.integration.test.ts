import { randomUUID } from 'node:crypto';
import { COIN_SIDES, DOT_RADIUS, GRAPH_SAMPLES } from '@party/contracts';
import { afterAll, describe, expect, it } from 'vitest';
import { parseDefinition, type GameDefinition } from '../../../src/game/definition.js';
import { createGameService } from '../../../src/game/service.js';
import { readSessionView } from '../../../src/game/views.js';
import { readMinigameRun } from '../../../src/minigames/shared/rules.js';
import { createLiveSignals } from '../../../src/minigames/tap-race/live.js';
import { db, fixture, prisma } from '../game-fixture.js';

afterAll(async () => { await db.close(); });
const game = (stage: Record<string, unknown>, extra: Partial<GameDefinition> = {}) => parseDefinition({
  formatVersion: 2, title: 'Minigames', startNodeKey: 'mini', ...extra,
  nodes: [{ key: 'mini', stages: [{ key: 'main', kind: 'minigame', prompt: 'Go!', durationMs: 30_000, ...stage }] }], edges: [],
});
/** A game service on a clock the test moves, so a 10-second race takes no time. */
function world(live?: ReturnType<typeof createLiveSignals>) {
  let now = Date.now(); const service = createGameService(prisma, undefined, () => new Date(now), live?.signals);
  return { service, advance: (ms: number) => { now += ms; }, now: () => now };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function host(w: ReturnType<typeof world>, f: Fixture, type: string, extra: Record<string, unknown> = {}) {
  const session = await prisma.gameSession.findUniqueOrThrow({ where: { id: f.sessionId } });
  return w.service.execute(f.host, { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, expectedRevision: session.revision, type, ...extra });
}
const play = (w: ReturnType<typeof world>, f: Fixture, index: number, stageRunId: string, value: number, early?: true) =>
  w.service.execute({ role: 'player', playerId: f.players[index]!.id }, { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type: 'submission.submit', stageRunId, value: { kind: 'minigame', value, ...(early ? { early } : {}) } });

describe('minigames', () => {
  it('keeps coin guesses secret and pays every correct player on one timed reveal', async () => {
    const w = world();
    const f = await fixture(4, game({ game: 'heads-or-tails', durationMs: 15_000, placementMilli: ['7000'] }));
    const stageRunId = (await host(w, f, 'session.start')).stageRunId!;
    const stored = async () => readMinigameRun((await prisma.stageRun.findUniqueOrThrow({ where: { id: stageRunId } })).presentation)!;
    const coin = (await stored()).coin!;
    const correct = COIN_SIDES.indexOf(coin);
    expect(correct).toBeGreaterThanOrEqual(0);
    const display = { role: 'display' as const, sessionId: f.sessionId };
    const player = (index: number) => ({ role: 'player' as const, playerId: f.players[index]!.id });
    const view = (actor: typeof display | typeof f.host | ReturnType<typeof player>) => readSessionView(prisma, actor, f.sessionId);
    expect((await view(display)).stage!.deadlineAt).toBe(new Date(w.now() + 18_000).toISOString());
    await expect(play(w, f, 0, stageRunId, correct)).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    w.advance(3000);
    await expect(play(w, f, 0, stageRunId, 2)).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    await play(w, f, 0, stageRunId, correct);
    await expect(play(w, f, 0, stageRunId, 1 - correct)).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
    expect((await view(player(0))).ownSubmission?.value).toEqual({ kind: 'minigame', value: correct });
    for (const actor of [f.host, display, player(1)]) {
      const privateView = await view(actor);
      expect(privateView.stage!.minigame).not.toHaveProperty('coin');
      expect(privateView.stage!.reveal).toBeNull();
      expect(privateView.ownSubmission).toBeNull();
    }
    await host(w, f, 'session.pause');
    w.advance(4000);
    await host(w, f, 'session.resume');
    expect((await stored()).coin).toBe(coin);
    w.advance(3000);
    await play(w, f, 1, stageRunId, correct);
    await play(w, f, 2, stageRunId, 1 - correct);
    w.advance(14_000);
    await expect(play(w, f, 3, stageRunId, correct)).rejects.toMatchObject({ code: 'TOO_LATE' });
    await w.service.execute(f.host, { formatVersion: 1, type: 'stage.timeout', commandId: randomUUID(), sessionId: f.sessionId, stageRunId });
    const revealed = await view(display);
    expect(revealed.stage!.reveal!.answer).toMatchObject({ game: 'heads-or-tails', coin, entries: expect.arrayContaining([
      { playerId: f.players[0]!.id, teamId: null, value: correct, place: 1 },
      { playerId: f.players[1]!.id, teamId: null, value: correct, place: 1 },
      { playerId: f.players[2]!.id, teamId: null, value: 1 - correct, place: null },
    ]) });
    expect(revealed.standings).toHaveLength(2);
    expect(revealed.standings).toEqual(expect.arrayContaining(f.players.slice(0, 2).map(({ id }) => ({ playerId: id, amountMilli: '7000' }))));
    await expect(host(w, f, 'stage.reveal', { stageRunId })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(await prisma.scoreEntry.count({ where: { sessionId: f.sessionId } })).toBe(2);
  });

  it('keeps Count the Dots private to the displays and opens guessing only after the viewing window', async () => {
    const w = world();
    const f = await fixture(5, game({ game: 'count-the-dots', durationMs: 15_000, settings: { viewSeconds: 5 } }));
    const stageRunId = (await host(w, f, 'session.start')).stageRunId!;
    const clock = () => new Date(w.now());
    const display = { role: 'display' as const, sessionId: f.sessionId };
    const player = (index: number) => ({ role: 'player' as const, playerId: f.players[index]!.id });
    const view = (actor: typeof display | typeof f.host | ReturnType<typeof player>) => readSessionView(prisma, actor, f.sessionId, clock);
    w.advance(3000);
    const opened = (await view(display)).stage!;
    const dots = opened.minigame!.dots!;
    const pattern = dots.pattern!;
    const count = pattern.length;
    expect(opened.deadlineAt).toBe(new Date(w.now() + 20_000).toISOString());
    expect((await view(f.host)).stage!.minigame!.dots).toEqual(dots);
    expect((await view(player(0))).stage!.minigame!.dots).toEqual({ guessAt: dots.guessAt });
    for (const [index, [x1, y1]] of pattern.entries()) {
      expect(pattern.slice(index + 1).every(([x2, y2]) => Math.hypot(x1 - x2, y1 - y2) >= 2 * DOT_RADIUS)).toBe(true);
    }

    w.advance(2000);
    await expect(play(w, f, 0, stageRunId, count)).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    await host(w, f, 'session.pause');
    w.advance(10_000);
    expect((await view(display)).stage!.minigame!.dots?.pattern).toBeUndefined();
    await host(w, f, 'stage.timer', { stageRunId, change: { kind: 'set', ms: 10_000 } });
    await host(w, f, 'session.resume');
    const resumed = (await view(display)).stage!;
    expect(resumed.minigame!.dots).toEqual({ pattern, guessAt: new Date(w.now() + 3000).toISOString() });
    expect(resumed.deadlineAt).toBe(new Date(w.now() + 13_000).toISOString());
    w.advance(2999);
    await expect(play(w, f, 0, stageRunId, count)).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    w.advance(1);
    expect((await view(display)).stage!.minigame!.dots?.pattern).toBeUndefined();
    await play(w, f, 0, stageRunId, count + 2);
    w.advance(100);
    await play(w, f, 1, stageRunId, count - 2);
    await expect(play(w, f, 2, stageRunId, 1000)).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    await play(w, f, 2, stageRunId, 0);
    expect((await view(player(2))).ownSubmission?.value).toEqual({ kind: 'minigame', value: 0 });
    expect((await view(player(1))).ownSubmission?.value).toEqual({ kind: 'minigame', value: count - 2 });

    await host(w, f, 'stage.close', { stageRunId });
    w.advance(3000);
    await host(w, f, 'stage.reopen', { stageRunId, durationMs: 10_000 });
    expect((await view(display)).stage!.minigame!.dots?.pattern).toBeUndefined();
    await play(w, f, 3, stageRunId, count);
    w.advance(12_000);
    await expect(play(w, f, 4, stageRunId, count)).rejects.toMatchObject({ code: 'TOO_LATE' });
    expect((await view(player(0))).stage!.reveal).toBeNull();
    await host(w, f, 'stage.close', { stageRunId });
    await host(w, f, 'stage.reveal', { stageRunId });
    const result = await view(player(0));
    expect(result.stage!.minigame!.dots?.pattern).toBeUndefined();
    expect(result.stage!.reveal!.answer).toMatchObject({ game: 'count-the-dots', dotCount: count, entries: [
      { playerId: f.players[3]!.id, value: 0, dotGuess: count, place: 1 },
      { playerId: f.players[0]!.id, value: 2, dotGuess: count + 2, place: 2 },
      { playerId: f.players[1]!.id, value: 2, dotGuess: count - 2, place: 3 },
      { playerId: f.players[2]!.id, value: count, dotGuess: 0, place: 4 },
    ] });
    expect(result.standings).toEqual(expect.arrayContaining([
      { playerId: f.players[3]!.id, amountMilli: '10000' },
      { playerId: f.players[0]!.id, amountMilli: '6000' },
      { playerId: f.players[1]!.id, amountMilli: '3000' },
    ]));
  });

  it('keeps graph answers private and ranks the whole line before breaking ties by receipt time', async () => {
    const w = world();
    const chart = { visible: [20, 50], hidden: [50, 50], startLabel: '2000', endLabel: '2020' };
    const f = await fixture(4, game({ game: 'draw-the-graph', settings: { graph: chart } }));
    const stageRunId = (await host(w, f, 'session.start')).stageRunId!;
    const player = (index: number) => ({ role: 'player' as const, playerId: f.players[index]!.id });
    const display = { role: 'display' as const, sessionId: f.sessionId };
    const view = (actor: typeof display | typeof f.host | ReturnType<typeof player>) => readSessionView(prisma, actor, f.sessionId, () => new Date(w.now()));
    const submit = (index: number, graphLine: number[]) => w.service.execute(player(index), {
      formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type: 'submission.submit', stageRunId,
      value: { kind: 'minigame', value: 0, graphLine },
    });
    const level = (value: number) => Array<number>(GRAPH_SAMPLES).fill(value);

    const { hidden, ...prefix } = chart;
    const colors = await Promise.all([0, 1, 2, 3].map(async index => {
      const active = (await view(player(index))).stage!.minigame!;
      expect(active.settings).toEqual({});
      expect(active.graph!.chart).toEqual(prefix);
      return active.graph!.hue;
    }));
    expect(colors.every(color => color !== undefined)).toBe(true);
    expect(new Set(colors).size).toBe(4);
    for (const actor of [f.host, display]) {
      const active = (await view(actor)).stage!;
      expect(active.minigame!.graph).toEqual({ chart: prefix });
      expect(active.minigame!.settings).toEqual({});
      expect(active.reveal).toBeNull();
    }
    await expect(submit(0, level(510))).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    w.advance(3000);
    await expect(submit(0, [510])).rejects.toMatchObject({ code: 'INVALID_COMMAND' });
    await submit(0, level(510));
    expect((await view(player(0))).ownSubmission?.value).toEqual({ kind: 'minigame', value: 0, graphLine: level(510) });
    const outsider = await view(player(1));
    expect(outsider.ownSubmission).toBeNull();
    expect(outsider.stage!.reveal).toBeNull();

    await host(w, f, 'session.pause');
    w.advance(2000);
    await host(w, f, 'session.resume');
    expect((await view(player(0))).stage!.minigame!.graph!.hue).toBe(colors[0]);
    await submit(1, level(490));
    w.advance(20);
    await submit(2, level(500));
    await host(w, f, 'stage.close', { stageRunId });
    expect((await view(display)).stage!.reveal).toBeNull();
    await host(w, f, 'stage.reopen', { stageRunId, durationMs: 1000 });
    expect((await view(player(3))).stage!.minigame!.graph!.hue).toBe(colors[3]);
    await submit(3, [...level(650).slice(1), 500]);
    await host(w, f, 'stage.close', { stageRunId });
    await host(w, f, 'stage.reveal', { stageRunId });
    const result = await view(display);
    expect(result.stage!.reveal!.answer).toMatchObject({ game: 'draw-the-graph', graph: { ...prefix, hidden }, entries: [
      { playerId: f.players[2]!.id, graphHue: colors[2], graphLine: level(500), value: 0, place: 1 },
      { playerId: f.players[0]!.id, graphHue: colors[0], graphLine: level(510), value: 100, place: 2 },
      { playerId: f.players[1]!.id, graphHue: colors[1], graphLine: level(490), value: 100, place: 3 },
      { playerId: f.players[3]!.id, graphHue: colors[3], value: 1438, place: 4 },
    ] });
    expect(result.standings).toEqual(expect.arrayContaining([
      { playerId: f.players[2]!.id, amountMilli: '10000' },
      { playerId: f.players[0]!.id, amountMilli: '6000' },
      { playerId: f.players[1]!.id, amountMilli: '3000' },
    ]));
  });

  it('ranks Match the Angle by circular error, then by the server receipt time', async () => {
    const w = world();
    const f = await fixture(5, game({ game: 'match-the-angle', durationMs: 20_000 }));
    const stageRunId = (await host(w, f, 'session.start')).stageRunId!;
    const display = { role: 'display' as const, sessionId: f.sessionId };
    const view = () => readSessionView(prisma, display, f.sessionId);
    const stage = (await view()).stage!;
    const target = stage.minigame!.angleTarget!;
    expect(stage.deadlineAt).toBe(new Date(w.now() + 23_000).toISOString());
    expect((await readSessionView(prisma, { role: 'player', playerId: f.players[0]!.id }, f.sessionId)).stage!.minigame!.angleTarget).toBe(target);
    await expect(play(w, f, 0, stageRunId, target)).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    w.advance(3000);
    await expect(play(w, f, 0, stageRunId, 361)).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    await expect(play(w, f, 0, stageRunId, 12.5)).rejects.toMatchObject({ code: 'INVALID_COMMAND' });

    // One guess crosses 0° on the shorter route. The other two have the same error.
    const acrossZero = target < 180 ? 359 : 0;
    const equalError = target < 180 ? target + 1 : 360 - target;
    const sameDistance = (target + (target < 180 ? equalError : -equalError) + 360) % 360;
    await play(w, f, 0, stageRunId, acrossZero);
    await host(w, f, 'session.pause');
    w.advance(5000);
    await host(w, f, 'session.resume');
    expect((await view()).stage!.minigame!.angleTarget).toBe(target);
    await play(w, f, 1, stageRunId, sameDistance);
    await play(w, f, 2, stageRunId, sameDistance);
    await host(w, f, 'stage.close', { stageRunId });
    await host(w, f, 'stage.reopen', { stageRunId, durationMs: 10_000 });
    expect((await view()).stage!.minigame!.angleTarget).toBe(target);
    await play(w, f, 3, stageRunId, target);
    w.advance(12_000);
    await expect(play(w, f, 4, stageRunId, target)).rejects.toMatchObject({ code: 'TOO_LATE' });
    expect((await view()).stage!.reveal).toBeNull();
    await host(w, f, 'stage.close', { stageRunId });
    await host(w, f, 'stage.reveal', { stageRunId });
    const revealed = await view();
    expect(revealed.stage!.reveal!.answer).toMatchObject({ game: 'match-the-angle', entries: expect.arrayContaining([
      { playerId: f.players[3]!.id, teamId: null, value: 0, angle: target, place: 1 },
      { playerId: f.players[0]!.id, teamId: null, value: equalError, angle: acrossZero, place: 2 },
      { playerId: f.players[1]!.id, teamId: null, value: equalError, angle: sameDistance, place: 3 },
      { playerId: f.players[2]!.id, teamId: null, value: equalError, angle: sameDistance, place: 3 },
    ]) });
    expect(revealed.standings).toEqual(expect.arrayContaining([
      { playerId: f.players[3]!.id, amountMilli: '10000' },
      { playerId: f.players[0]!.id, amountMilli: '6000' },
      { playerId: f.players[1]!.id, amountMilli: '3000' },
      { playerId: f.players[2]!.id, amountMilli: '3000' },
    ]));
  });

  it('uses one Cut the Line target, keeps it on recovery and awards places by absolute error', async () => {
    const w = world();
    const f = await fixture(4, game({ game: 'cut-the-line', durationMs: 20_000 }));
    const stageRunId = (await host(w, f, 'session.start')).stageRunId!;
    const display = { role: 'display' as const, sessionId: f.sessionId };
    const view = () => readSessionView(prisma, display, f.sessionId);
    const started = (await view()).stage!;
    const target = started.minigame!.cutTarget!;
    expect(started.deadlineAt).toBe(new Date(w.now() + 23_000).toISOString());
    expect(target).toBeGreaterThan(10);
    expect(target).toBeLessThan(90);
    expect(target % 5).not.toBe(0);
    expect((await readSessionView(prisma, { role: 'player', playerId: f.players[0]!.id }, f.sessionId)).stage!.minigame!.cutTarget).toBe(target);
    await expect(play(w, f, 0, stageRunId, target)).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });

    w.advance(3500);
    await expect(play(w, f, 0, stageRunId, 101)).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    await play(w, f, 0, stageRunId, target + 2);
    await host(w, f, 'session.pause');
    w.advance(5000);
    await host(w, f, 'session.resume');
    expect((await view()).stage!.minigame!.cutTarget).toBe(target);
    await host(w, f, 'stage.close', { stageRunId });
    await host(w, f, 'stage.reopen', { stageRunId, durationMs: 10_000 });
    expect((await view()).stage!.minigame!.cutTarget).toBe(target);
    await play(w, f, 1, stageRunId, target - 2);
    await play(w, f, 2, stageRunId, target - 6);
    await expect(play(w, f, 0, stageRunId, target)).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
    w.advance(12_000);
    await expect(play(w, f, 3, stageRunId, target)).rejects.toMatchObject({ code: 'TOO_LATE' });
    expect((await view()).stage!.reveal).toBeNull();
    await host(w, f, 'stage.close', { stageRunId });
    await host(w, f, 'stage.reveal', { stageRunId });
    const revealed = await view();
    expect(revealed.stage!.reveal!.answer).toMatchObject({ game: 'cut-the-line', entries: expect.arrayContaining([
      { playerId: f.players[0]!.id, teamId: null, value: 2, cut: target + 2, place: 1 },
      { playerId: f.players[1]!.id, teamId: null, value: 2, cut: target - 2, place: 1 },
      { playerId: f.players[2]!.id, teamId: null, value: 6, cut: target - 6, place: 3 },
    ]) });
    expect(revealed.standings).toEqual(expect.arrayContaining([
      ...f.players.slice(0, 2).map(player => ({ playerId: player.id, amountMilli: '10000' })),
      { playerId: f.players[2]!.id, amountMilli: '3000' },
    ]));
  });

  it('runs a tap race: one checked result per phone, places and points only at the reveal', async () => {
    const w = world(); const f = await fixture(3, game({ game: 'tap-race', settings: { seconds: 10 }, placementMilli: ['10000', '5000'] }));
    const stageRunId = (await host(w, f, 'session.start')).stageRunId!;
    const view = await readSessionView(prisma, { role: 'player', playerId: f.players[0]!.id }, f.sessionId);
    expect(view.stage).toMatchObject({ kind: 'minigame', input: null, minigame: { game: 'tap-race', settings: { seconds: 10 }, startsAt: new Date(w.now() + 3000).toISOString(), goAt: null } });
    // Too early: the race is not over yet.
    await expect(play(w, f, 0, stageRunId, 50)).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    w.advance(13_000);
    await play(w, f, 0, stageRunId, 50); await play(w, f, 1, stageRunId, 70); await play(w, f, 2, stageRunId, 70);
    await expect(play(w, f, 0, stageRunId, 60)).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
    await expect(play(w, f, 1, stageRunId, 150)).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
    expect(await prisma.scoreEntry.count({ where: { sessionId: f.sessionId } })).toBe(0);
    await host(w, f, 'stage.close', { stageRunId });
    await host(w, f, 'stage.reveal', { stageRunId });
    const revealed = await readSessionView(prisma, { role: 'display', sessionId: f.sessionId }, f.sessionId);
    expect(revealed.stage!.reveal!.answer).toEqual({ kind: 'minigame', game: 'tap-race', doorsMilli: null, entries: [
      { playerId: f.players[1]!.id, teamId: null, value: 70, place: 1 }, { playerId: f.players[2]!.id, teamId: null, value: 70, place: 1 }, { playerId: f.players[0]!.id, teamId: null, value: 50, place: 3 }] });
    // A tie shares first place; third place has no points in this game.
    expect(revealed.standings).toEqual(expect.arrayContaining([{ playerId: f.players[1]!.id, amountMilli: '10000' }, { playerId: f.players[2]!.id, amountMilli: '10000' }]));
    expect(revealed.standings).toHaveLength(2);
  });

  it('plays one against the rest in teams: the single player can win the round for their team', async () => {
    const w = world();
    const f = await fixture(4, game({ game: 'reaction', settings: { minWaitMs: 1000, maxWaitMs: 1000 }, placementMilli: ['10000', '4000'],
      play: { kind: 'teams', lineup: { kind: 'round', form: { split: { kind: 'sizes', sizes: [1, 'rest'] }, formation: 'host' } }, answers: 'everyone', points: 'team' } }));
    const stageRunId = (await host(w, f, 'session.start')).stageRunId!;
    // While teams are being made the minigame has not started.
    expect((await readSessionView(prisma, f.host, f.sessionId)).stage!.minigame!.startsAt).toBeNull();
    await host(w, f, 'teams.assign', { stageRunId, playerId: f.players[0]!.id, teamIndex: 0 });
    for (const player of f.players.slice(1)) await host(w, f, 'teams.assign', { stageRunId, playerId: player.id, teamIndex: 1 });
    await host(w, f, 'teams.confirm', { stageRunId });
    const run = readMinigameRun((await prisma.stageRun.findUniqueOrThrow({ where: { id: stageRunId } })).presentation)!;
    expect(Date.parse(run.goAt!) - Date.parse(run.startsAt)).toBe(1000);
    w.advance(4500);
    await play(w, f, 0, stageRunId, 200); await play(w, f, 1, stageRunId, 250); await play(w, f, 2, stageRunId, 260); await play(w, f, 3, stageRunId, 0, true);
    await host(w, f, 'stage.close', { stageRunId }); await host(w, f, 'stage.reveal', { stageRunId });
    const teams = await prisma.scoreEntry.findMany({ where: { sessionId: f.sessionId, recipientTeamId: { not: null } }, select: { amountMilli: true, recipientTeamId: true } });
    const single = (await prisma.teamMember.findFirstOrThrow({ where: { playerId: f.players[0]!.id } })).teamId;
    expect(teams.find(entry => entry.recipientTeamId === single)?.amountMilli).toBe(10000n);
    expect(teams.find(entry => entry.recipientTeamId !== single)?.amountMilli).toBe(4000n);
  });

  it('keeps a game with an unchosen minigame unpublishable, and refuses settings that do not fit', () => {
    expect(() => game({ game: 'stop-clock', settings: { targetMs: 3000, visibleMs: 5000 } })).toThrow();
    expect(() => game({ game: 'tap-race', settings: { seconds: 10, extra: 1 } })).toThrow();
    expect(game({ game: 'to-be-chosen' }).nodes[0]!.stages[0]!.kind).toBe('minigame');
  });

  it('lets a player change their own look at any time, with built-in parts only', async () => {
    const w = world(); const f = await fixture(1, game({ game: 'tap-race' }));
    const look = { color: 3, body: 'cat', eyes: 'happy', mouth: 'grin', hat: 'crown', extra: 'glasses' };
    const send = (value: unknown, actor: Parameters<typeof w.service.execute>[0] = { role: 'player', playerId: f.players[0]!.id }) =>
      w.service.execute(actor, { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type: 'player.look', look: value });
    await send(look);
    expect((await prisma.sessionPlayer.findUniqueOrThrow({ where: { id: f.players[0]!.id } })).look).toEqual(look);
    await expect(send({ ...look, hat: 'https://evil.example/hat.svg' })).rejects.toMatchObject({ code: 'INVALID_COMMAND' });
    await expect(send(look, f.host)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('keeps GO secret until it happens, and caps a reaction at what the network allows', async () => {
    const w = world(); const f = await fixture(1, game({ game: 'reaction', settings: { minWaitMs: 2000, maxWaitMs: 2000 } }));
    const live = createLiveSignals(() => w.now()); const fair = world(live);
    const stageRunId = (await host(w, f, 'session.start')).stageRunId!;
    const at = (ms: number) => readSessionView(prisma, { role: 'player', playerId: f.players[0]!.id }, f.sessionId, () => new Date(Date.parse(start) + ms));
    const start = readMinigameRun((await prisma.stageRun.findUniqueOrThrow({ where: { id: stageRunId } })).presentation)!.startsAt;
    expect((await at(1900)).stage!.minigame!.goAt).toBeNull();
    expect((await at(2000)).stage!.minigame!.goAt).not.toBeNull();
    // The phone answers pings in about 100 ms; it claims 90 ms but its tap arrives 900 ms after GO.
    for (let index = 0; index < 5; index++) live.recordLatency(f.sessionId, f.players[0]!.id, 100);
    fair.advance(3000 + 2000 + 900 + (w.now() - fair.now()));
    await fair.service.execute({ role: 'player', playerId: f.players[0]!.id }, { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type: 'submission.submit', stageRunId, value: { kind: 'minigame', value: 90 } });
    const saved = await prisma.submission.findFirstOrThrow({ where: { stageRunId } });
    expect(saved.value).toEqual({ kind: 'minigame', value: 620 });
  });

  it('shows no GO while a reaction duel is paused, and a new one after the fresh countdown', async () => {
    const w = world(); const f = await fixture(1, game({ game: 'reaction', settings: { minWaitMs: 2000, maxWaitMs: 2000 } }));
    const stageRunId = (await host(w, f, 'session.start')).stageRunId!;
    const view = (ms: number) => readSessionView(prisma, { role: 'player', playerId: f.players[0]!.id }, f.sessionId, () => new Date(w.now() + ms));
    const first = readMinigameRun((await prisma.stageRun.findUniqueOrThrow({ where: { id: stageRunId } })).presentation)!;
    await host(w, f, 'session.pause');
    // Long past the old GO moment, the paused room still shows none.
    expect((await view(60_000)).stage!.minigame!.goAt).toBeNull();
    w.advance(60_000); await host(w, f, 'session.resume');
    const next = readMinigameRun((await prisma.stageRun.findUniqueOrThrow({ where: { id: stageRunId } })).presentation)!;
    expect(next.goAt).not.toBe(first.goAt);
    expect((await view(4900)).stage!.minigame!.goAt).toBeNull();
    expect((await view(5000)).stage!.minigame!.goAt).toBe(next.goAt);
  });

  it('stops a running minigame while paused and gives a fresh countdown on resume; results already in stay', async () => {
    const w = world(); const f = await fixture(2, game({ game: 'tap-race', settings: { seconds: 5 } }));
    const stageRunId = (await host(w, f, 'session.start')).stageRunId!;
    w.advance(8500); await play(w, f, 0, stageRunId, 40);
    await host(w, f, 'session.pause');
    await expect(play(w, f, 1, stageRunId, 30)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    w.advance(60_000); await host(w, f, 'session.resume');
    const run = readMinigameRun((await prisma.stageRun.findUniqueOrThrow({ where: { id: stageRunId } })).presentation)!;
    expect(Date.parse(run.startsAt)).toBe(w.now() + 3000);
    // The second player plays the restarted race; the first keeps their result.
    await expect(play(w, f, 1, stageRunId, 30)).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    w.advance(8500); await play(w, f, 1, stageRunId, 30);
    expect(await prisma.submission.count({ where: { stageRunId } })).toBe(2);
  });

  it('scores Perfect circle from the stroke itself, whatever the phone claims', async () => {
    const w = world(); const f = await fixture(1, game({ game: 'perfect-circle', settings: { seconds: 10 } }));
    const stageRunId = (await host(w, f, 'session.start')).stageRunId!;
    const ring = Array.from({ length: 100 }, (_, index) => { const angle = index / 99 * 2 * Math.PI; return [Math.round(500 + 300 * Math.cos(angle)), Math.round(500 + 300 * Math.sin(angle))]; }).flat();
    w.advance(5000);
    await w.service.execute({ role: 'player', playerId: f.players[0]!.id }, { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type: 'submission.submit', stageRunId, value: { kind: 'minigame', value: 3, stroke: ring } });
    const saved = (await prisma.submission.findFirstOrThrow({ where: { stageRunId } })).value as { value: number };
    expect(saved.value).toBeGreaterThan(950);
  });
});

it('clap the beat checks timing and hit limits, and ranks the saved results', async () => {
  const w = world();
  const f = await fixture(2, game({ game: 'clap-beat', durationMs: 9000, countdownSeconds: 3 }));
  const stageRunId = (await host(w, f, 'session.start')).stageRunId!;
  w.advance(8000);
  await expect(play(w, f, 0, stageRunId, 6)).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
  w.advance(3200);
  await expect(play(w, f, 0, stageRunId, 7)).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
  await play(w, f, 0, stageRunId, 2);
  await play(w, f, 1, stageRunId, 6);
  await expect(play(w, f, 1, stageRunId, 2)).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
  await host(w, f, 'stage.close', { stageRunId });
  await host(w, f, 'stage.reveal', { stageRunId });
  const shared = await readSessionView(prisma, f.host, f.sessionId);
  expect(shared.stage?.reveal?.answer).toMatchObject({ game: 'clap-beat', entries: [
    { playerId: f.players[1]!.id, place: 1, value: 6 },
    { playerId: f.players[0]!.id, place: 2, value: 2 },
  ] });
});
