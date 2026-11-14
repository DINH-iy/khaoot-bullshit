-- People (accounts the owner makes) and side games: a play-chip ledger, side-game rounds and collected pack items. Only adds; existing players stay guests.
-- CreateEnum
CREATE TYPE "ChipReason" AS ENUM ('START', 'REFILL', 'BET', 'PAYOUT');

-- AlterTable
ALTER TABLE "session_players" ADD COLUMN     "personId" UUID;

-- CreateTable
CREATE TABLE "people" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(40) NOT NULL,
    "nameKey" VARCHAR(40) NOT NULL,
    "linkHash" CHAR(64) NOT NULL,
    "look" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMPTZ(3),

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "personId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "person_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chip_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessionId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "personId" UUID,
    "roundId" UUID,
    "game" VARCHAR(20),
    "reason" "ChipReason" NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chip_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "side_rounds" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "personId" UUID,
    "game" VARCHAR(20) NOT NULL,
    "finished" BOOLEAN NOT NULL DEFAULT false,
    "step" INTEGER NOT NULL DEFAULT 0,
    "bet" INTEGER NOT NULL,
    "payout" INTEGER NOT NULL DEFAULT 0,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "side_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collected_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessionId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "personId" UUID,
    "roundId" UUID NOT NULL,
    "itemKey" VARCHAR(40) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collected_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "people_nameKey_key" ON "people"("nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "people_linkHash_key" ON "people"("linkHash");

-- CreateIndex
CREATE UNIQUE INDEX "person_devices_tokenHash_key" ON "person_devices"("tokenHash");

-- CreateIndex
CREATE INDEX "person_devices_personId_idx" ON "person_devices"("personId");

-- CreateIndex
CREATE INDEX "chip_entries_personId_idx" ON "chip_entries"("personId");

-- CreateIndex
CREATE INDEX "chip_entries_playerId_idx" ON "chip_entries"("playerId");

-- CreateIndex
CREATE INDEX "chip_entries_sessionId_idx" ON "chip_entries"("sessionId");

-- CreateIndex
CREATE INDEX "side_rounds_playerId_game_finished_idx" ON "side_rounds"("playerId", "game", "finished");

-- CreateIndex
CREATE INDEX "collected_items_personId_idx" ON "collected_items"("personId");

-- CreateIndex
CREATE INDEX "collected_items_playerId_idx" ON "collected_items"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "session_players_sessionId_personId_key" ON "session_players"("sessionId", "personId");

-- AddForeignKey
ALTER TABLE "session_players" ADD CONSTRAINT "session_players_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_devices" ADD CONSTRAINT "person_devices_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chip_entries" ADD CONSTRAINT "chip_entries_sessionId_playerId_fkey" FOREIGN KEY ("sessionId", "playerId") REFERENCES "session_players"("sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chip_entries" ADD CONSTRAINT "chip_entries_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chip_entries" ADD CONSTRAINT "chip_entries_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "side_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "side_rounds" ADD CONSTRAINT "side_rounds_sessionId_playerId_fkey" FOREIGN KEY ("sessionId", "playerId") REFERENCES "session_players"("sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "side_rounds" ADD CONSTRAINT "side_rounds_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collected_items" ADD CONSTRAINT "collected_items_sessionId_playerId_fkey" FOREIGN KEY ("sessionId", "playerId") REFERENCES "session_players"("sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collected_items" ADD CONSTRAINT "collected_items_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collected_items" ADD CONSTRAINT "collected_items_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "side_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Guards: names are never blank, chips are whole amounts with the right sign, and the chip ledger and collections are history that is never changed.
ALTER TABLE people ADD CONSTRAINT people_valid_name CHECK (length(btrim(name)) > 0 AND ("removedAt" IS NOT NULL OR "nameKey" = lower(btrim(name))));
ALTER TABLE chip_entries ADD CONSTRAINT chips_valid_amount CHECK (
  (reason IN ('START', 'REFILL') AND amount > 0 AND "roundId" IS NULL) OR
  (reason = 'BET' AND amount < 0 AND "roundId" IS NOT NULL) OR
  (reason = 'PAYOUT' AND amount > 0 AND "roundId" IS NOT NULL));
ALTER TABLE side_rounds ADD CONSTRAINT rounds_valid_amounts CHECK (bet >= 0 AND payout >= 0 AND step >= 0 AND jsonb_typeof(state) = 'object');
CREATE TRIGGER immutable_chip_entries BEFORE UPDATE OR DELETE ON chip_entries FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_collected_items BEFORE UPDATE OR DELETE ON collected_items FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
