# Party Game Builder — App Plan

Date: 9 November 2026

Status: Planning only. This document records the agreed product scope and proposed technical setup. Implementation has not started. Build phases describe future work, not completed features.

## 1. Product overview

A browser-based platform for creating and hosting custom pub quizzes and party games, mixing:

- Private quiz answers on phones.
- Team and individual competition.
- Physical challenges judged by the host.
- Player submissions and voting.
- Custom house rules.
- Cutscenes, music, and sound effects.
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

A game is an ordered timeline of rounds and presentation items. For example:

Opening → rules → individual quiz → team formation → team challenge → cutscene → voting round → finale.

Supported timeline items:

- Quiz rounds.
- Room challenges.
- Submission and voting rounds.
- Rules and information screens.
- Team formation or reshuffling.
- Cutscenes.
- Breaks.
- Scoreboards and final results.

Items can be reordered, duplicated, disabled, and grouped.

Configuration follows this hierarchy:

1. Game defaults.
2. Round overrides.
3. Permitted live host adjustments.

Every supported gameplay setting should be configurable at the appropriate round or stage. The interface only shows relevant options.

## 4. Builder

### Layout

| Area | Function |
| --- | --- |
| Left: timeline | Add and arrange rounds and scenes. |
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

The first builder exposes these through templates. A later advanced editor allows users to arrange stages themselves.

Example custom sequence:

Create random teams → send private instructions → start timer → collect entries → vote → host bonus → results.

A later rule editor can use an event → condition → action structure. For example:

> When voting ends, if there is a tie, open a host tie-break stage.

Written house rules are available immediately. Automated rules must use supported conditions and actions. Custom mechanics initially mean new combinations of supported stages and actions. Arbitrary scripting is a possible future extension outside the initial scope.

## 6. Players and teams

Every participant has a persistent player identity within the session, regardless of team changes.

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
| Joining | Scan a QR code or enter a room code, then choose a nickname |
| Lobby | Nickname, connection status, and team information |
| Team selection | Available teams and membership counts |
| Quiz | Private answer controls and submission confirmation |
| Captain submission | Captain gets controls; teammates get instructions and status |
| Room challenge | Instructions, team details, and timer |
| Voting | Eligible entries and private voting controls |
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

## 12. Proposed technical setup

These are implementation recommendations, distinct from the agreed product requirements. Exact dependency versions will be selected when implementation begins.

| Component | Proposed choice | Reason |
| --- | --- | --- |
| Frontend | React + TypeScript + Vite | Shared UI foundation for builder, display, host, and phones |
| Backend | Node.js + TypeScript + Fastify | HTTP API and authoritative game engine |
| Real-time communication | Socket.IO | Room communication, acknowledgements, and reconnection support |
| Database | PostgreSQL | Games, versions, players, submissions, team history, and score records |
| Data access | Prisma | Typed database access and migrations |
| Validation | Zod | Validate game definitions and incoming commands |
| Media storage | S3-compatible object storage | Keep large media outside the app server |
| Testing | Vitest + Playwright | Engine tests and browser/device-flow tests |
| Repository | One repository with web, server, and shared packages | Keep schemas and command types consistent |

### Hosting

Recommended starting deployment:

- One always-running Node service serving the web app, API, and real-time connections.
- Managed PostgreSQL.
- Object storage for uploaded media.
- HTTPS and a single public domain.

Render is one suitable deployment option because its web services accept WebSocket connections. The provider and paid plan will be selected before deployment. See [Render WebSocket documentation](https://render.com/docs/websocket).

The first version is internet-hosted. Phones can use Wi-Fi or mobile data. Fully offline or laptop-hosted LAN operation is a separate possible extension.

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
| 1. Detailed design | Screen layouts, configuration schema, stage model, scoring examples, recovery behavior | One complete example game is specified without ambiguous score transitions |
| 2. Multiplayer foundation | Rooms, QR/code joining, player identity, host/display roles, late joining, reconnection, persistence | Twenty players can join and recover correctly |
| 3. Playable game engine | Quiz, room challenge, voting, teams, timers, scoring, carryover, final results | Reference game runs end to end using a prepared definition |
| 4. Builder and templates | Timeline editor, settings, defaults/overrides, previews, saving, duplication, reusable templates | A host can author the reference game without editing code |
| 5. Media and live controls | Cutscenes, uploads, YouTube embeds, audio layers, separate displays, phone hosting, upcoming-round editing | Full presentation and control flow works during play |
| 6. Rehearsal and release validation | Simulation, validation, load checks, device testing, restart recovery, production deployment | A complete game night works with at least 20 phones |
| 7. Custom mechanics | Stage editor, reusable stage sequences, additional supported inputs | Users can create mechanics beyond the starting templates |
| 8. Advanced automation | Conditional rules, branching, richer cutscene sequences | More elaborate games run with fewer manual interventions |

Phases 1–6 constitute the first complete release. Custom mechanics are supported by the architecture from the start, with their editing tools delivered afterward.

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
- Mobile Safari and Chrome, plus laptop browsers.
- Cutscene playback, blocked autoplay, and media failure.
- A complete rehearsal and a real game-night trial.

## 17. Details to settle during design

The product direction is established. Remaining implementation details include:

- Exact screen layouts and visual design.
- Rounding and score attribution at repeated team transitions.
- Late-join eligibility boundaries for each stage type.
- Host recovery and device-reclaim interaction.
- Behavior of timers across pauses and server restarts.
- Initial media formats, upload limits, and external-link support.
- Creator authentication provider, hosting provider, and operating budget.
- Exact tie-break options and first-release automated rule capabilities.

These details are addressed in Phase 1 or the relevant technical phase. They do not authorize implementation before the user requests it.
