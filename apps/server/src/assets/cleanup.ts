import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { PlayerLookSchema } from '@party/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';
import { assetPath } from './media.js';

const HOUR = 60 * 60 * 1000; const DAY = 24 * HOUR;
/** Work per run stays small, so the clean-up never competes with a running game. */
const BATCH = 200;

/**
 * Deletes stored files that are no longer needed, keeping the database rows
 * (marked `removedAt`) for history:
 * - everything of a room that ended, or was last used, more than the retention period ago;
 * - uploads and drawings never handed in (replaced, abandoned, unused relay turns), once their round is over;
 * - pictures a player no longer uses;
 * - half-written files left by a crash.
 * Safe to run at any time and to repeat; a missing file counts as removed.
 */
export async function cleanUpMedia(client: PrismaClient, directory: string, now: Date, retentionDays: number): Promise<{ removed: number; partials: number }> {
  const expired = new Date(now.getTime() - retentionDays * DAY); const settled = new Date(now.getTime() - HOUR);
  // Rooms that still have files, then those of them that are long over.
  const stored = await client.asset.groupBy({ by: ['sessionId'], where: { removedAt: null }, orderBy: { sessionId: 'asc' }, take: 1000 });
  const over = await client.gameSession.findMany({ where: { id: { in: stored.map(row => row.sessionId) }, OR: [{ endedAt: { lt: expired } }, { updatedAt: { lt: expired } }] }, select: { id: true } });
  const old = over.length ? await client.asset.findMany({ where: { removedAt: null, sessionId: { in: over.map(room => room.id) } }, select: { id: true, sessionId: true }, take: BATCH }) : [];
  const orphans = old.length >= BATCH ? [] : await client.asset.findMany({
    where: { removedAt: null, purpose: 'ANSWER', submissionId: null, createdAt: { lt: settled }, stage: { status: { not: 'ACTIVE' } } }, select: { id: true, sessionId: true }, take: BATCH - old.length });
  const pictures = old.length + orphans.length >= BATCH ? [] : await client.asset.findMany({
    where: { removedAt: null, purpose: 'AVATAR', createdAt: { lt: settled } }, select: { id: true, sessionId: true, player: { select: { look: true } } }, orderBy: { createdAt: 'asc' }, take: 1000 });
  const unused = pictures.filter(asset => { const look = PlayerLookSchema.safeParse(asset.player.look); return !(look.success && look.data.picture?.assetId === asset.id); })
    .slice(0, BATCH - old.length - orphans.length);
  let removed = 0;
  for (const asset of [...old, ...orphans, ...unused]) {
    // The file goes first: a row marked removed never points at a file that still exists.
    await rm(assetPath(directory, asset.sessionId, asset.id), { force: true });
    await client.asset.update({ where: { id: asset.id }, data: { removedAt: now } }); removed++;
  }
  return { removed, partials: await removePartials(directory, now) };
}

/** Upload files that were never finished (".part"), older than an hour. */
async function removePartials(directory: string, now: Date): Promise<number> {
  let count = 0;
  const folders = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const folder of folders.filter(entry => entry.isDirectory()).slice(0, 500)) {
    const files = await readdir(join(directory, folder.name)).catch(() => [] as string[]);
    for (const file of files.filter(name => name.endsWith('.part'))) {
      const path = join(directory, folder.name, file); const info = await stat(path).catch(() => null);
      if (info && now.getTime() - info.mtimeMs > HOUR) { await rm(path, { force: true }); count++; }
    }
  }
  return count;
}
