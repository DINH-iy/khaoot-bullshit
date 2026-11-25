import type { FastifyInstance, FastifyRequest } from 'fastify';
import { gamePermissions, visibleTo, type EditorAccess } from './drafts.js';
import { CreateSavePointSchema, GameIdSchema, MAX_SAVE_POINTS, SavePointListSchema, SavePointSchema, SavePointSummarySchema } from '@party/contracts';
import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import type { OwnerAccess } from '../hosting/owner-access.js';
import { ownerCreator } from '../hosting/owner-creator.js';
import { RoomError, roomAssert } from '../rooms/security.js';
import { canonicalJson } from '../game/definition.js';

// Save points: copies of a game's whole draft, made on purpose in the editor, to go back to "in case something
// happens". A copy is taken from the saved draft on the server (never sent by the browser), and only when the
// person sees that same draft. Going back is done by the editor as an ordinary edit, so it is validated, saved,
// shared with the other editors and can be undone like any other edit. The owner and editors share them.
type Row = { id: string; name: string; automatic: boolean; savedBy: string | null; sceneCount: number; createdAt: Date };
const summary = (row: Row) => SavePointSummarySchema.parse({ id: row.id, name: row.name, automatic: row.automatic, savedBy: row.savedBy, sceneCount: row.sceneCount, createdAt: row.createdAt.toISOString() });
const fields = { id: true, name: true, automatic: true, savedBy: true, sceneCount: true, createdAt: true } as const;
const sceneCountOf = (definition: unknown) => { const nodes = (definition as { nodes?: unknown } | null)?.nodes; return Array.isArray(nodes) ? nodes.length : 0; };

export function registerSavePointRoutes(app: FastifyInstance, client: PrismaClient, owner: OwnerAccess) {
  const param = (request: FastifyRequest, name: 'gameId' | 'savePointId') => { const id = GameIdSchema.safeParse((request.params as Record<string, string | undefined>)[name]); roomAssert(id.success, 'INVALID_COMMAND'); return id.data; };
  /** The game, when it is one of the owner's games that is still in the list. */
  // Only a game this person may see (their own, shared with them, or any for the owner).
  // `need`: reading save points needs to see the game; making, removing or going back to one needs `game.savePoints`.
  const game = async (request: FastifyRequest, access: EditorAccess, need: 'view' | 'edit' = 'view') => {
    const gameId = param(request, 'gameId'); const creator = await ownerCreator(client);
    const found = await client.game.findFirst({ where: { id: gameId, creatorId: creator.id, archivedAt: null, draft: { isNot: null }, ...visibleTo(access) }, select: { id: true, authorPersonId: true } });
    if (found) roomAssert((await gamePermissions(client, found, access)).has(need === 'edit' ? 'game.savePoints' : 'game.view'), 'FORBIDDEN');
    roomAssert(found, 'NOT_FOUND'); return gameId;
  };

  app.get('/api/host/games/:gameId/save-points', async (request, reply) => {
    try {
      const access = await owner.requireEditor(request, 'edit'); const gameId = await game(request, access);
      const rows = await client.gameSavePoint.findMany({ where: { gameId }, orderBy: { createdAt: 'desc' }, take: MAX_SAVE_POINTS, select: fields });
      return { ok: true, data: SavePointListSchema.parse({ savePoints: rows.map(summary), limit: MAX_SAVE_POINTS }) };
    } catch (error) { return owner.fail(reply, error); }
  });
  app.get('/api/host/games/:gameId/save-points/:savePointId', async (request, reply) => {
    try {
      const access = await owner.requireEditor(request, 'edit'); const gameId = await game(request, access);
      const row = await client.gameSavePoint.findFirst({ where: { id: param(request, 'savePointId'), gameId } }); roomAssert(row, 'NOT_FOUND');
      return { ok: true, data: SavePointSchema.parse({ ...summary(row), definition: row.definition }) };
    } catch (error) { return owner.fail(reply, error); }
  });
  // Idempotent per savePointId: a retried click returns the same save point.
  app.post('/api/host/games/:gameId/save-points', async (request, reply) => {
    try {
      const access = await owner.requireEditor(request);
      const parsed = CreateSavePointSchema.safeParse(request.body); roomAssert(parsed.success, 'INVALID_COMMAND');
      const { savePointId, name, expectedRevision, automatic = false } = parsed.data; const gameId = await game(request, access, 'edit');
      const savedBy = access.personId ? (await client.person.findUnique({ where: { id: access.personId }, select: { name: true } }))?.name.slice(0, 80) ?? null : null;
      const row = await client.$transaction(async tx => {
        // One at a time per game, so the limit holds when two people save at once.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`save-point:${gameId}`}, 0))::text AS locked`;
        const existing = await tx.gameSavePoint.findUnique({ where: { id: savePointId }, select: { ...fields, gameId: true } });
        if (existing) { roomAssert(existing.gameId === gameId, 'NOT_FOUND'); return existing; }
        const draft = await tx.gameDraft.findUnique({ where: { gameId }, select: { revision: true, definition: true } }); roomAssert(draft, 'NOT_FOUND');
        // The draft changed since the person last saw it: they get the newer one first, then try again.
        roomAssert(draft.revision === expectedRevision, 'REVISION_CONFLICT');
        if (automatic) {
          // The copy kept before going back: only when the game holds work no save point has (else that save point is
          // returned, and nothing new is made), and only one at a time (it replaces the previous one), so going back
          // and forth never piles up save points.
          const now = canonicalJson(draft.definition);
          const points = await tx.gameSavePoint.findMany({ where: { gameId }, select: { ...fields, definition: true } });
          const same = points.find(point => canonicalJson(point.definition) === now);
          if (same) { const { definition: _definition, ...found } = same; return found; }
          await tx.gameSavePoint.deleteMany({ where: { gameId, automatic: true } });
        }
        if (await tx.gameSavePoint.count({ where: { gameId } }) >= MAX_SAVE_POINTS) {
          // Full: the oldest automatic one makes room for a new automatic one; save points people made are never removed by themselves.
          const oldest = automatic ? await tx.gameSavePoint.findFirst({ where: { gameId, automatic: true }, orderBy: { createdAt: 'asc' }, select: { id: true } }) : null;
          roomAssert(oldest, 'SAVE_POINT_LIMIT');
          await tx.gameSavePoint.delete({ where: { id: oldest.id } });
        }
        return tx.gameSavePoint.create({ data: { id: savePointId, gameId, name, automatic, savedBy, sceneCount: sceneCountOf(draft.definition), definition: draft.definition as Prisma.InputJsonValue }, select: fields });
      }).catch(async (error: unknown) => {
        // Two identical requests at once: the second finds the first one's save point.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const made = await client.gameSavePoint.findUniqueOrThrow({ where: { id: savePointId }, select: { ...fields, gameId: true } });
          roomAssert(made.gameId === gameId, 'NOT_FOUND'); return made;
        }
        throw error;
      });
      app.log.info({ event: 'save_point_made', automatic: row.automatic, scenes: row.sceneCount }, 'Save point made');
      return { ok: true, data: summary(row) };
    } catch (error) { return owner.fail(reply, error); }
  });
  app.post('/api/host/games/:gameId/save-points/:savePointId/delete', async (request, reply) => {
    try {
      const access = await owner.requireEditor(request); const gameId = await game(request, access, 'edit');
      const removed = await client.gameSavePoint.deleteMany({ where: { id: param(request, 'savePointId'), gameId } });
      if (removed.count !== 1) throw new RoomError('NOT_FOUND');
      return { ok: true, data: {} };
    } catch (error) { return owner.fail(reply, error); }
  });
}
