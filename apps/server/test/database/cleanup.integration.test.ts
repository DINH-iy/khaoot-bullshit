import { mkdtemp, mkdir, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseDefinition } from '../../src/game/definition.js';
import { cleanUpMedia } from '../../src/assets/cleanup.js';
import { db, fixture, hostCommand, prisma } from './game-fixture.js';

afterAll(async () => { await db.close(); });
const game = parseDefinition({ formatVersion: 1, title: 'Pics', startNodeKey: 'a', edges: [],
  nodes: [{ key: 'a', stages: [{ key: 'b', kind: 'collect', prompt: 'Draw', durationMs: null, input: { kind: 'drawing', maxStrokes: 10 }, scoring: { kind: 'none' } }] }] });
const HOUR = 60 * 60 * 1000;

describe('media clean-up', () => {
  it('deletes the files of long-finished rooms, unused uploads and pictures, and crash leftovers; keeps what is in use', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'party-cleanup-'));
    try {
      const f = await fixture(2, game); const stageRunId = (await hostCommand(f, 'session.start')).stageRunId!;
      const old = new Date(Date.now() - 2 * HOUR);
      const stored = async (playerIndex: number, data: { stageRunId: string | null; submissionId?: string }) => {
        const asset = await prisma.asset.create({ data: { sessionId: f.sessionId, playerId: f.players[playerIndex]!.id, stageRunId: data.stageRunId, submissionId: data.submissionId ?? null, kind: 'DRAWING', purpose: data.stageRunId ? 'ANSWER' : 'AVATAR', contentType: 'application/json', byteSize: 2, sha256: '0'.repeat(64), createdAt: old } });
        await mkdir(join(directory, f.sessionId), { recursive: true }); await writeFile(join(directory, f.sessionId, asset.id), '{}'); return asset;
      };
      const answered = await prisma.submission.create({ data: { sessionId: f.sessionId, stageRunId, actorKey: `player:${f.players[0]!.id}`, playerId: f.players[0]!.id, value: { kind: 'text', text: 'x' } } });
      const handedIn = await stored(0, { stageRunId, submissionId: answered.id });
      const abandoned = await stored(1, { stageRunId });
      const inUse = await stored(0, { stageRunId: null }); const replaced = await stored(1, { stageRunId: null });
      await prisma.sessionPlayer.update({ where: { id: f.players[0]!.id }, data: { look: { color: 0, body: 'cat', eyes: 'dots', mouth: 'smile', hat: 'none', extra: 'none', picture: { assetId: inUse.id, kind: 'drawing' } } } });
      const partial = join(directory, f.sessionId, 'crashed.part'); await writeFile(partial, 'x'); await utimes(partial, old, old);
      const fresh = join(directory, f.sessionId, 'uploading.part'); await writeFile(fresh, 'x');
      const files = async () => (await readdir(join(directory, f.sessionId))).sort();
      // Each run is a small batch; repeat until there is nothing left to do (other rooms may be waiting too).
      const settle = async () => { for (let run = 0; run < 100; run++) if (!(await cleanUpMedia(prisma, directory, new Date(), 14)).removed) return; };

      // While the round is open, an unsent drawing may still be handed in: it stays.
      // (Counts are not checked: the test database also holds rooms of earlier test runs.)
      await settle(); // only the picture no longer used goes
      expect(await files()).toEqual([abandoned.id, handedIn.id, inUse.id, 'uploading.part'].sort()); // a fresh upload in progress stays
      expect((await prisma.asset.findUniqueOrThrow({ where: { id: replaced.id } })).removedAt).not.toBeNull();

      // Once the round is over, the abandoned drawing goes; handed-in answers and the picture in use stay.
      await hostCommand(f, 'stage.close', { stageRunId });
      await settle();
      expect(await files()).toEqual([handedIn.id, inUse.id, 'uploading.part'].sort());

      // After the retention period everything of the room goes; the rows stay, marked.
      await prisma.$executeRaw`UPDATE game_sessions SET "updatedAt" = now() - interval '15 days' WHERE id = ${f.sessionId}::uuid`;
      await settle();
      expect(await files()).toEqual(['uploading.part']);
      expect(await prisma.asset.count({ where: { sessionId: f.sessionId, removedAt: null } })).toBe(0);
      expect(await prisma.asset.count({ where: { sessionId: f.sessionId } })).toBe(4);
      // Running again changes nothing for this room.
      await settle();
      expect(await prisma.asset.count({ where: { sessionId: f.sessionId } })).toBe(4);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
