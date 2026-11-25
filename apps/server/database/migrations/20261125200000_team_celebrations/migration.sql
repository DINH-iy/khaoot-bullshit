-- Each team's winning celebration (emoji, cheer and a soundboard sound), picked while teams are made.
-- Additive only: one new nullable column; existing teams keep everything and simply have none.
-- AlterTable
ALTER TABLE "session_teams" ADD COLUMN "celebration" JSONB;
