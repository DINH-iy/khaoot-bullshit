-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('IMAGE', 'GIF', 'VIDEO');

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessionId" UUID NOT NULL,
    "stageRunId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "contentType" VARCHAR(64) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "submissionId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assets_submissionId_key" ON "assets"("submissionId");

-- CreateIndex
CREATE INDEX "assets_stageRunId_playerId_idx" ON "assets"("stageRunId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "assets_sessionId_id_key" ON "assets"("sessionId", "id");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_sessionId_stageRunId_fkey" FOREIGN KEY ("sessionId", "stageRunId") REFERENCES "stage_runs"("sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_sessionId_playerId_fkey" FOREIGN KEY ("sessionId", "playerId") REFERENCES "session_players"("sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Only verified, bounded media of the supported types is ever recorded.
ALTER TABLE "assets" ADD CONSTRAINT assets_valid_media CHECK (
  "byteSize" > 0 AND "sha256" ~ '^[0-9a-f]{64}$'
  AND "contentType" IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime')
  AND ((kind = 'GIF') = ("contentType" = 'image/gif')) AND ((kind = 'VIDEO') = ("contentType" LIKE 'video/%'))
);
