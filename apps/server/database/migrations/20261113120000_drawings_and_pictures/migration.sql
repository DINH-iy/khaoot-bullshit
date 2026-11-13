-- Drawings are stored as validated stroke files; players may have a picture (photo or drawing).
ALTER TYPE "AssetKind" ADD VALUE 'DRAWING';

CREATE TYPE "AssetPurpose" AS ENUM ('ANSWER', 'AVATAR');

-- Existing assets are answers in a round; a picture belongs to no round.
ALTER TABLE "assets" ADD COLUMN "purpose" "AssetPurpose" NOT NULL DEFAULT 'ANSWER';
ALTER TABLE "assets" ALTER COLUMN "stageRunId" DROP NOT NULL;

-- Exactly one of the two shapes: an answer always has its round, a picture never does.
ALTER TABLE "assets" ADD CONSTRAINT "assets_purpose_round" CHECK (("purpose" = 'ANSWER' AND "stageRunId" IS NOT NULL) OR ("purpose" = 'AVATAR' AND "stageRunId" IS NULL));
