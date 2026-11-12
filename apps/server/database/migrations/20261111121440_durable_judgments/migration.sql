BEGIN;

-- CreateTable
CREATE TABLE "stage_judgments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessionId" UUID NOT NULL,
    "stageRunId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "commandId" UUID NOT NULL,
    "amountMilli" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stage_judgments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stage_judgments_sessionId_commandId_idx" ON "stage_judgments"("sessionId", "commandId");

-- CreateIndex
CREATE UNIQUE INDEX "stage_judgments_stageRunId_playerId_key" ON "stage_judgments"("stageRunId", "playerId");

-- AddForeignKey
ALTER TABLE "stage_judgments" ADD CONSTRAINT "stage_judgments_sessionId_stageRunId_fkey" FOREIGN KEY ("sessionId", "stageRunId") REFERENCES "stage_runs"("sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_judgments" ADD CONSTRAINT "stage_judgments_sessionId_playerId_fkey" FOREIGN KEY ("sessionId", "playerId") REFERENCES "session_players"("sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_judgments" ADD CONSTRAINT "stage_judgments_sessionId_commandId_fkey" FOREIGN KEY ("sessionId", "commandId") REFERENCES "game_commands"("sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stage_judgments" ADD CONSTRAINT judgments_nonnegative_award CHECK ("amountMilli" >= 0);
CREATE TRIGGER immutable_stage_judgments BEFORE UPDATE OR DELETE ON "stage_judgments" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

COMMIT;
