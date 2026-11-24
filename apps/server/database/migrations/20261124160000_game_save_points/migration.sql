-- Save points: copies of a game's whole draft made in the editor, to go back to later. Only adds a table.
-- CreateTable
CREATE TABLE "game_save_points" (
    "id" UUID NOT NULL,
    "gameId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "automatic" BOOLEAN NOT NULL DEFAULT false,
    "savedBy" VARCHAR(80),
    "sceneCount" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_save_points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_save_points_gameId_createdAt_idx" ON "game_save_points"("gameId", "createdAt");

-- AddForeignKey
ALTER TABLE "game_save_points" ADD CONSTRAINT "game_save_points_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Checked in the database too: a name, a scene count, and no more than a draft's size (256 KB of JSON).
ALTER TABLE game_save_points ADD CONSTRAINT game_save_points_valid CHECK (length(btrim(name)) > 0 AND "sceneCount" >= 0 AND pg_column_size(definition) <= 1048576);
