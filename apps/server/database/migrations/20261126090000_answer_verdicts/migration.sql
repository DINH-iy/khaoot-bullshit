-- CreateTable
CREATE TABLE "answer_verdicts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessionId" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "commandId" UUID NOT NULL,
    "correct" BOOLEAN,
    "revision" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "answer_verdicts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "answer_verdicts_sessionId_submissionId_idx" ON "answer_verdicts"("sessionId", "submissionId");

-- CreateIndex
CREATE INDEX "answer_verdicts_sessionId_commandId_idx" ON "answer_verdicts"("sessionId", "commandId");

-- CreateIndex
CREATE UNIQUE INDEX "answer_verdicts_submissionId_revision_key" ON "answer_verdicts"("submissionId", "revision");

-- AddForeignKey
ALTER TABLE "answer_verdicts" ADD CONSTRAINT "answer_verdicts_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_verdicts" ADD CONSTRAINT "answer_verdicts_sessionId_commandId_fkey" FOREIGN KEY ("sessionId", "commandId") REFERENCES "game_commands"("sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The host's verdicts on answers are history: a change is a new row, never an edit.
CREATE TRIGGER immutable_answer_verdicts BEFORE UPDATE OR DELETE ON "answer_verdicts" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
