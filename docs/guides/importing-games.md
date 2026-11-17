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
| `explain` | Show an explanation before the round starts, until the host continues (players tap *Got it!*): the text, or `true` on a minigame for its standard "how to play" (which the game's look can change, see "Look & feel"). For quiz, poll, order, writing, upload, drawing, challenge, vote and minigame scenes. |
| `parts` | Instead of one scene, several parts that play one after another, each written like a scene (for example a question followed by a scoreboard). |

Scene types:

| `type` | Fields | Notes |
| --- | --- | --- |
| `cutscene` | `title`, `text` | Shown on every screen. The host continues. |
| `quiz` | `question`, `answers` (list of words), `correct` (one of the answers), `points`, `layout` (`"tiles"` or `"list"`) | Without `correct` it is an opinion question with no points. |
| `poll` | `question`, `answers` | Like a quiz without a correct answer. |
| `order` | `question`, `items` (in the correct order), `points` | Players see the items shuffled; points only for the exact order. |
| `writing` | `question`, `maxLength` | Jokes, captions, excuses. Can be voted on. |
| `upload` | `question`, `accept` (any of `"pictures"`, `"gifs"`, `"videos"`) | Can be voted on. |
| `vote` | `question`, `votesOn` (`id` of a writing or upload scene), `pointsPerVote` | Players vote anonymously, never for their own answer. |
| `challenge` | `question`, `maxPoints` | Something the group does in the room; the host gives points. |
| `party-choice` | `question`, `options` (each `{ "label": "Music", "to": "music-round" }`), `decidedBy` (`"players"`, `"captains"`, `"host"`), `onTie` (`"random"` or `"host"`), `showCounts` (`"reveal"`, `"live"`, `"never"`) | The party picks a route. Routes may come back together at a later scene. |
| `scoreboard` | `title`, `show` (`"players"`, `"teams"`, `"both"`) | Shows the standings. |
| `drawing` | `question`, optional `blind` (`true`: players cannot see what they draw) | Players draw on their phone. Can be voted on. |
| `minigame` | `question` (title on the screens), `game` (`reaction`, `tap-race`, `stop-clock`, `lucky-doors`, `perfect-circle` or `relay-drawing`, which needs team play), optional `settings`, `points` (list: 1st, 2nd, 3rd place…), `teamResult` (`average`, `best`, `total`) | Played on the phones. Default points 10, 6, 3. Settings: reaction `{ "minWaitMs": 2000, "maxWaitMs": 6000 }`, tap race `{ "seconds": 10 }`, stop the clock `{ "targetMs": 10000, "visibleMs": 3000 }`, lucky doors `{ "doorsMilli": ["0", "5000", "10000"] }` (points × 1000). Works solo or with `play` for teams, including one against the rest. An unknown `game` stays a scene to choose in the editor. |
| `duel` | `question` (what the two do), optional `pick` (`random`, default, or `host`), `game` (leave out for any contest the host judges, or `rps`, `tictactoe`, `chess` played on the two phones), `settings` (rock paper scissors: `{ "firstTo": 2 }`), `points` (for the winner, default 10) or `places`, `betPoints` (for each right bet, default 1), `seconds` (betting time, default 30) | Two players face off while everyone else bets on the winner. The host names the winner, or the game does. |

**Points by place** (`places`), on a `quiz`, `order`, `vote`, `challenge`, `minigame` or `duel`: either a list, `"places": [10, 6, 3]` (points for 1st, 2nd, 3rd), or a total the server splits, `"places": { "total": 30, "places": 3, "curve": "even" }` (`curve`: `even` 3-2-1, `steep` halves each place, `equal`). Quiz and order: the fastest correct answers, on top of `points`. Vote: the most-voted answers, on top of `pointsPerVote`. Challenge: the host gives each player a place. Minigame: instead of `points`. Duel: 1st is the winner, 2nd the runner-up. Equal results share a place.

Rules the game must follow (the editor explains any break):

- a scene that is voted on must come before its vote on every route, and every route through it must reach that vote;
- the game may never go round in a circle;
- every scene must be reachable;
- only a party choice leads to more than one scene, and each of its options leads to a different scene.

### Teams

Leave teams out for everyone-for-themselves; most games are. For a team game, add a **Pick teams** scene where the teams are made, and mark the rounds after it that are played in those teams:

```json
{ "id": "teams", "type": "pick-teams", "title": "Pick your teams", "teams": 2, "how": "players", "captains": true, "next": "q1" },
{ "id": "q1", "type": "quiz", "question": "…", "inTeams": true, "captain": true, "next": "…" }
```

- `teams`: how many equal teams (2–12, default 2). For exact sizes use `"form": { "split": { "kind": "sizes", "sizes": [1, "rest"] }, "formation": "random" }`.
- `how`: `"random"`, `"host"` or `"players"` (default). In the room the host always sees the teams first, can move players, add or remove teams, and starts when they are right.
- `captains`: `true` gives each team a captain.
- On a round, `"inTeams": true` plays it in the teams of the last Pick teams scene; `"captain": true` lets only the captain answer. Rounds without it are everyone for themselves. Duels, party choices, cutscenes and scoreboards are never played in teams.
- One round with its own teams (like one against the rest): `"play": { "kind": "teams", "lineup": { "kind": "round", "form": { "split": { "kind": "sizes", "sizes": [1, "rest"] }, "formation": "random" } }, "answers": "everyone", "points": "members" }`.
- Older games with game-wide `teams` and `play` still import; the editor turns them into a Pick teams scene at the start.

### Look & feel

Leave `look` out for the standard look. Everything in it is optional, and a scene's `look` changes only that scene:

```json
"look": {
  "theme": { "preset": "neon", "colors": { "accent": "#ff2bd6" }, "font": "condensed", "radius": 8, "background": "grid", "tiles": "outline" },
  "texts": { "answer.saved": "Locked in!", "timer.left": "{time} to go", "lobby.playerTitle": "Welcome, quizzer!" },
  "animations": { "sceneEnter": { "preset": "drop" }, "answerSaved": { "preset": "pop" } }
}
```

- `theme.preset`: `party`, `neon`, `pub`, `clean`, `retro`, `kids`, `elegant`, `ocean`, `christmas`, `birthday` or `mbou` (MBO Utrecht's colours); then any of `colors` (`background`, `background2`, `surface`, `text`, `muted`, `accent`, `accentText`, `success`, `danger`, `answerText` as `#rrggbb`, and `answers` as a list of 2–8 colours), `font` and `headingFont` (`system`, `rounded`, `serif`, `slab`, `mono`, `condensed`, `playful`, `elegant`), `radius` (0–40), `textScale` (0.8–1.6), `background` (`gradient`, `solid`, `dots`, `stripes`, `glow`, `grid`), `tiles` (`filled`, `outline`, `glass`, `flat`), `gradients` (true: a gradient effect on answer tiles and main buttons; off unless set), `markers` (`letters`, `numbers`, `shapes`, `custom` with `customMarks`: up to 8 short marks such as emoji, or `none`), `markerShape` (`circle`, `square`, `rounded`, `plain`), `markerPlace` (`start`, `end`, `top`), `routeMarkers` (`arrows` or `answers`) and `uppercaseHeadings`.
- `texts`: the names of the texts are listed in the editor's Look & feel tab and in `packages/contracts/src/presentation.ts`; words in curly brackets such as `{time}` are filled in during the game.
- A minigame's "how to play" is a text too, for example `"minigame.how.bus": "Guess together; wrong costs sips."`; the screen before a round uses `explain.title`, `explain.ok`, `explain.waiting`, `explain.ready` and `explain.start`.
- `animations`: for the moments `sceneEnter`, `answersEnter`, `answerSaved`, `timerEnding`, `reveal`, `scoreboard`, `cutscene` and `lobbyJoin`, a ready-made `preset` (`none`, `fade`, `rise`, `drop`, `zoom`, `pop`, `slideLeft`, `slideRight`, `flip`, `spin`, `blur`, `bounce`, `wobble`, `shake`, `pulse`, `cascade`), or your own `custom` animation built in the editor.

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
  - `"writing"`: `"question"`, optional `"maxLength"` (characters, default 240). For jokes, captions, excuses.
  - `"upload"`: `"question"`, `"accept"`: any of `"pictures"`, `"gifs"`, `"videos"`.
  - `"vote"`: `"question"`, `"votesOn"` (id of an earlier writing or upload scene), `"pointsPerVote"`.
  - `"challenge"`: `"question"` (something people do in the room), `"maxPoints"`. The host judges.
  - `"duel"`: `"question"` (what the two do), optional `"pick"`: `"random"` or `"host"`, optional `"game"`: `"rps"`, `"tictactoe"` or `"chess"` (played on the two phones; leave out for any contest the host judges), `"points"` (for the winner), `"betPoints"` (for each right bet), `"seconds"` (betting time). Everyone else bets on the winner.
  - Optional on quiz, order, vote, challenge, minigame and duel: `"places"`: a list like `[10, 6, 3]` (points for 1st, 2nd, 3rd: the fastest correct answers, the most-voted answers, the host's places, the minigame's places, the duel's winner and runner-up), or `{ "total": 30, "places": 3, "curve": "even" }` to split a total (`curve`: `"even"`, `"steep"` or `"equal"`).
  - `"party-choice"`: `"question"`, `"options"`: 2–8 objects `{ "label": "Music", "to": "id-of-first-scene-of-that-route" }`, optional `"decidedBy"`: `"players"`, `"captains"` or `"host"`. Each option must go to a DIFFERENT scene. Give the last scene of each route `"next"` set to the scene where the routes come back together.
  - `"scoreboard"`: `"title"`, `"show"`: `"players"`, `"teams"` or `"both"`.
  - `"drawing"`: `"question"` (what to draw), optional `"blind": true`. Can be voted on with a `"vote"` scene.
  - `"minigame"`: `"question"` (a short title), `"game"`: `"reaction"` (tap at GO), `"tap-race"` (tap fast), `"stop-clock"` (stop a vanishing clock at a target), `"lucky-doors"` (pick a door with hidden points; optional `"settings": { "doorsMilli": ["0", "5000", "10000"], "order": "fixed" }` for points in thousandths behind door 1, 2, 3… in that order instead of shuffled), `"perfect-circle"` (draw the roundest circle), `"relay-drawing"` (teams take turns drawing one picture, then vote), `"bus"` (Drive the bus, the drinking game: each team guesses red or black, higher or lower, inside or outside, then the suit; a wrong guess costs everyone in the team that round's sips, optional `"sips": [1, 2, 3, 4]`; a team whose four cards are four different suits, a rainbow, makes the other teams drink the last round's sips unless `"rainbow": false`; fewest sips wins) or `"majority"` (Left or right: everyone picks left or right in secret, the majority gets the 1st-place points; a tie: nobody); optional `"points"`: list of points for 1st, 2nd, 3rd place. `"relay-drawing"` and `"bus"` are team games: put them after a Pick teams scene with `"inTeams": true`, or they get teams of two for that round. In a team round, `"bus"`, `"lucky-doors"` and `"majority"` take `"decide"`: `"anyone"` (anyone in the team taps the choice), `"vote"` (each member votes within `"voteSeconds"`, default 20; who does not vote is not counted) or `"captain"` (the captain decides; a team without one gets one at random). Use `"seconds"` of 20–30 (Drive the bus: 120–180).
- Rules: no loops (never lead back to an earlier scene); every scene must be reachable; a `"vote"` must come after the scene it votes on, on every route, and every route through that scene must reach the vote; only a party-choice may lead to more than one scene.
- Teams are optional; most games are everyone-for-themselves. Only for a team game: add a scene `{ "type": "pick-teams", "title": "Pick your teams", "teams": 2, "how": "random" | "host" | "players", "captains": true }` where the teams are made, and `"inTeams": true` (plus `"captain": true` if only captains answer) on the rounds after it that are played in those teams. Quiz, writing, upload, drawing, order, challenge, vote and minigame rounds can be played in teams; duels, party choices, cutscenes and scoreboards cannot.
- Optional wheels of fortune, at top level: `"wheels": [{ "title": "Forfeits", "entries": ["Sing a song", "Tell a joke", "Swap seats"], "removePicked": true, "spinSeconds": 5 }]`, optionally with their own slice colours `"colors": ["#f39200", "#7ac6b6"]`. A scene with `"spin": "Forfeits"` (usually a cutscene) lets the host spin that wheel there; `"wheelClear": true` on a later scene stops showing the last result.
- Optional end-of-game awards, at top level, in order: `"awards"`: names from `"winner"`, `"mostCorrect"`, `"mostWrong"`, `"fastest"`, `"slowest"`, `"mostVotes"`, `"minigameChamp"`, `"luckiest"`, `"mostReactions"`, `"fewest"` (the wooden spoon), or objects with their own title; `"scene"` (most points in one scene) needs the scene's id: `{ "award": "scene", "scene": "karaoke", "title": "Karaoke champion" }`. Leave out for the standard awards; `[]` for none.
- Side games on the phones while players wait are on; `"sideGames": false` switches them off, `"chips": true` plays them with chips. A player can have 3 challenge invites waiting at once; `"openInvites": 5` allows 5 (1 to 10).
- Any round people play (not a cutscene, scoreboard, party choice, duel or Pick teams) can explain itself first: `"explain": "Each team gets one guess per card…"` shows that text before the round starts, players tap Got it and the host starts the round; on a minigame `"explain": true` uses its standard "how to play". Use it for minigames and unusual rounds.
- The host's quick time button adds 30 seconds to a running round; `"quickTime": 60` makes it a minute (5 to 600 seconds).
- Optional look, at top level or on a scene: `"look": { "theme": { "preset": "neon" }, "texts": { "answer.saved": "Locked in!" }, "animations": { "sceneEnter": { "preset": "drop" } } }`. Only add a look if the user asks for a style or colours.
  - Theme presets: `"party"`, `"neon"`, `"pub"`, `"clean"`, `"retro"`, `"kids"`, `"elegant"`, `"ocean"`, `"christmas"`, `"birthday"`, `"mbou"` (MBO Utrecht's colours). Anything in `"theme"` changes the preset:
  - `"colors"`: `"background"`, `"background2"`, `"surface"` (cards), `"text"`, `"muted"`, `"accent"` (main buttons), `"accentText"`, `"success"`, `"danger"`, `"answerText"` as `"#rrggbb"`, and `"answers"`: 2–8 answer colours. Keep text readable: strong contrast between each text colour and what it sits on.
  - `"font"` and `"headingFont"`: `"system"`, `"rounded"`, `"serif"`, `"slab"`, `"mono"`, `"condensed"`, `"playful"`, `"elegant"`; `"radius"` (corner roundness 0–40); `"textScale"` (0.8–1.6); `"uppercaseHeadings"` (true/false).
  - `"background"`: `"gradient"`, `"solid"`, `"dots"`, `"stripes"`, `"glow"`, `"grid"`; `"tiles"` (answer tiles): `"filled"`, `"outline"`, `"glass"`, `"flat"`; `"gradients": true` adds a gradient effect to answer tiles and main buttons.
  - Answer marks: `"markers"`: `"letters"`, `"numbers"`, `"shapes"`, `"custom"` (then `"customMarks"`: up to 8 short marks such as emoji) or `"none"`; `"markerShape"`: `"circle"`, `"square"`, `"rounded"`, `"plain"`; `"markerPlace"`: `"start"`, `"end"`, `"top"`; `"routeMarkers"`: `"arrows"` or `"answers"` (party choices).
  - Animation presets: `"none"`, `"fade"`, `"rise"`, `"drop"`, `"zoom"`, `"pop"`, `"slideLeft"`, `"slideRight"`, `"flip"`, `"spin"`, `"blur"`, `"bounce"`, `"wobble"`, `"shake"`, `"pulse"`, `"cascade"`.
- Use timers on quiz questions (15–30 seconds), writing (45–90 seconds) and votes (30–45 seconds). Keep phone texts short; answers fit on a small screen.

Example:

```json
{
  "title": "Friday Night Chaos",
  "scenes": [
    { "id": "welcome", "type": "cutscene", "title": "FRIDAY NIGHT.", "text": "Grab your phone. Three rounds, one winner.", "seconds": 20 },
    { "id": "warmup", "type": "quiz", "question": "What day is it?", "answers": ["Friday", "Monday", "Sunday"], "correct": "Friday", "points": 5, "seconds": 15 },
    { "id": "excuse", "type": "writing", "question": "Write the worst excuse for being late tonight.", "seconds": 60 },
    { "id": "excuse-vote", "type": "vote", "question": "Vote for the best excuse!", "votesOn": "excuse", "pointsPerVote": 5, "seconds": 40 },
    { "id": "choose", "type": "party-choice", "question": "Choose your challenge!", "options": [{ "label": "Music", "to": "music" }, { "label": "Physical", "to": "sculpture" }], "seconds": 20 },
    { "id": "music", "type": "quiz", "question": "Which instrument has 88 keys?", "answers": ["Piano", "Organ", "Harp"], "correct": "Piano", "seconds": 20, "next": "finale" },
    { "id": "sculpture", "type": "challenge", "question": "Build the Eiffel Tower out of people!", "maxPoints": 10, "seconds": 120, "next": "finale" },
    { "id": "finale", "type": "order", "question": "Put these in order, oldest first.", "items": ["Walkman", "Discman", "iPod", "Smartphone"], "points": 15, "seconds": 30 },
    { "id": "results", "type": "scoreboard", "title": "Final scores", "show": "players" }
  ]
}
```
<!-- ai-instructions:end -->

## Tips

- Ask the AI for the exact number of scenes and the length you want ("about 20 minutes", "8 questions").
- Ask for themes, inside jokes or names of your friends; the AI can write them into the questions.
- If the import shows problems, paste the problem messages back to the AI and ask it to fix the JSON.
- The exact internal format (with `nodes`, `stages` and `edges`, as written by **Export as text**) can be imported too.
