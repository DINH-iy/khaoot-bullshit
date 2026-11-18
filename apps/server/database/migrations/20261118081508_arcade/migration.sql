-- CreateTable
CREATE TABLE "arcade_lobbies" (
    "id" UUID NOT NULL,
    "title" VARCHAR(60) NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "leaderId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMPTZ(3),

    CONSTRAINT "arcade_lobbies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arcade_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lobbyId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "displayName" VARCHAR(40) NOT NULL,
    "personId" UUID,
    "look" JSONB,
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMPTZ(3),

    CONSTRAINT "arcade_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arcade_rounds" (
    "id" UUID NOT NULL,
    "lobbyId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "game" VARCHAR(20) NOT NULL,
    "teams" INTEGER,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),

    CONSTRAINT "arcade_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arcade_seats" (
    "roundId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "playerId" UUID NOT NULL,

    CONSTRAINT "arcade_seats_pkey" PRIMARY KEY ("roundId","memberId")
);

-- CreateTable
CREATE TABLE "arcade_results" (
    "roundId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "personId" UUID,
    "game" VARCHAR(20) NOT NULL,
    "place" INTEGER,
    "pointsMilli" BIGINT NOT NULL,
    "value" INTEGER,
    "bestKey" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arcade_results_pkey" PRIMARY KEY ("roundId","memberId")
);

-- CreateIndex
CREATE INDEX "arcade_lobbies_closedAt_lastActiveAt_idx" ON "arcade_lobbies"("closedAt", "lastActiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "arcade_members_tokenHash_key" ON "arcade_members"("tokenHash");

-- CreateIndex
CREATE INDEX "arcade_members_lobbyId_joinedAt_idx" ON "arcade_members"("lobbyId", "joinedAt");

-- CreateIndex
CREATE UNIQUE INDEX "arcade_members_lobbyId_personId_key" ON "arcade_members"("lobbyId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "arcade_rounds_sessionId_key" ON "arcade_rounds"("sessionId");

-- CreateIndex
CREATE INDEX "arcade_rounds_lobbyId_endedAt_idx" ON "arcade_rounds"("lobbyId", "endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "arcade_rounds_lobbyId_number_key" ON "arcade_rounds"("lobbyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "arcade_seats_playerId_key" ON "arcade_seats"("playerId");

-- CreateIndex
CREATE INDEX "arcade_results_personId_game_idx" ON "arcade_results"("personId", "game");

-- CreateIndex
CREATE INDEX "arcade_results_game_bestKey_idx" ON "arcade_results"("game", "bestKey");

-- AddForeignKey
ALTER TABLE "arcade_members" ADD CONSTRAINT "arcade_members_lobbyId_fkey" FOREIGN KEY ("lobbyId") REFERENCES "arcade_lobbies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arcade_members" ADD CONSTRAINT "arcade_members_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arcade_rounds" ADD CONSTRAINT "arcade_rounds_lobbyId_fkey" FOREIGN KEY ("lobbyId") REFERENCES "arcade_lobbies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arcade_rounds" ADD CONSTRAINT "arcade_rounds_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "game_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arcade_seats" ADD CONSTRAINT "arcade_seats_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "arcade_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arcade_seats" ADD CONSTRAINT "arcade_seats_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "arcade_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arcade_seats" ADD CONSTRAINT "arcade_seats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "session_players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arcade_results" ADD CONSTRAINT "arcade_results_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "arcade_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arcade_results" ADD CONSTRAINT "arcade_results_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "arcade_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arcade_results" ADD CONSTRAINT "arcade_results_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integrity guards (not expressible in the Prisma schema).
-- A lobby plays one round at a time: at most one round without an end.
CREATE UNIQUE INDEX "arcade_rounds_one_open_per_lobby" ON "arcade_rounds"("lobbyId") WHERE "endedAt" IS NULL;
ALTER TABLE "arcade_rounds" ADD CONSTRAINT "arcade_rounds_valid" CHECK ("number" >= 1 AND ("teams" IS NULL OR "teams" BETWEEN 2 AND 6) AND ("endedAt" IS NULL OR "endedAt" >= "startedAt"));
ALTER TABLE "arcade_results" ADD CONSTRAINT "arcade_results_valid" CHECK (("place" IS NULL OR "place" >= 1) AND "pointsMilli" >= 0);
ALTER TABLE "arcade_lobbies" ADD CONSTRAINT "arcade_lobbies_valid" CHECK (length(btrim("title")) > 0 AND ("closedAt" IS NULL OR "closedAt" >= "createdAt"));
ALTER TABLE "arcade_members" ADD CONSTRAINT "arcade_members_valid" CHECK (length(btrim("displayName")) > 0 AND ("leftAt" IS NULL OR "leftAt" >= "joinedAt"));
