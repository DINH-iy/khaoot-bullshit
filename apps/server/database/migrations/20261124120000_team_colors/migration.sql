-- Team colours: picked by the host (or a team) while teams are made. Only adds a nullable column.
-- AlterTable
ALTER TABLE "session_teams" ADD COLUMN "color" VARCHAR(7);
