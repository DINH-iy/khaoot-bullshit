import type { FastifyInstance, FastifyRequest } from 'fastify';
import { FeedbackListSchema, FeedbackUpdateSchema, GameIdSchema, NewFeedbackSchema, type FeedbackItem } from '@party/contracts';
import type { Config } from '../config.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { FeedbackItem as FeedbackRow } from '../generated/prisma/client.js';
import type { OwnerAccess } from '../hosting/owner-access.js';
import { allowedOrigin, RateLimiter, roomAssert } from '../rooms/security.js';

/** Past this many unhandled reports new ones are refused, so a flood cannot fill the disk. */
const MAX_OPEN_REPORTS = 5000;
const LIST_LIMIT = 500;

const toItem = (row: FeedbackRow): FeedbackItem => ({
  id: row.id, kind: row.kind.toLowerCase() as FeedbackItem['kind'], status: row.status.toLowerCase() as FeedbackItem['status'],
  title: row.title, details: row.details, reporterName: row.reporterName, context: row.context as FeedbackItem['context'],
  ownerNote: row.ownerNote, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});
const upper = <T extends string>(value: T) => value.toUpperCase() as Uppercase<T>;

export function registerFeedbackRoutes(app: FastifyInstance, client: PrismaClient, config: Config, owner: OwnerAccess) {
  const limiter = new RateLimiter(2048);
  // Anyone trying the test version can send a report: players have no account.
  // Testers behind one tunnel or router share an address, so the limits are generous.
  app.post('/api/feedback', { bodyLimit: 32 * 1024 }, async (request, reply) => {
    try {
      roomAssert(request.headers['x-party-request'] === '1' && allowedOrigin(request.headers, config), 'ORIGIN_REJECTED');
      roomAssert(limiter.allow(`feedback:${request.ip}`, 30) && limiter.allow(`feedback-hour:${request.ip}`, 200, 3_600_000), 'RATE_LIMITED');
      const parsed = NewFeedbackSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      roomAssert(await client.feedbackItem.count({ where: { status: 'NEW' } }) < MAX_OPEN_REPORTS, 'STORAGE_FULL');
      const { id, kind, title, details, reporterName, context } = parsed.data;
      // A retried send (same id) is stored once and never overwrites the first.
      await client.feedbackItem.createMany({ data: [{ id, kind: upper(kind), title, details, reporterName: reporterName || null, context }], skipDuplicates: true });
      app.log.info({ event: 'feedback_received', kind }, 'Feedback received');
      return { ok: true, data: { id } };
    } catch (error) { return owner.fail(reply, error); }
  });

  // Reading and managing reports is for the owner only (cookie scoped to /api/host).
  const idParam = (request: FastifyRequest) => { const id = GameIdSchema.safeParse((request.params as { id?: string }).id); roomAssert(id.success, 'INVALID_COMMAND'); return id.data; };
  app.get('/api/host/feedback', async (request, reply) => {
    try {
      owner.requireOwner(request);
      const rows = await client.feedbackItem.findMany({ orderBy: { createdAt: 'desc' }, take: LIST_LIMIT });
      return { ok: true, data: FeedbackListSchema.parse({ items: rows.map(toItem) }) };
    } catch (error) { return owner.fail(reply, error); }
  });
  app.put('/api/host/feedback/:id', async (request, reply) => {
    try {
      owner.requireOwner(request);
      const id = idParam(request); const parsed = FeedbackUpdateSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      const { kind, status, ownerNote } = parsed.data;
      const changed = await client.feedbackItem.updateMany({ where: { id }, data: {
        ...(kind ? { kind: upper(kind) } : {}), ...(status ? { status: upper(status) } : {}), ...(ownerNote !== undefined ? { ownerNote: ownerNote || null } : {}),
      } });
      roomAssert(changed.count === 1, 'NOT_FOUND');
      return { ok: true, data: toItem(await client.feedbackItem.findUniqueOrThrow({ where: { id } })) };
    } catch (error) { return owner.fail(reply, error); }
  });
  app.post('/api/host/feedback/:id/delete', async (request, reply) => {
    try {
      owner.requireOwner(request);
      const removed = await client.feedbackItem.deleteMany({ where: { id: idParam(request) } });
      roomAssert(removed.count === 1, 'NOT_FOUND');
      return { ok: true, data: {} };
    } catch (error) { return owner.fail(reply, error); }
  });
}
