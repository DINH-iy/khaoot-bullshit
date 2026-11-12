import { z } from 'zod';
import { GameIdSchema, type GameCommand } from '@party/contracts';
import type { Prisma, GameSession } from '../generated/prisma/client.js';
import { requireGame } from './errors.js';

// Internal authorization context ONLY. A future credential gateway must derive
// this from verified credentials; no HTTP/socket route accepts it from a client.
export const TrustedActorSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('host'), creatorId: GameIdSchema, credentialProof: proofSchema().optional() }).strict(),
  z.object({ role: z.literal('player'), playerId: GameIdSchema, credentialProof: proofSchema().optional() }).strict(),
  z.object({ role: z.literal('display'), sessionId: GameIdSchema, credentialProof: proofSchema().optional() }).strict(),
]);
function proofSchema() { return z.object({ kind: z.enum(['room', 'player']), id: GameIdSchema, tokenHash: z.string().regex(/^[0-9a-f]{64}$/) }).strict(); }
export type TrustedActor = z.infer<typeof TrustedActorSchema>;
export type Transaction = Prisma.TransactionClient;

export function actorKey(actor: TrustedActor): string { return actor.role === 'host' ? `host:${actor.creatorId}` : actor.role === 'player' ? `player:${actor.playerId}` : `display:${actor.sessionId}`; }
export async function authorize(tx: Transaction, session: GameSession, actor: TrustedActor): Promise<void> {
  if (actor.credentialProof) {
    const proof = actor.credentialProof;
    if (proof.kind === 'player') {
      const credential = await tx.playerCredential.findFirst({ where: { id: proof.id, sessionId: session.id, tokenHash: proof.tokenHash, revokedAt: null, expiresAt: { gt: new Date() } } });
      requireGame(credential && actor.role === 'player' && credential.playerId === actor.playerId, 'FORBIDDEN');
    } else {
      const credential = await tx.roomCredential.findFirst({ where: { id: proof.id, sessionId: session.id, tokenHash: proof.tokenHash, revokedAt: null, expiresAt: { gt: new Date() } } });
      requireGame(credential && ((credential.role === 'HOST' && actor.role === 'host') || (credential.role === 'DISPLAY' && actor.role === 'display')), 'FORBIDDEN');
    }
  }
  if (actor.role === 'host') { requireGame(session.hostId === actor.creatorId, 'FORBIDDEN'); return; }
  if (actor.role === 'display') { requireGame(session.id === actor.sessionId, 'FORBIDDEN'); return; }
  const player = await tx.sessionPlayer.findFirst({ where: { id: actor.playerId, sessionId: session.id, leftAt: null }, select: { id: true } });
  requireGame(player, 'FORBIDDEN');
}
export function requireHost(actor: TrustedActor): void { requireGame(actor.role === 'host', 'FORBIDDEN'); }
export function checkRevision(session: GameSession, command: GameCommand): void {
  if ('expectedRevision' in command) requireGame(session.revision === command.expectedRevision, 'REVISION_CONFLICT');
  requireGame(session.revision < 2_147_483_646, 'INVALID_STATE');
}
export const EligibilitySchema = z.object({ formatVersion: z.literal(1), playerIds: z.array(GameIdSchema) }).strict();
