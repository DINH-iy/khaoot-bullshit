-- A pack set is active (players see it) or hidden, and separately can be on sale: a percentage off its price.
ALTER TABLE "pack_sets" RENAME COLUMN "onSale" TO "active";
ALTER TABLE "pack_sets" ADD COLUMN "onSale" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pack_sets" ADD COLUMN "salePercent" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE pack_sets ADD CONSTRAINT pack_sets_valid_sale CHECK ("salePercent" BETWEEN 1 AND 99);
