import type { PrismaClient } from '../generated/prisma/client.js';
import { closeRoom } from './close.js';
import { lockRoom } from './gateway.js';
import { readRoomState } from './reclaim.js';

const BATCH_SIZE = 50;

/** Reconcile socket presence with persisted deadlines. Only the host or a player counts as presence. */
export async function reconcileEmptyRooms(client: PrismaClient, occupied: ReadonlySet<string>, hasPresence: (id: string) => boolean, now = new Date()) {
  if (occupied.size) await client.gameSession.updateMany({
    where: { id: { in: [...occupied] }, idleCloseAt: { not: null } }, data: { idleCloseAt: null },
  });
  const where = {
    arcadeRound: { is: null }, status: { not: 'FINISHED' as const }, roomCode: { not: null }, id: { notIn: [...occupied] },
  };
  const [due, unscheduled] = await Promise.all([
    client.gameSession.findMany({ where: { ...where, idleCloseAt: { lte: now } }, select: { id: true }, orderBy: { idleCloseAt: 'asc' }, take: BATCH_SIZE }),
    client.gameSession.findMany({ where: { ...where, idleCloseAt: null, AND: [
      { state: { path: ['idleCloseMinutes'], gt: 0 } }, { state: { path: ['keepOpen'], equals: false } },
    ] }, select: { id: true }, orderBy: { createdAt: 'asc' }, take: BATCH_SIZE }),
  ]);
  let closed = 0; let failed = 0;
  for (const candidate of [...due, ...unscheduled]) {
    try {
      if (await client.$transaction(async tx => {
        await lockRoom(tx, candidate.id);
        const room = await tx.gameSession.findUnique({ where: { id: candidate.id } });
        if (!room || room.status === 'FINISHED' || hasPresence(candidate.id)) return false;
        const state = readRoomState(room.state);
        if (!state.idleCloseMinutes || state.keepOpen) return false;
        if (room.idleCloseAt && room.idleCloseAt <= now) return closeRoom(tx, candidate.id, now);
        if (!room.idleCloseAt) await tx.gameSession.update({ where: { id: candidate.id }, data: { idleCloseAt: new Date(now.getTime() + state.idleCloseMinutes * 60_000) } });
        return false;
      })) closed++;
    } catch { failed++; }
  }
  return { closed, failed };
}
