# Party Game Builder — App Plan

Date: 9 November 2026

Last updated: 11 November 2026 — creative minigames, player customization, researched browser constraints, build order, testing, and accessibility.

Status: Browser/server/shared-contract scaffolding, tests, diagnostic logging, timing, token verification, PostgreSQL/Prisma models, migrations, and database integration tests are present. Live sign-in, gameplay command/persistence services, multiplayer rooms, editors, and the admin dashboard remain unimplemented. See README.md for implemented scope and verification. Build phases below describe intended outcomes, not completed features. This planning update does not start implementation.

## 1. Product overview

A browser-based platform for creating and hosting custom pub quizzes and party games, mixing:

- Private quiz answers on phones.
- Team and individual competition.
- Physical challenges judged by the host.
- Player submissions and voting.
- Drawing, jokes, captions, memory games, secret choices, and team creation.
- Custom player names and built-in, uploaded, or hand-drawn identity images.
- Custom house rules.
- Cutscenes, music, and sound effects.
- An optional customizable puppet/mascot character that presents the show.
- Eventually, user-created round mechanics.

A laptop provides the shared game display. Players join using their phones without installing an app.

Twenty players is a baseline requirement. There will be no arbitrary player cap in the game logic. Practical capacity depends on hosting and testing; unlimited capacity is not promised.

## 2. Main screens

| Screen | Purpose |
| --- | --- |
| Game library | Create, duplicate, edit, and host saved games. |
| Builder | Arrange the timeline and configure rounds, rules, teams, scores, and media. |
| Media library | Manage reusable images, videos, music, sound effects, and supported links. |
| Rehearsal | Test a game with simulated players and preview different devices. |
| Host controls | Manage the session, progression, judging, teams, and scores. |
| Shared display | Show questions, challenges, cutscenes, timers, reveals, and standings. |
| Phone controller | Join, answer, vote, receive instructions, and view results. |
| Results | Review final individual and team standings and point breakdowns. |

## 3. Game structure

A game is a directed flow of scenes and logic nodes. A simple game is an ordered sequence; games may also branch through explicit choices and rejoin later. For example:

Opening → rules → individual quiz → team formation → team challenge → cutscene → voting round → finale.

Supported scene and flow items:

- Quiz rounds.
- Room challenges.
- Submission and voting rounds.
- Rules and information screens.
- Team formation or reshuffling.
- Cutscenes.
- Breaks.
- Scoreboards and final results.
- Party route choices and explicit branch connections.
- Creative and minigame rounds assembled from supported stage mechanics (section 25).

Items can be reordered within a sequence, duplicated, disabled, grouped, and connected. Branches must remain explicit; moving, disabling, or deleting a node must not silently reconnect routes or discard authored branches.

Configuration follows this hierarchy:

1. Game defaults.
2. Round overrides.
3. Permitted live host adjustments.

Every supported gameplay setting should be configurable at the appropriate round or stage. The interface only shows relevant options.

## 4. Builder

### Two synchronized editing views

Accepted layout/interaction reference: [interactive dual-editor example](docs/design/editor-reference.html), with [reference notes and workspace-style images](docs/design/README.md). This is a saved design example, not implemented app functionality.

- **Scene view:** a classic PowerPoint-style editor. A slide/scene list, editable scene content, device previews, and settings let the author focus on what happens in one scene.
- **Flow view:** a high-level node canvas inspired by visual workflow editors. Drag connections between scenes, rounds, cutscenes, choice nodes, and results to define progression. Use labeled input/output ports with compatible-target highlighting and snap-to-port connections, zoom, pan, fit-to-game, groups, and a minimap when useful.
- Both views edit one canonical game definition with stable scene/node identifiers. Changing a scene in one view updates the other; there are no separately maintained copies.
- Double-clicking a scene node opens its scene editor. Returning to the flow retains canvas position and selection.
- The classic list shows branch groups/routes and rejoin destinations instead of flattening every branch into a misleading linear playlist. The author can select a route to inspect and rehearse.
- Store canvas positions and editor preferences separately from execution semantics. Moving a node visually does not change playback order; changing a connection does.
- Provide a keyboard-accessible connection picker and explicit next-scene controls alongside drag-to-connect interactions.

### Scene-view layout

| Area | Function |
| --- | --- |
| Left: scene list | Add and arrange scenes within sequences; expand route/branch groups. |
| Center: preview | Preview the shared screen or a particular phone perspective. |
| Right: settings | Edit the selected item's content and behavior. |

Inherited settings are clearly marked, with an option to reset an override to the game default. Phone previews include captain and teammate perspectives where relevant.

### Starting templates

| Template | Typical stages |
| --- | --- |
| Quiz | Instructions → question → answers → reveal → points |
| Room challenge | Instructions → timer → host judging → results |
| Submit and vote | Instructions → submissions → reveal → voting → results |
| Rules/information | Display content → continue |
| Cutscene | Play or display media → continue |
| Team change | Form teams → preview carryover → confirm |
| Scoreboard | Display selected standings → continue |
| Party route choice | Present routes → collect eligible votes → resolve → enter selected branch |
| Drawing and voting | Private prompt → draw → save → reveal → eligible votes → results |
| Jokes/captions | Private prompt → write → save → anonymous reveal → vote/judge → results |
| Secret-choice minigame | Instructions → private choices → lock → resolve → animate outcome → points |

Customized rounds can be saved as reusable personal templates.

### Per-round configuration

| Category | Options |
| --- | --- |
| Content | Questions, answers, instructions, images, and private messages |
| Participation | Individuals, teams, everyone, or selected players |
| Team formation | Keep teams, random assignment, player choice, or host assignment |
| Submission | Every player, captain only, or no submission |
| Visibility | Private answers, anonymous entries, and reveal timing |
| Timing | Timers, submission editing window, and host-controlled progression |
| Judging | Correctness, speed, votes, host decisions, or supported combinations |
| Scoring | Points, bonuses, penalties, recipients, and allocation |
| Carryover | Score handling when teams change |
| Media | Music, video, sound effects, and playback behavior |
| Rules | Public instructions and optional private instructions |

Each round gets a readable summary. For example:

> Random teams of three · captain submits · host judges · 50 team points and 10 individual points per member · team scores reset after reshuffling.

## 5. Custom mechanics and house rules

Rounds will be stored as sequences of stages from the beginning. Each stage defines:

- What each device displays.
- What actions are available.
- What ends the stage: host action, timer, or required submissions.
- What happens next.

The first builder supports template-based scene editing plus high-level node connections and explicit party-choice branches. A later advanced editor exposes the internal stages of a round for custom mechanics. Game-level flow nodes and round-internal stages are different levels of the same versioned definition.

Example custom sequence:

Create random teams → send private instructions → start timer → collect entries → vote → host bonus → results.

Party route-choice nodes are part of the initial builder. A later general rule editor can use an event → condition → action structure. For example:

> When voting ends, if there is a tie, open a host tie-break stage.

Written house rules are available immediately. Automated rules must use supported conditions and actions. Custom mechanics initially mean new combinations of supported stages and actions. Arbitrary scripting is a possible future extension outside the initial scope.

## 6. Players and teams

Every participant has a persistent player identity within the session, regardless of team changes.

Players choose a custom display name and a built-in icon, uploaded picture, or drawing made on their phone. These are display properties, never authentication credentials. Host moderation, reconnect persistence, upload validation, and privacy rules are specified in section 25.1. Cross-game profiles are optional later work, not a requirement to create an account as a guest.

Each round can use:

- Individual play.
- Existing teams.
- Randomly generated teams.
- Player-selected teams.
- Host-assigned teams.

Team settings include team count or target size and captain assignment. The host can resolve uneven groups or change a captain.

Team changes are explicit transitions. Players see their new team before the next round starts. Earlier results retain their original lineups.

## 7. Scoring and winners

Each round can award points to individuals, teams, or both.

A team result can give individual members:

- The full award each.
- An equal share.
- A separately configured award.
- A host-assigned amount.

Team and individual awards remain distinct. For example, a challenge can award 100 team points and 20 individual points to each member.

### Carryover when teams change

| Policy | Result |
| --- | --- |
| Keep scores with named teams | Team totals remain with those teams as members change. |
| Calculate from individual scores | New team totals use the sum or average of members' individual scores. |
| Fresh team scores | New teams begin at zero; historical results remain. |
| Redistribute old team totals | Divide old totals among members, then combine their shares into new teams. |
| Manual starting totals | Host sets the new totals. |

Carryover previews show resulting totals before confirmation. Redistribution does not automatically add points to individual standings.

Rounding and repeated-transition behavior must be defined explicitly during detailed design. Each transition replaces the relevant current team totals rather than repeatedly adding the same points.

Every score award, correction, and transition is recorded with its round, recipient, and relevant lineup. Corrections preserve an audit trail.

A game can crown an individual winner, a team winner, or both, using configured standings and tie-break rules.

## 8. Host and shared-display modes

All of these setups are supported:

| Mode | Setup |
| --- | --- |
| Single screen | Laptop displays the game; host controls open when needed and are visible to the room. |
| Separate displays | TV/projector shows the game while the laptop shows private controls. |
| Phone host controls | Laptop displays the game while an authorized host phone controls it. |

Only the selected shared-display device plays shared audio, preventing duplicate playback.

Host controls include:

- Start, pause, and advance.
- Extend or end timers.
- Inspect submission progress.
- Reveal answers.
- Judge challenges.
- Award or correct points.
- Manage teams and captains.
- Skip or replay timeline items.
- Control media and volume.
- Manage late joiners and recovery.

A participating-host setting hides correct answers and unrevealed submissions from the host interface. Some mechanics still require a non-playing judge; hiding answers alone cannot make every host-judged round impartial.

### Live editing

The host can edit upcoming content during play, including adding challenges, changing timers, rearranging rounds, and replacing media.

The active stage uses explicit controls for changes such as timer extensions and judging. Completed results preserve their history.

Edits to a live session do not silently overwrite the saved game. Saving those edits back is an explicit action.

## 9. Phone controllers

| Situation | Phone behavior |
| --- | --- |
| Joining | Scan a QR code or enter a room code, then choose a name and identity image; optional image setup can be skipped |
| Lobby | Nickname, connection status, and team information |
| Team selection | Available teams and membership counts |
| Quiz | Private answer controls and submission confirmation |
| Captain submission | Captain gets controls; teammates get instructions and status |
| Room challenge | Instructions, team details, and timer |
| Voting | Eligible entries and private voting controls |
| Creative rounds | Drawing pad, joke/caption entry, private prompts, and explicit local/server save status |
| Minigames | Supported tap/choice/turn controls, role information, and reconnect state |
| Cutscene | Companion content or “Watch the main screen” |
| Results | Individual points, team outcome, and standings |

Answer editing, anonymity, voting eligibility, and submission limits are configurable.

## 10. Late joining and rejoining

### Late joining

Players can join after the game begins. Proposed defaults:

- Enter immediately into a waiting state.
- Participate from the next eligible stage.
- Start with zero individual points.
- Join a team according to host action or the configured team policy.
- Receive no retroactive awards unless the host adjusts them.

Joining an existing team does not erase or redistribute that team's score unless a configured transition explicitly does so.

### Rejoining

Refreshing, locking the phone, or losing connection should preserve:

- Player identity.
- Team membership.
- Points.
- Accepted submissions.
- Current stage status.

A stored player credential handles normal reconnection. Switching devices uses a recovery code or host-approved reclaim process. Entering a nickname alone must not allow someone to take another player's identity.

Disconnected players remain part of the session. The host can continue without waiting indefinitely.

## 11. Cutscenes and audio

Cutscenes can contain video, images, text, and audio, with:

- Host-controlled or automatic start.
- End-on-completion or wait-for-host behavior.
- Skip and replay.
- Configurable phone companion content.

Basic cutscenes use a single video or image/text screen. Richer timed sequences come later.

### Audio layers

| Layer | Behavior |
| --- | --- |
| Game background | Default music or playlist |
| Round override | Keep, replace, or pause background music |
| Cutscene audio | Pause or lower background music |
| Event sounds | Countdown, reveal, correct answer, round end, and winner cues |

Shared sound plays through the selected display by default. Optional phone sounds can provide private cues.

The shared-display browser gets an initial Enable sound action. Playback failures show a manual play option. The host always has volume and mute controls.

The media library supports uploads and supported external sources. YouTube uses its embedded video player, with play, pause, volume, and playback-state controls where available. The app handles blocked autoplay and unavailable embeds. See the [YouTube player documentation](https://developers.google.com/youtube/iframe_api_reference).

Uploaded audio is the primary option for dependable background music. YouTube is supported as video playback, rather than promised as an interchangeable audio-only source.

An optional customizable show-host character can introduce scenes and react to results using authored art, dialogue, poses, and voice clips. It is presentation, separate from the human host and authoritative game engine. See section 25.5 for scope, fallbacks and build order.

## 12. Technical setup and frontend/backend boundary

Selected direction: a separate browser frontend and authoritative backend, using TypeScript for both. The server runtime is Node.js; TypeScript is the implementation language. Fastify remains the recommended server framework. Exact dependency versions and infrastructure providers will be selected when implementation begins.

All host and player interaction remains browser-based. The backend runs on hosting infrastructure; nobody needs to install a client or local server.

### Responsibility boundary

| Layer | Responsibilities |
| --- | --- |
| Browser frontend | Builder forms, previews, host/player interfaces, media playback, local countdown display, command submission, and presentation of server-confirmed state |
| Authoritative backend | Authentication and authorization, game-definition validation, stage transitions, eligibility, deadlines, judging permissions, score calculation, team assignment/carryover, durable writes, and recovery |
| Shared contracts | Public command/event schemas, identifiers, types, and safe presentation models; no credentials, correct-answer data, or privileged engine implementation in browser bundles |

Frontend validation provides immediate feedback, but the backend repeats all authoritative checks. A host browser is also a client: it requests a permitted action rather than directly changing database records or calculating authoritative results. Rehearsal uses the backend engine with isolated session data.

Keep frontend and backend in separate packages, with shared public contracts in a third package. They may initially be served from one deployment and public origin. Logical separation does not require separate domains or microservices; deployment can be split later if measured needs justify it. The browser has no direct access to authoritative game tables.

| Component | Proposed choice | Reason |
| --- | --- | --- |
| Frontend | React + TypeScript + Vite | Shared UI foundation for builder, display, host, and phones |
| Backend | Node.js + TypeScript + Fastify | HTTP API and authoritative game engine |
| Real-time communication | Socket.IO | Room communication, acknowledgements, and reconnection support |
| Database | PostgreSQL | Games, versions, players, submissions, team history, and score records |
| Data access and schema management | Prisma with version-controlled code-first definitions and migrations | Define models/relations/constraints in source, review generated database changes, and apply tracked migrations |
| Validation | Zod | Validate game definitions and incoming commands |
| Media storage | Dedicated SSD-backed media directory initially; optional S3-compatible adapter | Keep media outside the database and gameplay messages without requiring an extra storage service on the Pi |
| Testing | Vitest + fast-check + Playwright + Artillery | Engine properties/model tests, browser/device flows, and Socket.IO load/failure scenarios |
| Structured logging | Pino through Fastify | Correlated JSON logs with redaction |
| Observability | OpenTelemetry + centralized error tracking and metrics dashboards | Timings, traces, issue grouping, and operational alerts; backend providers to be selected |
| Repository | One repository with web, server, and shared packages | Keep schemas and command types consistent |

### Code-first database schema and migrations

The database must be managed code-first, using Prisma as the selected direction. Model/contract definitions in source control describe the intended PostgreSQL structure; versioned migrations describe how existing databases reach that structure. The database is not designed by manually editing production tables.

Required workflow:

1. Update the version-controlled model/contract definitions.
2. Generate a named migration with the pinned Prisma version's supported workflow.
3. Review the generated operations/SQL and add explicit data transformations/backfills where needed. Renames must not silently become destructive drop-and-create operations.
4. Test the migration on a fresh database and an existing-schema fixture containing representative data, including pending commands, scores, and recovery state where relevant.
5. Commit the definitions, migration authoring files, and required generated migration artifacts together. Never commit credentials or database contents.
6. Apply reviewed pending migrations as an explicit release step on the home server, then start the compatible application version. Track applied migrations so repeat deployment does not repeat changes.

Keep schema definitions, migration history, and database configuration together in a dedicated backend-owned database directory. Runtime persistence code belongs in the backend's feature/persistence modules; the browser only receives public contracts. Final filenames and commands depend on the Prisma version selected during database setup; do not copy commands from a different major version. Pin and verify the version against Node 24 and the Pi's ARM64 environment.

- Do not use untracked schema synchronization or destructive reset commands on the persistent home-server database as a replacement for migration history.
- Do not modify a migration that has already been applied to a shared/persistent environment; append a corrective migration.
- Keep schema migration execution out of request handlers and game-hosting actions. Do not run schema changes during a live quiz.
- Define release serialization/locking, failure handling, and schema/application compatibility. Stop a release when migration application fails; do not start incompatible application code.
- Use expand/backfill/contract steps where compatibility or existing data requires them. Backups and verified recovery procedures precede destructive changes; application rollback does not imply an automatic lossless database downgrade.
- Keep development, test, and production database targets separate. CI verifies schema validity and migration application against disposable PostgreSQL.

Database foundation implemented locally: PostgreSQL 18.6 and matching stable Prisma 7.10.1 CLI/client/adapter, version-controlled schema/migrations, a bounded client pool, connectivity diagnostics, and migration/integrity integration tests. [Database architecture and exact commands](docs/architecture/database.md) describe the 17 initial models and the limits of this foundation. Production deployment and gameplay command/recovery services remain unimplemented.

Versioned references for the pinned Prisma 7 tooling: [development/deploy migrations](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production), [migration customization](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/customizing-migrations). The unversioned documentation currently describes a different Prisma major; do not mix CLI workflows.

### Hosting

Primary target: the user's home server, initially a Raspberry Pi 4 with 8 GB RAM, or a NUC/mini PC. Use a supported 64-bit Linux OS and native ARM64 dependencies on the Pi; a NUC requires its matching architecture. This replaces the earlier managed-hosting default.

Recommended deployment shape:

- Reverse proxy serving the built frontend and media, terminating HTTPS, and forwarding API/WebSocket requests.
- One always-running Node backend with automatic restart and bounded shutdown.
- PostgreSQL on the same machine, accessible only locally or on the private service network.
- SSD-backed persistent database/media storage and separate off-device backups.
- Optional lightweight telemetry export rather than a full monitoring cluster on the Pi.

Docker Compose is a deployment option, not a requirement; system services are also valid. Deployment files will be added under infra/ when needed. Use explicit supported image versions, verify ARM64 availability, and build/reinstall native dependencies for the target architecture; never copy macOS node_modules onto the Pi.

A Pi 4 with 8 GB is expected to be a plausible target for one room with around 20 players, but this is an unmeasured engineering estimate. Actual-device simultaneous-submission, reconnect, multi-hour, disk-write, and recovery tests are release requirements. A NUC may provide more headroom depending on its CPU/storage; no replacement hardware is required before measuring.

Use a small bounded PostgreSQL connection pool and tune shared memory, per-query memory, and maintenance budgets against total host usage. Each phone connects to the backend, not to its own database connection. Do not interpret shared_buffers as PostgreSQL's entire memory requirement or disable durability to improve a benchmark.

Build release assets on the development machine/CI where practical. Avoid server-side video transcoding and heavy processing during games. The host laptop/TV browser plays media; the home server serves files and game state. Plan for media bandwidth as well as API latency.

Local-network versus internet access remains to be confirmed. Remote play requires a deliberate HTTPS/domain/reachability setup, potentially through a suitable tunnel or reverse proxy. Authentication/JWKS and YouTube may still require internet even when clients access the game over the LAN; fully offline operation is not promised by home hosting alone.

See [Raspberry Pi deployment notes](docs/deployment/raspberry-pi.md) for hardware assumptions, database rationale, and readiness checks. No home network, firewall, or deployment settings are changed by this plan.

### Authoritative game engine

The server controls:

- Current stage and progression.
- Deadlines and accepted submissions.
- Team assignments.
- Voting eligibility.
- Judging and score calculation.
- Carryover.
- Access to private information.

Clients send commands such as submit answer or advance stage. They cannot award themselves points or bypass deadlines.

Each command has an identifier so retries cannot duplicate submissions or score awards. Related database changes are committed together.

Socket.IO's default delivery behavior does not guarantee that a disconnected recipient receives every event. The app therefore needs acknowledgements, safe retries, and state synchronization in addition to connection recovery. See [delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/) and [connection recovery](https://socket.io/docs/v4/connection-state-recovery/).

### Persistence and recovery

The database stores current session state plus important actions and score records.

After reconnecting, a client receives a fresh view appropriate to its role. After a server restart, a session can be restored in a paused state for the host to resume.

Private data is filtered on the server. Correct answers must not merely be hidden in the phone interface while remaining available in its network data.

### Game definitions and live sessions

| Record | Purpose |
| --- | --- |
| Game draft | Editable source in the builder |
| Game version | Snapshot used to start a session |
| Live session | Current stage, participants, submissions, and live edits |
| Team lineup history | Membership at each relevant point |
| Score records | Awards, adjustments, and carryover operations |
| Media assets | Uploaded files or supported external references |

Proposed account model: creators sign in to manage saved games; players join as guests. Host and controller access use separate credentials from the public room code.

## 13. Rehearsal and validation

Rehearsal uses the same game engine as live play, with isolated test data.

It supports:

- Simulated players.
- Host, display, captain, and teammate previews.
- Sample answers and votes.
- Team reshuffles and score previews.
- Media playback.
- Stage navigation and reset.

Validation catches missing answers, impossible stage flows, incomplete scoring, missing carryover policies, and media problems detectable before play.

External media can still fail later, so the host always retains skip and continue controls.

## 14. Reference game: Friday Night Chaos

The reference game uses 20 players, initially forming four teams of five, and awards both individual and team points.

| Item | Format | Points |
| --- | --- | --- |
| Opening | Cutscene and house rules | None |
| Quickfire | Five individual quiz questions | Individual |
| Team Trivia | Four randomly assigned teams | Team and individual |
| Ad Break | Video cutscene | None |
| Living Sculpture | Physical team challenge judged by the host | Team and individual |
| Team shuffle | Players choose new teams | Redistribute team totals |
| Best Excuse | Private team submissions followed by voting | Team |
| Finale | Final standings | Individual and team winners |

### Builder walkthrough

1. Create the game and configure defaults: 20-second quiz timers, host-controlled question starts, background music, and both winner categories.
2. Add the timeline items from templates.
3. Configure Quickfire with five questions, private individual answers, ten points per correct answer, and no speed bonus.
4. Configure Team Trivia with four random teams, captain submissions, 20 team points per correct answer, and five individual points per member.
5. Add the video interlude and configure it to pause background music, permit skipping, and continue when playback finishes.
6. Configure Living Sculpture: two minutes to create a famous landmark using team members; host awards up to 50 team points, with ten individual participation points per member.
7. Add team selection with a target of four teams of five. Redistribute old team totals through equal member shares, without changing individual scores.
8. Configure Best Excuse: one typed entry per captain, anonymous reveal, one vote per player, no voting for one's own team, and five team points per vote.
9. Add individual and team final standings.
10. Rehearse with 20 simulated players and inspect all device perspectives and carryover calculations.

### Live walkthrough

1. **Lobby:** laptop shows a QR code, room code, joined count, and players. Phones accept nicknames and confirm entry.
2. **Opening:** shared display plays the opening and rules. Phones show welcome content and instructions.
3. **Quickfire:** laptop shows questions, timers, and submission counts; phones accept private answers. Reveals award individual points.
4. **Team formation:** shared display shows random lineups and captains; phones show each player's team.
5. **Team Trivia:** captains submit; teammates discuss. Shared display counts team submissions and reveals results.
6. **Video:** shared display plays the cutscene; phones ask players to watch the main screen.
7. **Living Sculpture:** shared display and phones show instructions and timer. Host enters and confirms awards after the performance.
8. **Team shuffle:** phones offer team selection; host resolves uneven groups, reviews calculated starting totals, and confirms.
9. **Best Excuse:** captains submit privately, entries are revealed anonymously, and phones accept eligible votes. Results reveal authorship and points.
10. **Finale:** shared display celebrates individual and team winners; phones show personal results and point breakdowns.

In single-screen mode, judging controls are visible to the room. In separate-display mode, private controls stay off the shared display. Missing submissions and disconnected players do not prevent the host from continuing.

## 15. Build phases

| Phase | Deliverables | Completion condition |
| --- | --- | --- |
| 1. Detailed design | Versioned stage/input contracts, role-filtered views, deadline/scoring rules, credentials, accessibility criteria, asset lifecycle, and test scenarios | Contracts and acceptance examples are reviewable; existing scaffolding/schema are distinguished from still-missing services |
| 2. Multiplayer foundation | Durable command handlers first, then rooms, guest identity/names/icons, host/display permissions, late joining, outbox, reconnect/restart recovery, and initial browser E2E tests | Twenty players can join; a confirmed submission survives server termination/restart; retries produce no duplicate effects; critical screens pass keyboard/touch checks |
| 3. Playable game engine | Quiz, room challenge, text/jokes/captions, voting, teams, timers, scoring/carryover, party-choice resolution/rejoin, results | Prepared reference game and branching scenario run end to end; core correctness and privacy regressions pass |
| 3A. First creative mechanics | Bounded drawing document/pad, hand-drawn avatars, validated picture uploads, asset recovery, draw/reveal/vote, one simultaneous secret-choice minigame | Accepted artwork survives restart, private assets stay private, upload failures are recoverable, and all supported device/input checks pass |
| 3B. Pre-editor verification | Multi-device browser tests, accessibility review, representative 20-player creative load, failure injection and target-hardware measurements | No unresolved critical privacy, score, recovery, or accessibility defects; measured results and limitations recorded before editor work |
| 4. Builder and templates | Synchronized scene/flow editors, drag-to-connect routes, branch-aware scene list, party-choice settings, theme separation, previews, saving, reusable templates | A host can author both a linear game and a party-voted branching game without code; both views stay consistent |
| 5. Media and live controls | Cutscenes, creator media uploads, YouTube embeds, audio layers, separate displays, phone hosting, upcoming-round editing, and optional static-pose show-host character/cues | Full presentation/control flow works; custom character supports text/captions, mute, skip, reduced motion and failure fallback |
| 6. Rehearsal and release validation | Extend ongoing tests to authoring/rehearsal/media; full soak/failure suites, real phones, backup restore drills, alerts, and production readiness | Complete authored game works with at least 20 phones; accessibility, recovery, and measured performance meet release criteria |
| 7. More creative mechanics and custom stages | Turn-based drawing/guessing, creation chains, team relay, frame-by-frame animation, stage editor and reusable sequences, in that dependency order | Each mechanic has supported participation ranges, accessible controls/alternatives, recovery behavior, and its own tests |
| 8. Advanced automation and live collaboration | General rules, advanced branches/cutscenes; simultaneous shared canvases or precision/rhythm games only after dedicated research/prototypes | Complex mechanics meet explicit consistency, fairness, device, and resource budgets; deferred features are not assumed safe by reuse |

Phases 1–6 constitute the first complete release, including both builder views and basic party-choice branching. Round-internal custom mechanics are supported by the architecture from the start, with advanced stage-editing tools delivered afterward.

Testing and accessibility start with the first feature and gate every phase; phase 6 expands coverage rather than introducing it. Section 26 gives the concrete next-phase sequence and links the testing/device strategy. The private admin dashboard follows real operational signals; it is not a prerequisite for the first reliable loop and is not implemented by this update.

Deployment occurs only once implementation is authorized and release prerequisites are satisfied; saving this plan does not authorize starting the build or deployment.

## 16. Release verification

Before calling the app ready, verify:

- At least 20 simultaneous players, plus host and shared display.
- A higher simulated load to measure headroom.
- Individual, team, and mixed scoring.
- Every carryover policy, including repeated reshuffles.
- Duplicate submissions and repeated host commands.
- Late joining, refreshes, network changes, and device recovery.
- Host/display reconnection and server restart recovery.
- Answer privacy and voting restrictions.
- Deadline boundaries, queued on-time submissions, speed-scoring behavior, and interrupted-question policies.
- Score conservation for transfers, exact rounding, corrections, deterministic history replay, and generated action sequences.
- Role escalation attempts, cross-room access, credential recovery/revocation, origin checks, and shared-Wi-Fi rate limits.
- Invalid stage graphs, empty voter/entry sets, automatic loops, and host fallback controls.
- Scene/flow view consistency, branch-aware editing, route selection/rejoin, vote ties/timeouts, and recovery after a route is chosen but before it is displayed.
- Mobile Safari and Chrome, plus laptop browsers.
- Cutscene playback, blocked autoplay, and media failure.
- A complete rehearsal and a real game-night trial.
- Server termination before and after commits, lost acknowledgements, and duplicate/stale commands.
- Database interruptions, slow queries, simultaneous host actions, and reconnect storms.
- Multi-hour soak testing, memory/listener cleanup, bounded queues, and measured capacity headroom.
- Monitoring outages, media failure isolation, and successful database backup restoration.
- Performance budgets measured with timeouts and failures reported separately from successful latency.
- Creative asset privacy, validated uploads, missing/corrupt-file recovery, drawing revisions, deadline behavior during upload, and storage-full handling.
- Keyboard, screen-reader, touch, zoom/reflow, reduced-motion, target-size, and contrast checks across supported screens; responsive phone controls and desktop-first editor alternatives.
- Unit/property, real-database integration, multi-role E2E, accessibility and selected visual regressions as detailed in [testing strategy](docs/architecture/testing-and-accessibility.md).

## 17. Details to settle during design

The product direction is established. Remaining implementation details include:

- Exact screen layouts and visual design.
- Rounding and score attribution at repeated team transitions.
- Late-join eligibility boundaries for each stage type.
- Host recovery and device-reclaim interaction.
- Behavior of timers across pauses and server restarts.
- Initial media formats, upload limits, and external-link support.
- Creator authentication provider, final home-server hardware, LAN versus internet access, and backup/operating budget.
- Exact tie-break options and first-release automated rule capabilities.

These details are addressed in Phase 1 or the relevant technical phase. They do not authorize implementation before the user requests it.


## 18. Reliability, logging, and performance requirements

These requirements were approved for inclusion after research. They apply from the multiplayer foundation phase, rather than being added only before release. Tools and numerical targets remain implementation proposals until validated.

The objective is to prevent avoidable failures, contain failures that occur, preserve confirmed gameplay, and let the host resume. No system can promise that every failure will be predicted, caught, or logged; abrupt process termination, device loss, and infrastructure failure must also be handled through persisted state and recovery.

### 18.1 Durable commands and confirmations

- Assign every submission and host command a unique identifier scoped to its session and actor.
- Validate authorization, payload, active stage, state revision, and eligibility on the server.
- Commit the accepted action, its result, and essential game audit records in one database transaction.
- Confirm success only after the transaction commits. A phone distinguishes Sending, Saved, and Not confirmed—reconnecting.
- Retrying a committed command returns its stored result without repeating its effect. Reject reuse of an identifier with different content.
- Use database uniqueness constraints for command records, eligible submissions/votes, and score awards, respecting configured editing and voting limits.
- Bind pending submissions to their original stage. Reconnection must not blindly submit an old answer into a new question.
- If pending commands are retained locally across refreshes, reconcile them with server status and deadlines before retrying. A locally stored answer is not a saved server submission.

Socket.IO does not supply these application-level guarantees automatically: [delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/).

### 18.2 Notifications and concurrent changes

- Store important outgoing notifications alongside state changes using a transactional outbox.
- Publish only committed changes; retry pending notifications after recovery.
- Preserve logical ordering and include event identifiers and state revisions. Consumers ignore duplicates and resynchronize when revisions are missing or outdated.
- Keep outbox processing bounded, monitored, and recoverable. A full state snapshot remains the recovery fallback.
- Define allowed stage transitions explicitly. Coordinate simultaneous host actions, timer expiry, and submissions through short transactions with appropriate row locking or conditional revision checks.
- Use consistent lock ordering, database timeouts, and bounded retries for transient transaction conflicts. Do not retry invalid, unauthorized, or expired actions.

Sources: [AWS transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html), [PostgreSQL locking](https://www.postgresql.org/docs/current/explicit-locking.html).

### 18.3 Recovery and persistence failures

Persist current round/stage/revision, deadlines and pause state, players and lineups, accepted submissions and votes, score changes, live edits, command outcomes, and pending important notifications.

- Reconnecting devices receive a current role-filtered snapshot, even when short-term transport recovery fails.
- An application restart restores the session into Recovered—waiting for host. Do not automatically close an interrupted question or issue awards before reconciliation.
- If persistence is unavailable, stop confirming authoritative changes and show a recovery state. Do not pretend that an answer or score was saved.
- Define how in-flight commands are reconciled when their outcome is initially unknown; query by command identifier rather than issue a new award.
- Recovery preserves confirmed actions under the application's database durability assumptions. Database loss/failover requires its own backup and durability policy; an acknowledgement is not protection against every infrastructure disaster.
- Configure backups and point-in-time recovery where supported, document recovery time/data-loss objectives for the selected service, and perform actual restore drills.

Sources: [Socket.IO recovery limitations](https://socket.io/docs/v4/connection-state-recovery/), [PostgreSQL point-in-time recovery](https://www.postgresql.org/docs/current/continuous-archiving.html).

### 18.4 Timers and phone lifecycle

- The server owns deadlines, pause state, and eligibility decisions.
- Clients render countdowns locally rather than receiving a network update every tick.
- Resynchronize when a page becomes visible, resumes, or reconnects. Phone sleep and tab suspension are expected.
- Log timer extensions and pauses as game actions.
- Decide deadline boundary semantics during design, including the race between submission and stage closure. A client-provided timestamp is not sufficient proof of timely receipt.
- Interrupted questions require host review, with explicit restart/extension controls and audit records.

Source: [browser page lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api).

### 18.5 Error containment and process recovery

| Failure | Required behavior |
| --- | --- |
| Media cannot load or play | Retry/skip fallback; host navigation remains available |
| Phone rendering fails | Recovery UI and reload/rejoin without losing server identity |
| Host interface fails | Restore controls from persisted session state |
| Round configuration is invalid | Explain the problem and prevent that round from starting |
| Database cannot persist changes | Stop authoritative confirmations and show recovery status |
| Fatal server error | Capture available diagnostics, terminate, restart externally, and recover persisted sessions |
| Monitoring service fails | Gameplay continues without unbounded telemetry buffering |

Use React error boundaries around meaningful UI regions, plus explicit handling for event-handler, network, and asynchronous failures. Do not swallow errors or continue normal server operation after an uncaught fatal exception. Planned shutdowns should stop accepting new work, drain within a bounded deadline, and flush diagnostics when possible. Recovery must also work when cleanup cannot run.

Sources: [React error boundaries and limitations](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary), [Node.js uncaught exceptions](https://nodejs.org/api/process.html#warning-using-uncaughtexception-correctly).

### 18.6 Audit history, diagnostic logs, and error registration

Maintain distinct records:

| Record | Purpose |
| --- | --- |
| Durable game audit history | Explain team changes, awards, corrections, timer changes, and live edits |
| Structured diagnostic logs | Investigate application, network, persistence, validation, and media problems |
| Centralized error issues | Group failures, record first/latest occurrence, affected sessions, release, and regressions |
| Metrics and traces | Measure frequency, latency, resource saturation, and time spent in each operation |

- Include timestamp, severity, release version, outcome, duration, and relevant internal session/stage/command/trace identifiers.
- Register expected failures with useful reason codes; distinguish rejected gameplay actions from unexpected server failures.
- Record starts/stops, recovery attempts, database failures, dropped telemetry, authorization failures, and media failures with appropriate severity.
- Capture frontend errors on a best-effort basis with release mapping; complete browser/device crashes may prevent final reports.
- Redact credentials, recovery codes, tokens, and sensitive session values. Store answers in game records instead of copying them into diagnostic logs.
- Sanitize user-controlled log fields; protect diagnostic access and define retention/deletion policies.
- Bound logging queues and storage; aggregate repeated errors to prevent floods while retaining counts and representative context.
- Essential game audit writes participate in gameplay transactions. External diagnostics never block gameplay indefinitely.
- Test logging failures, redaction, queue overflow, and monitoring outages.

Sources: [OWASP logging guidance](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html), [Fastify/Pino logging](https://fastify.dev/docs/latest/Reference/Logging/), [OpenTelemetry signals](https://opentelemetry.io/docs/concepts/signals/).

### 18.7 Built-in performance instrumentation

Measure latency, traffic, errors, and saturation. Instrument critical paths from the beginning:

| Measurement | What it reveals |
| --- | --- |
| Answer tap to saved confirmation | Player-perceived submission latency |
| Command receipt to database commit | Server processing and storage cost |
| Host advance to client update | Stage-transition responsiveness |
| Re-established connection to synchronized state | Recovery cost after connectivity returns |
| Database queries, lock waits, and pool wait | Database contention and bottlenecks |
| Event-loop delay and utilization | Server stalls and processing pressure |
| CPU, memory, queue depth, active connections | Capacity, backlog, and potential leaks |
| Media startup and playback failures | Presentation reliability |

Use monotonic duration measurements such as performance.now() and correlated traces. Do not subtract unsynchronized device timestamps to claim end-to-end latency. Separate successful, failed, timed-out, and cancelled operations. Track distributions, p95/p99 where sample counts are sufficient, and trends rather than averages alone.

Use bounded metric labels such as operation, outcome, and round type. Put session/player identifiers in controlled logs/traces, not unbounded metric labels. Bound browser performance entries and telemetry buffers; use configurable trace sampling and measure instrumentation overhead.

Sources: [Google SRE monitoring](https://sre.google/sre-book/monitoring-distributed-systems/), [monotonic timing](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/High_precision_timing), [Node performance APIs](https://nodejs.org/api/perf_hooks.html), [Prometheus label guidance](https://prometheus.io/docs/practices/naming/).

### 18.8 Initial performance and recovery budgets

These are proposed acceptance targets, not benchmark results or guarantees. Define the test network, device mix, hosting resources, workload, and measurement boundaries before evaluating them.

| Operation | Initial target |
| --- | --- |
| Answer tap to saved confirmation | p95 at or below 500 ms on the defined test network |
| Server command processing including commit | p95 at or below 100 ms |
| Host advance to active-client update | p95 at or below 500 ms |
| Synchronization after connection is re-established | p95 at or below 2 seconds |
| Application restart recovery | Host can resume within 60 seconds when database and other required dependencies are healthy |

Measure timeouts/failures separately and publish the sample counts and slower percentiles. Network reconnection delay and browser suspension must not be hidden inside a misleading server-only metric. Final budgets and alert windows will be confirmed using actual hosting and phones.

### 18.9 Optimization and overload control

- Keep live commands small; use compact role-filtered updates and snapshots for recovery.
- Serve media through a dedicated file/static-serving path outside gameplay messages, using the local SSD-backed directory initially or optional object storage/CDN later. Preload only a bounded amount of upcoming content.
- Keep media processing and heavy jobs off the live command path.
- Bound input sizes, connection pools, queues, retries, and concurrent work. Reject excessive work clearly instead of allowing memory to grow indefinitely.
- Use bounded exponential backoff with jitter and coordinate retry policy to avoid multiplying retries across layers.
- Clean up timers, socket listeners, and session resources; test cleanup through long sessions and repeated reconnects.
- Inspect database query plans and add indexes for measured access patterns before adding caching or extra services.
- Start with a simple deployment and measured headroom. Any later multi-instance setup must explicitly solve room ownership, concurrent writes, routing, and recovery rather than assume an in-memory room can be copied safely.

Source: [AWS timeouts, retries, and jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/).

### 18.10 Host diagnostics and operational readiness

Provide a compact private host health panel with connection/synchronization counts, recent command latency, persistence status, and recovery warnings. Keep technical detail out of the shared game display.

Recovery controls include reconnecting the display, retrying/skipping media, reviewing the last confirmed action, and audited question restart/extension.

- Use independent external availability monitoring, not only a status reported by the app itself.
- Distinguish process responsiveness from ability to accept durable gameplay actions. Avoid restart loops caused solely by a shared dependency outage.
- Add a safe synthetic gameplay check in an isolated test room where practical.
- Alert on sustained errors, growing backlog, failing persistence, memory pressure, and prolonged recovery. Use windows and deduplication to avoid alert noise.
- Define a short recovery runbook and a pre-game readiness check.
- Avoid planned deployments during live games; test shutdown, migration compatibility, and rollback before release.

Source: [hosting health checks](https://render.com/docs/health-checks).

### 18.11 Failure and capacity testing

Use protocol-aware tests with Socket.IO clients. Artillery provides a Socket.IO engine and acknowledgement validation; a raw WebSocket test alone does not exercise the full application protocol.

Required scenarios:

- At least 20 players plus host/display; higher loads to establish headroom.
- Simultaneous answers near the deadline and simultaneous reconnects.
- Several hours of play to detect memory, listener, and timer leaks.
- Server termination immediately before and after commit and notification.
- Lost acknowledgements, duplicate commands, stale revisions, and expired submissions.
- Database interruption, pool exhaustion, slow queries, and conflicting host actions.
- Phone sleep, refresh, browser suspension, network switching, and device reclaim.
- Broken media, monitoring failure, and telemetry/logging backpressure.
- Backup restoration and restart recovery with score/history verification.

Pass criteria include correct final state, no duplicate effects, preserved confirmed actions within the documented durability model, understandable recovery, and performance within agreed budgets.

The first playable milestone must demonstrate: submit an answer, terminate the server, restart it, reconnect, recover the confirmed answer, and apply any resulting points only once.

Source: [Artillery Socket.IO testing](https://www.artillery.io/docs/reference/engines/socketio).

## 19. Further research backlog

The first four priority topics have been researched and their approved recommendations are recorded in section 20. Their detailed policies and test cases still need design work. The remaining topics below are research questions, not settled decisions; findings should be presented before promotion into requirements.

| Priority | Topic | Questions and expected output |
| --- | --- | --- |
| Researched — finalize in Phase 1 | Timing fairness on mixed networks | How should receipt deadlines, late packets, disconnections, and optional speed bonuses work fairly? Define authoritative timestamp semantics and a testable fairness policy without trusting client clocks. |
| Researched — finalize in Phase 1 | Scoring correctness and team transitions | How do rounding, unequal teams, negative points, late joiners, departures, and repeated carryover interact? Produce worked examples, invariants, and property-based test cases. |
| Researched — finalize in Phase 1 | Room security and player recovery | How do we prevent room-code enumeration, host takeover, identity theft, unauthorized commands, and reconnect abuse? Specify credentials, reclaim, origin validation, payload limits, and venue-friendly rate limits; shared Wi-Fi must not be treated as one player. |
| Researched — finalize in Phase 1 | Safe custom mechanics | How do stage graphs terminate, validate required inputs, prevent impossible votes/deadlocks, and constrain automated rules? Define typed stage contracts, validation, execution limits, and a host escape route without arbitrary code execution. |
| P1 — before media integration | Browser, display, and media compatibility | Test mobile Safari/Chrome, autoplay, external embeds, fullscreen, host phone controls, display sleep, and audio ownership. Produce a supported-device matrix and fallback policy. |
| P1 — before hosting selection | Venue connectivity and outage scope | What happens when venue Wi-Fi fails but mobile data works, or all internet access disappears? Define hosting expectations, preflight checks, and whether a future LAN mode is worth the added architecture. |
| P1 — before release | Deployment and database disaster recovery | What are acceptable outage/data-loss budgets, compatible migration rules, maintenance behavior, restore procedures, and costs? Distinguish app restarts from database failover or loss. |
| P1 — before data collection | Privacy, retention, and uploads | Which player data is necessary, how long should submissions/logs remain, and how are games deleted? Research applicable requirements separately; specify upload validation and external-media handling. |
| P1 — before visual design is finalized | Accessibility and party-room usability | Test readable TV text, touch targets, color-independent cues, reduced motion, caption options, readable timers, and volume controls with actual group play. |

Recommended next research pass: browser/media compatibility and venue connectivity, followed by hosting/disaster-recovery tradeoffs. The researched foundation topics now move into detailed design rather than being treated as unanswered research. Research into legal requirements, external-media policies, and current service capabilities must use current authoritative sources rather than assumptions.

Creative/browser constraints, upload safety, testing, and accessibility received an additional research pass on 11 November 2026 (sections 25–26). This does not close the venue-connectivity, legal/retention, media-policy, or disaster-recovery questions. Precise reaction/rhythm fairness and simultaneous canvas collaboration remain separate prototype/research gates.


## 20. Approved research findings: fairness, scoring, security, and mechanics

These recommendations were researched and approved for inclusion on 11 November 2026. They establish design requirements beyond the initial scaffold; implementation coverage is tracked in README.md. Exact numerical policies, algorithms, and acceptance examples are finalized during detailed design.

### 20.1 Timing fairness

- Default to correctness-only scoring. Speed bonuses remain an explicit per-round option, with a clear explanation that connection quality and delivery delay can affect results.
- The server owns deadlines and records message receipt before database/processing delays. Validate eligibility and reconcile queued eligible submissions before finalizing results.
- Specify the exact deadline comparison, stage-close ordering, and handling of explicit host closure. A late database write must not automatically mean a message arrived late.
- Never trust a client timestamp as proof that an answer was submitted on time. Client clocks and countdowns are display aids.
- Avoid automatic per-player ping compensation in the initial release. Round-trip latency does not establish exactly when a player saw a question or tapped an answer.
- If a delivery grace period is offered, use an explicit, consistent policy and withhold answer reveals until acceptance closes. Do not claim perfect fairness across differing connections.
- Define how question content is released so preloading does not reveal it or its answer early.
- For interruptions, offer audited host extension, restart, or void actions. Reopening submissions after revealing the answer requires restarting/voiding the question rather than quietly accepting newly informed answers.
- Use monotonic elapsed-time measurement and resynchronization for displays, while retaining persisted deadlines/pause state for recovery.
- Test exact boundary cases, delayed/reordered messages, processing stalls, phone sleep, and reconnection near the deadline.

Sources: [Kahoot speed scoring](https://support.kahoot.com/hc/en-us/articles/115002303908-How-points-work), [server authority](https://docs.unity.com/en-us/cloud-code/3.0.0/cheat-prevention), [monotonic timing and clock origins](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/High_precision_timing). The specific fairness policy above is a project design recommendation, not a guarantee supplied by those platforms.

### 20.2 Exact, auditable scoring

Use append-only score operations and traceable corrections. Authoritative standings must be reproducible from the recorded history; cached totals may be maintained transactionally for performance.

Distinguish:

| Operation | Meaning |
| --- | --- |
| Award | Creates points under the round's configured rules |
| Transfer | Redistributes existing points without creating more |
| Derived standing | Calculates a view, such as a member-score average, without issuing new awards |
| Correction | Appends an explicit reversal/adjustment referencing the affected operation |

Requirements:

- Use whole-number points by default and exact integer/fixed-precision decimal arithmetic where supported allocations require it. Bound supported values and preserve exactness across database, server, and serialized messages.
- Do not rely on binary floating-point arithmetic for exact redistribution.
- Define supported precision, rounding, and deterministic remainder allocation. Preview allocations before confirmation.
- Example: 100 whole points divided across three members must not silently become 99. An allocation of 34/33/33 preserves 100 but needs an explicit remainder policy. This example is not yet the chosen algorithm.
- Define negative-score rounding, departures, late joins, zero-member teams, unequal team sizes, and repeated transfers.
- Specify which lineup and eligibility snapshot each award uses.
- Keep sums and averages distinct and explain their effect on uneven teams; neither is universally fair.
- Team membership changes never rewrite historical lineups or issue an award merely because a derived total was recalculated.
- Preserve the difference between intentional individual-and-team awards and conservation of existing points during transfers.

Required invariants and tests:

- Retrying a command produces no duplicate effect.
- Replaying the same ordered history produces the same totals.
- Transfers preserve the exact total being transferred, or explicitly record a configured reset/adjustment instead.
- Corrections are traceable and do not apply twice.
- Completed results preserve their applicable lineup and rules version.
- Use worked examples plus property-based/model-based sequences of awards, retries, departures, reshuffles, and corrections. Test an independently specified model rather than duplicating implementation logic; generated tests are not a formal proof.

Sources: [PostgreSQL exact numeric types](https://www.postgresql.org/docs/current/datatype-numeric.html), [fast-check properties](https://fast-check.dev/docs/core-blocks/properties/), [model-based testing](https://fast-check.dev/docs/advanced/model-based-testing/).

### 20.3 Room security and identity recovery

| Role | Permitted access |
| --- | --- |
| Player | Own instructions, permitted submissions, and allowed results |
| Captain | Current team's submission rights where configured |
| Shared display | Public presentation content only |
| Host | Authorized controls and explicitly permitted private information |

- A public room code permits joining; it is not a host or recovery credential.
- Use unpredictable player/host credentials with expiry, revocation, and protected transport/storage. Define credential delivery and browser storage during detailed security design.
- Recovery codes expire and can be revoked. Moving to another device explicitly replaces or invalidates the prior controller; a nickname alone never proves identity.
- Recheck room membership, current role/captain status, stage eligibility, and permissions for each action. Do not trust caller-provided player/team identifiers.
- Use HTTPS/WSS and explicit trusted-origin checks for real-time connection admission. CORS alone does not protect WebSocket connections; origin checks complement authentication and cannot authenticate arbitrary non-browser clients.
- Handle expired/revoked credentials on existing connections, not only new handshakes.
- Keep correct answers, unrevealed submissions, credentials, and private instructions out of unauthorized payloads and browser bundles.
- Render player text safely and restrict rich content. House rules and templates must not inject arbitrary HTML or JavaScript.
- Validate message shapes and lengths; bound payloads and connection/command rates. Apply per-player/session controls alongside broader abuse controls so shared venue Wi-Fi is not treated as one participant.
- Protect room discovery/joining against enumeration and flooding, and allow the host to lock admissions or remove/revoke an abusive participant without disabling legitimate recovery.
- Avoid credentials in query strings or logs; keep audit identifiers separate from secrets.
- Test role escalation, cross-room access, unauthorized origins, forged/replayed commands, recovery takeover, expiry/revocation, malicious text, and message floods.

Sources: [OWASP WebSocket security](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html), [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [Socket.IO CORS limitations](https://socket.io/docs/v4/handling-cors/).

### 20.4 Custom mechanic validation

Represent custom mechanics as declarative, versioned stage definitions using supported actions. Do not execute user-authored JavaScript or arbitrary validators on the server or player devices.

Use four validation layers:

| Layer | Checks |
| --- | --- |
| Structure | Supported stage/action types, required fields, bounds, and valid references |
| Semantics | Required entries, eligible voters, captains, teams, inputs, and compatible scoring settings |
| Flow | Reachability, explicit transition priority, usable exits, and host fallback |
| Runtime | Current eligibility, transition budgets, repeated-award prevention, and resource bounds |

Examples to detect:

- A vote with only one participating team when self-voting is forbidden.
- A captain-submission stage with no eligible captain.
- A branch pointing to a missing stage.
- A stage waiting indefinitely after required participants disconnect.
- An automatic loop repeatedly issuing points.

Requirements:

- Validate at authoring/start time and recheck dynamic conditions when the stage runs; attendance and eligible entries can change.
- Require an explicit no-response/no-eligible-entry fallback or host resolution path.
- Define deterministic priority when multiple transitions match.
- Initially prefer simple sequences; later loops need explicit exit conditions and execution limits. Static validation cannot prove every dynamic game terminates.
- Bound automatic transitions, rule nesting, and repeated actions. Provide host pause/skip controls without silently fabricating results.
- Keep random assignment outcomes and relevant definition versions in history so recovery/replay is deterministic.
- Simulate zero submissions, no eligible votes, ties, disconnections, and expired timers in rehearsal.
- Evaluate XState as an implementation option, not a replacement for persistence, validation, or runtime limits. Select a stable version if adopted.
- Keep validation schemas controlled by the application. Users configure approved blocks rather than upload arbitrary validation code or expensive schemas.

Sources: [state machines](https://stately.ai/docs/editor-states-and-transitions), [automatic-transition loop risks](https://stately.ai/docs/eventless-transitions), [Ajv validation security](https://ajv.js.org/security.html).

## 21. Language decision and safety practices

Selected language: TypeScript for the frontend and backend. Browser code compiles to JavaScript; server code runs on Node.js. Use React for browser interfaces and the recommended Fastify/Socket.IO backend stack. This remains an entirely browser-operated product for hosts and players.

### Comparison considered

| Option | Strength | Project tradeoff |
| --- | --- | --- |
| TypeScript + Node.js | Shared public contracts, static checks, and documented React/Socket.IO integration | Requires runtime validation, exact scoring rules, and event-loop discipline |
| Plain JavaScript | Direct browser ecosystem integration | Fewer compile-time safeguards for configurable stages and commands |
| C#/.NET | Typed backend, SignalR, and browser options through Blazor | Different stack and cross-language contracts unless adopting Blazor throughout |
| Go backend + TypeScript frontend | Concurrency support and race-detection tooling | Two languages and explicit cross-language contract management |
| Rust backend + TypeScript frontend | Ownership-based memory safety | Additional implementation complexity without a measured requirement here |

This is a project-fit judgment, not a performance benchmark, universal ecosystem ranking, or claim that any language prevents crashes. Backend language choice does not require players to install anything. Memory safety, type safety, authorization, persistence, and game-rule correctness are different concerns.

### Required implementation discipline

- Enable strict TypeScript checks, including checked indexed access, and fail the build on type errors.
- Model commands/stages with explicit variants and exhaustive handling.
- Treat external messages and stored/imported game definitions as untrusted until runtime validation succeeds.
- Infer public types from validated schemas where practical; share contracts without shipping server internals or secrets.
- Restrict unchecked casts and any; do not treat successful compilation as proof of runtime safety.
- Keep database constraints, transactions, generated scoring tests, fault injection, and monitoring regardless of language.
- Keep CPU-heavy operations off the live event loop, bound inputs/work, and measure performance before adding services or changing languages.

Sources: [React TypeScript support](https://react.dev/learn/typescript), [Socket.IO types and validation caveat](https://socket.io/docs/v4/typescript/), [TypeScript erased types](https://www.typescriptlang.org/docs/handbook/2/basic-types.html#erased-types), [TypeScript soundness limitations](https://www.typescriptlang.org/docs/handbook/type-compatibility), [checked indexed access](https://www.typescriptlang.org/tsconfig/noUncheckedIndexedAccess.html), [Node event-loop guidance](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop).

Alternative platform references: [ASP.NET Core SignalR](https://learn.microsoft.com/en-us/aspnet/core/signalr/introduction?view=aspnetcore-10.0), [Blazor hosting](https://learn.microsoft.com/en-us/aspnet/core/blazor/hosting-models?view=aspnetcore-10.0), [Go race detector](https://go.dev/doc/articles/race_detector), [Rust ownership](https://doc.rust-lang.org/stable/book/ch04-00-understanding-ownership.html).


## 22. Project organization conventions

Keep the existing frontend/backend/shared-package separation. Add folders by responsibility as features arrive, rather than putting the app into a single file or creating empty speculative modules.

| Folder | Contents |
| --- | --- |
| apps/web/src | Browser entry points and feature folders; UI, hooks, and presentation helpers |
| apps/server/src | Server bootstrap and feature modules for auth, rooms, games, scoring, and diagnostics |
| apps/server/test | Backend unit/integration tests grouped by feature as they grow |
| packages/contracts/src | Public runtime schemas and contract types only |
| packages/contracts/test | Contract compatibility tests where needed |
| docs/architecture | Design decisions and diagrams when introduced |
| docs/deployment | Pi/NUC setup, recovery, and operations documentation |
| infra | Deployment/proxy/container files when introduced |
| .github/workflows | CI configuration |

APP_PLAN.md remains at the root as requested. README.md is the quick start; detailed documents belong under docs/. Credentials, live database files, uploaded media, logs, and build output do not belong in tracked source. Small current bootstrap files can remain simple; split by feature/responsibility as implementation grows. Contributor conventions are recorded in AGENTS.md.


## 23. Dual-view builder, party choices, and theme scope

Added following the user's visual workflow reference on 11 November 2026. This is a planned feature expansion; no scene/flow editor has been implemented. The reference establishes drag-to-connect behavior and a high-level overview, not a requirement to copy another product's branding.

The user-approved [dual-editor visual example](docs/design/editor-reference.html) is the interaction/layout reference for both editors. Its [editable source](docs/design/editor-reference.source.html) is preserved alongside it. The subsequently supplied [neutral workspace reference](docs/design/assets/builder-neutral-reference.png) and [restrained-accent workspace reference](docs/design/assets/builder-accent-reference.png) establish the builder visual direction. See [reference notes](docs/design/README.md) for scope and limitations.

### 23.1 Two levels of authoring

- Game flow nodes represent scenes, round groups, cutscenes, route choices, and results. Connections determine which node runs next.
- A scene editor determines what a selected scene displays and how its configured stages behave on the shared screen and phones.
- A quiz round may contain several questions/stages; the high-level canvas can collapse it into one round group and expand it when needed.
- First-release scene tools cover text, answers, instructions, media, and supported layouts. Arbitrary freeform object animation or a complete PowerPoint implementation is not implied.
- Both views support the same undoable edits, shared validation, stable identifiers, and versioned saves. Prevent deletion or rewiring from silently invalidating another route. Warn about a scene's references before removal.

### 23.2 Party route-choice node

Example flow:

Opening → party chooses → Music Mayhem OR Physical Challenge → common finale.

The first implementation routes the whole party together. Separate simultaneous team/player routes are a possible later extension requiring an explicit synchronization design; they are not assumed here.

Each choice node configures:

| Setting | Choices |
| --- | --- |
| Prompt and routes | Public prompt, labeled options, optional images, and connected destination for each option |
| Decision method | One vote per eligible player, one captain vote per eligible team, or host decision |
| Eligibility | Snapshot of participating voters/teams, defined late-join behavior, no duplicate votes |
| Timing | Timed vote or host closure; configurable vote editing before close |
| Visibility | Private votes; reveal labels/counts according to settings without exposing future-route spoilers |
| Tie policy | Explicit host tie-break, runoff, configured default, or recorded random resolution |
| No-vote/disconnect policy | Host resolution or configured fallback; never wait forever |
| Resolution | Exactly one destination is chosen; optional announcement/cutscene before entering it |
| Scoring | No points by default; any award is separately configured and auditable |

Team-vote weighting and individual-vote weighting are different modes and must be clearly labeled. A runoff must be bounded with a final fallback. Random resolutions record their outcome so reconnecting or replaying cannot change the chosen route.

The backend validates and saves votes, the resolution, selected edge/destination, and audit/outbox records transactionally as appropriate. Repeated closure commands cannot select or score twice. Recovery resumes the saved route, not a fresh vote. A later host override is an explicit recorded action with downstream-score/state consequences checked before application.

Branches may rejoin a common scene. A rejoin means continuing after the one selected branch, not waiting for all alternative branches to run. Unselected paths receive no completion awards. In rehearsal, let the author exercise every route and the tie/no-response paths.

If branches offer different point opportunities, show that in the builder and require an intentional scoring configuration. Do not silently normalize or award points from skipped branches.

### 23.3 Graph validation and live editing

- Require an explicit start, valid destinations, connected labeled choice outputs, and a reachable end or explicit host-managed exit.
- Identify unreachable scenes and accidental dead ends; deliberate disabled/draft content can remain in authoring but cannot become an executable route unnoticed.
- Reuse section 20's structural, semantic, flow, and runtime validation. Avoid unrestricted cycles initially; later loops require limits and exits.
- A valid graph does not guarantee all players will respond. Provide timeout/no-response policies and host recovery controls.
- Apply the existing live-edit rules to the graph: edit future content, preserve the active node and completed history, and validate connection changes before accepting them.
- Protect already-resolved choices and active destinations from casual deletion/rewiring. Changes requiring rollback are separate audited host operations, not ordinary canvas edits.

### 23.4 Independent workspace and game themes

Keep workspace appearance separate from game themes. The user has selected a clean, professional, neutral builder direction: white/light or black/dark surfaces, rounded corners, subtle borders/shadows, readable sans-serif typography, consistent spacing, and restrained functional accents. The builder does not need multiple decorative skins or a creator-facing workspace theme designer. Game presentation remains themeable.

| Theme scope | Saved with | Controls |
| --- | --- | --- |
| Builder workspace | Creator preferences | Light/dark/system mode; one consistent professional design system with rounded panels and controls. Density can be a usability preference, not a decorative theme. |
| Game presentation | Game definition/version | Supported fonts, colors, backgrounds, answer-button styling, scoreboards, and transitions |
| Round presentation | Explicit round override | Selected supported game-theme properties, with a reset-to-game-default option |

Changing workspace appearance must not change the game preview's selected theme or player-facing output. Changing a game theme must not restyle the editor chrome. Keep theme tokens separate from mechanics; colors/fonts never change scoring or routing.

Scene view previews shared-screen and phone results. Flow view can show small scene thumbnails without turning node layout into game presentation. Keep readable defaults, accessible non-color labels, reduced-motion support, and clear inheritance indications. Use accents to indicate selection, focus, route identity, and status without depending on color alone. The supplied dashboard images are visual-style references, not requests to add dashboard metrics, search, profiles, or unrelated widgets to the editor.

The saved interactive example preserves the previously approved editor layout and behavior; its provisional purple accent is not a binding builder palette. Workspace styling follows the newer user-supplied references. No editor implementation or app restyling is authorized by saving these references.


### 23.5 Connection handles, snapping, and node alignment

Required planned behavior for the actual flow editor:

- Drag from an explicit output handle to a compatible input handle. Render a live connection preview from the originating handle.
- Highlight valid target handles while dragging. Within a configurable proximity radius, snap the preview endpoint to the nearest compatible handle; commit the connection only after a valid drop.
- Base the effective snap/hit area on screen pixels so handles stay usable across zoom levels. Hit areas can be larger than the visible dot, including for touch/pen input.
- Make the candidate target unmistakable before release. Resolve nearby/equidistant candidates deterministically rather than unexpectedly changing the target on drop.
- Validate handle direction, scene/port compatibility, branch labels, duplicate-edge rules, and prohibited cycles. Show invalid targets with a reason; never silently connect to a nearby invalid point.
- Keep party-choice outputs separately identifiable by stable IDs and route labels such as Music wins and Physical wins. Snapping must not swap the configured branch meanings.
- Releasing on empty space or pressing Escape cancels without saving a dangling edge or changing the graph. Any future add-node-on-drop interaction must be explicit.
- When reconnecting an existing edge, preserve the old connection until a valid replacement is confirmed. Cancellation leaves the original intact; successful edits are undoable.
- Moving a node keeps its connections anchored to the handles and redraws paths. Optional grid/alignment guides help place nodes; node positioning alone never changes gameplay progression.
- Provide keyboard-accessible source/destination selection and clear focus states alongside pointer dragging. Do not make drag precision the only way to connect nodes.
- Revalidate the resulting graph on the backend when saving. Client snapping is an editing aid, not the authority for valid game flow.

The saved example illustrates handles, routes, branch selection, and the two editor views. It does not implement dragging, snapping, node creation, or a production graph editor. Those remain future implementation work.

Acceptance examples: near-target valid drops connect to the intended port; invalid/empty drops do nothing; Escape and cancelled reconnections preserve state; zoom and node movement preserve handle alignment; keyboard connections produce the same validated graph; choice routes remain correctly labeled after edits.


## 24. Database boundaries and private admin health

### 24.1 Database separation

Use one PostgreSQL database per environment, with authoring and runtime tables in the same database. There is no separate database for each editor or game. Development (`party_dev`), disposable integration testing (`party_test`), and production use separate targets/credentials.

Both editors update GameDraft; publishing creates immutable GameVersion. GameSession points to that fixed version. Runtime identities, team lineups, stage runs, submissions, decisions, command outcomes, exact score entries, audit, and pending outbox notifications are separate relational records. Definition/payload details use versioned JSONB documents where appropriate. See [database schema](docs/architecture/database.md) and [Prisma models](apps/server/database/schema.prisma).

### 24.2 Private admin dashboard (planned, not built)

Accepted visual reference: [interactive admin health example](docs/design/admin-health-reference.html), with its [editable source](docs/design/admin-health-reference.source.html) and [reference notes](docs/design/README.md#private-admin-health-reference). All values are illustrative and controls change the example only; this is not an implemented admin dashboard.

Add an Admin → Health area for authorized operators, separate from the shared display and everyday host controls. A host sees only permitted session diagnostics; global infrastructure access requires operator permission. Existing `ops:read` protects the foundation metrics endpoint; future mutations need separate control permissions and server checks.

Show scoped measurements with units, percentile/window/sample count where relevant:

- Player end-to-end saved-confirmation latency, individual connection RTT and reconnect status.
- Server command duration, event-loop delay, CPU, memory, queue pressure and uptime.
- Database probe/commit/query timings, bounded pool use/waiters, persistence availability and migration status.
- Session/stage, accepted submission counts, outbox backlog/oldest age, recovery state and recent grouped errors.
- Storage/backup health and home-server capacity when those signals are implemented.

Separate current values from p95/p99 over a window and successful operations from failures/timeouts. Server processing includes nested database work; do not add overlapping timings as if they were independent. Identify stale/unknown data rather than displaying reassuring zeros.

Proposed controls: reconnect the shared display, retry/skip failed media, temporarily enable more diagnostic logging with automatic expiry, inspect sanitized command/error records, and pause/resume or extend a session through normal game commands. Every gameplay-affecting operation is authorized, validated, idempotent, and audited. Do not expose arbitrary SQL, raw tokens/private answers, unrestricted score writes, production resets, or unsafe durability/performance switches.

Treat diagnostics and control availability separately. Monitoring failures do not block gameplay; unavailable persistence blocks confirmed state changes. Store durable session actions in the existing command/audit tables. Keep high-frequency metrics outside the gameplay tables. System-wide operational audit/retention and monitoring backend are future design work.

## 25. Player customization and creative minigames

Added after the user's creative-game requests and online research on 11 November 2026. These are planned features, not implemented capabilities. Detailed findings, storage boundaries, technical-debt risks, sources and unresolved policies are in [creative minigames research](docs/architecture/creative-minigames.md).

### 25.1 Names and identity images

Players can choose a custom display name and a bundled icon, uploaded picture, or phone-drawn avatar. Image setup is skippable. Stable session IDs/credentials remain independent of names/images; reconnect restores confirmed customization. Guests do not need permanent accounts. Hosts can rename/reset/hide inappropriate content. Names are safely rendered and bounded, duplicate names are distinguishable, and avatar failures fall back to a built-in icon. Persistent cross-game profiles are optional later work.

### 25.2 Mechanics and inspiration

Use original content inspired by the variety of [Nintendo's Mario Party formats](https://media.nintendo.com/supermarioparty/minigames/), private mobile creation/reveal in [Drawful](https://www.jackboxgames.com/games/drawful), and drawing/guessing turns in [skribbl.io](https://skribbl.io/). This is inspiration for mechanics, not a plan to copy their assets, branding or implementations, or to inherit their capacity claims.

| Family | Proposed original examples | Delivery order |
| --- | --- | --- |
| Text creativity | Jokes, captions, best excuse, finish the sentence | With basic submissions/reveal/voting |
| Independent drawing | Draw a prompt; reveal and vote | First creative slice; reuse avatar pad |
| Simultaneous secret choice | Bank points or risk a hazard; choose a concealed route | First creative slice; server resolves once |
| Memory and observation | Recreate a sequence; identify a changed detail | Follow supported choice/input primitives |
| Drawing and guessing | Rotating artist with private prompt and eligible guesses | After bounded live updates/checkpoint recovery |
| Team relay/creation chain | Draw → pass → caption; contribute one piece each | After persisted turn assignments and lineage |
| Team animation | Each teammate creates a frame; play the combined sequence | Turn-based first, after frame/contribution storage |
| Precision/coordinated live games | Stop near a target, rhythm, continuous movement, simultaneous shared drawing | Dedicated prototypes/research first; not promised in initial release |

Participation can be free-for-all, teams, cooperative, rotating representatives, or one-versus-many where supported. It is separate from awarding individual/team/both scores. Supported participation ranges and balancing are explicit per mechanic. Twenty people need simultaneous creation, short showcases/batches or representative rotation; a four-player game cannot simply be stretched to twenty without pacing/fairness design. Room/player capacity is distinct from a mechanic's required roles.

### 25.3 Shared stage architecture and per-round configuration

Mechanics declare compatible inputs, roles, views and stages: instruct → create/choose → lock → reveal → judge/vote → resolve → score, with optional/repeated stages explicit. Configure participants, captain/individual/turn ownership, contribution count, private prompts, tools/limits, timers, editing window, visibility, vote eligibility, ties, judging, individual/team awards, late joins, departures and fallback behavior. Unsupported combinations are rejected rather than exposed as arbitrary toggles.

Version definitions and creation payloads. Reuse durable commands, lineup snapshots, score ledger and privacy-filtered views; do not couple engine execution to slide order or node coordinates. Begin with a few application-owned typed mechanic handlers. Arbitrary scripts, general runtime plugins and simultaneous collaborative editing are deferred.

### 25.4 Browser, persistence and performance requirements

- One reusable touch/mouse/pen drawing pad with bounded pixels/strokes/undo, resize-safe logical coordinates, clear tools and controlled local rendering.
- Local asynchronous draft checkpoints are distinct from server-saved/final acceptance. Browser eviction, storage errors, hard kills and sleep can lose unconfirmed work; reconcile by stage/identity/revision on return.
- Store file metadata/references in the existing PostgreSQL database; raster files in managed SSD-backed storage. Add asset/profile/creation/turn models through reviewed new Prisma migrations when needed; no schema changes are made by this plan.
- Validate images on the server, constrain decode/processing/storage work, preserve privacy through authorized delivery, and use staged finalization/reconciliation because files and database writes are not one atomic transaction.
- Initially freeze drawing controls at the drawing deadline and use an explicit bounded final-submit stage before reveal. Server eligibility/receipt remains authoritative; a client freeze cannot prove an untrusted device stopped drawing on time.
- Live preview and durable final results have different delivery requirements. Bound/coalesce previews, checkpoint accepted operations where required, and prevent unbounded queues/fan-out; never confirm content that only exists in memory.
- Guessing and voting protect prompts/authorship, define eligibility/normalization/ties, and cannot award points twice after retry/reconnect.
- Team animation starts with ordered frames and one owner per turn. Playback is browser-side; server video encoding, CRDTs, WebRTC and precision timing compensation are not baseline dependencies.
- Add content moderation, coordinated asset/database backups, missing-file recovery, retention/tombstone design and storage-pressure diagnostics before shipping uploads.

Research confirms background browser timers/animation can be paused/throttled, local storage can be evicted, and Socket.IO needs application-level recovery. The [research document](docs/architecture/creative-minigames.md#research-findings-and-project-decisions) links the primary browser, Socket.IO and OWASP sources and translates them into decisions. Actual-device measurements remain required; twenty drawing clients on a Pi have not been benchmarked.

### 25.5 Optional customizable show-host character

Allow a puppet, minion, mascot or other character to present the entire show. Customize its name, original/uploaded artwork, poses/expressions, dialogue, voice clips, sounds, position/size and supported animation/cues, with game defaults and per-round overrides. Keep this independent of builder workspace styling, human-host permissions and game scoring.

Start with static poses, text/captions and optional prerecorded voice clips. Add bounded authored pose/sprite animation after basic media reliability. Rigging, TTS, generated dialogue, lip sync and conversational AI are future options requiring separate research/provider choices; none is required for the baseline. Customization uses supported validated content rather than arbitrary executable code.

Trigger cues at introductions, stage changes, reveals, results and finale. Deduplicate/limit queued cues and restore current presentation after reconnect without replaying the entire show. One selected display owns shared voice/audio. Provide text fallback, captions/transcript, mute/skip, reduced motion, and layouts that do not cover controls. Decorative character failures never block scoring or progression; intentional character cutscenes use ordinary stage timeout/skip rules.

## 26. Next-phase build order and quality gates

The existing scaffold/database is the starting point, not a completed multiplayer engine. Build a small playable game from prepared versioned definitions before either editor. This sequence refines phases 1–3B; no implementation is started by this document update.

| Order | Slice | Evidence required before moving on |
| --- | --- | --- |
| 1 | Finalize versioned input/stage contracts, deadline rules, exact score invariants, role-filtered views and test scenarios; choose creator sign-in approach | Reviewable examples for quiz, judged challenge, text, drawing reference and choice without implementing all mechanics |
| 2 | Durable session/stage/submission/judging/score commands with idempotency, revision checks, transactional outbox and recovery | Unit/property and real-PostgreSQL tests; real server-kill/lost-ack test proves one accepted result and no duplicate score effects |
| 3 | Guest names/bundled icons, room admission, host/display/player authorization, late join/reclaim and Socket.IO state synchronization | Reconnect/permission tests and twenty-client protocol test; no reliance on socket IDs as identity |
| 4 | Minimal responsive lobby/phone controls, host controls and shared display for a quiz → judged challenge → results | First Playwright multi-role E2E tests, keyboard/touch/error-state checks and real-phone smoke test; no decorative editor work |
| 5 | Text/jokes/captions, reveal/vote, fixed teams, then team changes/carryover and route choices | Deterministic vote/score/lineup regressions; prepared reference and branching games run end to end |
| 6 | Bounded asset lifecycle/storage, reusable avatar drawing pad, hand-drawn/profile picture customization, draft checkpoints | Validated uploads, protected downloads, retry/failure/storage/restore integration tests and device drawing checks |
| 7 | Draw → save → reveal → vote and one simultaneous secret-choice minigame | Multi-role E2E, artwork/privacy/recovery regressions, realistic simultaneous upload/save load and accessible alternatives |
| 8 | Pre-editor verification on actual phones and Pi/NUC, representative load plus headroom, crash/reconnect/soak tests and manual accessibility review | Measured budgets, documented browser support/limitations, and no unresolved critical integrity/privacy/accessibility defects |
| 9 | Scene editor using the proven definition, then Flow editor using that same draft/validation/publishing service | Saved/published semantics agree across views; keyboard and non-drag alternatives, snapping and branch regressions pass |
| 10 | Presentation/media/live editing/rehearsal; optional show-host character; private admin UI once real metrics/actions exist | Media/character failure isolation, permissioned controls, editor regression/device/accessibility suites and pre-release recovery drills |
| 11 | Single-author live drawing/guessing → turn-based relays → frame animation → advanced stage tools | Each addition has explicit ownership, recovery, supported player formats and tests before the next complexity increase |
| 12 | Precision/rhythm games, simultaneous canvases and more advanced automation | Separate feasibility/fairness/conflict prototype and measured device/server budgets; not an assumed first-release commitment |

Steps are dependency order rather than deadlines. Backend APIs and minimal UI may advance together within a slice; durability and authorization must exist before real accepted submissions. Start browser E2E with the first interactive slice, not after the editors. Incremental diagnostics ship throughout; a full admin interface follows real signals.

The [testing, accessibility and device strategy](docs/architecture/testing-and-accessibility.md) specifies unit/property, API/database/migration, component, Playwright E2E, selected visual regressions, protocol/load/failure tests and manual accessibility checks. Proposed tools are not installed by this update. Regression cases accompany bug fixes at the cheapest realistic layer.

Controllers are mobile first; host controls work on laptop and phone/tablet; shared display is readable on a TV; editors are desktop first. Target WCAG 2.2 AA for ordinary application UI, with keyboard/screen-reader support, visible focus, adequate contrast/targets, zoom/reflow, reduced motion, timing accommodations and non-drag editing alternatives. Spatial/drawing mechanics need documented alternative roles/rounds and real-user evaluation; no conformance claim follows from an automated scan alone.

Every slice must include relevant automated checks and keyboard/touch/responsive review. Browser emulation complements real iOS Safari/Android Chrome checks; it does not replace them. Preserve CI test isolation and sanitized artifacts, never run crash/load tests against live party data, and treat confirmed-data loss, authorization leaks or essential inaccessible controls as release blockers.
