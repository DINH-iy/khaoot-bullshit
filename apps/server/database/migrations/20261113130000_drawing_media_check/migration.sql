-- Drawings are server-written JSON of at most 96 KB; pictures of players are cleaned PNGs or drawings.
-- (The kind is compared as text: a new enum value cannot be used in the migration that adds it.)
ALTER TABLE "assets" DROP CONSTRAINT assets_valid_media;
ALTER TABLE "assets" ADD CONSTRAINT assets_valid_media CHECK (
  "byteSize" > 0 AND "sha256" ~ '^[0-9a-f]{64}$'
  AND "contentType" IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime', 'application/json')
  AND ((kind = 'GIF') = ("contentType" = 'image/gif')) AND ((kind = 'VIDEO') = ("contentType" LIKE 'video/%'))
  AND ((kind::text = 'DRAWING') = ("contentType" = 'application/json'))
  AND (kind::text <> 'DRAWING' OR "byteSize" <= 98304)
  AND ("purpose"::text <> 'AVATAR' OR "contentType" IN ('image/png', 'application/json'))
);
