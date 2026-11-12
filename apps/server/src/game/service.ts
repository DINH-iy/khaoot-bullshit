import { performance } from 'node:perf_hooks';
import { CommandReceiptSchema, GameCommandSchema, PLAYER_COMMANDS, SessionChangedSchema, type CommandReceipt, type GameErrorCode } from '@party/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';
import { applyCommand } from './commands.js';
import { assertExecutable, contentHash, parseDefinition } from './definition.js';
import { GameError, requireGame } from './errors.js';
import type { Clock } from './timing.js';
import { actorKey, authorize, checkRevision, requireHost, TrustedActorSchema, type TrustedActor } from './model.js';

export interface CommandObservation { type: string; outcome: 'COMMITTED' | 'REPLAYED' | GameErrorCode; durationMs: number }

export function createGameService(client: PrismaClient, observe?: (event: CommandObservation) => void, clock: Clock = () => new Date()) {
  return {
    async execute(trustedActor: TrustedActor, input: unknown): Promise<CommandReceipt> {
      const start = performance.now();
      // Receipt time decides deadlines; lock or database delay never makes an on-time answer late.
      const receivedAt = clock();
      let type = 'invalid';
      let outcome: CommandObservation['outcome'] = 'GAME_UNAVAILABLE';
      try {
        const parsed = GameCommandSchema.safeParse(input);
        requireGame(parsed.success, 'INVALID_COMMAND');
        const actor = TrustedActorSchema.safeParse(trustedActor);
        requireGame(actor.success, 'FORBIDDEN');
        const command = parsed.data;
        type = command.type;
        const key = actorKey(actor.data);
        const requestHash = contentHash(command);
        const committed = await client.$transaction(async tx => {
          await tx.$executeRaw`SET LOCAL lock_timeout = '1500ms'`;
          await tx.$executeRaw`SET LOCAL statement_timeout = '2500ms'`;
          // One DB-owned lock for every command writer, including creation before
          // a session row exists. Hash collisions only serialize unrelated rooms.
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${command.sessionId}, 0))::text AS locked`;
          let session = await tx.gameSession.findUnique({ where: { id: command.sessionId }, include: { gameVersion: true } });
          const creating = !session;
          if (!session) {
            requireGame(command.type === 'session.create', 'NOT_FOUND');
            requireHost(actor.data);
            requireGame(actor.data.role === 'host', 'FORBIDDEN');
            const version = await tx.gameVersion.findUnique({ where: { id: command.gameVersionId }, include: { game: true } });
            requireGame(version && version.game.creatorId === actor.data.creatorId && !version.game.archivedAt, 'FORBIDDEN');
            const definition = parseDefinition(version.definition);
            requireGame(version.definitionFormat === definition.formatVersion && contentHash(definition) === version.contentHash, 'INVALID_DEFINITION');
            assertExecutable(definition);
            session = await tx.gameSession.create({ data: { id: command.sessionId, gameVersionId: version.id, hostId: actor.data.creatorId, mode: command.mode }, include: { gameVersion: true } });
          }
          await authorize(tx, session, actor.data);
          if (!PLAYER_COMMANDS.includes(command.type)) requireHost(actor.data);
          const previous = await tx.gameCommand.findUnique({ where: { sessionId_actorKey_commandKey: { sessionId: session.id, actorKey: key, commandKey: command.commandId } } });
          if (previous) {
            requireGame(previous.requestHash === requestHash, 'COMMAND_KEY_REUSED');
            return { receipt: CommandReceiptSchema.parse(previous.result), replayed: true };
          }
          requireGame(command.type !== 'session.create' || creating, 'INVALID_STATE');
          checkRevision(session, command);
          const definition = parseDefinition(session.gameVersion.definition);
          requireGame(session.gameVersion.definitionFormat === definition.formatVersion && contentHash(definition) === session.gameVersion.contentHash, 'INVALID_DEFINITION');
          assertExecutable(definition);
          const effect = await applyCommand(tx, session, definition, actor.data, command, receivedAt);
          const revision = session.revision + 1;
          const result = CommandReceiptSchema.parse({ formatVersion: 1, commandId: command.commandId, sessionId: session.id, revision, type: command.type, stageRunId: effect.stageRunId, submissionId: effect.submissionId });
          const saved = await tx.gameCommand.create({ data: { sessionId: session.id, commandKey: command.commandId, actorKey: key, type, requestHash, result } });
          if (effect.judgments?.length) await tx.stageJudgment.createMany({ data: effect.judgments.map(judgment => ({ ...judgment, sessionId: session.id, commandId: saved.id })) });
          // The route outcome references this command; the database allows exactly one per route run.
          if (effect.decision) await tx.routeDecision.create({ data: { ...effect.decision, voteSnapshot: effect.decision.voteSnapshot, sessionId: session.id, commandId: saved.id } });
          if (effect.awards?.length) await tx.scoreEntry.createMany({ data: effect.awards.map(award => ({ sessionId: session.id, commandId: saved.id,
            recipientPlayerId: award.playerId ?? null, recipientTeamId: award.teamId ?? null, lineupId: award.lineupId ?? null,
            stageRunId: award.stageRunId, amountMilli: award.amountMilli, awardKey: award.awardKey, reason: award.reason, kind: award.kind ?? 'AWARD' })) });
          await tx.gameSession.update({ where: { id: session.id }, data: { revision } });
          // Audit stores references, not jokes, answers or correct-choice data.
          await tx.auditEvent.create({ data: { sessionId: session.id, commandId: saved.id, revision, kind: type, details: { stageRunId: effect.stageRunId, submissionId: effect.submissionId, ...(effect.decision ? { routeDecision: { optionKey: effect.decision.voteSnapshot.optionKey, reason: effect.decision.reason } } : {}) } } });
          const changed = SessionChangedSchema.parse({ formatVersion: 1, type: 'session.changed', sessionId: session.id, revision });
          await tx.outboxEvent.createMany({ data: [
            { sessionId: session.id, revision, eventIndex: 0, audience: 'HOST', audienceKey: 'host', type: changed.type, payload: changed },
            { sessionId: session.id, revision, eventIndex: 1, audience: 'DISPLAY', audienceKey: 'display', type: changed.type, payload: changed },
            { sessionId: session.id, revision, eventIndex: 2, audience: 'PLAYER', audienceKey: 'players', type: changed.type, payload: changed },
            ...(actor.data.role === 'player' ? [{ sessionId: session.id, revision, eventIndex: 3, audience: 'PLAYER' as const, audienceKey: key, type: 'submission.saved', payload: result }] : []),
          ] });
          return { receipt: result, replayed: false };
        }, { isolationLevel: 'ReadCommitted', maxWait: 2000, timeout: 5000 });
        outcome = committed.replayed ? 'REPLAYED' : 'COMMITTED';
        return committed.receipt;
      } catch (error) {
        const safe = error instanceof GameError ? error : new GameError('GAME_UNAVAILABLE');
        outcome = safe.code;
        throw safe;
      } finally {
        // A telemetry outage must not turn an already committed action into an
        // apparent failure. Observers receive no submitted values or credentials.
        try { observe?.({ type, outcome, durationMs: performance.now() - start }); } catch { /* isolated observer */ }
      }
    },
  };
}
