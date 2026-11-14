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

`npm run host` builds the app, starts it on this computer and opens the host menu in your browser, already signed in as the owner. Pick a built-in game, open a room, and share the room code or QR. The first run generates `ROOM_TOKEN_SECRET` and `LOCAL_OWNER_TOKEN` into the ignored `.env`. This mode only reaches browsers on the same computer; `npm run network:public` opens the same menu on a temporary public address for phones on other networks. The host menu also has "Your games": create a game (blank or a copy of a built-in), see its problems per scene, publish it, and open a room for the published version. Each game opens in the Flow editor (`/?edit=<game>`): scene cards on a canvas, connected by dragging between ports, with snapping, problem markers per scene, automatic saving and publishing. Several people can edit the same game at once: each sees the others' changes as they are saved, the scenes they have selected and their pointers, and undo/redo only takes back your own steps (for now everyone enters with the owner link; invites need accounts, which are not built). A second tab, the Scene editor, shows the same game slide by slide with a rough screen and phone preview and every setting, including scenes with several parts and team settings. Games can also be imported from text, for example written by an AI assistant: see [Making a game from text](docs/guides/importing-games.md). The editor can export a game as text too. Drafts can be rehearsed in a practice room without publishing, from the start or from a chosen scene; scenes can be duplicated or copied between games; a minimap helps in large games. Minigame scenes play on the phones: Reaction duel, Tap race, Stop the clock and Lucky doors, each with settings, points by place (ties share) and team play including one against the rest; a built-in "Minigame madness" game shows all four. Players build their own look (a character from built-in parts: colour, body, eyes, mouth, hat, extra), or use a drawing or a photo (metadata removed; the host can remove it); it shows in the lobby, player list, scoreboard and results, and the phone remembers the character for the next game. Minigame results are checked against the server clock and each phone's measured network delay, the tap race streams its taps (live race bars), and pausing restarts a running minigame with a fresh countdown. Drawing rounds (optionally blind, or finishing a doodle) can be voted on; drawing minigames are Perfect circle and Pass the pencil (teams take turns on one picture, then vote, with every stroke shown live). Drawing also works with the keyboard. Games can have wheels of fortune (spun by the host on chosen scenes, the result kept in a corner of the shared screen), players can vote for a smoke break that pauses the game, games end with an awards show the author configures, and the editor shows about how long a game takes. Old pictures, videos and drawings are deleted automatically after `MEDIA_RETENTION_DAYS` (default 14) once a room is over or unused. A third editor tab, Look & feel, changes how the game looks and talks: every text players and screens show, a style (eight starting points, then any colour, font, size, roundness, background and answer-tile style, with readability warnings) and the animation for each moment (sixteen ready-made, or built from blocks), for the whole game or a single scene. Looks are data only, validated by the server; authors never write code or CSS. Built-in games are "Friday Night Chaos" (a route vote), "Timed quiz", "Team party", "Minigame madness", "Draw party", "Picture party" (uploads and a vote) and the untimed "First reliable game".

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

1. Tap **Feedback** on the right edge of any screen.
2. Choose *Something is broken*, *Idea or wish* or *Minigame idea*, and give it a title (and details if you like).
3. Optional: **Point at something**, then tap the thing on the screen you mean. The tap picks it instead of pressing it. Up to five things.
4. Optional: your name (the phone remembers it). **Send**.

For you: open **Admin: feedback from testers** at the bottom of the host menu (`/?admin`).

- Filter by kind, status (open, all, new, planned, in progress, done, declined) and text.
- Change a report's status or kind, write a note, or delete it.
- **Copy as text** (one report) or **Copy N as text** (everything shown) gives a description with the screen, the page and, for each pointed-at thing, the file and line in the code (for example `JoinScreen in apps/web/src/network/room-screen.tsx:38`). Paste that into a request to fix it.

What a report keeps: the page address without the part after `#` (so never a key), the screen (player phone, host screen, shared screen, editor…), its size, the browser, and for each pointed-at thing its text, where it sits in the page and its file and line. Nothing typed into the game. The file and line come from the build, which writes them onto every element (`apps/web/tooling/source-tags.ts`, about 2% more download; `PARTY_SOURCE_TAGS=off npm run build` leaves them out). Limits: 30 reports a minute and 200 an hour per address (testers coming in through the test link count as one address), at most 5000 unhandled reports, no screenshots.

### 3. People: accounts so you are always yourself

1. Host menu → **Admin: people (accounts)** (`/?admin=people`).
2. Type a name (for example *Dinny*) → **Add person**. A personal link and its QR code appear, **only this once**.
3. Open the link on that person's phone: scan the QR code or send the link. The phone says "This phone now plays as Dinny".
4. From then on that phone joins every room as Dinny: the name is filled in, the character comes back, and the chips carry over between games. Joining the same room from a second phone of the same person continues the same seat.
5. On a phone, **Not Dinny?** on the join screen signs that phone out.

In the People list: **New link** (the old link stops working; phones already signed in stay signed in), **Rename**, **Sign out phones** (all of that person's phones become guests), **Remove** (signs out, frees the name; past games and chips stay in the history). The list shows phones, last seen, games played, chips and how much they bet in total.

Good to know:

- Anyone with a personal link can become that person: send it only to them. There are no passwords.
- A phone's sign-in belongs to one address. The temporary test link gets a new address at every start, so on a new address people need a new link (**New link**, then send it). This goes away with the fixed home-server domain.
- Players without a personal link still join as guests by typing a name.

### 4. Side games on the phones

Players play on their own phone while waiting: in the lobby, between rounds, after answering, during a break.

- Bottom bar → **Games**: **Slot machine**, **Blackjack**, **Packs** (open packs, collect 15 items in four rarities) and the **Leaderboard**.
- Chips are play money only. Everyone starts with 1000. When they are almost out, **Broke? Get 500**; the leaderboard counts how often.
- People (accounts) keep their chips across games; guests' chips are for that room only.
- The leaderboard shows this room and all time (people only): bet in total, net result, chips now, best win.
- **Pausing**: as soon as a round needs the player (a question to answer, a vote, a minigame, picking teams), the side game closes with "Round started: your side game is paused" and the button says *Games paused*. An unfinished blackjack hand waits until the next time. The server refuses side-game moves while the player is needed, so this cannot be skipped.
- The host can switch side games off for a room: host screen → Room settings → *Side games on the phones while waiting*. On by default.
- What pays and the chances are shown in each game. The slot machine pays back about 94 of every 100 chips bet, blackjack pays 3 to 2 for a blackjack (dealer stands on 17, doubling on the first two cards, no splitting), packs never pay chips back. The server draws every card, reel and pack.

## Authentication boundary

Creator sign-in provider selection is deferred. There is **no development login bypass**, password store, sign-in screen, or token-issuing endpoint.

The backend can verify API access tokens from a configured OIDC provider using HTTPS JWKS, RS256 signatures, issuer, audience, subject, expiry, issue time, and a one-hour maximum token age. Set `AUTH_ISSUER`, `AUTH_AUDIENCE`, and `AUTH_JWKS_URL` together. Tokens are sent using an Authorization Bearer header. Configure a dedicated API access-token audience; this is not a browser ID-token login flow.

`/api/me` requires a verified identity. `/api/ops/metrics` also requires the trusted issuer's `ops:read` scope. A browser cannot grant itself scopes by sending IDs or role flags. There is no frontend token storage yet.

With no provider in development, protected endpoints return 503 and readiness is 503. Production startup refuses missing authentication configuration. Liveness stays 200 so a deployment does not endlessly restart just because sign-in is unconfigured.

Room networking now separately verifies expiring/revocable opaque host/display/player credentials in HttpOnly cookies, checks roles/origins and bounds admission/messages. Normal room creation requires verified OIDC identity and ownership. The owner-run rehearsal CLI explicitly provisions a short-lived host grant for one test room; production rejects those local rehearsal grants. Full creator browser sign-in/provider integration remains future work.

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

Real process-kill tests verify rollback/retry without duplicate scoring. The room gateway, real WebSocket/polling tests, bounded outbox publication, startup pausing, and browser host/phone refresh/offline/recovery tests are now implemented. Trusted actor IDs are derived from verified credentials, never accepted as authentication from a request. Timed stages now run with server deadlines, a delivery grace period, automatic closing, and host controls to add time, replace it, remove the limit, pause and reopen. Each round sets its own answer style on the phone: a list, large tiles, or putting items in order. Players can also answer by uploading a picture, GIF or short video, and vote anonymously on each other's text answers or uploads. Rounds can be solo or team-based: the game sets a default and each round can override it with its own split (2v2, 1v3, 1 vs everyone, a number of teams), made randomly, by the host or by the players, always confirmed by the host. Captains can answer for their team, and points go to the team, each member or both. Show-only scenes (an info/cutscene scene and a scoreboard scene) let the host present text or standings between rounds. Games can branch: a route choice lets the players, the team captains or the host pick one of several routes, which can join back together; ties and empty votes follow the game's rules, and the host can always choose. Closed stages are revealed by the host (correct answer, answer tally, points, scoreboard), the host can judge challenges from the browser, and score corrections are new ledger entries. More drawing minigames (see the ideas in the creative minigames document), media in scenes and the show host remain later slices.

**Current gate: actual Android Chrome phone testing over public HTTPS, including 5G and Wi-Fi switching. Do not continue product features until this networking review passes.** On 12 November 2026 the owner lifted this gate for two slices only, timed stages and browser hosting; the phone review itself is still parked and not passed. See [network checkpoint and test steps](docs/testing/network-checkpoint.md). Temporary public rehearsal uses the built app through a Cloudflare tunnel; database ports remain private. Run `npm run network:prepare`, `npm run network:public`, and separately `npm run network:host` after the documented build/database setup. No cloud account/domain or permanent production deployment is created.

Browser regressions: start `npm run db:test:up`, install Chromium with `npx playwright install chromium`, then `npm run test:e2e` after building. These use a dedicated `_test` database; phone rehearsal uses local `_dev`. Automated emulation does not replace real-phone/5G evidence.

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

Use Prisma **7.10.1** commands, not the current Prisma 8 prerelease workflow. There are twelve migrations; the latest two add feedback reports, and people with side-game chips. Uploaded files are stored in `.local/media` (or `MEDIA_DIR`), not in the database. `npm run db:migrate:create -- --name describe_change` generates SQL for review; `npm run db:migrate:dev` applies it to a guarded local development database. `npm run db:generate` is also run by root build/test/typecheck commands. No database is reset or migrated automatically by the web server.
