-- Groups of people (Admin → People → Groups), to add many people to a room at once.
-- Additive only: two new tables, nothing existing changes.
-- CreateTable
CREATE TABLE "person_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(40) NOT NULL,
    "nameKey" VARCHAR(40) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_group_members" (
    "groupId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_group_members_pkey" PRIMARY KEY ("groupId","personId")
);

-- CreateIndex
CREATE UNIQUE INDEX "person_groups_nameKey_key" ON "person_groups"("nameKey");

-- CreateIndex
CREATE INDEX "person_group_members_personId_idx" ON "person_group_members"("personId");

-- AddForeignKey
ALTER TABLE "person_group_members" ADD CONSTRAINT "person_group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "person_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_group_members" ADD CONSTRAINT "person_group_members_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
