-- The server always sets a share's role, so the column needs no default. No rows change.
-- AlterTable
ALTER TABLE "game_shares" ALTER COLUMN "roleId" DROP DEFAULT;
