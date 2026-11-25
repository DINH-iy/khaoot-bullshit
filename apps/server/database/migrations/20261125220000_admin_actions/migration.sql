-- Admin → Action log: what the owner and editors changed. Additive only: one new table.
-- CreateTable
CREATE TABLE "admin_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorPersonId" UUID,
    "actorName" VARCHAR(60) NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "details" JSONB,

    CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_actions_createdAt_idx" ON "admin_actions"("createdAt");
