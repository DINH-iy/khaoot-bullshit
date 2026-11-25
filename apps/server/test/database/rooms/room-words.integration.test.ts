import { afterAll, describe, expect, it } from 'vitest';
import { readConfig } from '../../../src/config.js';
import { parseDefinition } from '../../../src/game/definition.js';
import { createSeatReclaim } from '../../../src/rooms/reclaim.js';
import type { Principal } from '../../../src/rooms/gateway.js';
import { readMinigameRun } from '../../../src/minigames/shared/rules.js';
import { readUndercover } from '../../../src/minigames/undercover/rules.js';
import { db, fixture, hostCommand, prisma } from '../game-fixture.js';

afterAll(async () => { await db.close(); });
const config = readConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ROOM_TOKEN_SECRET: 'c'.repeat(64), PUBLIC_ORIGIN: 'http://127.0.0.1:4173' });
const seats = createSeatReclaim(prisma, config, () => new Set(), () => {});
const mini = (key: string, game: string, settings: object) => ({ key, stages: [{ key: 'm', kind: 'minigame', prompt: game, game, durationMs: 300_000, settings }] });
const game = parseDefinition({ formatVersion: 2, title: 'Words', startNodeKey: 'a', edges: [{ key: 'e', from: 'a', to: 'b' }], nodes: [
  mini('a', 'hangman', { lives: 7, words: ['fiets'] }), mini('b', 'undercover', { undercovers: 1, mrWhite: false, turnSeconds: 30, voteSeconds: 45, pairs: [['koffie', 'thee']] })] });
type World = Awaited<ReturnType<typeof fixture>>;
const principal = (f: World, role: 'host' | 'player'): Principal => ({ id: role, sessionId: f.sessionId, role, expiresAt: new Date(Date.now() + 60_000),
  actor: role === 'host' ? f.host : { role: 'player', playerId: f.players[0]!.id }, source: 'LOCAL_REHEARSAL' });
const presentation = async (stageRunId: string) => (await prisma.stageRun.findUniqueOrThrow({ where: { id: stageRunId } })).presentation;

describe('the host\'s own words for Galgje and Undercover', () => {
  it('replace the scene\'s words in rounds that start afterwards; only the host sets them; a pause keeps Galgje\'s word', async () => {
    const f = await fixture(3, game);
    await expect(seats.setWords(f.sessionId, principal(f, 'player'), { words: ['molen'], pairs: [] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await seats.setWords(f.sessionId, principal(f, 'host'), { words: ['molen'], pairs: [['zon', 'maan']] });
    const galgje = (await hostCommand(f, 'session.start')).stageRunId!;
    expect(readMinigameRun(await presentation(galgje))?.hangmanWord).toBe('molen');
    // Words changed during a round only count from the next round; a pause and continue keep the drawn word.
    await seats.setWords(f.sessionId, principal(f, 'host'), { words: ['tulp'], pairs: [['zon', 'maan']] });
    await hostCommand(f, 'session.pause'); await hostCommand(f, 'session.resume');
    expect(readMinigameRun(await presentation(galgje))?.hangmanWord).toBe('molen');
    await hostCommand(f, 'stage.close', { stageRunId: galgje });
    const undercover = (await hostCommand(f, 'stage.advance', { stageRunId: galgje })).stageRunId!;
    expect([...readUndercover(await presentation(undercover))!.words].sort()).toEqual(['maan', 'zon']);
  });
});
