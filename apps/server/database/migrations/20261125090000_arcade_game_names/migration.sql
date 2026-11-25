-- Arcade rounds and results name their game; minigame keys such as "red-or-black-roulette" (21 characters) did not fit
-- in 20, so a roulette round could not start. Only widens the two columns; no data changes.
-- AlterTable
ALTER TABLE "arcade_rounds" ALTER COLUMN "game" SET DATA TYPE VARCHAR(32);

-- AlterTable
ALTER TABLE "arcade_results" ALTER COLUMN "game" SET DATA TYPE VARCHAR(32);
