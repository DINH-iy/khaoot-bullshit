-- The media library: pictures, videos and songs for scenes. Additive only: a new enum and table.
-- CreateEnum
CREATE TYPE "GameMediaKind" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO');

-- CreateTable
CREATE TABLE "game_media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "GameMediaKind" NOT NULL,
    "contentType" VARCHAR(64) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "personId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMPTZ(3),

    CONSTRAINT "game_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_media_removedAt_createdAt_idx" ON "game_media"("removedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "game_media" ADD CONSTRAINT "game_media_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
