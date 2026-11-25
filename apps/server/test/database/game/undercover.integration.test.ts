import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { parseDefinition } from '../../../src/game/definition.js';
import { createGameService } from '../../../src/game/service.js';
import { readSessionView } from '../../../src/game/views.js';
import { readUndercover } from '../../../src/minigames/undercover/rules.js';
import { db, fixture, prisma } from '../game-fixture.js';

afterAll(async () => { await db.close(); });
const game = (settings: Record<string, unknown>) => parseDefinition({ formatVersion: 2, title: 'Undercover', startNodeKey: 'mini',
  nodes: [{ key: 'mini', stages: [{ key: 'main', kind: 'minigame', prompt: 'Who is it?', game: 'undercover', durationMs: 900_000, settings, placementMilli: ['10000'] }] }], edges: [] });

describe('Undercover / Mr. White in a room', () => {
  it('deals every phone only its own word, shows the screens no word, and pays the winning side once the game is decided', async () => {
    let now = Date.now(); const service = createGameService(prisma, undefined, () => new Date(now));
    const f = await fixture(3, game({ undercovers: 1, mrWhite: true, turnSeconds: 30, voteSeconds: 45, pairs: [['espresso', 'cappuccino']] }));
    const session = await prisma.gameSession.findUniqueOrThrow({ where: { id: f.sessionId } });
    const stageRunId = (await service.execute(f.host, { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, expectedRevision: session.revision, type: 'session.start' })).stageRunId!;
    now += 3500;
    const table = readUndercover((await prisma.stageRun.findUniqueOrThrow({ where: { id: stageRunId } })).presentation)!;
    const ids = f.players.map(player => player.id);
    // Three players: one undercover, no Mr. White (that needs five).
    expect(Object.values(table.roles).sort()).toEqual(['civilian', 'civilian', 'undercover']);
    const undercover = ids.find(id => table.roles[id] === 'undercover')!;
    const view = (index: number) => readSessionView(prisma, { role: 'player', playerId: ids[index]! }, f.sessionId);
    for (const [index, id] of ids.entries()) {
      const stage = (await view(index)).stage!;
      expect(stage.minigame!.undercover!.own!.word).toBe(table.words[table.roles[id] === 'civilian' ? 0 : 1]);
      // The author's pairs never reach a phone, nor the other word.
      expect(stage.minigame!.settings['pairs']).toBeUndefined();
      expect(JSON.stringify(stage)).not.toContain(table.words[table.roles[id] === 'civilian' ? 1 : 0]);
    }
    const hostStage = (await readSessionView(prisma, f.host, f.sessionId)).stage!;
    expect(JSON.stringify(hostStage)).not.toMatch(/espresso|cappuccino/);
    const act = (playerId: string, extra: Record<string, unknown>) => service.execute({ role: 'player', playerId }, { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type: 'undercover.act', stageRunId, round: 1, ...extra });
    for (const id of table.order) await act(id, { action: 'clued' });
    // A plain answer is not how this game is played.
    await expect(service.execute({ role: 'player', playerId: ids[0]! }, { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type: 'submission.submit', stageRunId, value: { kind: 'minigame', value: 0 } }))
      .rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    // The two civilians vote the undercover player out: the civilians win and get 1st place's points.
    const civilians = ids.filter(id => id !== undercover);
    for (const id of civilians) await act(id, { action: 'vote', playerId: undercover });
    await act(undercover, { action: 'vote', playerId: civilians[0]! });
    const done = readUndercover((await prisma.stageRun.findUniqueOrThrow({ where: { id: stageRunId } })).presentation)!;
    expect(done).toMatchObject({ phase: 'done', winner: 'civilians' });
    const close = async (type: string) => { const current = await prisma.gameSession.findUniqueOrThrow({ where: { id: f.sessionId } });
      await service.execute(f.host, { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, expectedRevision: current.revision, type, stageRunId }); };
    await close('stage.close'); await close('stage.reveal');
    const scores = await prisma.scoreEntry.findMany({ where: { sessionId: f.sessionId }, select: { recipientPlayerId: true, amountMilli: true } });
    expect(scores.map(score => score.recipientPlayerId).sort()).toEqual([...civilians].sort());
    expect(scores.every(score => score.amountMilli === 10_000n)).toBe(true);
    const reveal = (await view(0)).stage!.reveal!.answer as { undercover?: { words: string[]; winner: string; roles: { playerId: string; role: string }[] } };
    expect(reveal.undercover).toMatchObject({ words: table.words, winner: 'civilians' });
    expect(reveal.undercover!.roles.find(entry => entry.playerId === undercover)!.role).toBe('undercover');
  });
});
