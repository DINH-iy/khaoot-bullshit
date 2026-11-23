-- Saved styles: looks made in Look & feel to reuse in other games. Only adds a table.
-- CreateTable
CREATE TABLE "theme_styles" (
    "id" UUID NOT NULL,
    "creatorId" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "theme" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "theme_styles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "theme_styles_creatorId_createdAt_idx" ON "theme_styles"("creatorId", "createdAt");

-- AddForeignKey
ALTER TABLE "theme_styles" ADD CONSTRAINT "theme_styles_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "creators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Checked in the database too: a name, and a bounded size.
ALTER TABLE theme_styles ADD CONSTRAINT theme_styles_valid CHECK (length(btrim(name)) > 0 AND pg_column_size(theme) <= 16384);
