-- CreateEnum
CREATE TYPE "SessionMode" AS ENUM ('LIVE', 'REHEARSAL');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('LOBBY', 'RUNNING', 'PAUSED', 'RECOVERING', 'FINISHED');

-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('ACTIVE', 'CLOSED', 'VOID');

-- CreateEnum
CREATE TYPE "ScoreKind" AS ENUM ('AWARD', 'ADJUSTMENT', 'REVERSAL', 'TRANSFER');

-- CreateEnum
CREATE TYPE "DecisionReason" AS ENUM ('VOTE', 'HOST', 'TIE_BREAK', 'FALLBACK');

-- CreateEnum
CREATE TYPE "EventAudience" AS ENUM ('HOST', 'DISPLAY', 'PLAYER');

-- CreateTable
CREATE TABLE "creators" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "issuer" VARCHAR(512) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "creatorId" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_drafts" (
    "gameId" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "definitionFormat" INTEGER NOT NULL DEFAULT 1,
    "definition" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_drafts_pkey" PRIMARY KEY ("gameId")
);

-- CreateTable
CREATE TABLE "game_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gameId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "definitionFormat" INTEGER NOT NULL DEFAULT 1,
    "definition" JSONB NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gameVersionId" UUID NOT NULL,
    "hostId" UUID NOT NULL,
    "mode" "SessionMode" NOT NULL DEFAULT 'LIVE',
    "status" "SessionStatus" NOT NULL DEFAULT 'LOBBY',
    "roomCode" VARCHAR(12),
    "revision" INTEGER NOT NULL DEFAULT 0,
    "currentNodeKey" VARCHAR(128),
    "state" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),

    CONSTRAINT "game_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_players" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessionId" UUID NOT NULL,
    "displayName" VARCHAR(40) NOT NULL,
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMPTZ(3),

    CONSTRAINT "session_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_credentials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessionId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "player_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_teams" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessionId" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_lineups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessionId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "carryover" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_lineups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessionId" UUID NOT NULL,
    "lineupId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "isCaptain" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessionId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "nodeKey" VARCHAR(128) NOT NULL,
    "stageKey" VARCHAR(128) NOT NULL,
    "status" "StageStatus" NOT NULL DEFAULT 'ACTIVE',
    "lineupId" UUID,
    "eligibility" JSONB NOT NULL DEFAULT '{}',
    "presentation" JSONB NOT NULL DEFAULT '{}',
    "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt" TIMESTAMPTZ(3),
    "pausedRemainingMs" INTEGER,
    "closedAt" TIMESTAMPTZ(3),

    CONSTRAINT "stage_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessionId" UUID NOT NULL,
    "stageRunId" UUID NOT NULL,
    "actorKey" VARCHAR(160) NOT NULL,
    "slotKey" VARCHAR(128) NOT NULL DEFAULT 'answer',
    "playerId" UUID,
    "teamId" UUID,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "value" JSONB NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessionId" UUID NOT NULL,
    "stageRunId" UUID NOT NULL,
    "commandId" UUID NOT NULL,
    "selectedEdgeKey" VARCHAR(128) NOT NULL,
    "destinationNodeKey" VARCHAR(128) NOT NULL,
    "reason" "DecisionReason" NOT NULL,
    "voteSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_commands" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessionId" UUID NOT NULL,
    "commandKey" UUID NOT NULL,
    "actorKey" VARCHAR(160) NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessionId" UUID NOT NULL,
    "commandId" UUID NOT NULL,
    "awardKey" VARCHAR(200) NOT NULL,
    "stageRunId" UUID,
    "lineupId" UUID,
    "recipientPlayerId" UUID,
    "recipientTeamId" UUID,
    "amountMilli" BIGINT NOT NULL,
    "kind" "ScoreKind" NOT NULL,
    "reason" VARCHAR(240) NOT NULL,
    "reversesEntryId" UUID,
    "transferGroupId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessionId" UUID NOT NULL,
    "commandId" UUID,
    "revision" INTEGER NOT NULL,
    "eventIndex" INTEGER NOT NULL DEFAULT 0,
    "kind" VARCHAR(100) NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessionId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "eventIndex" INTEGER NOT NULL DEFAULT 0,
    "audience" "EventAudience" NOT NULL,
    "audienceKey" VARCHAR(160) NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "creators_issuer_subject_key" ON "creators"("issuer", "subject");

-- CreateIndex
CREATE INDEX "games_creatorId_archivedAt_idx" ON "games"("creatorId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "game_versions_gameId_number_key" ON "game_versions"("gameId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "game_sessions_roomCode_key" ON "game_sessions"("roomCode");

-- CreateIndex
CREATE INDEX "game_sessions_hostId_status_idx" ON "game_sessions"("hostId", "status");

-- CreateIndex
CREATE INDEX "game_sessions_gameVersionId_idx" ON "game_sessions"("gameVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "session_players_sessionId_id_key" ON "session_players"("sessionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "player_credentials_tokenHash_key" ON "player_credentials"("tokenHash");

-- CreateIndex
CREATE INDEX "player_credentials_sessionId_playerId_idx" ON "player_credentials"("sessionId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "session_teams_sessionId_id_key" ON "session_teams"("sessionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "session_teams_sessionId_name_key" ON "session_teams"("sessionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "team_lineups_sessionId_id_key" ON "team_lineups"("sessionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "team_lineups_sessionId_number_key" ON "team_lineups"("sessionId", "number");

-- CreateIndex
CREATE INDEX "team_members_sessionId_teamId_idx" ON "team_members"("sessionId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_lineupId_playerId_key" ON "team_members"("lineupId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "stage_runs_sessionId_id_key" ON "stage_runs"("sessionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "stage_runs_sessionId_number_key" ON "stage_runs"("sessionId", "number");

-- CreateIndex
CREATE INDEX "submissions_sessionId_stageRunId_idx" ON "submissions"("sessionId", "stageRunId");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_stageRunId_actorKey_slotKey_key" ON "submissions"("stageRunId", "actorKey", "slotKey");

-- CreateIndex
CREATE UNIQUE INDEX "route_decisions_stageRunId_key" ON "route_decisions"("stageRunId");

-- CreateIndex
CREATE UNIQUE INDEX "route_decisions_sessionId_stageRunId_key" ON "route_decisions"("sessionId", "stageRunId");

-- CreateIndex
CREATE UNIQUE INDEX "game_commands_sessionId_id_key" ON "game_commands"("sessionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "game_commands_sessionId_actorKey_commandKey_key" ON "game_commands"("sessionId", "actorKey", "commandKey");

-- CreateIndex
CREATE INDEX "score_entries_sessionId_recipientPlayerId_idx" ON "score_entries"("sessionId", "recipientPlayerId");

-- CreateIndex
CREATE INDEX "score_entries_sessionId_recipientTeamId_idx" ON "score_entries"("sessionId", "recipientTeamId");

-- CreateIndex
CREATE INDEX "score_entries_sessionId_transferGroupId_idx" ON "score_entries"("sessionId", "transferGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "score_entries_sessionId_id_key" ON "score_entries"("sessionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "score_entries_sessionId_awardKey_key" ON "score_entries"("sessionId", "awardKey");

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_sessionId_revision_eventIndex_key" ON "audit_events"("sessionId", "revision", "eventIndex");

-- CreateIndex
CREATE INDEX "outbox_events_publishedAt_availableAt_idx" ON "outbox_events"("publishedAt", "availableAt");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_sessionId_revision_eventIndex_audienceKey_key" ON "outbox_events"("sessionId", "revision", "eventIndex", "audienceKey");

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "creators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_drafts" ADD CONSTRAINT "game_drafts_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_versions" ADD CONSTRAINT "game_versions_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_versions" ADD CONSTRAINT "game_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "creators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_gameVersionId_fkey" FOREIGN KEY ("gameVersionId") REFERENCES "game_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "creators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_players" ADD CONSTRAINT "session_players_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "game_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_credentials" ADD CONSTRAINT "player_credentials_sessionId_playerId_fkey" FOREIGN KEY ("sessionId", "playerId") REFERENCES "session_players"("sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_teams" ADD CONSTRAINT "session_teams_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "game_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_lineups" ADD CONSTRAINT "team_lineups_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "game_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_sessionId_lineupId_fkey" FOREIGN KEY ("sessionId", "lineupId") REFERENCES "team_lineups"("sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_sessionId_teamId_fkey" FOREIGN KEY ("sessionId", "teamId") REFERENCES "session_teams"("sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_sessionId_playerId_fkey" FOREIGN KEY ("sessionId", "playerId") REFERENCES "session_players"("sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_runs" ADD CONSTRAINT "stage_runs_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "game_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_runs" ADD CONSTRAINT "stage_runs_sessionId_lineupId_fkey" FOREIGN KEY ("sessionId", "lineupId") REFERENCES "team_lineups"("sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_sessionId_stageRunId_fkey" FOREIGN KEY ("sessionId", "stageRunId") REFERENCES "stage_runs"("sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_sessionId_playerId_fkey" FOREIGN KEY ("sessionId", "playerId") REFERENCES "session_players"("sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_sessionId_teamId_fkey" FOREIGN KEY ("sessionId", "teamId") REFERENCES "session_teams"("sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_decisions" ADD CONSTRAINT "route_decisions_sessionId_stageRunId_fkey" FOREIGN KEY ("sessionId", "stageRunId") REFERENCES "stage_runs"("sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_decisions" ADD CONSTRAINT "route_decisions_sessionId_commandId_fkey" FOREIGN KEY ("sessionId", "commandId") REFERENCES "game_commands"("sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_commands" ADD CONSTRAINT "game_commands_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "game_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_entries" ADD CONSTRAINT "score_entries_sessionId_commandId_fkey" FOREIGN KEY ("sessionId", "commandId") REFERENCES "game_commands"("sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_entries" ADD CONSTRAINT "score_entries_sessionId_stageRunId_fkey" FOREIGN KEY ("sessionId", "stageRunId") REFERENCES "stage_runs"("sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_entries" ADD CONSTRAINT "score_entries_sessionId_lineupId_fkey" FOREIGN KEY ("sessionId", "lineupId") REFERENCES "team_lineups"("sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_entries" ADD CONSTRAINT "score_entries_sessionId_recipientPlayerId_fkey" FOREIGN KEY ("sessionId", "recipientPlayerId") REFERENCES "session_players"("sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_entries" ADD CONSTRAINT "score_entries_sessionId_recipientTeamId_fkey" FOREIGN KEY ("sessionId", "recipientTeamId") REFERENCES "session_teams"("sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_entries" ADD CONSTRAINT "score_entries_sessionId_reversesEntryId_fkey" FOREIGN KEY ("sessionId", "reversesEntryId") REFERENCES "score_entries"("sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "game_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_sessionId_commandId_fkey" FOREIGN KEY ("sessionId", "commandId") REFERENCES "game_commands"("sessionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "game_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
