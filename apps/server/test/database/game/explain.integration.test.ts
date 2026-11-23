import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { parseDefinition } from '../../../src/game/definition.js';
import { readSessionView } from '../../../src/game/views.js';
import { readMinigameRun } from '../../../src/minigames/shared/rules.js';
import { answer, db, fixture, hostCommand, prisma, service } from '../game-fixture.js';

afterAll(async () => { await db.close(); });
const one = (stage: Record<string, unknown>) => parseDefinition({ formatVersion: 2, title: 'Explained', startNodeKey: 'a', edges: [], nodes: [{ key: 'a', stages: [stage] }] });
const quiz = (extra: Record<string, unknown> = {}) => one({ key: 'main', kind: 'collect', prompt: 'Capital of Australia?', durationMs: 30_000,
  input: { kind: 'choice', options: [{ key: 'canberra', label: 'Canberra' }, { key: 'sydney', label: 'Sydney' }] }, scoring: { kind: 'correct-choice', correctChoiceKey: 'canberra', awardMilli: '1000' }, ...extra });
type Fixture = Awaited<ReturnType<typeof fixture>>;
const as = (f: Fixture, index: number) => ({ role: 'player' as const, playerId: f.players[index]!.id });
const understood = (f: Fixture, index: number, stageRunId: string) => service.execute(as(f, index), { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type: 'stage.understood', stageRunId });
const run = (id: string) => prisma.stageRun.findUniqueOrThrow({ where: { id } });

describe('a scene that explains itself first', () => {
  it('waits, untimed and closed to answers, until the host starts it; players say they are ready once', async () => {
    const f = await fixture(2, quiz({ explain: { text: 'Pick the capital. One try.' } }));
    const stageRunId = (await hostCommand(f, 'session.start')).stageRunId!;
    expect((await run(stageRunId)).deadlineAt).toBeNull();
    expect((await readSessionView(prisma, as(f, 0), f.sessionId)).stage!.explain).toEqual({ text: 'Pick the capital. One try.', readyIds: [] });
    await expect(service.execute(as(f, 0), answer(f.sessionId, stageRunId))).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(hostCommand(f, 'stage.timer', { stageRunId, change: { kind: 'add', ms: 30_000 } })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await understood(f, 0, stageRunId); await understood(f, 0, stageRunId);
    expect((await readSessionView(prisma, f.host, f.sessionId)).stage!.explain!.readyIds).toEqual([f.players[0]!.id]);
    // The host starts the round (not everyone has to be ready): the timer runs from now and answers open.
    await hostCommand(f, 'stage.explained', { stageRunId });
    expect((await run(stageRunId)).deadlineAt).not.toBeNull();
    expect((await readSessionView(prisma, as(f, 0), f.sessionId)).stage!.explain).toBeNull();
    await service.execute(as(f, 0), answer(f.sessionId, stageRunId));
    await expect(understood(f, 1, stageRunId)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(hostCommand(f, 'stage.explained', { stageRunId })).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('a minigame starts its countdown only when the host starts it; without a text it uses the game’s standard explanation', async () => {
    const f = await fixture(2, one({ key: 'main', kind: 'minigame', prompt: 'Doors', durationMs: 60_000, game: 'lucky-doors', explain: {} }));
    const stageRunId = (await hostCommand(f, 'session.start')).stageRunId!;
    expect(readMinigameRun((await run(stageRunId)).presentation)).toBeNull();
    expect((await readSessionView(prisma, as(f, 0), f.sessionId)).stage!.explain).toEqual({ text: null, readyIds: [] });
    await hostCommand(f, 'stage.explained', { stageRunId });
    expect(readMinigameRun((await run(stageRunId)).presentation)).not.toBeNull();
  });

  it('in a team round the teams come first: confirming them does not start the round, and the explanation cannot be skipped past them', async () => {
    const f = await fixture(2, quiz({ explain: { text: 'Answer as a team.' }, play: { kind: 'teams', lineup: { kind: 'round', form: { split: { kind: 'sizes', sizes: [1, 'rest'] }, formation: 'host' } }, answers: 'everyone', points: 'team' } }));
    const stageRunId = (await hostCommand(f, 'session.start')).stageRunId!;
    await expect(hostCommand(f, 'stage.explained', { stageRunId })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    for (const [index, player] of f.players.entries()) await hostCommand(f, 'teams.assign', { stageRunId, playerId: player.id, teamIndex: index });
    await hostCommand(f, 'teams.confirm', { stageRunId });
    expect((await run(stageRunId)).deadlineAt).toBeNull();
    await expect(service.execute(as(f, 0), answer(f.sessionId, stageRunId))).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await hostCommand(f, 'stage.explained', { stageRunId });
    expect((await run(stageRunId)).deadlineAt).not.toBeNull();
    await service.execute(as(f, 0), answer(f.sessionId, stageRunId));
  });

  it('a scene other than a minigame needs something to show: its own text, its points or a picture', () => {
    expect(() => quiz({ explain: {} })).toThrow();
    expect(() => quiz({ explain: { points: true } })).not.toThrow();
    // A poll earns no points, so showing them alone is not enough.
    expect(() => quiz({ scoring: { kind: 'none' }, explain: { points: true } })).toThrow();
    expect(() => quiz({ explain: { picture: { id: randomUUID(), kind: 'video' } } })).toThrow();
  });

  it('the intro shows the points at stake from the scene’s scoring, its picture, and whether only the shared screen shows it', async () => {
    const picture = { id: randomUUID(), kind: 'image' as const };
    const f = await fixture(2, quiz({ scoring: { kind: 'correct-choice', correctChoiceKey: 'canberra', awardMilli: '10000', places: { kind: 'list', pointsMilli: ['5000'] } },
      explain: { points: true, picture, screenOnly: true } }));
    const stageRunId = (await hostCommand(f, 'session.start')).stageRunId!;
    expect((await readSessionView(prisma, as(f, 0), f.sessionId)).stage!.explain).toEqual({ text: null, readyIds: [],
      points: { kind: 'round', milli: '15000', upTo: true }, picture: { ...picture, url: `/api/media/${picture.id}` }, screenOnly: true });
    await hostCommand(f, 'stage.explained', { stageRunId });
    expect((await readSessionView(prisma, as(f, 0), f.sessionId)).stage!.explain).toBeNull();
  });
});
