-- Earned chips are positive, belong to no side-game round, and say what they were for in "game":
-- 'points', 'place' or 'wins' (a finished game) or 'arcade' (a won arcade round).
ALTER TABLE chip_entries DROP CONSTRAINT chips_valid_amount;
ALTER TABLE chip_entries ADD CONSTRAINT chips_valid_amount CHECK (
  (reason IN ('START', 'REFILL') AND amount > 0 AND "roundId" IS NULL) OR
  (reason = 'BET' AND amount < 0 AND ("roundId" IS NOT NULL OR game IN ('rps', 'tictactoe', 'chess'))) OR
  (reason = 'PAYOUT' AND amount > 0 AND ("roundId" IS NOT NULL OR game IN ('rps', 'tictactoe', 'chess'))) OR
  (reason = 'EARNED' AND amount > 0 AND "roundId" IS NULL AND game IN ('points', 'place', 'wins', 'arcade')));

-- Each kind of earning is paid once per seat per room: a retried or repeated finish pays nothing more.
CREATE UNIQUE INDEX chip_entries_earned_once ON chip_entries ("sessionId", "playerId", game) WHERE reason = 'EARNED';
