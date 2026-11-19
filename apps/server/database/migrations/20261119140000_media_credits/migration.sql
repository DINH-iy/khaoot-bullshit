-- A credit line for library files (composer and licence), shown when a song plays. Additive: one nullable column.
-- AlterTable
ALTER TABLE "game_media" ADD COLUMN "credit" VARCHAR(300);
