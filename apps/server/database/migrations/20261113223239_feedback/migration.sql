-- Feedback from testers: bug reports, feature requests and minigame ideas. Only adds a table.
-- CreateEnum
CREATE TYPE "FeedbackKind" AS ENUM ('BUG', 'FEATURE', 'MINIGAME');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'PLANNED', 'IN_PROGRESS', 'DONE', 'DECLINED');

-- CreateTable
CREATE TABLE "feedback_items" (
    "id" UUID NOT NULL,
    "kind" "FeedbackKind" NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "title" VARCHAR(140) NOT NULL,
    "details" TEXT NOT NULL,
    "reporterName" VARCHAR(60),
    "context" JSONB NOT NULL,
    "ownerNote" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_items_status_createdAt_idx" ON "feedback_items"("status", "createdAt");
