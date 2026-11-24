# Game catalog: what exists and what could be added

13 November 2026. An overview of game types for the builder: what is built, what can be made from existing parts, and what needs a new mechanic. "Built" means playable today; everything else is an idea. See [APP_PLAN.md](../../APP_PLAN.md) for priorities and [creative minigames](../architecture/creative-minigames.md) for the drawing research.

Legend: **Built** · **Parts ready** (can be made in the editor now, maybe as a template) · **New mechanic** (needs building).

## 1. Quiz and knowledge

| Game | How it plays | Status |
| --- | --- | --- |
| Classic quiz | Multiple choice, tiles or list, timer, points | Built |
| Put in order | Arrange items (years, sizes, rankings) | Built |
| Picture/video question | A picture or clip with the question | New mechanic: host media in scenes |
| Music intro | A song starts; guess the title | New mechanic: audio in scenes |
| Closest number wins | "How many…?" — nearest answer wins | New mechanic: number answers with closeness scoring |
| Speed bonus | More points for answering faster | New mechanic: time-based scoring |
| Higher or lower | Is the next value higher or lower? Chain until wrong | New mechanic: chained rounds |
| True or false blitz | Many quick statements, 5 seconds each | Parts ready (quiz with two answers, short timers) |

## 2. Opinion and "about us"

| Game | How it plays | Status |
| --- | --- | --- |
| Poll | Opinion question, no points | Built |
| Most likely to… | Everyone votes which player fits the statement | New mechanic: vote for a player |
| Who said it? | An anonymous answer from earlier; guess who wrote it | New mechanic: guess the author |
| Two truths and a lie | A player writes three statements; others find the lie | New mechanic: per-player turns |
| Majority wins | Points for picking what most people pick | New mechanic: majority scoring |
| Minority wins | Points for the least-picked answer | New mechanic: minority scoring |
| Hot takes | Rate a statement 1–10; see how the room is split | New mechanic: scale answers |

## 3. Writing and jokes

| Game | How it plays | Status |
| --- | --- | --- |
| Caption / joke / excuse + vote | Write, then vote anonymously | Built |
| Fill in the blank | A sentence with a gap; funniest wins | Parts ready (writing + vote) |
| Fake definitions | Write a believable definition of a strange word; vote for the real one | New mechanic: mix the real answer into the ballot |
| Story chain | Each player adds one sentence to a story | New mechanic: creation chains |
| Head to head | Two answers at a time, everyone votes, winner moves on | New mechanic: tournament ballots |

## 4. Drawing

| Game | How it plays | Status |
| --- | --- | --- |
| Drawing round + vote | Draw the prompt, then vote | Built |
| Blind drawing | Draw without seeing your strokes | Built |
| Finish the doodle | Everyone completes the same starting scribble | Built |
| Perfect circle | Roundest circle wins, scored automatically | Built |
| Pass the pencil | Teams take turns on one picture, live; then vote | Built |
| Speed sketch | 15 seconds to draw, then vote | Parts ready |
| One line | Draw without lifting your finger | New mechanic: small (one-stroke option) |
| Trace it from memory | Shape shown 3 s, redraw it; scored automatically | New mechanic: shape comparison |
| Copy cat | Copy someone's drawing as closely as possible | New mechanic: drawing comparison |
| Draw and guess | One draws a secret word live, others type guesses | New mechanic: live strokes exist; needs turns and guess checking |
| Telephone | Write → draw → describe → draw… then replay all chains | New mechanic: creation chains |
| Exquisite corpse | Head, body and legs drawn by different players without seeing the rest | New mechanic: hidden parts |
| Team canvas race | Teams draw on one shared canvas at the same time | New mechanic: simultaneous shared canvas |

## 5. Phone minigames (Mario Party style)

| Game | How it plays | Status |
| --- | --- | --- |
| Reaction duel | Tap at GO; early is out | Built |
| Tap race | Tap as fast as you can; live race bars | Built |
| Stop the clock | Stop a vanishing clock at the target | Built |
| Cut the Line | Estimate a target percentage on an unmarked bar | Built |
| Match the Angle | Aim a ray at a shared target, with speed breaking ties | Built |
| Count the Dots | Count a brief pattern on the shared screen, then enter a number on a phone | Built for hosted rooms |
| Lucky doors | Pick a door with hidden points | Built |
| Hot potato | A bomb passes between phones; whoever holds it when it blows loses | New mechanic: passing between players |
| Simon says / memory | Repeat a growing colour sequence | New mechanic |
| Colour clash | Tap the colour of the word, not the word (Stroop) | New mechanic |
| Quick maths | Fastest correct sum | New mechanic: small |
| Tug of war | Two teams tap; the rope moves on the TV | New mechanic: team totals live (tap stream exists) |
| Rock paper scissors tournament | Bracket of duels | New mechanic: brackets |
| Auction | Bid points on a mystery prize | New mechanic: bidding with points |
| Split or steal | Two players choose secretly; classic dilemma | New mechanic: paired secret choices |
| Shake it | Shake the phone fastest | New mechanic: motion sensors (needs permission on iPhone) |
| Balance | Keep a ball in the middle by tilting the phone | New mechanic: motion sensors |
| Rhythm | Tap on the beat of a song | New mechanic: audio and timing (research first) |
| Galgje (Hangman) | Guess a hidden word letter by letter before the drawing is finished | Requested by the owner; kit "Guess the word" |
| Undercover / Mr. White | Everyone gets a secret word, the undercover players a similar one and Mr. White none; give clues, vote someone out; Mr. White may guess the word | Requested by the owner; kit "Secret words" |

## 6. Team and show formats

| Format | How it plays | Status |
| --- | --- | --- |
| Teams, 1 vs rest, any split | Per game or per round | Built |
| Party choice of route | The room votes where the game goes | Built |
| Host-judged challenge | Do something in the room; host gives points | Built |
| Lifelines / jokers | Double points, skip, 50/50 once per game | New mechanic |
| Final round with all-in bets | Bet part of your score on the last question | New mechanic: wagers |
| Show host character | A presenter with lines and reactions on the TV | New mechanic (planned) |

## 6a. Side games and 1 v 1 challenges (requested 13 November 2026)

Played on a player's own phone while waiting, next to the game rather than as a scene. How to build them from shared mechanics: [scenes from building blocks](../architecture/composable-scenes.md).

| Game | How it plays | Status |
| --- | --- | --- |
| Slot machine | Bet play chips, spin the reels | Built 14 November 2026 |
| Blackjack | Against the bank, with play chips | Built 14 November 2026 (no splitting) |
| Pack opening / loot box | Open packs with items of different rarity; collect them | Built 14 November 2026 |
| Gambling leaderboard | Who bet, won and lost how many chips | Built 14 November 2026 (this room and all time) |
| 1 v 1 challenge | Challenge another player on the phones; chess for example | Requested; kit "1 v 1 board" |
| Replays | Every 1 v 1 game is replayed sped up at the end, like a GIF | Requested; move log and replay |

## 7. Drinking games

For adults only. Every drinking game should work with any drink, and "drink" can be replaced by any other forfeit. The host decides whether drinks are shown at all.

| Game | How it plays | Status |
| --- | --- | --- |
| Loser drinks (any round) | After a round or minigame, last place, or everyone below a score, drinks a set number of sips | New mechanic: sips as a forfeit next to points |
| Never have I ever | A statement shows; everyone who *has* taps "I have" and drinks; the TV shows how many (or who, if the room allows) | New mechanic: confession answers + sips |
| Most likely to… | Vote which player fits; the most votes drinks | New mechanic: vote for a player + sips |
| Truth or drink | A random player gets a question; answer out loud or drink | New mechanic: random player picks + prompt decks |
| Paranoia | A player answers "who in the room…?" privately by naming someone; flip a coin on the TV whether the question is revealed, or drink to keep it secret | New mechanic: private player votes + coin flip |
| Categories | Name things in a category in turn; the first to fail drinks | Parts ready as a host-judged challenge; new mechanic for turns |
| Higher or lower (ride the bus) | Guess higher or lower on cards; wrong drinks | New mechanic: card decks + chained rounds |
| Kings cup style deck | Draw a card on the TV, each card is a rule ("waterfall", "make a rule", "pick a mate") | New mechanic: card decks with rules |
| Power hour | A cue every minute (a song change); everyone sips | New mechanic: timed cues (and audio) |
| Pick a mate | A player chooses a "mate" who drinks whenever they drink, for a while | New mechanic: linked players |
| Drink-or-dare round | Choose a dare (host judges) or drink | Parts ready mostly (challenge) + sips |

What drinking games need from the app:

- **Sips as a forfeit**: next to points; per round "last place drinks 2", "wrong answers drink 1", "most votes drinks"; the TV and the player's phone show who drinks how much. Optional per game.
- **Vote for a player** and **confession answers** ("I have / I haven't").
- **Prompt decks**: lists of statements or cards, drawn at random without repeats; the editor gets a deck builder and the text import gets decks.
- **Safety and comfort**: a "drinking game" game setting that the host must switch on; an age note on joining; any player can choose "no alcohol" (their forfeit is shown as "take a sip of water" or a dare); the host can cap sips per round and call a water break; no score for drinking itself.

## November minigame feedback

Use the [minigame playtest checklist](minigame-playtest.md) to tune one implemented game at a time. The queue starts with short whole-room rounds. It groups ideas that can reuse controls, scoring or the submission flow. Each item gets its own playtest.

| Order | Idea | First playable version |
| --- | --- | --- |
| 1 | Cut the Line | Implemented with a shared target, cuts in tenths of a percent (no countable whole steps; feedback 494811d2) and points by place (server submission time breaks ties) or by closeness. |
| 2 | Match the Angle | Implemented with tenths of a degree (no countable whole steps; feedback 494811d2), targets away from common angles, and server submission time breaking ties in circular distance. |
| 3 | Count the Dots | Implemented. Only the host and shared display see the pattern. Phones open the guessing field when the viewing timer ends. |
| 4 | Heads or Tails | Built as a secret-pick hosted round with one shared reveal, and as a solo phone game with optional play-chip stakes. |
| 5 | Roulette | Built: full European table (numbers, colours, odd/even, low/high, dozens, columns) with a rolling ball on one shared wheel. Players bet their own points, up to their score or the scene's minimum stake. The arcade and the solo phone game (play chips) use the same table. |
| 6 | Build Your Meme | Add captions to an author-provided image. Show entries anonymously and vote for the funniest. |
| 7 | Draw the Graph | Implemented. Players finish the same partial graph with assigned colours. The host and TV reveal all guesses with the actual line. Lowest average vertical error wins, with submission time breaking ties. |
| 8 | Program the Robot | Use Blockly for the phone’s block editor. Author a grid and let players arrange movement blocks. Rank finishes first, then progress and time. Add loops, conditions or enemies after playtesting the basic round. |
| 9 | Shared-Screen Jump Runner | Use the phone as a jump controller for an original distance race visible on the TV. |
| 10 | One-Tap Flight | Make an original aerial obstacle course with one-tap lift. |
| 11 | Fruit Slice | Make an original swipe game with original visuals and rules. Validate touch input and scoring across phones. |
| 12 | Territory Drawing | Cover the most area. Prototype simultaneous strokes in free-for-all first, then add two-player and team modes. |
| 13 | 8-Ball Pool | Hosted rounds and two-player phone challenges are playable. The host and TV mirror each shot. Solo practice remains open. |
| 14 | Kart Race | Treat the report's “Mario card game” as a possible kart race. Confirm the mechanic and landscape controls before implementation. |
| 15 | Krillion | Park until someone can describe the objective and the phone controls. |
| 16 | Creature Adventure | Scope an original short adventure set around the existing Creature Duel. A full adventure is a separate project-sized decision. |

Feedback attachments are already implemented. A report can include one image up to 2 MB or one video up to 5 MB. The owner can open it in Admin. Capturing and playing clips across physical phones remains a device check. [Feedback build plan](feedback-build-plan.md#editor-themes-and-media)

## Earlier suggestions

1. Drinking basics: sips as a forfeit, vote for a player, confession answers, prompt decks (unlocks most of section 7 and several of section 2).
2. Host media in scenes (pictures, music, sounds) and the show host character (already next in the plan).
3. Number answers with closeness scoring, speed bonus, majority/minority scoring (cheap, many quiz variants).
4. More phone minigames: tug of war (reuses the tap stream), quick maths, colour clash, hot potato.
5. Draw and guess and telephone (reuse live strokes and drawings).
