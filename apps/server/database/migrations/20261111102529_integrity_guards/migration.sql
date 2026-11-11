-- PostgreSQL-only invariants that cannot be expressed by Prisma's schema language.
-- Keep these in migration history; never apply them as an untracked db push.
BEGIN;

ALTER TABLE games ADD CONSTRAINT games_nonempty_title CHECK (length(btrim(title)) > 0);
ALTER TABLE game_drafts ADD CONSTRAINT drafts_valid_definition CHECK (
  revision >= 0 AND "definitionFormat" > 0 AND jsonb_typeof(definition) = 'object'
);
ALTER TABLE game_versions ADD CONSTRAINT versions_valid_definition CHECK (
  number > 0 AND "definitionFormat" > 0 AND jsonb_typeof(definition) = 'object'
  AND "contentHash" ~ '^[0-9a-f]{64}$'
);
ALTER TABLE game_sessions ADD CONSTRAINT sessions_valid_state CHECK (
  revision >= 0 AND jsonb_typeof(state) = 'object'
  AND ("roomCode" IS NULL OR "roomCode" ~ '^[A-Z0-9]{4,12}$')
  AND ((status = 'FINISHED') = ("endedAt" IS NOT NULL))
);
ALTER TABLE session_players ADD CONSTRAINT players_nonempty_name CHECK (length(btrim("displayName")) > 0);
ALTER TABLE player_credentials ADD CONSTRAINT credentials_valid_lifetime CHECK (
  "tokenHash" ~ '^[0-9a-f]{64}$' AND "expiresAt" > "createdAt"
);
ALTER TABLE session_teams ADD CONSTRAINT teams_nonempty_name CHECK (length(btrim(name)) > 0);
ALTER TABLE team_lineups ADD CONSTRAINT lineups_positive_number CHECK (number > 0 AND jsonb_typeof(carryover) = 'object');
CREATE UNIQUE INDEX one_captain_per_team_lineup ON team_members ("lineupId", "teamId") WHERE "isCaptain";
ALTER TABLE stage_runs ADD CONSTRAINT stages_valid_lifecycle CHECK (
  number > 0 AND length(btrim("nodeKey")) > 0 AND length(btrim("stageKey")) > 0
  AND jsonb_typeof(eligibility) = 'object' AND jsonb_typeof(presentation) = 'object'
  AND ("pausedRemainingMs" IS NULL OR "pausedRemainingMs" >= 0)
  AND NOT ("deadlineAt" IS NOT NULL AND "pausedRemainingMs" IS NOT NULL)
  AND ((status = 'ACTIVE') = ("closedAt" IS NULL))
);
CREATE UNIQUE INDEX one_active_stage_per_session ON stage_runs ("sessionId") WHERE status = 'ACTIVE';
ALTER TABLE submissions ADD CONSTRAINT submissions_valid_actor CHECK (
  num_nonnulls("playerId", "teamId") = 1 AND revision >= 0 AND length(btrim("slotKey")) > 0
  AND "actorKey" = CASE WHEN "playerId" IS NOT NULL THEN 'player:' || "playerId"::text ELSE 'team:' || "teamId"::text END
);
ALTER TABLE game_commands ADD CONSTRAINT commands_valid_envelope CHECK (
  "requestHash" ~ '^[0-9a-f]{64}$' AND length(btrim("actorKey")) > 0 AND length(btrim(type)) > 0
);
ALTER TABLE score_entries ADD CONSTRAINT scores_valid_recipient CHECK (
  num_nonnulls("recipientPlayerId", "recipientTeamId") = 1
  AND ("recipientTeamId" IS NULL OR "lineupId" IS NOT NULL)
  AND "amountMilli" <> 0 AND length(btrim(reason)) > 0 AND length(btrim("awardKey")) > 0
  AND ("reversesEntryId" IS NULL OR "reversesEntryId" <> id)
  AND (kind <> 'REVERSAL' OR "reversesEntryId" IS NOT NULL)
  AND ((kind = 'TRANSFER') = ("transferGroupId" IS NOT NULL))
);
CREATE UNIQUE INDEX one_full_reversal_per_entry ON score_entries ("reversesEntryId") WHERE kind = 'REVERSAL';
ALTER TABLE audit_events ADD CONSTRAINT audit_valid_revision CHECK (
  revision >= 0 AND "eventIndex" >= 0 AND length(btrim(kind)) > 0 AND jsonb_typeof(details) = 'object'
);
ALTER TABLE outbox_events ADD CONSTRAINT outbox_valid_envelope CHECK (
  revision >= 0 AND "eventIndex" >= 0 AND attempts >= 0 AND length(btrim(type)) > 0
  AND length(btrim("audienceKey")) > 0 AND jsonb_typeof(payload) = 'object'
);

CREATE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Historical records are immutable; append a new version or corrective event'
    USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER immutable_game_versions BEFORE UPDATE OR DELETE ON game_versions FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_score_entries BEFORE UPDATE OR DELETE ON score_entries FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_audit_events BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_command_results BEFORE UPDATE OR DELETE ON game_commands FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_route_decisions BEFORE UPDATE OR DELETE ON route_decisions FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

COMMIT;
