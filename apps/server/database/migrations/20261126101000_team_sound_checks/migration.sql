-- A team's own sound: short audio (2 MB at most), belonging to no round; audio is stored for nothing else.
-- (Kind and purpose are compared as text, as in the earlier versions of these checks.)
ALTER TABLE "assets" DROP CONSTRAINT assets_valid_media;
ALTER TABLE "assets" ADD CONSTRAINT assets_valid_media CHECK (
  "byteSize" > 0 AND "sha256" ~ '^[0-9a-f]{64}$'
  AND "contentType" IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime', 'application/json',
    'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/flac', 'audio/webm')
  AND ((kind = 'GIF') = ("contentType" = 'image/gif')) AND ((kind = 'VIDEO') = ("contentType" LIKE 'video/%'))
  AND ((kind::text = 'DRAWING') = ("contentType" = 'application/json'))
  AND (kind::text <> 'DRAWING' OR "byteSize" <= 98304)
  AND ((kind::text = 'AUDIO') = ("contentType" LIKE 'audio/%'))
  AND (kind::text <> 'AUDIO' OR "byteSize" <= 2097152)
  AND ((kind::text = 'AUDIO') = ("purpose"::text = 'SOUND'))
  AND ("purpose"::text <> 'AVATAR' OR "contentType" IN ('image/png', 'application/json'))
);
ALTER TABLE "assets" DROP CONSTRAINT "assets_purpose_round";
ALTER TABLE "assets" ADD CONSTRAINT "assets_purpose_round" CHECK (("purpose"::text = 'ANSWER' AND "stageRunId" IS NOT NULL) OR ("purpose"::text IN ('AVATAR', 'SOUND') AND "stageRunId" IS NULL));
