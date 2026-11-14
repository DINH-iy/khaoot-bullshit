-- People: a personal key the owner can look up again (stored encrypted; the hash in "linkHash" still does the checking), and editor rights. Only adds; existing people keep their links and are not editors.
-- AlterTable
ALTER TABLE "people" ADD COLUMN     "canEdit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "keySealed" VARCHAR(200);
