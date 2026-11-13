-- The clean-up deletes old files but keeps their rows: removedAt records when.
ALTER TABLE "assets" ADD COLUMN "removedAt" TIMESTAMPTZ(3);
-- Finding what is still stored, per room.
CREATE INDEX "assets_sessionId_removedAt_idx" ON "assets"("sessionId", "removedAt");
