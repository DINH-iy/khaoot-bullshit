-- A player's own look (built-in character parts). Nullable: existing players keep the default look made from their ID.
ALTER TABLE "session_players" ADD COLUMN "look" JSONB;
