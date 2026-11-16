-- Challenges between players put their stakes in (BET) and pay them out (PAYOUT) without a side-game
-- round: the challenge itself is the game. The original rule required a round for every bet and payout,
-- so accepting any challenge with a stake failed. Allow round-less bets and payouts for the head-to-head
-- games only; every other rule stays as it was.
ALTER TABLE chip_entries DROP CONSTRAINT chips_valid_amount;
ALTER TABLE chip_entries ADD CONSTRAINT chips_valid_amount CHECK (
  (reason IN ('START', 'REFILL') AND amount > 0 AND "roundId" IS NULL) OR
  (reason = 'BET' AND amount < 0 AND ("roundId" IS NOT NULL OR game IN ('rps', 'tictactoe', 'chess'))) OR
  (reason = 'PAYOUT' AND amount > 0 AND ("roundId" IS NOT NULL OR game IN ('rps', 'tictactoe', 'chess'))));
