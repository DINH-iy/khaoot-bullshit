import type { LibraryGame } from '@party/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';

// Which games use which library files, for grouping the media library by game. A game uses a file when
// its draft or its latest published version mentions the file's id: the same rule that keeps a file
// from being removed (library.ts). Each definition is scanned once for quoted ids, then matched.
export async function libraryUsage(client: PrismaClient): Promise<{ games: LibraryGame[]; byMedia: Map<string, string[]> }> {
  const rows = await client.$queryRaw<{ gameId: string; mediaId: string }[]>`
    WITH definitions AS (
      SELECT "gameId", definition FROM game_drafts
      UNION ALL
      SELECT v."gameId", v.definition FROM game_versions v
        WHERE v.number = (SELECT max(w.number) FROM game_versions w WHERE w."gameId" = v."gameId")
    ), mentioned AS (
      SELECT DISTINCT d."gameId", found[1] AS id
      FROM definitions d, regexp_matches(d.definition::text, '"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"', 'g') AS found
    )
    SELECT m."gameId"::text AS "gameId", m.id AS "mediaId" FROM mentioned m
    JOIN game_media media ON media.id::text = m.id
    WHERE media."removedAt" IS NULL AND media.kind <> 'FONT'`;
  // Only games an author works on (they have a draft): a rehearsal's hidden copy ("Rehearsal · …") is not a game of its own here.
  const games = await client.game.findMany({ where: { id: { in: [...new Set(rows.map(row => row.gameId))] }, draft: { isNot: null } },
    select: { id: true, title: true, archivedAt: true }, orderBy: [{ title: 'asc' }, { id: 'asc' }] });
  const shown = new Set(games.map(game => game.id));
  const byMedia = new Map<string, string[]>();
  for (const { gameId, mediaId } of rows) if (shown.has(gameId)) byMedia.set(mediaId, [...byMedia.get(mediaId) ?? [], gameId]);
  return { games: games.map(game => ({ id: game.id, title: game.title, archived: game.archivedAt !== null })), byMedia };
}
