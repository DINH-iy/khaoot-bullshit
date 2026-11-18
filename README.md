# Party game builder

Browser frontend and authoritative TypeScript/Node.js backend. The current checkpoint has PostgreSQL/Prisma, durable game commands, verified room credentials, Socket.IO, and minimal host/phone connection-test screens. It is not the complete party-game builder. Product decisions live in [APP_PLAN.md](APP_PLAN.md).

## Requirements and local commands

Use Node.js 24 LTS (`nvm use`) and npm 11.

```sh
npm ci
cp .env.example .env
npm run dev
```

Frontend: http://127.0.0.1:5173. Backend: http://127.0.0.1:3001. Vite proxies `/api` to the backend. To override the API port, update both `.env` and the development proxy. Nothing is deployed automatically.

```sh
npm run check       # types, tests, and production builds
npm test            # deterministic offline backend tests
npm run test:watch
npm run build
npm start -w @party/server
```

Build contracts before standalone package development/tests; the root commands handle this. Restart development after changing contracts, or rebuild contracts while watching. Production web files land in `apps/web/dist`. The API serves them only when `SERVE_WEB=true`, which the host launcher, the public rehearsal launcher and the browser tests set; it is off by default. Permanent deployment comes in a later slice.

## Hosting a room

Step-by-step instructions for starting (on this computer or with a temporary public test link for phones), checking what runs (`npm run status`) and taking everything down (`npm run stop`) are in [Running the party game](docs/guides/running.md).

```sh
npm run db:up && npm run db:migrate:deploy   # once, or after new migrations
npm run host
```

`npm run host` builds the app, starts it on this computer and opens the host menu in your browser, already signed in as the owner. Pick a built-in game, open a room, and share the room code or QR. To try a game alone, **Open test bench ↗** (in the room's *Shared screen & invite*) shows the host screen with virtual phones next to it, each its own player; *Real phones can join too* lets real players join as well (the room setting *Test bench phones may join* is switched on by opening the bench). The owner can change a built-in game with **Edit this game** (their own version, edited and published like any game; once published the menu and rooms use it, and **Restore original…** goes back). The first run generates `ROOM_TOKEN_SECRET` and `LOCAL_OWNER_TOKEN` into the ignored `.env`. This mode only reaches browsers on the same computer; `npm run network:public` opens the same menu on a temporary public address for phones on other networks. The host menu also has "Your games": create a game (blank or a copy of a built-in), see its problems per scene, publish it, and open a room for the published version. Each game opens in the Flow editor (`/?edit=<game>`): scene cards on a canvas (right-click empty canvas to add a scene there; the add menu has tabs (Rounds, Games, Between rounds, Prefabs; it opens on the tab used last) and one entry per kind of scene; only writing prompts, minigames and duels open a second menu. Settings such as a quiz's layout (big tiles, a list, true or false), what a scoreboard shows, upload types, drawing blind and who decides a party choice are chosen in the scene's own panel), connected by dragging between ports, with snapping, problem markers per scene, automatic saving and publishing. Several people can edit the same game at once: each sees the others' changes as they are saved, the scenes they have selected and their pointers, and undo/redo only takes back your own steps (you enter with the owner link; people you give editor rights in Admin → People enter with their own personal key). A second tab, the Scene editor, shows the same game slide by slide with a rough screen and phone preview and every setting, including scenes with several parts and team settings. The two have separate jobs: the Flow editor is the map (adding, connecting, moving and deleting scenes, party-choice routes and where each scene leads; its panel shows a summary and **Edit this scene →**, as does double-clicking a card), the Scene editor is the content (questions, answers, parts, points, who plays), where the next scene is a button that goes there (changing it is in the scene's ☰ menu), routes fold one by one or all at once, and **Try this scene** plays just that scene (a minigame, a round) in a practice room. The map zooms with the scroll wheel (Shift + scroll moves it) or its zoom menu (*100% ▾*: zoom, show the whole game, zoom to the selection), a *Tips* button lists its gestures, the *Tidy up* menu wraps long games into rows (Ctrl + Shift + L), lays them out in one line, lines up selected scenes and straightens all arrows, arrows can get bend points to lead them around something, and **Help & shortcuts** (☰ menu or the ? key) lists every gesture and shortcut. Options with a longer explanation show it behind an ⓘ. On a phone the editor rearranges into short rows, bottom sheets and a scrolling page. The top bar is one compact row: the game name with its state (draft, saved, length, problems), the three editor tabs, Undo and Redo, an **Editing / Viewing** button (Viewing: look through the game without changing anything; remembered in this browser), a **Play & publish ▾** menu (rehearse from the start or the selected scene, publish, play the published version), a ☰ menu with Game settings, Invite people, Export as text, Help & shortcuts and **Light mode / Dark mode** (remembered in this browser, also for the host and admin pages), and at the far right who is editing. Coming back to a game opens the same place: the editor, the selected scene, the open panel and the part of Look & feel (remembered in this browser). Long pages are small named groups that open and close and stay as left: the scene's settings, its parts, Game settings, Look & feel's style page (Style, Colours, Text, Shapes and background, Answer marks) and its texts (a search opens the groups with a match). Games can also be imported from text, for example written by an AI assistant: see [Making a game from text](docs/guides/importing-games.md). The instructions the app copies for an AI cover every feature (a test keeps them complete) and make the AI ask a few short questions first (who plays, how long, teams, rounds, style) before it writes the game. The editor can export a game as text too. Drafts can be rehearsed in a practice room without publishing, from the start or from a chosen scene; scenes can be duplicated or copied between games, or saved as a prefab (**Save as prefab** on selected scenes; kept in the database, shared by you and your editors) and inserted into any game from the Prefabs tab of Add a scene; a minimap helps in large games. Minigame scenes play on the phones: Reaction duel, Tap race, Stop the clock and Lucky doors (shuffled every game, or fixed as listed), Drive the bus (the Dutch drinking game "bussen" without the final bus: teams guess red or black, higher or lower, inside or outside, then the suit; wrong costs sips) and Left or right (everyone picks in secret; the majority wins), each with settings, points by place (ties share) and team play including one against the rest; a built-in "Minigame madness" game shows all four. Lucky doors, Drive the bus and Left or right are *step games*: one engine plays any game made of choices (a game only brings its rules), and in a team round the scene decides how a team chooses: anyone taps it, the team votes (each member once within the vote time, which the server ends by itself; who does not vote is not counted; a tie goes to the captain or a random pick), or the captain decides (a team without one gets a fixed random captain). Players build their own look (a character from built-in parts: colour, body, eyes, mouth, hat, extra), or use a drawing or a photo (metadata removed; the host can remove it); it shows in the lobby, player list, scoreboard and results, and the phone remembers the character for the next game. Minigame results are checked against the server clock and each phone's measured network delay, the tap race streams its taps (live race bars), and pausing restarts a running minigame with a fresh countdown. Drawing rounds (optionally blind, or finishing a doodle) can be voted on; drawing minigames are Perfect circle and Pass the pencil (teams take turns on one picture, then vote, with every stroke shown live). Drawing also works with the keyboard. Games can have wheels of fortune (spun by the host on chosen scenes, the result kept in a corner of the shared screen; slices in the game's answer colours or the wheel's own, with readable labels, and a **Test spin…** in the editor: click the wheel to turn it, click again while it turns for a boost), players can vote for a smoke break that pauses the game, games end with an awards show the author configures (each award with its own title if wanted; besides the statistics, "best in one scene" and the wooden spoon for the fewest points; swipe or step through the awards; auto-play is a toggle on each screen, on by itself only on the shared screen), every scene that gives points can also pay by place (points for 1st, 2nd, 3rd…, or a total split automatically, evenly, steeply or equally: the fastest correct answers of a quiz or ordering round, the most-voted answers, the host's places in a challenge, a minigame's results), a head-to-head duel scene puts two players (at random or picked by the host) against each other while everyone else bets on the winner (any contest in the room that the host decides, or rock paper scissors, tic-tac-toe or chess on the two phones; the winner, the runner-up and every right bet are paid automatically), and the editor shows about how long a game takes. Old pictures, videos and drawings are deleted automatically after `MEDIA_RETENTION_DAYS` (default 14) once a room is over or unused. **Invite people** (☰ menu at the top right) lists your people: copy an invite link for someone with editor rights (it signs their phone or computer in with their personal key and opens this game), or give editing rights with one tap. Clicking an arrow in the Flow editor opens a small menu to add a scene on it (a wheel, a cutscene, a scoreboard… placed between the two scenes, so it plays right there) or remove the connection. **Wheel of fortune** is a scene type of its own: the scene’s wheel and its entries are edited right in the scene. **Game settings** (☰ menu at the top right) gathers everything about the whole game: name, start scene, side games & chips (and how many challenge invites a player can have waiting at once: 3 unless changed; the host can change it in the room too), wheels of fortune and end-of-game awards. **Teams** are not a game setting: a game is everyone-for-themselves unless it has a **Pick teams** scene (in the add menu), where the teams are made (a number of teams or exact sizes, at random, by the host or by the players, optionally with captains). Rounds after it can be played in those teams ("Who plays"); only rounds that can be played in teams offer it, and only once the game has a Pick teams scene. In the room each team is a coloured column with its players: the host taps a player and then a team (or drags with a mouse), makes captains, adds teams (up to 12) or removes them, shuffles, and starts with the big host button. Games made before this keep working; opening one in the editor turns its game-wide teams into a Pick teams scene at the start. A scene’s own panel groups its settings into Content, Points, Who plays and Where next; each group stays open or closed as you left it when you select another scene (remembered in this browser). Short choices are buttons, choices that need a description (which minigame, how a duel is won, an award to add) open a popup with cards, lists (scenes, wheels, fonts, animations) use the editor’s own keyboard-friendly dropdown, and the scene’s actions (start here, duplicate, save as prefab, delete) are in the ☰ menu next to Close. Delete or Backspace on selected scenes asks before deleting. A third editor tab, Look & feel, changes how the game looks and talks: every text players and screens show, a style (eleven starting points, among them Christmas, Birthday and MBO Utrecht's colours, then any colour, font, size, roundness, background and answer-tile style, an optional gradient effect on tiles and buttons, and the answer marks (A B C, 1 2 3, shapes, your own typed marks or none; their shape and place; arrows or the same marks on party choices), with readability warnings; colour palettes can be imported from Canva, Figma, Coolors or Adobe and exported for them: hex codes, a Coolors link, CSS, design tokens or an .ase/.gpl file) and the animation for each moment (sixteen ready-made, or built from blocks; each shown on a timeline and in words), for the whole game or a single scene. Looks are data only, validated by the server; authors never write code or CSS. Built-in games are "Friday Night Chaos" (a route vote), "Timed quiz", "Team party", "Minigame madness", "Bar games" (Drive the bus with team votes, then Left or right), "Draw party", "Picture party" (uploads and a vote) and the untimed "First reliable game".

Signed in as the owner, the host menu, the editor and the admin pages show a top bar: Play, Host, Editor (Your games on the host menu), Admin and People. Editors (people with editor rights) see only Play and Editor. Whether to show it comes from the owner endpoint (`GET /api/host`), never from reading cookies. The player screen never calls that endpoint; its "Host a game instead" link only shows in a browser that signed in as the owner before (a hint in that browser's storage, never the key). A browser that is not signed in is told to open the private owner link once.

## Package boundaries

- `apps/web`: React/Vite browser UI; presentation only.
- `apps/server`: Fastify API, authentication enforcement, logs and instrumentation.
- `packages/contracts`: public runtime schemas/types; no secrets or privileged engine code.

The room screens (phone, host, shared display) have a first party design: join card, lobby with QR and big room code, colour-coded answers, a host control panel and results bars. The admin dashboard is partly built: feedback and people (see the instructions below).

## Instructions: test version, feedback, people and side games

Step by step for the owner. Starting, checking and stopping everything is in [Running the party game](docs/guides/running.md).

### 1. Put out a test version for other people

1. Once: `npm ci`, `npm run db:env`, `npm run db:up`. After pulling new code, every time: `npm run db:migrate:deploy` (it only adds what is new).
2. `npm run build`, then `npm run network:public`. It prints `PUBLIC ADDRESS: https://….trycloudflare.com` and opens the host menu, signed in as you.
3. Testers open that address on their phone or computer. Players join a room with the room code or the QR code.
4. The address changes every time the test link starts. Send the new one each time. Lost the host tab? `npm run host:link`.

### 2. Feedback: bugs, wishes and minigame ideas

For testers (no account needed):

1. Tap **Feedback**: on the right edge of the screen, or in the top bar on the host menu, the editor and the admin pages.
2. Choose *Something is broken*, *Idea or wish* or *Minigame idea*, and give it a title (and details if you like).
3. Optional: **Point at something**, then tap the thing on the screen you mean. The tap picks it instead of pressing it. Up to five things.
4. Optional: your name (the phone remembers it). **Send**.

For you: open **Admin: feedback from testers** at the bottom of the host menu (`/?admin`).

- Filter by kind, status (open, all, new, planned, in progress, done, declined) and text.
- Change a report's status or kind, write a note, or delete it.
- **Mark N as done** marks everything the filters show (kind, status and search) as Done at once, after a confirmation. Only bugs selected: only the bugs change.
- **Copy as text** (one report) or **Copy N as text** (everything shown) gives a description with the screen, the page and, for each pointed-at thing, the file and line in the code (for example `JoinScreen in apps/web/src/room/room-screen.tsx:38`). Paste that into a request to fix it.

What a report keeps: the page address without the part after `#` (so never a key), the screen (player phone, host screen, shared screen, editor…), its size, the browser, and for each pointed-at thing its text, where it sits in the page and its file and line. Nothing typed into the game. The file and line come from the build, which writes them onto every element (`apps/web/tooling/source-tags.ts`, about 2% more download; `PARTY_SOURCE_TAGS=off npm run build` leaves them out). Limits: 30 reports a minute and 200 an hour per address (testers coming in through a Cloudflare tunnel count as one address unless `TRUST_CLOUDFLARE_LOCAL=true`, see `.env.example`), at most 5000 unhandled reports, no screenshots.

### 3. People: accounts so you are always yourself

1. Host menu → **Admin: people (accounts)** (`/?admin=people`).
2. Type a name (for example *Dinny*). Tick **Can edit games** for someone who should help make games (see below). **Add person**. Their personal key (like `K7QM-4XPT-9RWD`), a personal link and its QR code appear.
3. On that person's phone: on the start page tap **Have a personal key? Sign in** and type the key (capitals, spaces and dashes do not matter), or scan the QR code / open the link. The phone says "This phone now plays as Dinny".
4. From then on that phone joins every room as Dinny: the name is filled in, the character comes back, and the chips carry over between games. Joining the same room from a second phone of the same person continues the same seat. A new phone signs in with the same key.
5. On a phone, **Not Dinny?** on the join screen signs that phone out.

The People list shows what matters at a glance (a search box, the **Editor** switch, phones, last seen on a 24-hour clock, **Show key**) with a few totals on top. A name opens that person's own page: their stats (games, wins, top 3, points, right and wrong answers, minigames, challenges per game and their main rival, arcade, side games, chips, favourite and last game, each with their rank), **Can edit games**, **Show key** / **New key** (the old key and link stop working; phones already signed in stay signed in) / **Sign out phones** (all of that person's phones become guests), **Rename** and **Remove** (signs out, stops the key, frees the name; past games and chips stay in the history). The **Leaderboard** tab ranks everyone: titles with the top three each (Champion, Brainiac, Confidently wrong, Sharpshooter, Never misses a party, Arcade king, Duel master, High roller) and a table that sorts by any column. Stats count finished real games only (never practice rooms); answers given as a team in team rounds count for nobody yet. People made before keys existed show no key until you make a new one; their old links keep working.

Without a key at hand, in a room:

- **Players can make an account when joining** (Room settings, off by default): the join screen then offers *Make me an account*; the phone becomes that new person and shows their personal key once, to write down (you can look it up in People).
- **People you added** (the host's Players sheet → *Add people…*): tick people who played before. Their key shows next to their name (to tell them in person) with whether they are in the room. On the join screen they see *Played with us before?* with those names; tapping one asks you (*A phone says it is Anouk: Yes / No*), and once you say yes that phone is signed in as them for good. Only the phone that asked gets it, once. The list and the setting carry over to *Back to lobby*.

Editors: a person with **Can edit games** gets an **Edit games** link on the start page once signed in (or opens `/?host=1`). They can make, import, change, publish, rehearse (practice rooms) and remove games, and edit together with you live. They cannot open real rooms, see your open rooms, or use the admin menu. Unticking the rights, signing their phones out or removing them stops it at once, including an editor they have open. Editing uses the same owner access as hosting, so it only works where the owner link works (never in production).

Good to know:

- The key works like a password you can look up: anyone with it can become that person (and, for an editor, edit your games). Give it only to them, and make a new one if it got out.
- The server checks keys by their hash. So you can look a key up, it is also stored encrypted with a key derived from `ROOM_TOKEN_SECRET`: a copy of the database alone does not reveal keys, but the database together with `.env` does. Changing `ROOM_TOKEN_SECRET` makes existing keys unviewable (they still work; make new ones to see them).
- Typing keys is limited to 20 tries a minute per address (behind a Cloudflare tunnel, set `TRUST_CLOUDFLARE_LOCAL=true` so that is per visitor).
- A phone's sign-in belongs to one address. On a new address (such as a new temporary test link) people sign in again with their key.
- Players without a personal key still join as guests by typing a name (or make an account, or pick their name, as above).

### 4. Side games on the phones

Players play on their own phone while waiting: in the lobby, between rounds, after answering, during a break.

- **Menu** button → **Games**: **Slot machine**, **Blackjack**, **Packs** (open packs, collect 15 items in four rarities) and the **Leaderboard**.
- **Menu** button → **Challenge**: challenge another player in the room to rock paper scissors (first to 1–5 wins), tic-tac-toe or chess, for fun or for a stake in chips. The challenged player sees a banner at the top of their phone (Open or Later), no menu needed (each puts it in, the winner takes both, a draw gives it back). The other player accepts or declines; moves arrive on both phones at once. Once a game is over, both can watch the replay and save it as a video on their phone. Challenges, their games and replays are deleted when the room ends (a stake still in play goes back). Chess rules come from chess.js on the server; phones get the legal moves from it. Head-to-head games are plug-ins (apps/server/src/head-to-head), shared with the duel scene.
- Chips are play money only. Everyone starts with 1000. When they are almost out, **Broke? Get 500**; the leaderboard counts how often.
- People (accounts) keep their chips across games; guests' chips are for that room only.
- The leaderboard shows this room and all time (people only): bet in total, net result, chips now, best win.
- **Pausing**: as soon as a round needs the player (a question to answer, a vote, a minigame, picking teams), the side game closes with "Round started: your side game is paused" and the button says *Games paused*. An unfinished blackjack hand waits until the next time. The server refuses side-game moves while the player is needed, so this cannot be skipped.
- Side games are **on** in a new room and chips are **off**, so everyone can play the slot machine, blackjack, packs and challenges just for fun (no bets, free packs, no leaderboard). Chips are an extra: with them on, players bet chips, stake them in challenges and get the leaderboard. A game can change both (editor → Game settings → *Side games & chips*, or `"sideGames": false` / `"chips": true` in an imported game), and the host can switch both at any time with the *Side games* and *Chips* switches in the host panel, in the lobby and during the game. Rooms opened before this change keep both on.
- What pays and the chances are shown in each game. The slot machine pays back about 94 of every 100 chips bet, blackjack pays 3 to 2 for a blackjack (dealer stands on 17, doubling on the first two cards, no splitting), packs never pay chips back. The server draws every card, reel and pack.

### 5. Arcade: minigames with friends, without a host or a game

Anyone can play the minigames together outside a game: **Arcade: play minigames with friends** on the start page (or `/?arcade`).

1. Type your name (a phone signed in with a personal key plays as that person) and **Open a lobby**. You are its *leader*.
2. Invite people with the lobby's link or QR code (**Invite players**), or they find the lobby under **Open lobbies** on the arcade page and tap **Join**.
3. The lobby is open by default. The leader taps **Open: lock** to lock it: nobody new can join, but players who were in it can always come back. **Locked: unlock** opens it again.
4. The leader picks the next round from three dropdowns: the minigame, *Everyone alone* or *In N teams* (2 to 6, never more than there are players), and for teams *At random* or *By the players*. Drive the bus and Pass the pencil are team-only. **Play** sends every phone in the lobby into the round by itself.
5. There is no host: the leader runs the round while playing along. The leader's phone shows one big button only when the round waits for them (start with these teams, start once everyone tapped *Got it!*, show the results, back to the lobby). The rest is in the **☰ Leader tools** menu next to the ⓘ in the round bar: shuffle random teams, end now and count the results, and stop the round (it asks first).
6. Back in the lobby everyone sees the last round's results and the **total in this lobby** (points, wins, rounds played).

- The arcade page also shows the all-time **leaderboards**: most wins, and the best result per minigame (played alone). Only people with a personal key are on them; guests count in their lobby's total only.
- If the leader leaves or is gone for 45 seconds, the player who joined first among those still there becomes leader. Someone who arrives during a round plays in the next one.
- A lobby that nobody has been in for 15 minutes closes by itself (a round still open there ends without results).
- Limits: 40 open lobbies, 24 players a lobby, 10 new lobbies a minute per address.
- Like hosting, the arcade only runs in the test version, never in production (until sign-in exists). Each round is an ordinary room hosted by the arcade, which nobody can join with its room code or take a seat in: only the lobby's members are seated. Code: `apps/server/src/arcade/` and `apps/web/src/arcade/`.

## Authentication boundary

Creator sign-in provider selection is deferred. There is **no development login bypass**, password store, sign-in screen, or token-issuing endpoint.

The backend can verify API access tokens from a configured OIDC provider using HTTPS JWKS, RS256 signatures, issuer, audience, subject, expiry, issue time, and a one-hour maximum token age. Set `AUTH_ISSUER`, `AUTH_AUDIENCE`, and `AUTH_JWKS_URL` together. Tokens are sent using an Authorization Bearer header. Configure a dedicated API access-token audience; this is not a browser ID-token login flow.

`/api/me` requires a verified identity. `/api/ops/metrics` also requires the trusted issuer's `ops:read` scope. A browser cannot grant itself scopes by sending IDs or role flags. There is no frontend token storage yet.

With no provider in development, protected endpoints return 503 and readiness is 503. Production startup refuses missing authentication configuration. Liveness stays 200 so a deployment does not endlessly restart just because sign-in is unconfigured.

Room networking now separately verifies expiring/revocable opaque host/display/player credentials in HttpOnly cookies, checks roles/origins and bounds admission/messages. Normal room creation requires verified OIDC identity and ownership. The owner-run rehearsal CLI explicitly provisions a short-lived host grant for one test room; production rejects those local rehearsal grants. Full creator browser sign-in/provider integration remains future work.

Back to lobby: in the host panel, **Back to lobby** (it asks first) starts the same game again in a fresh lobby, also after the game is over. The room gets a new code; phones and the shared screen move along by themselves, with each player's name, look and personal account, and the host's room settings carry over. The old room ends as it was, so its scores and answers stay in the history.

When time runs out, a phone sends what the player had chosen, typed, ordered, uploaded or drawn but not sent yet (the server takes it during its grace period: 1 second, or 3 seconds in drawing rounds, where a line still being drawn is kept too; a very slow connection can still miss it).

Room screen: the connection is a dot in the top bar (its menu: status, *Reconnect and sync*, measurements); the round is one line of chips (what to do now, a player's team as a coloured flag, the time) with an (i) for the details; the host panel has the main buttons, a row of icon tools (pause, smoke break, a quick time button of 30 seconds unless the game sets `quickTime`, the stopwatch with more time options, reopen) and four icons that each open one sheet (Room settings, Shared screen & invite, Players, Back to lobby); the scores are a small foldable card (bottom of the host panel, a corner of the shared screen), shown big only at scoreboard scenes and the end. A round people play can **explain itself first** (scene setting): the round waits, untimed, while everyone reads the explanation and players tap *Got it!*; the host sees who is ready and starts the round. A minigame can use its standard "how to play", which each game can reword in Look & feel → Texts → Minigames.

Looks: unless the host ticks *Players confirm their look before it is used* (Room settings), every choice in the look builder is used at once, and a drawing in progress is used when the player taps Done or the game starts.

Seat takeover: a player whose phone died opens the room on another phone, chooses "Take over my seat" and picks their seat. Only seats with no phone connected are offered. A room setting decides whether the host must approve first (off by default); either way the old phone's access is cancelled and the score and answers stay with the seat.

Local owner hosting is the explicit non-production stand-in for creator sign-in. The owner link carries a generated key once; the browser then holds it in an HttpOnly, SameSite=Strict cookie scoped to `/api/host`. Startup refuses `LOCAL_OWNER_TOKEN` in production, and rooms opened this way use rehearsal grants that production rejects. Hosting on a production deployment therefore still needs a chosen sign-in provider.

## Logs, timing, and health

- Fastify/Pino JSON logs include generated request IDs, version, route, status, duration, and errors. Request serializers omit headers, query strings, and bodies; configured sensitive fields are redacted.
- `Server-Timing` measures server work through response preparation. Completion logs/metrics measure the lifecycle through response completion. Neither includes phone/network/render time.
- `/api/health/live` reports process responsiveness. `/api/health/ready` checks authentication configuration and database connectivity. It does not prove provider availability, schema compatibility, or game readiness; migration/deploy checks are separate.
- `/api/ops/metrics` exposes fixed-size duration buckets, error/request counts, event-loop delay, memory and uptime to authorized operators. It also includes database pool measurements and last connectivity-probe timing. Metrics reset on process restart and are not a persistent monitoring system.
- Optional manual request spans export over OTLP/HTTP when `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is configured. No exporter or external network telemetry is enabled by default. Request spans are currently standalone; database spans and full browser/server trace correlation come later.
- SIGTERM/SIGINT trigger a bounded shutdown. Fatal exception monitoring logs available diagnostics without swallowing the crash. An external host/process supervisor is required for restarts.

Never commit `.env`, credentials, answers, or recovery codes in logs. Centralized error issue tracking, persistent dashboards, telemetry outage testing, and deployment alerts remain future work.

## Verification and next slice

CI runs type checking, offline tests and builds. Tests cover signed tokens and invalid claims, permission boundaries, configuration failures, error containment, log redaction, request limits, timings and health behavior. No tests depend on a live identity provider.

Game contracts and the first internal durable command service now support prepared untimed individual choice/text stages, host-judged challenges, exact score effects, receipts/retries, safe views, and transactional audit/outbox persistence. See [contracts and command services](docs/architecture/game-commands.md) for trust boundaries and limitations. A new migration records zero-point judgments as immutable decisions.

Real process-kill tests verify rollback/retry without duplicate scoring. The room gateway, real WebSocket/polling tests, bounded outbox publication, startup pausing, and browser host/phone refresh/offline/recovery tests are now implemented. Trusted actor IDs are derived from verified credentials, never accepted as authentication from a request. Timed stages now run with server deadlines, a delivery grace period, automatic closing, and host controls to add time, replace it, remove the limit, pause and reopen. Each round sets its own answer style on the phone: a list, large tiles, or putting items in order. Players can also answer by uploading a picture, GIF or short video, and vote anonymously on each other's text answers or uploads. Rounds can be solo or team-based: teams are made in a Pick teams scene and later rounds play in them, or a round has its own split (2v2, 1v3, 1 vs everyone, a number of teams), made randomly, by the host or by the players, always confirmed by the host. Captains can answer for their team, and points go to the team, each member or both. Show-only scenes (an info/cutscene scene and a scoreboard scene) let the host present text or standings between rounds. Games can branch: a route choice lets the players, the team captains or the host pick one of several routes, which can join back together; ties and empty votes follow the game's rules, and the host can always choose. Closed stages are revealed by the host (correct answer, answer tally, points, scoreboard), the host can judge challenges from the browser, and score corrections are new ledger entries. More drawing minigames (see the ideas in the creative minigames document), media in scenes and the show host remain later slices.

**Current gate: actual Android Chrome phone testing over public HTTPS, including 5G and Wi-Fi switching. Do not continue product features until this networking review passes.** On 12 November 2026 the owner lifted this gate for two slices only, timed stages and browser hosting; the phone review itself is still parked and not passed. See [network checkpoint and test steps](docs/testing/network-checkpoint.md). Temporary public rehearsal uses the built app through a Cloudflare tunnel; database ports remain private. Run `npm run network:prepare`, `npm run network:public`, and separately `npm run network:host` after the documented build/database setup. No cloud account/domain or permanent production deployment is created.

Browser regressions: start `npm run db:test:up`, install Chromium with `npx playwright install chromium`, then `npm run test:e2e` after building. These use a dedicated `_test` database; phone rehearsal uses local `_dev`. Automated emulation does not replace real-phone/5G evidence.

**Tester feedback of 15 November:** what is done, what still needs a real phone and what is left (groups H, I, J and the editor polish of 17 November, R and S) is in [tester feedback](docs/product/tester-feedback.md).

The [roadmap](docs/product/roadmap.md) lists what is next in order, with open questions. The [game catalog](docs/product/game-catalog.md) lists built games and ideas to add, including drinking games. The [next-phase sequence](APP_PLAN.md#26-next-phase-build-order-and-quality-gates) puts the reliable loop and basic creative mechanics before the editors. [Creative minigame research](docs/architecture/creative-minigames.md) covers still-planned avatars, drawing, jokes, team animation and show-host characters. The [testing/accessibility strategy](docs/architecture/testing-and-accessibility.md) extends the implemented initial networking browser suite to later features, devices and accessibility gates.

## Editor design reference

The approved [interactive example](docs/design/editor-reference.html) shows Flow and Scene views of the same branching game. [Design notes](docs/design/README.md) preserve the user-supplied workspace styling references and explain the mockup limitations. The Flow, Scene and Look & feel editors are implemented in `apps/web/src/editor`; the reference remains the design direction.

The [private admin health example](docs/design/admin-health-reference.html) preserves the proposed diagnostics layout and local demonstration controls. Its measurements are illustrative; the actual dashboard remains unimplemented.

## PostgreSQL and code-first migrations

One database per environment holds both authoring and live-game tables. Sessions reference immutable game versions; both editors will use the same editable draft. See the [schema and migration guide](docs/architecture/database.md).

```sh
npm run db:env             # create ignored local credentials if .env does not exist
npm run db:up              # start persistent local PostgreSQL
npm run db:migrate:deploy  # apply reviewed migration files
npm run db:status
npm run db:test:up         # isolated disposable test service
npm run db:test           # migration and integration checks
npm run db:test:stop
```

Use Prisma **7.10.1** commands, not the current Prisma 8 prerelease workflow. There are seventeen migrations; the latest seven add feedback reports, people with side-game chips, personal keys with editor rights, scene prefabs, challenges between players, chip stakes for those challenges (before it, accepting a challenge with a stake failed), and the arcade (lobbies, members, rounds, seats and results, with at most one unfinished round per lobby). Uploaded files are stored in `.local/media` (or `MEDIA_DIR`), not in the database. `npm run db:migrate:create -- --name describe_change` generates SQL for review; `npm run db:migrate:dev` applies it to a guarded local development database. `npm run db:generate` is also run by root build/test/typecheck commands. No database is reset or migrated automatically by the web server.

## Credits

Route arrows and shape marks use a few icons from [Font Awesome Free](https://fontawesome.com) (Fonticons, Inc.), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); see `apps/web/src/presentation/mark-icons.tsx`.
