-- AlterTable
ALTER TABLE "game_drafts" ADD COLUMN     "lastEditorIsOwner" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastEditorName" VARCHAR(80);

