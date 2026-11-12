import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client.js';
import { preparedGame } from '../game/prepared-game.js';
import { contentHash } from '../game/definition.js';
import { createGameService } from '../game/service.js';
import { lockRoom, makeRoomCode } from './gateway.js';
import { newToken, tokenHash } from './security.js';

// Owner-run CLI/test fixture ONLY; never register as an unauthenticated route.
export async function provisionRehearsal(client: PrismaClient) {
  const creator = await client.creator.create({ data: { issuer: 'urn:local-rehearsal', subject: randomUUID() } });
  const game = await client.game.create({ data: { creatorId: creator.id, title: preparedGame.title } });
  const version = await client.gameVersion.create({ data: { gameId: game.id, createdById: creator.id, number: 1, definition: preparedGame, contentHash: contentHash(preparedGame) } });
  const sessionId = randomUUID(); const hostToken = newToken(); const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await createGameService(client).execute({ role: 'host', creatorId: creator.id }, { formatVersion: 1, type: 'session.create', sessionId, commandId: randomUUID(), gameVersionId: version.id, mode: 'REHEARSAL', expectedRevision: 0 });
  const roomCode = makeRoomCode();
  await client.$transaction(async tx => {
    await lockRoom(tx, sessionId);
    await tx.gameSession.update({ where: { id: sessionId }, data: { roomCode } });
    await tx.roomCredential.create({ data: { sessionId, role: 'HOST', source: 'LOCAL_REHEARSAL', tokenHash: tokenHash(hostToken), expiresAt } });
  });
  return { sessionId, roomCode, hostToken, expiresAt: expiresAt.toISOString() };
}
