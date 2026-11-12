import { GameIdSchema, SessionViewSchema, SubmissionValueSchema, type SessionView } from '@party/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';
import { executionStages, parseDefinition } from './definition.js';
import { GameError, requireGame } from './errors.js';
import { actorKey, authorize, TrustedActorSchema, type TrustedActor } from './model.js';

export async function readSessionView(client: PrismaClient, trustedActor: TrustedActor, sessionId: string): Promise<SessionView> {
  try {
    const actor = TrustedActorSchema.safeParse(trustedActor);
    const id = GameIdSchema.safeParse(sessionId);
    requireGame(actor.success && id.success, 'FORBIDDEN');
    return await client.$transaction(async tx => {
      const session = await tx.gameSession.findUnique({ where: { id: id.data }, include: { gameVersion: true } });
      requireGame(session, 'NOT_FOUND');
      await authorize(tx, session, actor.data);
      const definition = parseDefinition(session.gameVersion.definition);
      const current = session.status === 'LOBBY' || session.status === 'FINISHED' ? null : await tx.stageRun.findFirst({ where: { sessionId: session.id }, orderBy: { number: 'desc' } });
      const entry = current ? executionStages(definition)[current.number - 1] : null;
      requireGame(!current || (entry && entry.nodeKey === current.nodeKey && entry.stage.key === current.stageKey), 'INVALID_STATE');
      const own = current && actor.data.role === 'player' ? await tx.submission.findUnique({ where: { stageRunId_actorKey_slotKey: { stageRunId: current.id, actorKey: actorKey(actor.data), slotKey: 'answer' } } }) : null;
      const totals = await tx.scoreEntry.groupBy({ by: ['recipientPlayerId'], where: { sessionId: session.id, stage: { status: 'CLOSED' } }, _sum: { amountMilli: true }, orderBy: { recipientPlayerId: 'asc' } });
      return SessionViewSchema.parse({ formatVersion: 1, sessionId: session.id, revision: session.revision, status: session.status, title: definition.title,
        stage: current && entry ? { id: current.id, nodeKey: current.nodeKey, stageKey: current.stageKey, kind: entry.stage.kind, prompt: entry.stage.prompt,
          input: entry.stage.kind === 'collect' ? entry.stage.input : null, status: current.status } : null,
        ownSubmission: own ? { id: own.id, value: SubmissionValueSchema.parse(own.value) } : null,
        standings: totals.filter(row => row.recipientPlayerId !== null).map(row => ({ playerId: row.recipientPlayerId!, amountMilli: (row._sum.amountMilli ?? 0n).toString() })),
      });
    }, { isolationLevel: 'RepeatableRead', maxWait: 2000, timeout: 5000 });
  } catch (error) { throw error instanceof GameError ? error : new GameError('GAME_UNAVAILABLE'); }
}
