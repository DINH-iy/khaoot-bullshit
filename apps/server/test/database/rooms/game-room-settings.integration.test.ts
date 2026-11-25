import { afterAll, describe, expect, it } from 'vitest';
import { readConfig } from '../../../src/config.js';
import { parseDefinition } from '../../../src/game/definition.js';
import { createSeatReclaim, readRoomState } from '../../../src/rooms/reclaim.js';
import type { Principal } from '../../../src/rooms/gateway.js';
import { db, fixture, hostCommand, prisma } from '../game-fixture.js';

afterAll(async () => { await db.close(); });
const config = readConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ROOM_TOKEN_SECRET: 'c'.repeat(64), PUBLIC_ORIGIN: 'http://127.0.0.1:4173' });
const seats = createSeatReclaim(prisma, config, () => new Set(), () => {});
const game = (room?: object) => parseDefinition({ formatVersion: 1, title: 'Room settings', startNodeKey: 'a', edges: [], ...(room ? { room } : {}),
  nodes: [{ key: 'a', stages: [{ key: 'q', kind: 'collect', prompt: 'Capital?', durationMs: 30_000, input: { kind: 'choice', options: [{ key: 'canberra', label: 'Canberra' }, { key: 'sydney', label: 'Sydney' }] }, scoring: { kind: 'correct-choice', correctChoiceKey: 'canberra', awardMilli: '10000' } }] }] });
type World = Awaited<ReturnType<typeof fixture>>;
const host = (f: World): Principal => ({ id: 'host', sessionId: f.sessionId, role: 'host', expiresAt: new Date(Date.now() + 60_000), actor: f.host, source: 'LOCAL_REHEARSAL' });
const state = async (f: World) => readRoomState((await prisma.gameSession.findUniqueOrThrow({ where: { id: f.sessionId } })).state);

describe('a game\'s own room settings', () => {
  it('are the room\'s starting values; the host changes them, and the round-closing rule only until the game starts', async () => {
    const f = await fixture(2, game({ showScores: false, reactionLimit: 4, breakPercent: 70, autoCloseSeconds: 8 }));
    expect(await state(f)).toMatchObject({ showScores: false, reactionLimit: 4, breakPercent: 70, autoClose: true, autoCloseSeconds: 8, reactions: true, gameLocks: ['autoClose', 'autoCloseSeconds'] });
    // In the lobby the host may still change everything.
    await seats.setSettings(f.sessionId, host(f), { autoCloseSeconds: 6 });
    await hostCommand(f, 'session.start');
    // Once started: other settings change, the closing rule does not (sending the same value is fine).
    await seats.setSettings(f.sessionId, host(f), { showScores: true });
    await seats.setSettings(f.sessionId, host(f), { autoCloseSeconds: 6 });
    await expect(seats.setSettings(f.sessionId, host(f), { autoCloseSeconds: 10 })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(seats.setSettings(f.sessionId, host(f), { autoClose: false, showScores: false })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(await state(f)).toMatchObject({ showScores: true, autoClose: true, autoCloseSeconds: 6 });
  });

  it('lock nothing when the game leaves the closing rule out', async () => {
    const f = await fixture(2, game({ showScores: false }));
    expect((await state(f)).gameLocks).toEqual([]);
    await hostCommand(f, 'session.start');
    await seats.setSettings(f.sessionId, host(f), { autoClose: false });
    expect((await state(f)).autoClose).toBe(false);
    const plain = await fixture(2, game());
    expect(await state(plain)).toMatchObject({ showScores: true, autoCloseSeconds: 3, gameLocks: [] });
  });
});
