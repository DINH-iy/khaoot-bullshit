import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { parseDefinition, type GameDefinition } from '../../src/game/definition.js';
import { createGameService } from '../../src/game/service.js';
import { readSessionView } from '../../src/game/views.js';
import { readMinigameRun } from '../../src/minigames/rules.js';
import { createLiveSignals } from '../../src/minigames/live.js';
import { db, fixture, prisma } from './game-fixture.js';

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

  it('keeps the doors secret until the reveal and pays what was behind the chosen door', async () => {
    const w = world(); const f = await fixture(2, game({ game: 'lucky-doors', settings: { doorsMilli: ['0', '7000'] } }));
    const stageRunId = (await host(w, f, 'session.start')).stageRunId!;
    const view = await readSessionView(prisma, { role: 'player', playerId: f.players[0]!.id }, f.sessionId);
    // Screens see the door values the author chose, never which door hides which.
    expect(Object.keys(view.stage!.minigame!).sort()).toEqual(['game', 'goAt', 'relay', 'settings', 'startsAt']);
    const run = readMinigameRun((await prisma.stageRun.findUniqueOrThrow({ where: { id: stageRunId } })).presentation)!;
    const prize = run.doorsMilli!.indexOf('7000');
    w.advance(3500);
    await play(w, f, 0, stageRunId, prize); await play(w, f, 1, stageRunId, 1 - prize);
    await expect(play(w, f, 1, stageRunId, prize)).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
    await expect(play(w, f, 0, stageRunId, 5)).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    await host(w, f, 'stage.close', { stageRunId });
    // Moving on reveals it too, with its points.
    await host(w, f, 'stage.advance', { stageRunId });
    const totals = await prisma.scoreEntry.findMany({ where: { sessionId: f.sessionId }, select: { recipientPlayerId: true, amountMilli: true } });
    expect(totals).toEqual([{ recipientPlayerId: f.players[0]!.id, amountMilli: 7000n }]);
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
