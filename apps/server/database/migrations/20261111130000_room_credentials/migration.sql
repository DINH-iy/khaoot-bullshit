BEGIN;

-- CreateEnum
CREATE TYPE "RoomRole" AS ENUM ('HOST', 'DISPLAY');

-- CreateEnum
CREATE TYPE "CredentialSource" AS ENUM ('OIDC', 'LOCAL_REHEARSAL');

-- AlterTable
ALTER TABLE "session_players" ADD COLUMN     "joinKeyHash" CHAR(64);

-- CreateTable
CREATE TABLE "room_credentials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessionId" UUID NOT NULL,
    "role" "RoomRole" NOT NULL,
    "source" "CredentialSource" NOT NULL DEFAULT 'OIDC',
    "tokenHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "room_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "room_credentials_tokenHash_key" ON "room_credentials"("tokenHash");

-- CreateIndex
CREATE INDEX "room_credentials_sessionId_role_idx" ON "room_credentials"("sessionId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "session_players_joinKeyHash_key" ON "session_players"("joinKeyHash");

-- AddForeignKey
ALTER TABLE "room_credentials" ADD CONSTRAINT "room_credentials_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "game_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "room_credentials" ADD CONSTRAINT room_credentials_valid_lifetime CHECK (
  "tokenHash" ~ '^[0-9a-f]{64}$' AND "expiresAt" > "createdAt"
);
ALTER TABLE "session_players" ADD CONSTRAINT players_valid_join_hash CHECK (
  "joinKeyHash" IS NULL OR "joinKeyHash" ~ '^[0-9a-f]{64}$'
);

COMMIT;
