# Scenes from building blocks

Written 13 November 2026 from the owner's request list: games on the phones while waiting (slot machine, blackjack, pack opening, with a gambling leaderboard), 1 v 1 challenges such as chess with a replay at the end, and the minigames Galgje (Hangman) and Undercover / Mr. White. None of these are built. This note describes how to build them so that each new game makes the next one cheaper. It does not change what is built.

## The idea

Today each minigame is its own piece of code: Reaction duel, Tap race, Lucky doors and so on each have their own rules on the server and their own phone and TV screens. That was right for the first few. For the games requested now it would mean a lot of code that is almost the same: Undercover and Mr. White are one game with a different setting, Blackjack and Higher-or-lower (in the drinking list) share a deck of cards, and a slot machine, a loot box and Lucky doors all "pick something at random, keep it secret until it is shown".

So the next games are built as a small number of **scene kits**. A kit is a game skeleton with settings (knobs) in the editor. Each kit is made from shared **building blocks**. The author never writes code; they choose a kit and turn the knobs. This follows the existing rule in [creative minigames](creative-minigames.md#a-reusable-mechanic-contract): no scripting language, no plug-ins; a few trusted mechanics with settings that the server checks.

## Building blocks

Each block is written and tested once, on the server, and is then reused by every kit that needs it.

| Block | What it does | Already exists as |
| --- | --- | --- |
| Fair chance | The server draws at random (cards, reels, pack contents, roles) and records the draw, so a restart or a replay shows the same result. Phones never decide chance. | Lucky doors, wheel of fortune |
| Secret per player | Each player sees only their own card, role or word; the TV sees nothing until the reveal. | Lucky doors (server-only doors) |
| Word lists and decks | Lists of words, pairs of similar words, statements or cards, drawn without repeats. Also needed for the drinking games. | Not yet |
| Turns | Whose turn it is, a time per turn, skipping someone who left. | Pass the pencil |
| Pairs and matches | Two players (or teams) play each other: challenge, accept or decline, a bracket for more players. | Teams and 1 against the rest (partly) |
| Vote for a player | Everyone votes for a person instead of an answer; ties follow the game's rules. | Votes on answers, route votes |
| Lives and knock-out | Players drop out (voted out, hanged, bust) and watch until the end. | Not yet |
| Chips | A play currency next to the points: bets, wins and losses, never real money. | Not yet |
| Move log and replay | Every move is stored in order with its time; the replay redraws the game from the moves, sped up. No video is stored, so it is small. | Drawings are stored as strokes, the same idea |

## Kits for the requested games

| Kit | Knobs | Covers |
| --- | --- | --- |
| Secret words | Number of word pairs, how many undercover players, whether there is a Mr. White (no word), clue rounds, vote rounds, whether Mr. White may guess the word when voted out | Undercover, Mr. White, later Spyfall-style and Chameleon-style games |
| Guess the word | Who picks the word (host, a player, the list), how many wrong guesses, everyone at once or in turns, guesses by letter or whole word | Galgje (Hangman), later Wordle-style guessing |
| Card table | Which game (Blackjack, Higher or lower), chips to start with, the bet limits, number of decks | Blackjack, Higher or lower, later a Kings Cup style deck |
| Chance machine | What can come out and how likely (reels, pack contents with rarities), the price per go | Slot machine, pack opening and loot boxes, later more |
| 1 v 1 board | Which board game (chess first), time per player, whether a draw can be offered | Chess, later Four in a row, Tic-tac-toe |

The likelihoods in the Chance machine are shown to the players (as in real loot-box rules), and everything is play money.

## Side games while waiting

Built on 14 November 2026: slot machine, blackjack and packs with chips and a leaderboard, and people (accounts). The owner decided: side games pause when a round needs the player, the host setting is on by default, and the leaderboard carries over between games through accounts. They are built as three trusted games, not yet as the Chance machine and Card table kits; the blocks fair chance (server draws), secret per player (the dealer's card) and chips now exist to build those kits on. The rules below are the original suggestions; see the README instructions for what is built.


The waiting games and the 1 v 1 challenges are different from scenes: they are not a step in the game's flow, but something players do on their own phone **between** rounds. They are a separate layer next to the game, with these rules (suggestions for the owner to confirm):

- The host switches side games on or off per room, and can set which ones are allowed. Off by default for the shared screen: it stays calm.
- When a round starts that needs the player, their side game is paused (or forfeited, for a 1 v 1 with a clock) and the round comes first.
- Chips from side games are separate from the game's points unless the author chooses to convert them; the gambling leaderboard shows chips bet, won and lost.
- A "gambling" setting like the planned "drinking game" setting: the host must switch it on; slot machine, blackjack and packs are hidden otherwise.
- 1 v 1 replays are shown at the end of the game (in the awards show, for example "Best match"), from the move log.

## Order of work (suggestion)

1. The shared blocks that unlock the most: word lists and decks, secret per player, vote for a player, lives and knock-out. Then the **Secret words** kit (Undercover / Mr. White) and **Guess the word** (Galgje) as ordinary scenes. These also unlock several drinking games.
2. **Chips** and the side-game layer with the **Chance machine** (slot machine, packs) and the gambling leaderboard.
3. **Card table** (Blackjack), which reuses decks, chips and secret per player.
4. **Pairs and matches**, the **move log and replay**, and the **1 v 1 board** with chess. Chess rules need checking on the server; a small, maintained rules library with no dependencies of its own is worth reviewing first instead of writing chess rules from scratch.

Each kit gets the same checks as the minigames so far: the server decides everything that matters, secrets never reach other phones, a restart in the middle continues or restarts cleanly, and tests for the rules and scoring.
