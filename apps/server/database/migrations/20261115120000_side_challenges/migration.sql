-- Challenges between two players of a room (rock paper scissors, tic-tac-toe, chess…), optionally for chips. Only adds a table; rows are deleted once the room is over.
-- CreateTable
CREATE TABLE "side_challenges" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "challengerId" UUID NOT NULL,
    "opponentId" UUID NOT NULL,
    "game" VARCHAR(20) NOT NULL,
    "stake" INTEGER NOT NULL,
    "status" VARCHAR(12) NOT NULL,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "side_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "side_challenges_sessionId_status_idx" ON "side_challenges"("sessionId", "status");

-- AddForeignKey
ALTER TABLE "side_challenges" ADD CONSTRAINT "side_challenges_sessionId_challengerId_fkey" FOREIGN KEY ("sessionId", "challengerId") REFERENCES "session_players"("sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "side_challenges" ADD CONSTRAINT "side_challenges_sessionId_opponentId_fkey" FOREIGN KEY ("sessionId", "opponentId") REFERENCES "session_players"("sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Checked in the database too: two different players, a stake that is not negative, and a known status.
ALTER TABLE side_challenges ADD CONSTRAINT side_challenges_valid CHECK ("challengerId" <> "opponentId" AND stake >= 0 AND status IN ('INVITED', 'PLAYING', 'FINISHED', 'DECLINED', 'CANCELLED'));
