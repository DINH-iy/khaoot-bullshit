import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

export const HEALTH_DAY_MS = 86_400_000;
const UPDATE_BATCH = 500;

export function roomUpdateFilters(sessionIds: string[], now: number) {
  const connected = { sessionId: { in: sessionIds }, publishedAt: null } satisfies Prisma.OutboxEventWhereInput;
  const retryable = { publishedAt: null, attempts: { gte: 5 }, OR: [
    { sessionId: { in: sessionIds } }, { session: { status: { not: 'FINISHED' } } },
  ] } satisfies Prisma.OutboxEventWhereInput;
  const obsolete = { publishedAt: null, createdAt: { lt: new Date(now - HEALTH_DAY_MS) },
    sessionId: { notIn: sessionIds }, session: { status: 'FINISHED' },
  } satisfies Prisma.OutboxEventWhereInput;
  return { connected, retryable, obsolete };
}

export function unreviewedProblems(now: number, checkedAt = now): Prisma.DeviceLogWhereInput {
  return { reviewedAt: null, createdAt: { gte: new Date(now - HEALTH_DAY_MS), lte: new Date(Math.min(now, checkedAt)) },
    OR: [{ source: 'SERVER' }, { reason: 'problem' }] };
}

export async function recoverRoomUpdates(client: PrismaClient, action: 'retry-updates' | 'clear-finished-updates', sessionIds: string[], now: number) {
  const filters = roomUpdateFilters(sessionIds, now);
  const where = action === 'retry-updates' ? filters.retryable : filters.obsolete;
  const batch = await client.outboxEvent.findMany({ where, select: { id: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: UPDATE_BATCH });
  if (!batch.length) return 0;
  const selected = { ...where, id: { in: batch.map(event => event.id) } };
  const result = action === 'retry-updates'
    ? await client.outboxEvent.updateMany({ where: selected, data: { attempts: 0, availableAt: new Date(now) } })
    : await client.outboxEvent.deleteMany({ where: selected });
  return result.count;
}
