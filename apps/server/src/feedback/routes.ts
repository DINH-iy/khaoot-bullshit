import type { FastifyInstance, FastifyRequest } from 'fastify';
import { recordAction } from '../admin/actions.js';
import { FEEDBACK_BASE64_MAX, FEEDBACK_IMAGE_MAX, FEEDBACK_VIDEO_MAX, FeedbackAttachmentTypeSchema, FeedbackListSchema, FeedbackMarkDoneSchema, FeedbackUpdateSchema, GameIdSchema, NewFeedbackSchema, type FeedbackItem } from '@party/contracts';
import type { Config } from '../config.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { sniffMedia } from '../assets/media.js';
import type { FeedbackItem as FeedbackRow } from '../generated/prisma/client.js';
import type { OwnerAccess } from '../hosting/owner-access.js';
import { allowedOrigin, RateLimiter, roomAssert } from '../rooms/security.js';

/** Past this many unhandled reports new ones are refused, so a flood cannot fill the disk. */
const MAX_OPEN_REPORTS = 5000;
const LIST_LIMIT = 500;
const MAX_ATTACHMENTS = 80;
const attachmentMetadata = { attachment: { select: { contentType: true } } } as const;

const toItem = (row: FeedbackRow & { attachment: { contentType: string } | null }): FeedbackItem => ({
  id: row.id, kind: row.kind.toLowerCase() as FeedbackItem['kind'], status: row.status.toLowerCase() as FeedbackItem['status'],
  title: row.title, details: row.details, reporterName: row.reporterName, context: row.context as FeedbackItem['context'],
  ownerNote: row.ownerNote, attachmentType: row.attachment ? FeedbackAttachmentTypeSchema.parse(row.attachment.contentType) : null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});
const upper = <T extends string>(value: T) => value.toUpperCase() as Uppercase<T>;

export function registerFeedbackRoutes(app: FastifyInstance, client: PrismaClient, config: Config, owner: OwnerAccess) {
  const limiter = new RateLimiter(2048);
  // Anyone trying the test version can send a report: players have no account.
  // Testers behind one tunnel or router share an address, so the limits are generous.
  app.post('/api/feedback', {
    bodyLimit: FEEDBACK_BASE64_MAX + 32 * 1024,
    onRequest: async (request, reply) => {
      try {
        roomAssert(request.headers['x-party-request'] === '1' && allowedOrigin(request.headers, config), 'ORIGIN_REJECTED');
        roomAssert(limiter.allow(`feedback:${request.ip}`, 30) && limiter.allow(`feedback-hour:${request.ip}`, 200, 3_600_000), 'RATE_LIMITED');
      } catch (error) { return owner.fail(reply, error); }
    },
  }, async (request, reply) => {
    try {
      const parsed = NewFeedbackSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      const { id, kind, title, details, reporterName, context, attachment } = parsed.data;
      const entry = { id, kind: upper(kind), title, details, reporterName: reporterName || null, context };
      if (attachment) {
        const data = Buffer.from(attachment, 'base64');
        const detected = FeedbackAttachmentTypeSchema.safeParse(sniffMedia(data.subarray(0, 64))?.contentType);
        roomAssert(detected.success, 'UNSUPPORTED_MEDIA');
        roomAssert(data.length <= (detected.data.startsWith('image/') ? FEEDBACK_IMAGE_MAX : FEEDBACK_VIDEO_MAX), 'FILE_TOO_LARGE');
        await client.$transaction(async tx => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('feedback-attachments', 0))::text AS locked`;
          if (await tx.feedbackItem.findUnique({ where: { id }, select: { id: true } })) return;
          roomAssert(await tx.feedbackItem.count({ where: { status: 'NEW' } }) < MAX_OPEN_REPORTS, 'STORAGE_FULL');
          roomAssert(await tx.feedbackAttachment.count() < MAX_ATTACHMENTS, 'STORAGE_FULL');
          const saved = await tx.feedbackItem.createMany({ data: [entry], skipDuplicates: true });
          if (saved.count) await tx.feedbackAttachment.create({ data: { feedbackId: id, contentType: detected.data, data } });
        });
      } else {
        roomAssert(await client.feedbackItem.count({ where: { status: 'NEW' } }) < MAX_OPEN_REPORTS, 'STORAGE_FULL');
        // A retried send (same id) is stored once and never overwrites the first.
        await client.feedbackItem.createMany({ data: [entry], skipDuplicates: true });
      }
      app.log.info({ event: 'feedback_received', kind }, 'Feedback received');
      return { ok: true, data: { id } };
    } catch (error) { return owner.fail(reply, error); }
  });

  // Reading and managing reports is for the owner only (cookie scoped to /api/host).
  const idParam = (request: FastifyRequest) => { const id = GameIdSchema.safeParse((request.params as { id?: string }).id); roomAssert(id.success, 'INVALID_COMMAND'); return id.data; };
  app.get('/api/host/feedback/:id/attachment', async (request, reply) => {
    try {
      owner.requireOwner(request);
      const attachment = await client.feedbackAttachment.findUnique({ where: { feedbackId: idParam(request) } });
      roomAssert(attachment, 'NOT_FOUND');
      return reply.headers({
        'content-type': attachment.contentType, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
        'content-security-policy': "sandbox; default-src 'none'", 'cross-origin-resource-policy': 'same-origin',
      }).send(Buffer.from(attachment.data));
    } catch (error) { return owner.fail(reply, error); }
  });
  app.get('/api/host/feedback', async (request, reply) => {
    try {
      owner.requireOwner(request);
      const rows = await client.feedbackItem.findMany({ orderBy: { createdAt: 'desc' }, take: LIST_LIMIT, include: attachmentMetadata });
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
      return { ok: true, data: toItem(await client.feedbackItem.findUniqueOrThrow({ where: { id }, include: attachmentMetadata })) };
    } catch (error) { return owner.fail(reply, error); }
  });
  // Everything the owner's filters show becomes Done in one statement; ids that are gone or already done are skipped.
  app.post('/api/host/feedback/mark-done', async (request, reply) => {
    try {
      owner.requireOwner(request);
      const parsed = FeedbackMarkDoneSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      const changed = await client.feedbackItem.updateMany({ where: { id: { in: parsed.data.ids }, status: { not: 'DONE' } }, data: { status: 'DONE' } });
      return { ok: true, data: { changed: changed.count } };
    } catch (error) { return owner.fail(reply, error); }
  });
  app.post('/api/host/feedback/:id/delete', async (request, reply) => {
    try {
      owner.requireOwner(request); const id = idParam(request);
      const title = (await client.feedbackItem.findUnique({ where: { id }, select: { title: true } }))?.title ?? 'Feedback';
      const removed = await client.feedbackItem.deleteMany({ where: { id } });
      roomAssert(removed.count === 1, 'NOT_FOUND');
      await recordAction(client, { personId: null }, 'feedback.deleted', title);
      return { ok: true, data: {} };
    } catch (error) { return owner.fail(reply, error); }
  });
}
