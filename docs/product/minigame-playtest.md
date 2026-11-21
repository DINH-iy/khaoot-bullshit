# Minigame playtest checklist

Play and tune one game at a time. Keep the current game under **In review**, and move to the next only after agreeing that its controls, timing, scoring, and reveal feel right on a real phone and the shared screen. Keep unbuilt ideas in the [game catalog](game-catalog.md#november-minigame-feedback).

## In review

### Draw the Graph

- [x] Import a CSV or paste spreadsheet data, preview the chart, and choose the last visible period.
- [x] Give the phone a nearly full-width, taller plot with one instruction and a compact row of buttons.
- [x] Show the graph question and live period and value while drawing. At reveal, draw the actual and predicted lines together and show rankings on the main screen.
- [x] Add Our World in Data URL import with a series picker and attribution. See the [source comparison](graph-data-sources.md).
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
- [ ] **Cut the Line** — Check the shared target, 1% steps, and submission on a small screen.
- [ ] **Match the Angle** — Check the angle direction, 1° snap, and fastest-submission tiebreak.
- [ ] **Count the Dots** — Check dot legibility on TV, submissions during and after viewing, and the compact phone result.
- [ ] **Heads or Tails** — Check secret picks, the shared flip, and solo play with and without chips.
- [ ] **Red or Black Roulette** — Check secret picks, green zero, and the shared spin. In solo Roulette, also try exact numbers and multiple wagers.
- [ ] **Lucky doors** — Check that the reveal and points match the selected door in shuffled and fixed modes.
- [ ] **Pass the pencil** — Check turn handoff, live drawing, voting, and the animation variant.
- [ ] **Drive the bus** — Check every choice and the captain and voting flows in a team round.
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

## Scene settings audit

Every minigame scene exposes its prompt and the timing controls applicable to its rules. The points panel shows places for ranked games and a single award for correct shared predictions. Step games that support team play also offer a team decision method.

| Scene | Settings specific to the game |
| --- | --- |
| Reaction duel | Shortest and longest wait before GO |
| Tap race | Race length |
| Clap the beat | Round timer. The beat sequence is fixed and microphone use is a player choice. |
| Speed run | Stock or custom obstacle course |
| Stop the Clock | Target time and when the clock hides |
| Lucky doors | Door values and shuffled or fixed order |
| Perfect circle | Drawing time |
| Cut the Line | Random, exact, or inclusive target range |
| Match the Angle | Shared random target. The exclusion of easy angles and the 1° step are fixed rules. |
| Count the Dots | Display time, guess time, random or authored count, slight overlap, and reveal easing |
| Draw the Graph | Stock or custom data, CSV or Grapher import, cutoff, axis labels, source, and reveal easing |
| Heads or Tails | Award for a correct guess and guess time. Coin probabilities are fixed. |
| Red or Black Roulette | Award for a correct guess and guess time. Wheel pockets and odds are fixed. |
| Pass the pencil | Time per turn, voting time, and animation mode |
| Drive the bus | Sips per step, rainbow rule, and team decision method |
| Left or right | Vote time and places. Majority and tie rules are fixed. |

Solo phone games use the side-game and chip settings in Game settings. Duel settings belong to their separate scene type.

## Hosted minigame UI pass

The phone has one round result with the player's own measurement, guess, or team outcome and a single points line. The host and TV carry placements, group results, and shared reveals. The result table includes points in the same row when the award belongs to that player or team. In narrow panes, measurements move beneath the player's name to leave room for both the name and points.

| Minigame | Main play control | What the phone reveals |
| --- | --- | --- |
| Reaction duel | Wait/GO pad | Reaction time or false start |
| Tap race | Tap pad and live count | Tap count |
| Clap the beat | Lit tap pad with optional microphone | Beats hit |
| Speed run | Course and direction buttons | Finish time |
| Stop the Clock | Stop button and optional elapsed reading | Target, stop time, and difference |
| Lucky doors | Compact door choices | Chosen door and payout |
| Perfect circle | Square drawing area | Own circle and roundness |
| Cut the Line | Endpoint labels and lock-in button | Target and cut markers |
| Match the Angle | Dial and lock-in button | Target and guess on one dial, with the difference below |
| Count the Dots | Numeric entry | Actual count and own guess |
| Draw the Graph | Plot, Clear, and Lock in | Own trace against the actual line |
| Heads or Tails | Two coin faces | Landed face and own pick |
| Red or Black Roulette | Two color buttons | Landed color and own pick |
| Pass the pencil | Turn drawing area and paged ballot | Own team's drawing and votes or accuracy |
| Drive the bus | Cards and current choice | Own team's cards and total sips |
| Left or right | Direction choices | Own pick and majority or tie |

Waiting rounds give a short status, and the phone removes play controls when answers close. The compact editor preview also applies to every hosted minigame. Device and input coverage belongs in the verification notes for each playtest.

Hosts can open **Configure minigame** in the Scene editor to change settings and preview the draft on a phone or shared screen before applying it. Count the Dots reveals the original pattern one dot at a time. Draw the Graph uses the same **Reveal easing** choices for its line sweep. Both default to Ease in and respect reduced motion.

## Follow-up requested after the UI pass

- Extend team play to each minigame. Give the captain the team submission and let the host choose whether captains are assigned or elected on phones. Define the team rules for games that currently play individually.
- Let the host choose whether Heads or Tails flips automatically after guesses lock or waits for a host action.
- Replace the hosted roulette color-only choice with numbered and table bets, score bonuses for winning bets, and an animated ball. Losing bets leave the score as it was.
- Replace the compact drawing color dropdown with swatches, simplify the Pass the Pencil ballot and host timer controls, and tighten the Left or Right prompt. Remove redundant dot indicators while keeping the Count the Dots board used for play.
- Let a team that earns a rainbow in Drive the Bus choose the opposing team that takes the sips.
