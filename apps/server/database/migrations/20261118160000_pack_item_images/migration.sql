-- A pack item can have an uploaded picture (a cleaned PNG in the media folder) instead of its emoji.
ALTER TABLE "pack_items" ADD COLUMN "imageId" UUID;
