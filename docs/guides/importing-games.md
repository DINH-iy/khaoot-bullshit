# Making a game from text (for example with an AI)

You can create a whole game by pasting text into **Your games → Import a game from text**. The text is JSON in a simple format described below. It is easy to write by hand and it is the format AI assistants such as Claude or ChatGPT produce reliably.

## How it works

1. In the host menu, open **Import a game from text** and press **Copy instructions for an AI**. This copies the section "Instructions for the AI" below.
2. Paste them into an AI chat, and below them describe the game you want. The AI first asks a few short questions (who plays, how long, teams or not, which kinds of rounds, a style) and waits for your answers; say "just make it" to skip them. For example: *"A 20-minute pub quiz about the 90s for 12 friends: a welcome screen, five timed questions, a caption contest with voting, and the party chooses between a music round and a movie round before the final scoreboard."*
3. Copy the AI's answer and paste it into the import box. Code fences (```` ```json ````) and a sentence before or after the JSON are fine.
4. Press **Import**. The game is created as a draft and the editor opens.
5. Check the scenes. Any problem is shown in plain language on the scene it concerns. Fix it in the editor, or ask the AI to fix it and import again.
6. Use **Rehearse** to try it, then **Publish** to play it with everyone.

Nothing is lost: if the text is a game with mistakes, it is still imported as a draft with its problems listed. Only text that is not JSON at all is refused.

To change an existing game with an AI, use **Export as text** in the editor, give the result to the AI with your request, and import its answer as a new game.

## What is needed

- **JSON**, with a `title` and a list of `scenes`.
- Each scene needs a `type` and its text. Everything else has a sensible default.
- Limits: up to 100 scenes and 256 KB of text, 2–12 answers per question, 2–8 items to order, 2–8 routes per party choice, timers from 1 second to 1 hour.

Defaults when something is left out:

- scenes play in the order listed, starting with the first;
- names (`id`s) are made from the text;
- quiz questions get 20 seconds and 10 points;
- writing rounds get 60 seconds and 240 characters;
- uploads get 90 seconds and accept pictures;
- party choices get 20 seconds, with everyone voting, a random pick on a tie or when nobody votes, and counts shown when the route is announced.

## Format reference

Top level:

| Field | Meaning |
| --- | --- |
| `title` | Name of the game (required). |
| `scenes` | The scenes, in play order (required). |
| `start` | `id` of the first scene. Default: the first scene. |
| `look` | Optional texts, style and animations, see "Look & feel". |
| `wheels` | Optional wheels of fortune: `[{ "title": "Forfeits", "entries": ["Sing a song", "Tell a joke"], "removePicked": true, "spinSeconds": 5 }]`, optionally with its own slice colours, `"colors": ["#f39200", "#7ac6b6"]` (2–8; otherwise the game's answer colours). A scene with `"spin": "Forfeits"` lets the host spin it there; `"wheelClear": true` stops showing the last result. |
| `awards` | The end-of-game awards in order, from `winner`, `mostCorrect`, `mostWrong`, `fastest`, `slowest`, `mostVotes`, `minigameChamp`, `luckiest`, `mostReactions`, `fewest` (the wooden spoon: fewest points) and `scene` (most points in one scene). Leave out for all of them; `[]` for none. An entry can also be an object with its own title, and `scene` needs one: `{ "award": "scene", "scene": "karaoke", "title": "Karaoke champion" }` (`"scene"` is a scene's `id`). |
| `sideGames` | `false` to leave out the side games on the phones (slot machine, blackjack, packs, challenges). Default: on, just for fun. |
| `autoRevealSeconds` | Reveal ready results automatically after 0–120 seconds. 0 means as soon as ready. Omit for manual reveal. |
| `birthdayVote` | Set to `true` to enable the private birthday vote for players. |
| `idleCloseMinutes` | Close an empty party room after this many minutes (0 to 1440). Default: 0. A host or player connection resets the countdown. |
| `quickTime` | Seconds the host's quick time button adds to a running round. Default: 30. The host can change it in the room. |
| `chips` | `true` to play the side games with chips (play money): bets, stakes in challenges and a leaderboard. Default: off. The host can still switch both in the room. |
| `openInvites` | How many challenges a player can have waiting for an answer at once (1 to 10). Default: 3. The host can change it in the room. |

Every scene can have:

| Field | Meaning |
| --- | --- |
| `id` | Short name used to connect scenes, for example `"music-round"`. |
| `type` | One of the types below. |
| `seconds` | Timer. Leave it out for no timer (the host continues). |
| `next` | `id` of the scene that follows, or `"end"` to end the game there. Default: the next scene in the list. |
| `look` | Optional look for this scene only, see "Look & feel". |
| `explain` | Show an intro before the round starts, until the host continues (players tap *Got it!*): the text, `true` on a minigame for its standard "how to play" (which the game's look can change, see "Look & feel"), or an object `{ "text": "…", "points": false, "screenOnly": true, "picture": { "id": "…", "kind": "image" } }`. A round that earns points shows its points at stake in the intro (worked out from its scoring: "Up to 15 points", "2 points per vote"); `"points": false` leaves them out. `"screenOnly": true`: only the shared screen shows the intro and phones wait without tapping. `picture`: a picture from the media library. For quiz, poll, order, writing, upload, drawing, challenge, vote and minigame scenes. |
| `showPoints` | `true`: an intro that shows only the points at stake (no text needed); `false`: an `explain` without the points. |
| `countdownSeconds` | Pre-start countdown for a drawing round or minigame (0–15 seconds), after any explanation. |
| `resultCards` | On a vote, upload or drawing round, use `"manual"` for host-stepped results or a number (1–60) for seconds per card. Omit to show results together. |
| `parts` | Instead of one scene, several parts that play one after another, each written like a scene (for example a question followed by a scoreboard). |

Scene types:

| `type` | Fields | Notes |
| --- | --- | --- |
| `cutscene` | `title`, `text` | Shown on every screen. The host continues. |
| `quiz` | `question`, `answers` (list of words), `correct` (one of the answers), `points`, `layout` (`"tiles"` or `"list"`) | Without `correct` it is an opinion question with no points. |
| `poll` | `question`, `answers` | Like a quiz without a correct answer. |
| `order` | `question`, `items` (in the correct order), `points` | Players see the items shuffled; points only for the exact order. |
| `writing` | `question`, `maxLength`, optional `maxPoints` and `places` | Jokes, captions, excuses. Can be voted on, or the host gives points (`maxPoints`). |
| `upload` | `question`, `accept` (any of `"pictures"`, `"gifs"`, `"videos"`), optional `maxPoints` and `places` | Can be voted on, or the host gives points (`maxPoints`). |
| `vote` | `question`, `votesOn` (`id` of a writing or upload scene), `pointsPerVote` | Players vote anonymously, never for their own answer. |
| `challenge` | `question`, `maxPoints` | Something the group does in the room; the host gives points. |
| `party-choice` | `question`, `options` (each `{ "label": "Music", "to": "music-round" }`), `decidedBy` (`"players"`, `"captains"`, `"host"`), `onTie` (`"random"` or `"host"`), `showCounts` (`"reveal"`, `"live"`, `"never"`) | The party picks a route. Routes may come back together at a later scene. |
| `minigame-draw` | `question`, `games` (each `{ "label": "Tap race", "to": "tap-scene" }`), optional `seconds` | A random draw picks one of the minigames. The host presses Draw, or the timer draws. Every screen shuffles the cards and shows the game that was drawn. Each game is its own minigame scene. A team game in the draw gets teams for that round. |
| `minigame` with `draw` | `question`, `draw` (2–8 games, each a name or `{ "game": "cut-the-line", "seconds": 20, "settings": { … } }`) | A minigame draw in one scene: when the scene starts, one of the games is drawn at random and played right there, with its own settings and time. Points, teams and look are the scene's. In the editor: **Plays → A draw**, and the pencil beside each game for its settings. |
| `scoreboard` | `title`, `show` (`"players"`, `"teams"`, `"both"`) | Shows the standings. |
| `drawing` | `question`, optional `blind` (`true`: players cannot see what they draw), optional `maxPoints` and `places` | Players draw on their phone. Can be voted on, or the host gives points (`maxPoints`). |
| `minigame` | `question` (title on the screens), `game` (`reaction`, `tap-race`, `clap-beat`, `speed-run`, `stop-clock`, `cut-the-line`, `match-the-angle`, `count-the-dots`, `heads-or-tails`, `red-or-black-roulette`, `lucky-doors`, `perfect-circle` or `relay-drawing`, which needs team play), optional `settings`, `points` (list: 1st, 2nd, 3rd place…), `teamResult` (`average`, `best`, `total`), `tiebreak` (`faster`, `shared`; precision minigames only), `scoring` (points by closeness: `within` or `scale`, with `distance` and `points`) | Played on the phones. Default points 10, 6, 3. Settings: reaction `{ "minWaitMs": 2000, "maxWaitMs": 6000 }`, tap race `{ "seconds": 10 }`, stop the clock `{ "targetMs": 10000, "visibleMs": 3000 }`, lucky doors `{ "doorsMilli": ["0", "5000", "10000"] }` (points × 1000), roulette `{ "betFloor": 100 }` (no `points`: players bet their own). Works solo or with `play` for teams, including one against the rest. An unknown `game` stays a scene to choose in the editor. |
| `duel` | `question` (what the two do), optional `pick` (`random`, default, or `host`), `game` (leave out for any contest the host judges, or `rps`, `tictactoe`, `chess`, or `creature-duel` played on the two phones), `settings` (rock paper scissors: `{ "firstTo": 2 }`), `points` (for the winner, default 10) or `places`, `betPoints` (for each right bet, default 1), `seconds` (betting time, default 30) | Two players face off while everyone else bets on the winner. The host names the winner, or the game does. |

**Points by place** (`places`), on a `quiz`, `order`, `vote`, `challenge`, `minigame` or `duel`: either a list, `"places": [10, 6, 3]` (points for 1st, 2nd, 3rd), or a total the server splits, `"places": { "total": 30, "places": 3, "curve": "even" }` (`curve`: `even` 3-2-1, `steep` halves each place, `equal`). Quiz and order: the fastest correct answers, on top of `points`. Vote: the most-voted answers, on top of `pointsPerVote`. Challenge: the host gives each player a place. Minigame: instead of `points`. Duel: 1st is the winner, 2nd the runner-up. Equal results share a place.

Rules the game must follow (the editor explains any break):

- a scene that is voted on must come before its vote on every route, and every route through it must reach that vote;
- the game may never go round in a circle;
- every scene must be reachable;
- only a party choice or a minigame draw leads to more than one scene, and each of its options leads to a different scene.

### Teams

Leave teams out for everyone-for-themselves; most games are. For a team game, add a **Pick teams** scene where the teams are made, and mark the rounds after it that are played in those teams:

```json
{ "id": "teams", "type": "pick-teams", "title": "Pick your teams", "teams": 2, "how": "skill", "captains": true, "next": "q1" },
{ "id": "q1", "type": "quiz", "question": "…", "inTeams": true, "captain": true, "next": "…" }
```

- `teams`: how many equal teams (2–12, default 2). For exact sizes use `"form": { "split": { "kind": "sizes", "sizes": [1, "rest"] }, "formation": "random" }`.
- `how`: `"random"`, `"skill"`, `"host"` or `"players"` (default). In the room the host always sees the teams first, can move players, add or remove teams, and starts when they are right.
- `captains`: `true` gives each team a captain.
- On a round, `"inTeams": true` plays it in the teams of the last Pick teams scene; `"captain": true` lets only the captain answer. Rounds without it are everyone for themselves. Duels, party choices, cutscenes and scoreboards are never played in teams.
- One round with its own teams (like one against the rest): `"play": { "kind": "teams", "lineup": { "kind": "round", "form": { "split": { "kind": "sizes", "sizes": [1, "rest"] }, "formation": "random" } }, "answers": "everyone", "points": "members" }`.
- Older games with game-wide `teams` and `play` still import; the editor turns them into a Pick teams scene at the start.

### Pictures, videos and songs

A quiz, writing, upload, drawing or challenge round and a cutscene can show one picture, video or song with its text. Open **Game menu → Media library** to browse and manage files, then attach a file through the scene’s *Picture, video or song* control. The library can import an MP3 from a YouTube video when you have permission to download and use the audio, or save a trimmed MP3 copy of a library song. The game text stores library references. An exported game keeps them as `"media": { "id": "…", "kind": "image" | "video" | "audio" }` and imports them again on the same server. Pictures show on the shared screen and the phones; videos and songs play on the shared screen (on the host's screen when none is connected), and the phones say to watch or listen.

### Music

A game can have a background playlist of songs from the media library (Game settings → Music): it plays on the shared screen from the lobby on, song after song and round again. Each scene's *Music* says what happens there: the music plays on (the default), the scene plays a song of its own on repeat, the music plays quieter, or there is silence. While a scene shows its own video or song, the music plays quieter by itself. The host can switch music off and set the volume in the room's settings. In text: `"music": "quiet"` or `"music": "stop"` on a scene; an exported game keeps the playlist (`"music": { "tracks": [{ "id": "…", "kind": "audio" }] }`) and a scene's own song (`"music": { "mode": "play", "track": { "id": "…", "kind": "audio" } }`).

### Look & feel

Leave `look` out for the standard look. Everything in it is optional, and a scene's `look` changes only that scene:

```json
"look": {
  "theme": { "preset": "neon", "colors": { "accent": "#ff2bd6" }, "font": "condensed", "radius": 8, "background": "grid", "tiles": "outline", "sliderStyle": "blade" },
  "texts": { "answer.saved": "Locked in!", "timer.left": "{time} to go", "lobby.playerTitle": "Welcome, quizzer!" },
  "animations": { "sceneEnter": { "preset": "drop" }, "minigameEnter": { "preset": "fade" }, "answerSaved": { "preset": "pop" } }
}
```

- `theme.preset`: `party`, `neon`, `pub`, `clean`, `retro`, `kids`, `elegant`, `space`, `mars`, `saturn`, `neptune`, `ocean`, `christmas`, `birthday` or `mbou` (MBO Utrecht's colours); then any of `colors` (`background`, `background2`, `surface`, `text`, `muted`, `accent`, `accentText`, `success`, `danger`, `answerText` as `#rrggbb`, or `#rrggbbaa` for a see-through colour, and `answers` as a list of 2–8 colours), `font` and `headingFont` (`system`, `rounded`, `serif`, `slab`, `mono`, `condensed`, `playful`, `elegant`), `radius` (0–40), `textScale` (0.8–1.6), `background` (`gradient`, `solid`, `dots`, `stripes`, `glow`, `grid`), `tiles` (`filled`, `outline`, `glass`, `flat`), `gradients` (true: a gradient effect on answer tiles and main buttons; off unless set), `markers` (`letters`, `numbers`, `shapes`, `custom` with `customMarks`: up to 8 short marks such as emoji, or `none`), `markerShape` (`circle`, `square`, `rounded`, `plain`), `markerPlace` (`start`, `end`, `top`), `routeMarkers` (`arrows` or `answers`), `sliderStyle` (`blade`, `notch`, `ring`, or `dial` for the Cut the Line slider), `timerStyle` (`digits`: “1:25 left”, or `clock`: a round clock that empties, pulses red in the last seconds and flashes red when time is up) and `uppercaseHeadings`.
- Upload a font or import a single family from Google Fonts in **Look & feel → Colours & style → Text**. If the editor reports that a font is already in the shared library, choose the existing entry. For an existing font, `font` and `headingFont` also accept an object such as `{ "id": "<existing font UUID>", "name": "Space Grotesk" }`. To set fonts across the game, put them in the whole-game look. A scene can override either choice.
- `texts`: the names of the texts are listed in the editor's Look & feel tab and in `packages/contracts/src/presentation.ts`; words in curly brackets such as `{time}` are filled in during the game.
- A minigame's "how to play" is a text too, for example `"minigame.how.bus": "Guess together; wrong costs sips."`; the screen before a round uses `explain.title`, `explain.ok`, `explain.waiting`, `explain.ready`, `explain.start`, `explain.atStake`, `explain.points`, `explain.upTo`, `explain.perVote`, `explain.mostVotes` and `explain.lookUp`.
- `animations`: for the moments `sceneEnter`, `answersEnter`, `answerSaved`, `timerEnding`, `reveal`, `scoreboard`, `cutscene`, `lobbyJoin`, `mediaEnter`, `teamsEnter`, `explanationEnter`, `voteEnter`, `routeEnter`, `duelEnter`, `minigameEnter` and `finaleEnter`, a ready-made `preset` (`none`, `fade`, `rise`, `drop`, `zoom`, `pop`, `slideLeft`, `slideRight`, `flip`, `spin`, `blur`, `bounce`, `wobble`, `shake`, `pulse`, `cascade`), or your own `custom` animation built in the editor.

Unknown names, wrong colours and anything that looks like code are listed as problems, never used.

<!-- ai-instructions:start -->
## Instructions for the AI

You are writing a party game for a web app where people play on their phones while a shared screen shows the game and a host runs it.

**First, ask before you write.** Unless the user already told you, ask these questions in ONE short, numbered message, then wait for their answers before writing anything:

1. Who is playing: how many people, roughly what age, and what is the occasion (a birthday, Christmas, a work outing, a pub quiz…)?
2. How long should it last (for example 15, 30 or 60 minutes)?
3. Everyone for themselves, or in teams?
4. Which kinds of rounds do they like: quiz questions, writing jokes or captions, drawing, photos, challenges in the room, minigames on the phones, duels, the party choosing a route, a wheel of fortune, awards at the end?
5. Language, topics, names or inside jokes to use, and anything to avoid?
6. A style: a ready-made one (for example party, Christmas or birthday) or their own colours (hex codes welcome)?

If the user says "just make it" or has already answered, do not ask; choose sensible defaults. Ask at most one follow-up question, only if something important is unclear.

**Then reply with ONLY one JSON object (no explanation),** in this format:

- Top level: `"title"` (string) and `"scenes"` (array, in play order). Optional: `"start"` (id of the first scene).
- Every scene: `"id"` (short lowercase name with dashes, unique), `"type"`, its texts, optional `"seconds"` (timer), optional `"next"` (id of the following scene, or `"end"`; default is the next scene in the list).
- Types and their fields:
  - `"cutscene"`: `"title"`, `"text"`. Introductions, rules, jokes, transitions.
  - `"quiz"`: `"question"`, `"answers"` (2–12 short strings), `"correct"` (exactly one of the answers), `"points"` (number, default 10), optional `"layout"`: `"tiles"` or `"list"`.
  - `"poll"`: `"question"`, `"answers"`. No correct answer, no points.
  - `"order"`: `"question"`, `"items"` (2–8 strings, listed in the CORRECT order), `"points"`.
  - `"writing"`: `"question"`, optional `"maxLength"` (characters, default 240). For jokes, captions, excuses. Write the prompt in `"question"`. The editor also offers Prompt starters inside Writing.
  - `"upload"`: `"question"`, `"accept"`: any of `"pictures"`, `"gifs"`, `"videos"`.
  - `"vote"`: `"question"`, `"votesOn"` (id of an earlier writing or upload scene), `"pointsPerVote"`.
  - `"challenge"`: `"question"` (something people do in the room), `"maxPoints"`. The host judges.
  - `"duel"`: `"question"` (what the two do), optional `"pick"`: `"random"` or `"host"`, optional `"game"`: `"rps"`, `"tictactoe"`, `"chess"`, `"creature-duel"` or `"eight-ball"` (played on the two phones; leave out for any contest the host judges), `"points"` (for the winner), `"betPoints"` (for each right bet), `"seconds"` (betting time). Everyone else bets on the winner.
  - Optional on quiz, order, vote, challenge, minigame and duel: `"places"`: a list like `[10, 6, 3]` (points for 1st, 2nd, 3rd: the fastest correct answers, the most-voted answers, the host's places, the minigame's places, the duel's winner and runner-up), or `{ "total": 30, "places": 3, "curve": "even" }` to split a total (`curve`: `"even"`, `"steep"` or `"equal"`).
  - `"party-choice"`: `"question"`, `"options"`: 2–8 objects `{ "label": "Music", "to": "id-of-first-scene-of-that-route" }`, optional `"decidedBy"`: `"players"`, `"captains"` or `"host"`. Each option must go to a DIFFERENT scene. Give the last scene of each route `"next"` set to the scene where the routes come back together.
  - `"minigame-draw"`: a random draw decides which minigame is played. Give `"question"` (for example "Which minigame will it be?") and `"games"`: 2–8 objects `{ "label": "Tap race", "to": "id-of-that-minigame-scene" }`. Each game must go to a DIFFERENT `"minigame"` scene. Give each of those scenes `"next"` set to the scene where the game continues. The host draws. With `"seconds"`, the draw also happens by itself when the time runs out. The draw is made once and is never redrawn. Team games such as `"relay-drawing"` and `"bus"` may be in the draw: without `"inTeams": true` they get teams of two for that round only.
  - `"scoreboard"`: `"title"`, `"show"`: `"players"`, `"teams"` or `"both"`.
  - `"drawing"`: `"question"` (what to draw), optional `"blind": true`. Can be voted on with a `"vote"` scene.
  - Points on `"writing"`, `"upload"` and `"drawing"`: add `"maxPoints": 10` (optionally `"places": [10, 6, 3]`). The answers are shown, and then the host gives each player (or team) up to that many points, or a place. A round with `"maxPoints"` cannot also be voted on. To let the players vote instead, leave `"maxPoints"` out and add a `"vote"` scene.
  - `"minigame"`: `"question"` (a short title), `"game"`: `"reaction"` (tap at GO), `"tap-race"` (tap fast), `"clap-beat"` (clap softly or tap on six lit beats, with local microphone opt-in; use at least 9 seconds), `"speed-run"` (navigate the obstacle course, fastest finish wins), `"stop-clock"` (stop a vanishing clock at a target; the room never displays the time-left badge in this round), `"lucky-doors"` (pick a door with hidden points; optional `"settings": { "doorsMilli": ["0", "5000", "10000"], "order": "fixed" }` for points in thousandths behind door 1, 2, 3… in that order instead of shuffled), `"perfect-circle"` (draw the roundest circle), `"relay-drawing"` (teams take turns drawing one picture, then vote), `"bus"` (Drive the bus, the drinking game: each team guesses red or black, higher or lower, inside or outside, then the suit; a wrong guess costs everyone in the team that round's sips, optional `"sips": [1, 2, 3, 4]`; a team whose four cards are four different suits, a rainbow, makes the other teams drink the last round's sips unless `"rainbow": false`; fewest sips wins) or `"majority"` (Left or right: everyone picks left or right in secret, the majority gets the 1st-place points; a tie: nobody); optional `"points"`: list of points for 1st, 2nd, 3rd place. `"relay-drawing"` and `"bus"` are team games: put them after a Pick teams scene with `"inTeams": true`, or they get teams of two for that round. In a team round, `"bus"`, `"lucky-doors"` and `"majority"` take `"decide"`: `"anyone"` (anyone in the team taps the choice), `"vote"` (each member votes within `"voteSeconds"`, default 20; who does not vote is not counted) or `"captain"` (the captain decides; a team without one gets one at random). Use `"seconds"` of 20–30 (Drive the bus: 120–180).
- Rules: no loops (never lead back to an earlier scene); every scene must be reachable; a `"vote"` must come after the scene it votes on, on every route, and every route through that scene must reach the vote; only a party-choice or a minigame-draw may lead to more than one scene.
- Teams are optional. Draw the Graph, Heads or Tails, and Roulette use individual play even in a team game. To form teams, add a scene `{ "type": "pick-teams", "title": "Pick your teams", "teams": 2, "how": "random" | "skill" | "host" | "players", "captains": true }` (optionally `"names": ["Sharks", "Jets"]`: the teams' own names, one per team; and `"colors": "teams"`: each team picks its own colour on the phones; otherwise the host picks the team colours) where the teams are made, and `"inTeams": true` (plus `"captain": true` if only captains answer) on the rounds after it that are played in those teams. Quiz, writing, upload, drawing, order, challenge, vote and minigame rounds can be played in teams; duels, party choices, cutscenes and scoreboards cannot.
- Optional wheels of fortune, at top level: `"wheels": [{ "title": "Forfeits", "entries": ["Sing a song", "Tell a joke", "Swap seats"], "removePicked": true, "spinSeconds": 5 }]`, optionally with their own slice colours `"colors": ["#f39200", "#7ac6b6"]` (`#rrggbb` or see-through `#rrggbbaa`). A scene with `"spin": "Forfeits"` (usually a cutscene) lets the host spin that wheel there; `"wheelClear": true` on a later scene stops showing the last result.
- Optional end-of-game awards, at top level, in order: `"awards"`: names from `"winner"`, `"mostCorrect"`, `"mostWrong"`, `"fastest"`, `"slowest"`, `"mostVotes"`, `"minigameChamp"`, `"luckiest"`, `"mostReactions"`, `"fewest"` (the wooden spoon), or objects with their own title; `"scene"` (most points in one scene) needs the scene's id: `{ "award": "scene", "scene": "karaoke", "title": "Karaoke champion" }`. Leave out for the standard awards; `[]` for none.
- Side games on the phones while players wait are on; `"sideGames": false` switches them off, `"chips": true` allows play-chip bets and paid packs. Free packs can be opened when chips are off, and only pack openings that spend chips add cards to the collection. Pack availability is managed in **Admin → Chips & packs**. A player can have 3 challenge invites waiting at once; `"openInvites": 5` allows 5 (1 to 10).
- Any round people play (not a cutscene, scoreboard, party choice, duel or Pick teams) can explain itself first: `"explain": "Each team gets one guess per card…"` shows that text before the round starts, players tap Got it and the host starts the round; on a minigame `"explain": true` uses its standard "how to play". Use it for minigames and unusual rounds. A round that earns points also shows its points at stake in that intro (from its own scoring); add `"showPoints": true` to a round for an intro with only its points (for example before a big question), or `"showPoints": false` to leave them out. `"explain": { "text": "…", "screenOnly": true }` shows the intro on the shared screen only, and the phones wait without tapping. An intro's `"picture"` comes from the media library, so leave it out: the author adds it in the editor.
- Pictures, videos and songs (`"media"`) are added separately in the editor. Under **Game menu → Media library**, authors can upload a file, import permitted YouTube audio as an MP3, or trim a library song and save an MP3 clip. They can attach a file with the scene's *Picture, video or song* control. Leave `"media"` out; when a question needs one ("Which city is this?", "Name this song"), say in its `"question"` what it shows and tell the user afterwards which scenes need a picture, video or song added.
- Visible YouTube clips: for a quiz, writing, upload, drawing or challenge round or a cutscene, `"youtube": { "videoId": "M7lc1UVf-VE", "startSeconds": 5, "endSeconds": 15 }` uses the video the user supplied. Start and end are optional whole seconds from the start of the video; end must be greater than start. Use a video that allows embedding. The editor accepts a YouTube link in *Picture, video or song → Add YouTube video*.
- Use `"mediaLayout": { "position": "left", "size": "standard" }` to position a scene’s picture, clip or song relative to its text. `"position"` is `"below"`, `"above"`, `"left"` or `"right"`; `"size"` is `"compact"`, `"standard"` or `"wide"`. Side-by-side media stays beside the text on the shared display and in the editor when space allows. The phone view stacks it below the text. Defaults are below and standard.
- When reusing a known library item, its `"media"` reference can include a scene-only picture crop, `"crop": { "ratio": "landscape", "x": 50, "y": 50 }`, or a video or song cut, `"trim": { "startSeconds": 2, "endSeconds": 8 }`. Crop ratios are `"square"`, `"landscape"` and `"portrait"`, with focus coordinates from 0 to 100. The end time is optional. For a song, include `"waveform": false` in its media reference to hide the waveform in that scene while keeping playback controls.
- Scene translations: `"translations": { "nl": { "prompt": "Welke dag is het?", "labels": { "friday": "Vrijdag" } } }`. The language keys are `en`, `nl`, `de` and `ro`. Use `prompt` for the question or scene text, `title` for a cutscene title, `explanation` for its explanation and `labels` for choices, routes or ordering items. Give options explicit `key` and `label` fields when translating them. Omitted values use the original. Custom standard texts can also be translated in `look.translations` using the same language keys and standard text keys such as `"answer.saved"`.
- A `"duel"` with `"game": "creature-duel"` can use `"settings": { "size": 3 }` for three creatures on each side. The default `"size": 1` gives one each. Turns draw three optional moves at random.
- For **8-ball pool**, use `"type": "duel", "game": "eight-ball"`. In the editor it is available from Add a scene → Head-to-head duel. Set `"pick": "random"` (default) or `"host"` to select two players. The others predict the winner for `"betPoints"` points each, and the winner gets `"points"`. Use `"seconds"` for the voting timer. Add `"matchSeconds": 120` to cap play after voting, or omit it for unlimited play. The winner at expiry has the most legal pots after the break. When both sides are on the 8, fewer cue-ball scratches wins. The host settles any remaining tie. Set `"settings": { "ballBehavior": { "preset": "arcade" } }` for Balanced Arcade (default). Under `"settings"`, use `"start": { "side": "random", "percent": 30 }` to choose the starting line. `"side"` can be `"left"` (default), `"right"` or `"random"`. `"percent"` is 10–40% from that edge, default 25. The same area applies to cue-ball placement after a foul. Under `"settings"`, `"felt"` sets the table cloth colour: `"green"` (default), `"blue"`, `"teal"`, `"red"`, `"purple"` or `"gray"`. `"shotSeconds"` sets the time per shot: `0` (off), `15`, `30` (default), `45` or `60`. When it runs out the turn passes, with ball in hand behind the line (on the break, the other player breaks instead). The other presets are `"realistic"` (faster cloth) and `"heavy"` (shorter roll). For custom tuning use `"ballBehavior": { "preset": "custom", "rollingResistance": 0.035, "railBounce": 0.85, "stopSpeed": 18 }`. The supported ranges are 0.005–0.120 in steps of 0.001, 0.65–0.97 in steps of 0.01, and 5–35 in whole table units per second, respectively. With `"pick": "teams"`, run **Pick teams** first on every path. In the editor, **Add Pick teams scene** inserts it before pool on all incoming paths. One random player from each of two distinct teams plays immediately, and only the winning team's score gets `"points"`. Both duelists play on their phones, and the host and TV show the shots. Players can also challenge each other to pool from the phone menu.
- For `"relay-drawing"`, use `"settings": { "secondsPerTurn": 15, "voteSeconds": 30, "animation": true }` for separate animation frames with a secret prompt per team and a guessing round. Use two or more teams and a neutral question such as “Animate your secret prompt!”.
- Use `"how": "skill"` on Pick teams to balance revealed individual scores with a neutral rating for new players. The host can adjust the proposal.
- For example, `{ "id": "rhythm", "type": "minigame", "game": "clap-beat", "question": "Clap the beat!", "seconds": 12 }` adds the microphone or tap rhythm game.
- A minigame draw in ONE scene (no separate scene per game): give a `"minigame"` scene `"draw"` instead of `"game"`, a list of 2–8 different games, each a name or `{ "game": "…", "seconds": 20, "settings": { … } }` (the same settings as that game alone). When the scene starts, one game is drawn at random and played in that scene; its points (`"places"`, `"scoring"`) and team play are the scene's. For example `{ "id": "lucky", "type": "minigame", "question": "Which minigame will it be?", "draw": ["tap-race", { "game": "cut-the-line", "seconds": 20 }, "stop-clock"] }`. Team games (`"relay-drawing"`, `"bus"`) only in a scene played in teams. Use `"minigame-draw"` instead when each game should be its own scene with its own route.
- In the Scene editor, **Configure minigame** opens the game picker, game settings, and phone and shared-screen previews. **Apply changes** saves the setup to the draft. Use **Minigame Tryout** in the host menu for live test rounds. These controls are part of the editor and host tools.
- For `"reaction"`, the optional `"settings": { "minWaitMs": 2000, "maxWaitMs": 6000 }` sets the random wait before GO in milliseconds. Minimum wait is 1000–10000, maximum wait is 1000–15000, and minimum must be at most maximum.
- For `"tap-race"` and `"perfect-circle"`, `"settings": { "seconds": 10 }` sets the actual play window. Tap Race accepts 3–60 seconds and Perfect Circle accepts 3–30. The outer `"seconds"` field is the round timer and should leave enough time to finish.
- For `"stop-clock"`, `"settings": { "targetMs": 10000, "visibleMs": 3000 }` sets the elapsed-time target and how long players can see the clock. Use a target from 2000 to 60000 ms and a visible time from 0 ms up to, but below, the target. A visible time of 0 hides the reading from the start.
- For ranked minigames with team play, `"teamResult": "average"` is the default, `"best"` uses the best teammate's result, and `"total"` is for games where higher is better, such as Tap Race.
- For `"cut-the-line"`, `"match-the-angle"`, `"count-the-dots"` and `"draw-the-graph"`, equal results go to whoever locked in first (the server's receipt time); the phones say so under how to play. Add `"tiebreak": "shared"` to let equal results share the place and its points instead; `"tiebreak": "faster"` is the default. Other minigames always share the place on a tie and ignore `"tiebreak"`.
- For `"cut-the-line"`, `"match-the-angle"`, `"count-the-dots"`, `"draw-the-graph"` and `"stop-clock"`, points can go by how close a result is instead of by place. Add `"scoring": { "kind": "within", "distance": 5, "points": 10 }` (close enough: everyone at most that far from the target gets those points) or `"scoring": { "kind": "scale", "distance": 20, "points": 10 }` (sliding scale: the points for spot on, shrinking evenly to none at that distance, in whole points); leave out `"points"` then. `"distance"` is a whole number in the game's unit: percent for Cut the Line (up to 100), degrees for Match the Angle (up to 180), dots for Count the Dots (up to 500), percent of the chart height for Draw the Graph (up to 100) and milliseconds for Stop the clock (up to 60000). A sliding scale needs a distance of at least 1. In team rounds the team's combined result (see `"teamResult"`) earns the points. `"tiebreak"` only applies to points by place. Leave out `"scoring"` for points by place.
- For `"speed-run"`, omit settings for the built-in course. To set obstacles, pass `"settings": { "course": ["S...#..", ".##...#", "....#..", "##.#...", "......F"] }`. Use five rows of seven tiles with `S` at the top left, `F` at the bottom right, `#` for walls and `.` for open tiles. Keep a route from start to finish. In **Configure minigame → Customize course**, authors can change walls and see the course in the preview.
- For `"cut-the-line"`, use `"seconds"` for the guess time after the countdown (default 20). The server picks one shared target. Omit `"settings"` for the standard random target, use `"settings": { "target": { "mode": "exact", "value": 37 } }` for a set percentage, or `"settings": { "target": { "mode": "range", "min": 25, "max": 75 } }` for an inclusive range. Percentages are whole numbers from 0 to 100, with minimum at most maximum. Players estimate the position on an unmarked rail. Closest wins; see `"tiebreak"` for ties.
- For `"match-the-angle"`, omit settings and use `"seconds"` for the time to play after the countdown (default 20). Players aim a ray at one shared target (it moves in tenths of a degree) and lock it in. 0° points right, and angles increase counterclockwise. Targets stay more than 5° from multiples of 30° and 45°. The smallest circular error wins; see `"tiebreak"` for ties. For team scoring, Best uses the earliest guess at the team's best error, and Average uses the last guess included.
- For `"count-the-dots"`, set `"settings": { "viewSeconds": 5 }` for how long to show the random pattern on the host and shared screens (whole seconds from 1 to 30). Phone guesses open when the pattern appears. Use `"seconds"` for the remaining guessing time after it disappears (default 15) and `"countdownSeconds"` for any countdown before viewing. Closest wins; see `"tiebreak"` for ties. Set `"count": { "mode": "exact", "value": 100 }` or `"count": { "mode": "range", "min": 1, "max": 500 }` inside `"settings"` to pick a whole-number dot count from 1 to 500. Omitting `"count"` uses the standard random range of 50–500. Set `"allowOverlap": true` to allow slight overlap. Include `"viewSeconds"` whenever you supply dot settings, including when changing only the reveal easing.
- For `"heads-or-tails"`, omit settings. Each player guesses secretly (the default timer is 15 seconds), then one shared coin flips when guesses close. Use a single award such as `"points": [10]` to pay each correct guess. The round scores players individually. The separate solo phone version uses the game's existing side-game and play-chip settings.
- For `"draw-the-graph"`, put the question players should answer in `"question"` and omit settings for a built-in chart or set `"settings": { "graph": { "visible": [10, 20, 35, 50], "hidden": [55, 65, 62, 80], "startLabel": "2000", "splitLabel": "2010", "endLabel": "2020", "yLabel": "Index" } }`. Each half takes 2–50 equally spaced readings normalized to 0–100. Optional `"scale": { "min": 0, "max": 5000 }` displays the original axis values, `"splitAt": 0.4` places the cutoff 40% across the chart (allowed 0.15–0.85, default 0.5), and `"source": "Example dataset"` credits the source at reveal. Optional `"sourceUrl"` (HTTPS) links to the original data, and `"sourceNote"` adds a short explanation at reveal. Authors can paste an Our World in Data Grapher link in Scene editor → Import graph data → Chart link, review a series and last visible period, then choose Use this data and Apply changes to keep the values and credit. To use a spreadsheet or search-interest export, authors can choose CSV file or Paste data in Scene editor → Import graph data, then choose the value column and last visible period. For Google Trends, describe the numbers as relative search interest and credit Google Trends in the data source field. The last visible reading is the anchor. The first hidden reading is after it. Axis labels are optional (up to 32 characters each). Players draw the missing half in individually assigned colors. Rank by average vertical error; see `"tiebreak"` for ties. Use `"seconds"` to set the drawing time (default 30). Everyone plays individually, and all guesses appear together on the host and shared screens at reveal.
- Both `"count-the-dots"` and `"draw-the-graph"` accept `"revealEasing"` inside `"settings"` for the host and shared screen. Choose `"ease-in"` (default), `"ease-out"`, `"ease-in-out"`, `"linear"`, or `"instant"`. On the host and shared screen, the original dots count up before the standings appear. Dense patterns reveal several dots per frame. The real graph line and player lines draw together. Reduced motion shows the completed result immediately. The host can replay or pause an animated graph reveal. The Scene editor exposes this in **Configure minigame → Reveal easing**.
- `"red-or-black-roulette"` is full European roulette, and players bet their own points (default 30 seconds to bet). Each player puts points on any numbers 0–36, red or black, odd or even, 1–18 or 19–36, a dozen (1–12, 13–24, 25–36) or a column. One ball rolls on the shared wheel when betting closes. A number pays 35 to 1, a dozen or column 2 to 1, the other bets 1 to 1. A winning bet also returns its stake and a losing bet is lost. Green zero loses every bet except a bet on 0. Do not give it `points`. Players may bet up to their score, or up to `"betFloor"` points when their score is lower (default 100). A loss can therefore take a score below 0, and in a fresh arcade round everyone can still bet. Set `"settings": { "betFloor": 0 }` to allow bets only from points a player has. A player may also make one free pick (stake 0) just for fun. The solo Roulette in Games is the same table and wheel with play chips as stakes.
- On the whole game's `"look"`, use `"phoneMenuIcons"` to customize individual phone menu icons. Keys are `scores`, `players`, `chat`, `react`, `break`, `games`, `challenge`, `sound`, `effects`, `birthday`, `leave`, `language`, `slots`, `blackjack`, `roulette`, `coin` (Heads or Tails), `packs`, and `leaderboard`. Values can be `scoreboard`, `teams`, `chat`, `smile`, `pause`, `minigame`, `duel`, `sound`, `gear`, `phone`, `cake`, `exit`, `globe`, `star`, `sparkles`, `flag`, `wheel`, `heart`, `reels`, `cards`, `coin`, `gift`, or `bars`. Omit an entry to use the default line icon. The `effects` key sets the icon for the Settings tile.
- Game-level `"phoneEffects": true` lets players choose a personal score sound and visual effect in the lobby. Those preferences stay on each phone.
- Music (`"music"`): the background playlist is made of library songs, added in the editor (Game settings → Music), so leave it out. A scene can still say what the music does there: `"music": "quiet"` (softer, for example under a speech or a tense question) or `"music": "stop"` (silence, for example for a minute of concentration); without it the music plays on.
- Optional `"autoRevealSeconds": 0` lets results appear as soon as they are ready. Use a delay from 0 to 120 seconds, or omit the setting for manual reveal. The app waits for judging and keeps vote source answers anonymous.
- On a vote scene, use `"voteMode": "single"`, `"multi"` or `"ranked"`. Single choice is the default. Use `"voteLimit": 3` to cap multiple or ranked selections (2–8). Multi gives each choice one vote. Ranked gives the first choice the limit in ranking points, then one less per rank. Equal totals share a place.
- On vote, upload and drawing scenes, `"resultCards": "manual"` shows one result card at a time, advanced by the host. A number such as `"resultCards": 5` sets the seconds per card. Omit it to show results together.
- For a birthday game, `"birthdayVote": true` enables a private prompt if a majority of eligible players vote to sing. The host and assigned host phone do not see the ballot.
- On a drawing round or minigame, `"countdownSeconds": 5` adds a countdown after any explanation and before play. Use 0–15 seconds. Omit it for the normal start.
- Use `"idleCloseMinutes": 30` to close an empty room after 30 minutes. Use 0 to keep rooms open by default. The host can keep the current room open in Room settings.
- The host's quick time button adds 30 seconds to a running round; `"quickTime": 60` makes it a minute (5 to 600 seconds).
- Optional look, at top level or on a scene: `"look": { "theme": { "preset": "neon" }, "texts": { "answer.saved": "Locked in!" }, "animations": { "sceneEnter": { "preset": "drop" } } }`. Only add a look if the user asks for a style or colours.
  - Animation moments: `"sceneEnter"`, `"answersEnter"`, `"answerSaved"`, `"timerEnding"`, `"reveal"`, `"scoreboard"`, `"cutscene"`, `"lobbyJoin"`, `"mediaEnter"`, `"teamsEnter"`, `"explanationEnter"`, `"voteEnter"`, `"routeEnter"`, `"duelEnter"`, `"minigameEnter"` and `"finaleEnter"`. Each can select a preset or use a custom animation.
  - Theme presets: `"party"`, `"neon"`, `"pub"`, `"clean"`, `"retro"`, `"terminal"`, `"kids"`, `"elegant"`, `"space"`, `"mars"`, `"saturn"`, `"neptune"`, `"ocean"`, `"christmas"`, `"birthday"`, `"mbou"` (MBO Utrecht's colours). Anything in `"theme"` changes the preset:
  - `"colors"`: `"background"`, `"background2"`, `"surface"` (cards), `"text"`, `"muted"`, `"accent"` (main buttons), `"accentText"`, `"success"`, `"danger"`, `"answerText"` as `"#rrggbb"` (or `"#rrggbbaa"`, where the last two digits are the opacity: `80` is half see-through), and `"answers"`: 2–8 answer colours. Keep text readable: strong contrast between each text colour and what it sits on.
  - `"font"` and `"headingFont"`: `"system"`, `"rounded"`, `"serif"`, `"slab"`, `"mono"`, `"condensed"`, `"playful"`, `"elegant"`; `"radius"` (corner roundness 0–40); `"textScale"` (0.8–1.6); `"uppercaseHeadings"` (true/false).
  - Uploaded and Google Fonts are added in **Look & feel → Colours & style → Text**. If the user supplies the existing library font ID and name, use a reference like `"font": { "id": "<existing font UUID>", "name": "Space Grotesk" }` for body text or the same object for `"headingFont"`. Set either at game level and override it on specific scenes as requested. With only a file or Google Fonts link, choose the font from the editor after adding it to the library. If it is already listed, use that entry.
  - `"background"`: `"gradient"`, `"solid"`, `"dots"`, `"stripes"`, `"glow"`, `"grid"`; `"tiles"` (answer tiles): `"filled"`, `"outline"`, `"glass"`, `"flat"`; `"gradients": true` adds a gradient effect to answer tiles and main buttons.
  - `"backgroundMotion"`: `"none"`, `"starlight"` or `"light-lines"` for subtle movement. Follows the device’s reduced-motion preference.
  - Minigame sliders: `"sliderStyle"` accepts `"blade"` (default), `"notch"`, `"ring"`, or `"dial"`. Cut the Line uses the rail and handle shape. Keep guesses visually unmarked.
  - Timer: `"timerStyle"`: `"digits"` (default, "1:25 left") or `"clock"`: a round clock that empties as time runs out, pulses red in the last seconds and flashes red when time is up; `"timerTurn"`: `"clockwise"` (default, like a clock hand) or `"counterclockwise"`. Set them on the whole game or on one scene's `"look"`.
  - Answer marks: `"markers"`: `"letters"`, `"numbers"`, `"shapes"`, `"custom"` (then `"customMarks"`: up to 8 short marks such as emoji) or `"none"`; `"markerShape"`: `"circle"`, `"square"`, `"rounded"`, `"plain"`; `"markerPlace"`: `"start"`, `"end"`, `"top"`; `"routeMarkers"`: `"arrows"` or `"answers"` (party choices).
  - Animation presets: `"none"`, `"fade"`, `"rise"`, `"drop"`, `"zoom"`, `"pop"`, `"slideLeft"`, `"slideRight"`, `"flip"`, `"spin"`, `"blur"`, `"bounce"`, `"wobble"`, `"shake"`, `"pulse"`, `"cascade"`.
- To open with an intro, use a cutscene with a welcome title and text. In the editor, **Between rounds → Intro** inserts this template.
- Use timers on quiz questions (15–30 seconds), writing (45–90 seconds) and votes (30–45 seconds). Keep phone texts short; answers fit on a small screen.

Example:

```json
{
  "title": "Friday Night Chaos",
  "idleCloseMinutes": 30,
  "autoRevealSeconds": 2,
  "phoneEffects": true,
  "look": { "theme": { "preset": "neptune", "font": "rounded", "headingFont": "condensed", "sliderStyle": "dial" }, "phoneMenuIcons": { "scores": "star", "games": "wheel", "packs": "sparkles", "blackjack": "cards" }, "animations": { "minigameEnter": { "preset": "fade" } }, "translations": { "nl": { "answer.saved": "Je antwoord is binnen!" } } },
  "scenes": [
    { "id": "welcome", "type": "cutscene", "title": "FRIDAY NIGHT.", "text": "Grab your phone. Closest cuts and best guesses earn points.", "youtube": { "videoId": "M7lc1UVf-VE", "startSeconds": 5, "endSeconds": 15 }, "mediaLayout": { "position": "left", "size": "wide" }, "seconds": 20 },
    { "id": "warmup", "type": "quiz", "question": "What day is it?", "answers": [{ "key": "friday", "label": "Friday" }, { "key": "monday", "label": "Monday" }, { "key": "sunday", "label": "Sunday" }], "correct": "friday", "points": 5, "seconds": 15, "showPoints": true, "translations": { "nl": { "prompt": "Welke dag is het?", "labels": { "friday": "Vrijdag", "monday": "Maandag", "sunday": "Zondag" } } } },
    { "id": "cut", "type": "minigame", "question": "Cut at the target percentage!", "game": "cut-the-line", "seconds": 20, "look": { "theme": { "font": "serif" } }, "settings": { "target": { "mode": "exact", "value": 37 } }, "explain": true, "scoring": { "kind": "within", "distance": 5, "points": 10 } },
    { "id": "angle", "type": "minigame", "question": "Aim at the target angle!", "game": "match-the-angle", "seconds": 20, "explain": { "screenOnly": true }, "tiebreak": "shared", "points": [10, 6, 3] },
    { "id": "dots", "type": "minigame", "question": "How many dots did you see?", "game": "count-the-dots", "settings": { "viewSeconds": 6, "count": { "mode": "range", "min": 1, "max": 500 }, "allowOverlap": true, "revealEasing": "ease-in" }, "seconds": 15, "countdownSeconds": 3, "explain": true },
    { "id": "coin", "type": "minigame", "question": "Heads or tails?", "game": "heads-or-tails", "seconds": 15, "points": [10] },
    { "id": "graph", "type": "minigame", "question": "How many people visited the museum each year?", "game": "draw-the-graph", "seconds": 30, "settings": { "revealEasing": "ease-out", "graph": { "visible": [10, 20, 35, 50], "hidden": [55, 65, 62, 80], "yLabel": "Visitors", "scale": { "min": 0, "max": 1000 }, "splitAt": 0.4, "source": "Example dataset", "sourceUrl": "https://example.org/museum-visits", "sourceNote": "Annual admissions." } } },
    { "id": "roulette", "type": "minigame", "question": "Place your bets", "game": "red-or-black-roulette", "seconds": 30, "settings": { "betFloor": 50 } },
    { "id": "excuse", "type": "writing", "question": "Write the worst excuse for being late tonight.", "seconds": 60 },
    { "id": "excuse-vote", "type": "vote", "question": "Vote for the best excuse!", "votesOn": "excuse", "pointsPerVote": 5, "voteMode": "ranked", "voteLimit": 3, "resultCards": "manual", "seconds": 40 },
    { "id": "choose", "type": "party-choice", "question": "Choose your challenge!", "options": [{ "label": "Music", "to": "music" }, { "label": "Physical", "to": "sculpture" }], "seconds": 20 },
    { "id": "sprint", "type": "minigame", "question": "Reach the finish flag!", "game": "speed-run", "settings": { "course": ["S...#..", ".##...#", "....#..", "##.#...", "......F"] }, "seconds": 45, "next": "finale" },
    { "id": "music", "type": "quiz", "question": "Which instrument is playing in this clip?", "answers": ["Piano", "Organ", "Harp"], "correct": "Piano", "music": "stop", "seconds": 20, "next": "sprint" },
    { "id": "sculpture", "type": "challenge", "question": "Build the Eiffel Tower out of people!", "maxPoints": 10, "seconds": 120, "next": "finale" },
    { "id": "finale", "type": "order", "question": "Put these in order, oldest first.", "items": ["Walkman", "Discman", "iPod", "Smartphone"], "points": 15, "seconds": 30 },
    { "id": "draw", "type": "minigame-draw", "question": "Which minigame will it be?", "games": [{ "label": "Tap race", "to": "draw-tap" }, { "label": "Relay drawing", "to": "draw-relay" }] },
    { "id": "draw-tap", "type": "minigame", "question": "Tap race!", "game": "tap-race", "seconds": 10, "next": "pool" },
    { "id": "draw-relay", "type": "minigame", "question": "Relay drawing!", "game": "relay-drawing", "seconds": 90, "next": "pool" },
    { "id": "pool", "type": "duel", "question": "8-ball pool", "game": "eight-ball", "pick": "random", "points": 10, "betPoints": 2, "seconds": 20, "matchSeconds": 120, "settings": { "ballBehavior": { "preset": "arcade" }, "start": { "side": "random", "percent": 30 }, "felt": "blue" } },
    { "id": "results", "type": "scoreboard", "title": "Final scores", "show": "players" }
  ]
}
```
After importing this example, use **Game menu → Media library** to find or prepare a short piano clip. In the Scene editor, attach that clip to the music question under **Picture, video or song**.
<!-- ai-instructions:end -->

## Tips

- Ask the AI for the exact number of scenes and the length you want ("about 20 minutes", "8 questions").
- Ask for themes, inside jokes or names of your friends; the AI can write them into the questions.
- If the import shows problems, paste the problem messages back to the AI and ask it to fix the JSON.
- The exact internal format (with `nodes`, `stages` and `edges`, as written by **Export as text**) can be imported too.
