-- AlterTable
ALTER TABLE "stage_runs" ADD COLUMN     "revealedAt" TIMESTAMPTZ(3);

-- Stages closed before this migration had their scores public on closing; keep them public.
UPDATE "stage_runs" SET "revealedAt" = "closedAt" WHERE status = 'CLOSED' AND "closedAt" IS NOT NULL;

-- Only a closed stage can be revealed, and never before it closed.
ALTER TABLE "stage_runs" ADD CONSTRAINT stages_reveal_after_close CHECK (
  "revealedAt" IS NULL OR (status = 'CLOSED' AND "closedAt" IS NOT NULL AND "revealedAt" >= "closedAt")
);
