ALTER TABLE chip_entries DROP CONSTRAINT chips_valid_amount;
ALTER TABLE chip_entries ADD CONSTRAINT chips_valid_amount CHECK (
  (reason IN ('START', 'REFILL') AND amount > 0 AND "roundId" IS NULL) OR
  (reason = 'BET' AND amount < 0 AND ("roundId" IS NOT NULL OR game IN ('rps', 'tictactoe', 'chess', 'eight-ball'))) OR
  (reason = 'PAYOUT' AND amount > 0 AND ("roundId" IS NOT NULL OR game IN ('rps', 'tictactoe', 'chess', 'eight-ball'))) OR
  (reason = 'EARNED' AND amount > 0 AND "roundId" IS NULL AND game IN ('points', 'place', 'wins', 'arcade')));
