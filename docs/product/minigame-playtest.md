# Minigame playtest checklist

Play and tune one game at a time. Keep the current game under **In review**, and move to the next only after agreeing that its controls, timing, scoring, and reveal feel right on a real phone and the shared screen. Keep unbuilt ideas in the [game catalog](game-catalog.md#november-minigame-feedback).

## In review

### Draw the Graph

- [ ] Try a real search-interest series and a dataset with raw counts. Check that the axis and cutoff make sense in both cases.
- [ ] Draw with one thumb on a small phone. Check that it is easy to reach the right edge, clear the line, and submit.
- [ ] Replay several crossing guesses and pause and resume on the TV from the host controls. Check color contrast, name labels, the real line, and the winner.
- [ ] Confirm that equal-error guesses sort by submission time.

### Next in line

- [ ] **Stop the Clock** — Check there is no time-left badge on the phone, TV, or host screen. Try a brief count-up and a fully hidden clock. Judge whether the target and result are clear.
- [ ] **Reaction duel** — Check readability of GO, false starts, and results on phones with different connection delays.
- [ ] **Tap race** — Check tap feedback, live race bars, and the end of the race.
- [ ] **Clap the beat** — Test tapping and the optional microphone on a real phone. Check the beat windows and feedback.
- [ ] **Speed run** — Try a stock course and a custom course. Check controls, restart, and finish timing.
- [ ] **Perfect circle** — Draw at different speeds and sizes. Check that rankings match how round the drawings look.
- [ ] **Cut the Line** — Check the shared target, smooth tenth-of-a-percent movement, and submission on a small screen.
- [ ] **Match the Angle** — Check the angle direction, smooth tenth-of-a-degree movement, and fastest-submission tiebreak.
- [ ] **Count the Dots** — Check dot legibility on TV, submissions during and after viewing, and the compact phone result.
- [ ] **Heads or Tails** — Check secret picks, the shared flip (both when guesses close and when the host flips), and solo play with and without chips.
- [ ] **Roulette** — Bet points on numbers and outside bets, check the stake limit (score or minimum stake), green zero, the rolling ball, and that wins and losses change the score. Check that arcade and solo Roulette (play chips) use the same table.
- [ ] **Lucky doors** — Check that the reveal and points match the selected door in shuffled and fixed modes.
- [ ] **Pass the pencil** — Check turn handoff, live drawing, voting, and the animation variant.
- [ ] **Drive the bus** — Check every choice and the captain and voting flows in a team round, and calling a rainbow (right and wrong) in round 4.
- [ ] **Left or right** — Check private picks, the majority reveal, and what happens when the room splits evenly.
- [ ] **Slot machine** — Check reel pacing, the final symbols, payout display, and reduced motion.
- [ ] **Blackjack** — Check card and button readability, chip bets, and resuming a hand.
- [ ] **Packs** — Check the seal gesture, card reveals, and which openings add to the collection.
- [ ] **Rock paper scissors** — Check secret choices, the first-to setting, and replay.
- [ ] **Tic-tac-toe** — Check turn visibility, touch targets, draws, and replay.
- [ ] **Chess** — Check selection, legal moves, promotion, and play on a small phone.
- [ ] **Creature duel** — Try both team sizes. Check turn choices, feedback, and replay.

## For each playtest

1. Open the test bench, switch to **Minigame Tryout**, and choose **Play selected**. Use **Replay** to rerun the same case with the phones still joined.
2. Try a real phone and the shared screen. Include a late, missed, or repeated submission and a brief disconnect where relevant.
3. Record what felt wrong, the change made, and what to retest. Replay the same case before signing off.

## Notes

| Game | Change | Next check |
| --- | --- | --- |
| Draw the Graph | Added CSV and pasted data, original-scale axes, and an author-controlled cutoff. | Try two real datasets. |
| Stop the Clock | Hid the room’s time-left badge during this game. | Play a round with the elapsed clock visible briefly, then with it hidden from the start. |
| Count the Dots | Made the number field available during viewing and put the actual count beside the player’s guess. | Submit while the dots are visible and again in a separate round after they disappear. |
| Heads or Tails | Shortened the countdown and gave the coin a tumbling toss, bounce and settle. | Check both landing faces on the TV and try the solo flip with reduced motion. |
| Drive the bus | Tightened the phone results and put each team’s sips next to its name. | Check long team names in a narrow phone view. |

## Still to build (requested after the UI pass)

- Extend team play to each minigame. Give the captain the team submission and let the host choose whether captains are assigned or elected on phones. Define the team rules for games that currently play individually.
- Simplify the Pass the Pencil ballot and host timer controls, and tighten the Left or Right prompt. Remove redundant dot indicators while keeping the Count the Dots board used for play.
