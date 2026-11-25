-- Who made a game, and games shared with editors (owner request, 25 November 2026).
-- Additive only: one new nullable column and one new table. No rows are changed or removed:
-- every existing game keeps its drafts, versions and save points, and counts as the owner's (author NULL).
-- AlterTable
ALTER TABLE "games" ADD COLUMN "authorPersonId" UUID;

-- CreateTable
CREATE TABLE "game_shares" (
    "gameId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_shares_pkey" PRIMARY KEY ("gameId","personId")
);

-- CreateIndex
CREATE INDEX "games_authorPersonId_idx" ON "games"("authorPersonId");

-- CreateIndex
CREATE INDEX "game_shares_personId_idx" ON "game_shares"("personId");

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_authorPersonId_fkey" FOREIGN KEY ("authorPersonId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_shares" ADD CONSTRAINT "game_shares_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_shares" ADD CONSTRAINT "game_shares_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
