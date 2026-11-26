import { authoredGraphs, AuthoredGraphsSchema } from '@party/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';
import { controlsGame, visibleTo, type EditorAccess } from './drafts.js';

export async function listAuthoredGraphs(client: PrismaClient, creatorId: string, access: EditorAccess) {
  const games = await client.game.findMany({
    where: { creatorId, archivedAt: null, draft: { isNot: null }, ...visibleTo(access) },
    select: { id: true, title: true, authorPersonId: true, draft: { select: { definition: true } },
      shares: { ...(access.personId ? { where: { personId: access.personId } } : { take: 0 }), select: { role: { select: { permissions: true } } } } },
    orderBy: [{ title: 'asc' }, { id: 'asc' }],
  });
  return AuthoredGraphsSchema.parse(games.flatMap(game => {
    const editable = controlsGame(game, access) || Boolean(game.shares[0]?.role.permissions.includes('game.edit'));
    return authoredGraphs(game.draft?.definition).map(({ graph, ...location }) => ({
      ...location, gameId: game.id, title: game.title, label: graph.yLabel, editable,
    }));
  }));
}
