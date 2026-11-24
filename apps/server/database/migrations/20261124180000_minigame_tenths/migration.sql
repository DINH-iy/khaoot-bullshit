-- Cut the Line and Match the Angle now measure in tenths (a cut of 47.3% is 473, an angle of 91.5° is 915), so the
-- marker and the ray no longer snap to whole, countable steps. Data only: earlier results, stored in whole percents
-- and degrees, are multiplied by 10 so they keep their meaning. No schema change.

-- Submissions: the server stores the cut (or angle) and its distance from the target (value).
UPDATE "submissions"
SET "value" = jsonb_set(jsonb_set("value", '{cut}', to_jsonb(("value"->>'cut')::int * 10)), '{value}', to_jsonb(("value"->>'value')::int * 10))
WHERE "value"->>'kind' = 'minigame' AND "value" ? 'cut' AND jsonb_typeof("value"->'value') = 'number';

UPDATE "submissions"
SET "value" = jsonb_set(jsonb_set("value", '{angle}', to_jsonb(("value"->>'angle')::int * 10)), '{value}', to_jsonb(("value"->>'value')::int * 10))
WHERE "value"->>'kind' = 'minigame' AND "value" ? 'angle' AND jsonb_typeof("value"->'value') = 'number';

-- Arcade results: the measured distance and the leaderboards' key (both lower is better).
UPDATE "arcade_results"
SET "value" = "value" * 10, "bestKey" = "bestKey" * 10
WHERE "game" IN ('cut-the-line', 'match-the-angle');
