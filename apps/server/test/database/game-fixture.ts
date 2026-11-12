import { randomUUID } from 'node:crypto';
import { createDatabase } from '../../src/database/client.js';
import { contentHash, type GameDefinition } from '../../src/game/definition.js';
import { preparedGame } from '../../src/game/prepared-game.js';
import { createGameService } from '../../src/game/service.js';

const connection = process.env['DATABASE_URL'];
if (!connection || !new URL(connection).pathname.endsWith('_test')) throw new Error('Dedicated test database required');
export const testConnection = connection;
export const db = createDatabase(connection, 5);
export const prisma = db.client;
export const service = createGameService(prisma);
export async function fixture(playerCount = 2, definition: GameDefinition = preparedGame) {
  const creator = await prisma.creator.create({ data: { issuer: 'https://identity.example/', subject: randomUUID() } });
  const game = await prisma.game.create({ data: { creatorId: creator.id, title: definition.title } });
  const version = await prisma.gameVersion.create({ data: { gameId: game.id, number: 1, definition, contentHash: contentHash(definition), createdById: creator.id } });
  const sessionId = randomUUID();
  const host = { role: 'host' as const, creatorId: creator.id };
  const create = { formatVersion: 1, sessionId, commandId: randomUUID(), type: 'session.create', gameVersionId: version.id, mode: 'REHEARSAL', expectedRevision: 0 };
  const receipt = await service.execute(host, create);
  const players = await Promise.all(Array.from({ length: playerCount }, (_, i) => prisma.sessionPlayer.create({ data: { sessionId, displayName: `Player ${i + 1}` } })));
  return { sessionId, creator, version, host, create, receipt, players };
}
export async function hostCommand(f: Awaited<ReturnType<typeof fixture>>, type: string, extra: Record<string, unknown> = {}) {
  const session = await prisma.gameSession.findUniqueOrThrow({ where: { id: f.sessionId } });
  return service.execute(f.host, { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, expectedRevision: session.revision, type, ...extra });
}
export async function start(f: Awaited<ReturnType<typeof fixture>>) { return (await hostCommand(f, 'session.start')).stageRunId!; }
export function answer(sessionId: string, stageRunId: string, choiceKey = 'canberra') {
  return { formatVersion: 1, commandId: randomUUID(), sessionId, type: 'submission.submit', stageRunId, value: { kind: 'choice', choiceKey } };
}
