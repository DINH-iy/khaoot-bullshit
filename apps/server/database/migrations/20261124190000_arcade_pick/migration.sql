-- Arcade: the leader's choice for the next round so far, shown read-only to the other players (feedback 497ae660).
-- Only adds a nullable column.
-- AlterTable
ALTER TABLE "arcade_lobbies" ADD COLUMN "pick" JSONB;
