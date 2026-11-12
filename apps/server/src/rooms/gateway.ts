import { randomInt } from 'node:crypto';
import { GameIdSchema, JoinRoomSchema, type Identity } from '@party/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { Config } from '../config.js';
import { createGameService } from '../game/service.js';
import { authorize } from '../game/model.js';
import type { TrustedActor, Transaction } from '../game/model.js';
import { assertExecutable, contentHash, parseDefinition } from '../game/definition.js';
import { cookieToken, joinToken, roomAssert, tokenHash } from './security.js';

export interface Principal { id: string; sessionId: string; role: 'host' | 'player' | 'display'; expiresAt: Date; actor: TrustedActor; source: 'OIDC' | 'LOCAL_REHEARSAL' }
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const makeRoomCode = () => Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
export async function lockRoom(tx: Transaction, sessionId: string) {
  await tx.$executeRaw`SET LOCAL lock_timeout = '1500ms'`;
  await tx.$executeRaw`SET LOCAL statement_timeout = '2500ms'`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${sessionId}, 0))::text AS locked`;
}
export async function recordRoomChange(tx: Transaction, sessionId: string, kind: string) {
  const session = await tx.gameSession.update({ where: { id: sessionId }, data: { revision: { increment: 1 } } });
  await tx.auditEvent.create({ data: { sessionId, revision: session.revision, kind, details: {} } });
  const payload = { formatVersion: 1, type: 'session.changed', sessionId, revision: session.revision };
  await tx.outboxEvent.createMany({ data: [
    { sessionId, revision: session.revision, audience: 'HOST', audienceKey: 'host', type: payload.type, payload },
    { sessionId, revision: session.revision, audience: 'DISPLAY', audienceKey: 'display', type: payload.type, payload },
    { sessionId, revision: session.revision, audience: 'PLAYER', audienceKey: 'players', type: payload.type, payload },
  ] });
}

export function createRoomGateway(client: PrismaClient, config: Config) {
  return {
    async authenticate(sessionId: string, cookie?: string, display = false): Promise<Principal> {
      roomAssert(GameIdSchema.safeParse(sessionId).success, 'UNAUTHORIZED');
      const token = cookieToken(cookie, sessionId, display);
      roomAssert(token, 'UNAUTHORIZED'); const hash = tokenHash(token);
      const credential = await client.roomCredential.findUnique({ where: { tokenHash: hash }, include: { session: true } });
      if (credential) {
        roomAssert(credential.sessionId === sessionId && !credential.revokedAt, 'UNAUTHORIZED');
        roomAssert(credential.expiresAt.getTime() > Date.now(), 'CREDENTIAL_EXPIRED');
        roomAssert(config.NODE_ENV !== 'production' || credential.source !== 'LOCAL_REHEARSAL', 'UNAUTHORIZED');
        const proof = { kind: 'room' as const, id: credential.id, tokenHash: hash };
        return { id: credential.id, sessionId, role: credential.role === 'HOST' ? 'host' : 'display', source: credential.source, expiresAt: credential.expiresAt,
          actor: credential.role === 'HOST' ? { role: 'host', creatorId: credential.session.hostId, credentialProof: proof } : { role: 'display', sessionId, credentialProof: proof } };
      }
      const player = await client.playerCredential.findUnique({ where: { tokenHash: hash }, include: { player: { include: { session: true } } } });
      roomAssert(player && player.sessionId === sessionId && !player.revokedAt && !player.player.leftAt, 'UNAUTHORIZED');
      roomAssert(player.expiresAt.getTime() > Date.now(), 'CREDENTIAL_EXPIRED');
      // A local rehearsal is not usable as production guest admission either.
      roomAssert(config.NODE_ENV !== 'production' || player.player.session.mode !== 'REHEARSAL', 'UNAUTHORIZED');
      return { id: player.id, sessionId, role: 'player', source: 'OIDC', expiresAt: player.expiresAt,
        actor: { role: 'player', playerId: player.playerId, credentialProof: { kind: 'player', id: player.id, tokenHash: hash } } };
    },
    async claim(sessionId: string, token: string) {
      const credential = await client.roomCredential.findUnique({ where: { tokenHash: tokenHash(token) } });
      roomAssert(credential && credential.sessionId === sessionId && !credential.revokedAt, 'UNAUTHORIZED');
      roomAssert(credential.expiresAt.getTime() > Date.now(), 'CREDENTIAL_EXPIRED');
      roomAssert(config.NODE_ENV !== 'production' || credential.source !== 'LOCAL_REHEARSAL', 'UNAUTHORIZED');
      return { expiresAt: credential.expiresAt, display: credential.role === 'DISPLAY' };
    },
    async join(input: unknown) {
      const parsed = JoinRoomSchema.safeParse(input); roomAssert(parsed.success, 'INVALID_COMMAND');
      roomAssert(config.ROOM_TOKEN_SECRET, 'AUTH_UNAVAILABLE'); const data = parsed.data;
      const room = await client.gameSession.findUnique({ where: { roomCode: data.roomCode }, select: { id: true } });
      roomAssert(room, 'ROOM_NOT_AVAILABLE');
      const token = joinToken(config.ROOM_TOKEN_SECRET, room.id, data.joinId);
      return client.$transaction(async tx => {
        await lockRoom(tx, room.id);
        const current = await tx.gameSession.findUniqueOrThrow({ where: { id: room.id } });
        roomAssert(current.status !== 'FINISHED' && (config.NODE_ENV !== 'production' || current.mode !== 'REHEARSAL'), 'ROOM_NOT_AVAILABLE');
        const joinKeyHash = tokenHash(`${room.id}:${data.joinId}`);
        const existing = await tx.sessionPlayer.findUnique({ where: { joinKeyHash } });
        if (existing) {
          const credential = await tx.playerCredential.findUnique({ where: { tokenHash: tokenHash(token) } });
          roomAssert(credential && !credential.revokedAt && !existing.leftAt, 'UNAUTHORIZED');
          roomAssert(credential.expiresAt.getTime() > Date.now(), 'CREDENTIAL_EXPIRED');
          return { sessionId: room.id, token, expiresAt: credential.expiresAt };
        }
        const player = await tx.sessionPlayer.create({ data: { sessionId: room.id, displayName: data.displayName, joinKeyHash } });
        const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000);
        await tx.playerCredential.create({ data: { sessionId: room.id, playerId: player.id, tokenHash: tokenHash(token), expiresAt } });
        await recordRoomChange(tx, room.id, 'player.joined');
        return { sessionId: room.id, token, expiresAt };
      });
    },
    async create(identity: Identity, gameVersionId: string, sessionId: string, commandId: string) {
      roomAssert(config.AUTH_ISSUER && identity.scopes.includes('games:write'), 'FORBIDDEN');
      const creator = await client.creator.findUnique({ where: { issuer_subject: { issuer: config.AUTH_ISSUER, subject: identity.subject } } });
      roomAssert(creator, 'FORBIDDEN');
      const version = await client.gameVersion.findUnique({ where: { id: gameVersionId }, include: { game: true } });
      roomAssert(version && version.game.creatorId === creator.id && !version.game.archivedAt, 'FORBIDDEN');
      const definition = parseDefinition(version.definition); assertExecutable(definition);
      roomAssert(contentHash(definition) === version.contentHash, 'INVALID_DEFINITION');
      roomAssert(config.ROOM_TOKEN_SECRET, 'AUTH_UNAVAILABLE');
      const token = joinToken(config.ROOM_TOKEN_SECRET, sessionId, `host:${creator.id}:${commandId}`); const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await createGameService(client).execute({ role: 'host', creatorId: creator.id }, { formatVersion: 1, type: 'session.create', sessionId, commandId, expectedRevision: 0, mode: 'LIVE', gameVersionId });
      // Failed provisioning leaves an inaccessible lobby, never a false success.
      return client.$transaction(async tx => {
        await lockRoom(tx, sessionId);
        const previous = await tx.roomCredential.findUnique({ where: { tokenHash: tokenHash(token) } });
        if (previous) { roomAssert(!previous.revokedAt && previous.expiresAt.getTime() > Date.now(), 'UNAUTHORIZED'); return { sessionId, token, expiresAt: previous.expiresAt }; }
        await tx.gameSession.update({ where: { id: sessionId }, data: { roomCode: makeRoomCode() } });
        await tx.roomCredential.create({ data: { sessionId, role: 'HOST', tokenHash: tokenHash(token), expiresAt } });
        return { sessionId, token, expiresAt };
      });
    },
    async revoke(sessionId: string, principal: Principal, playerId?: string) {
      await client.$transaction(async tx => {
        await lockRoom(tx, sessionId);
        // Re-check the requesting credential while holding the command lock.
        const session = await tx.gameSession.findUniqueOrThrow({ where: { id: sessionId } });
        await authorize(tx, session, principal.actor);
        if (playerId) {
          roomAssert(principal.role === 'host', 'FORBIDDEN');
          await tx.playerCredential.updateMany({ where: { sessionId, playerId }, data: { revokedAt: new Date() } });
          await tx.sessionPlayer.updateMany({ where: { id: playerId, sessionId }, data: { leftAt: new Date() } });
        } else if (principal.role === 'player') await tx.playerCredential.update({ where: { id: principal.id }, data: { revokedAt: new Date() } });
        else await tx.roomCredential.update({ where: { id: principal.id }, data: { revokedAt: new Date() } });
        await recordRoomChange(tx, sessionId, playerId ? 'player.revoked' : 'credential.revoked');
      });
    },
  };
}
