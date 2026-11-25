-- CreateEnum
CREATE TYPE "LogSource" AS ENUM ('DEVICE', 'SERVER');

-- CreateTable
CREATE TABLE "device_logs" (
    "id" UUID NOT NULL,
    "source" "LogSource" NOT NULL,
    "reason" VARCHAR(40) NOT NULL,
    "summary" VARCHAR(300) NOT NULL,
    "sessionId" UUID,
    "lobbyId" UUID,
    "playerId" UUID,
    "role" VARCHAR(12) NOT NULL,
    "requestId" VARCHAR(36),
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "device_logs_createdAt_idx" ON "device_logs"("createdAt");

-- CreateIndex
CREATE INDEX "device_logs_sessionId_createdAt_idx" ON "device_logs"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "device_logs_requestId_idx" ON "device_logs"("requestId");

