-- Prefabs: scenes saved from the editor to insert into any game. Only adds a table.
-- CreateTable
CREATE TABLE "scene_prefabs" (
    "id" UUID NOT NULL,
    "creatorId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "sceneCount" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scene_prefabs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scene_prefabs_creatorId_createdAt_idx" ON "scene_prefabs"("creatorId", "createdAt");

-- AddForeignKey
ALTER TABLE "scene_prefabs" ADD CONSTRAINT "scene_prefabs_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "creators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Checked in the database too: a name, at least one scene, and a bounded size.
ALTER TABLE scene_prefabs ADD CONSTRAINT scene_prefabs_valid CHECK (length(btrim(name)) > 0 AND "sceneCount" BETWEEN 1 AND 40 AND pg_column_size(content) <= 262144);
