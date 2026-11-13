# Making a game from text (for example with an AI)

You can create a whole game by pasting text into **Your games → Import a game from text**. The text is JSON in a simple format described below. It is easy to write by hand and it is the format AI assistants such as Claude or ChatGPT produce reliably.

## How it works

1. In the host menu, open **Import a game from text** and press **Copy instructions for an AI**. This copies the section "Instructions for the AI" below.
2. Paste them into an AI chat, and below them describe the game you want, for example: *"A 20-minute pub quiz about the 90s for 12 friends: a welcome screen, five timed questions, a caption contest with voting, and the party chooses between a music round and a movie round before the final scoreboard."*
3. Copy the AI's answer and paste it into the import box. Code fences (```` ```json ````) and a sentence before or after the JSON are fine.
4. Press **Import**. The game is created as a draft and the editor opens.
5. Check the scenes. Any problem is shown in plain language on the scene it concerns. Fix it in the editor, or ask the AI to fix it and import again.
6. Use **Rehearse** to try it, then **Publish** to play it with everyone.

Nothing is lost: if the text is a game with mistakes, it is still imported as a draft with its problems listed. Only text that is not JSON at all is refused.

To change an existing game with an AI, use **Export as text** in the editor, give the result to the AI with your request, and import its answer as a new game.

## What is needed

- **JSON**, with a `title` and a list of `scenes`.
- Each scene needs a `type` and its text. Everything else has a sensible default.
- Limits: up to 100 scenes and 256 KB of text, 2–12 answers per question, 2–8 items to order, 2–6 routes per party choice, timers from 1 second to 1 hour.

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
| `teams` | Optional game teams, see "Teams". |
| `play` | Optional default for all rounds, see "Teams". |
| `look` | Optional texts, style and animations, see "Look & feel". |
| `wheels` | Optional wheels of fortune: `[{ "title": "Forfeits", "entries": ["Sing a song", "Tell a joke"], "removePicked": true, "spinSeconds": 5 }]`. A scene with `"spin": "Forfeits"` lets the host spin it there; `"wheelClear": true` stops showing the last result. |
| `awards` | The end-of-game awards in order, from `winner`, `mostCorrect`, `mostWrong`, `fastest`, `slowest`, `mostVotes`, `minigameChamp`, `luckiest`, `mostReactions`. Leave out for all of them; `[]` for none. |

Every scene can have:

| Field | Meaning |
| --- | --- |
| `id` | Short name used to connect scenes, for example `"music-round"`. |
| `type` | One of the types below. |
| `seconds` | Timer. Leave it out for no timer (the host continues). |
| `next` | `id` of the scene that follows, or `"end"` to end the game there. Default: the next scene in the list. |
| `look` | Optional look for this scene only, see "Look & feel". |
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

Rules the game must follow (the editor explains any break):

- a scene that is voted on must come before its vote on every route, and every route through it must reach that vote;
- the game may never go round in a circle;
- every scene must be reachable;
- only a party choice leads to more than one scene, and each of its options leads to a different scene.

### Teams

Leave teams out for everyone-for-themselves. For a team game, add game teams and say how rounds use them:

```json
"teams": { "split": { "kind": "count", "teams": 2 }, "formation": "random" },
"play": { "kind": "teams", "lineup": { "kind": "game" }, "answers": "captain", "points": "both" }
```

- `split`: `{ "kind": "count", "teams": 3 }` for equal teams, or `{ "kind": "sizes", "sizes": [1, "rest"] }` for exact sizes such as one against the rest, or `[2, 2]`.
- `formation`: `"random"`, `"host"` or `"players"`. The host can always change the teams before a round starts.
- `answers`: `"everyone"` or `"captain"`. `points`: `"team"`, `"members"` or `"both"`.
- One scene can differ from the game: add `"play": { "kind": "solo" }` for everyone-for-themselves. For teams in this round only, add `"play": { "kind": "teams", "lineup": { "kind": "round", "form": { "split": { "kind": "sizes", "sizes": [1, "rest"] }, "formation": "random" } }, "answers": "everyone", "points": "members" }`.

### Look & feel

Leave `look` out for the standard look. Everything in it is optional, and a scene's `look` changes only that scene:

```json
"look": {
  "theme": { "preset": "neon", "colors": { "accent": "#ff2bd6" }, "font": "condensed", "radius": 8, "background": "grid", "tiles": "outline" },
  "texts": { "answer.saved": "Locked in!", "timer.left": "{time} to go", "lobby.playerTitle": "Welcome, quizzer!" },
  "animations": { "sceneEnter": { "preset": "drop" }, "answerSaved": { "preset": "pop" } }
}
```

- `theme.preset`: `party`, `neon`, `pub`, `clean`, `retro`, `kids`, `elegant` or `ocean`; then any of `colors` (`background`, `background2`, `surface`, `text`, `muted`, `accent`, `accentText`, `success`, `danger`, `answerText` as `#rrggbb`, and `answers` as a list of 2–8 colours), `font` and `headingFont` (`system`, `rounded`, `serif`, `slab`, `mono`, `condensed`, `playful`, `elegant`), `radius` (0–40), `textScale` (0.8–1.6), `background` (`gradient`, `solid`, `dots`, `stripes`, `glow`, `grid`), `tiles` (`filled`, `outline`, `glass`, `flat`) and `uppercaseHeadings`.
- `texts`: the names of the texts are listed in the editor's Look & feel tab and in `packages/contracts/src/presentation.ts`; words in curly brackets such as `{time}` are filled in during the game.
- `animations`: for the moments `sceneEnter`, `answersEnter`, `answerSaved`, `timerEnding`, `reveal`, `scoreboard`, `cutscene` and `lobbyJoin`, a ready-made `preset` (`none`, `fade`, `rise`, `drop`, `zoom`, `pop`, `slideLeft`, `slideRight`, `flip`, `spin`, `blur`, `bounce`, `wobble`, `shake`, `pulse`, `cascade`), or your own `custom` animation built in the editor.

Unknown names, wrong colours and anything that looks like code are listed as problems, never used.

<!-- ai-instructions:start -->
## Instructions for the AI

You are writing a party game for a web app where people play on their phones while a shared screen shows the game and a host runs it. Reply with ONLY one JSON object (no explanation), in this format:

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
  - `"party-choice"`: `"question"`, `"options"`: 2–6 objects `{ "label": "Music", "to": "id-of-first-scene-of-that-route" }`, optional `"decidedBy"`: `"players"`, `"captains"` or `"host"`. Each option must go to a DIFFERENT scene. Give the last scene of each route `"next"` set to the scene where the routes come back together.
  - `"scoreboard"`: `"title"`, `"show"`: `"players"`, `"teams"` or `"both"`.
  - `"drawing"`: `"question"` (what to draw), optional `"blind": true`. Can be voted on with a `"vote"` scene.
  - `"minigame"`: `"question"` (a short title), `"game"`: `"reaction"` (tap at GO), `"tap-race"` (tap fast), `"stop-clock"` (stop a vanishing clock at a target), `"lucky-doors"` (pick a door with hidden points), `"perfect-circle"` (draw the roundest circle) or `"relay-drawing"` (teams take turns drawing one picture, then vote; add team `"play"`); optional `"points"`: list of points for 1st, 2nd, 3rd place. Use `"seconds"` of 20–30.
- Rules: no loops (never lead back to an earlier scene); every scene must be reachable; a `"vote"` must come after the scene it votes on, on every route, and every route through that scene must reach the vote; only a party-choice may lead to more than one scene.
- Optional teams: add at top level `"teams": { "split": { "kind": "count", "teams": 2 }, "formation": "random" }` and `"play": { "kind": "teams", "lineup": { "kind": "game" }, "answers": "captain", "points": "both" }`. A single scene can use `"play": { "kind": "solo" }` to be everyone-for-themselves.
- Optional look, at top level or on a scene: `"look": { "theme": { "preset": "neon" }, "texts": { "answer.saved": "Locked in!" }, "animations": { "sceneEnter": { "preset": "drop" } } }`. Presets: `party`, `neon`, `pub`, `clean`, `retro`, `kids`, `elegant`, `ocean`. Animation presets: `fade`, `rise`, `drop`, `zoom`, `pop`, `flip`, `spin`, `bounce`, `shake`, `pulse`. Only add a look if the user asks for a style.
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
