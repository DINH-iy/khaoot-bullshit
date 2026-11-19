ALTER TABLE "game_sessions" ADD COLUMN "idleCloseAt" TIMESTAMPTZ(3);

CREATE INDEX "game_sessions_idleCloseAt_idx" ON "game_sessions"("idleCloseAt");
