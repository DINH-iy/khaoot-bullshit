-- Roles: the owner's own roles with permissions, given to people and to shared games.
-- Additive only: a new table with the two built-in roles, and two new columns. Nothing is removed:
-- everyone who could edit games gets the Editor role (exactly the rights they had), and every existing share
-- keeps editing (Editor). The old "canEdit" column stays and is kept in step.
-- CreateTable
CREATE TABLE "access_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(40) NOT NULL,
    "nameKey" VARCHAR(40) NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "access_roles_nameKey_key" ON "access_roles"("nameKey");

-- The built-in roles (contracts/roles.ts: EDITOR_ROLE_ID, VIEWER_ROLE_ID).
INSERT INTO "access_roles" ("id", "name", "nameKey", "permissions", "builtIn") VALUES
  ('00000000-0000-4000-8000-00000000e001', 'Editor', 'editor', ARRAY['games.make', 'media.manage', 'rooms.rehearse', 'game.view', 'game.edit', 'game.publish', 'game.savePoints', 'game.rehearse', 'game.copy'], true),
  ('00000000-0000-4000-8000-00000000e002', 'Viewer', 'viewer', ARRAY['game.view', 'game.rehearse', 'game.copy'], true);

-- AlterTable
ALTER TABLE "people" ADD COLUMN "roleId" UUID;
UPDATE "people" SET "roleId" = '00000000-0000-4000-8000-00000000e001' WHERE "canEdit" = true;

-- AlterTable
ALTER TABLE "game_shares" ADD COLUMN "roleId" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-00000000e001';

-- CreateIndex
CREATE INDEX "game_shares_roleId_idx" ON "game_shares"("roleId");

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "access_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_shares" ADD CONSTRAINT "game_shares_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "access_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
