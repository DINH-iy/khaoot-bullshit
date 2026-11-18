-- The owner's own version of a built-in game: a game that points at the built-in's key.
-- AlterTable
ALTER TABLE "games" ADD COLUMN     "builtInKey" VARCHAR(64);

-- One version per built-in game per owner (several games without a key stay allowed: NULLs are distinct).
-- CreateIndex
CREATE UNIQUE INDEX "games_creatorId_builtInKey_key" ON "games"("creatorId", "builtInKey");
