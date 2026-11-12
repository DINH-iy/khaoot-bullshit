# Game contracts and durable commands

Implemented domain service, 11 November 2026, now integrated with the [verified room/network checkpoint](../testing/network-checkpoint.md). Editors and admin dashboard remain unbuilt; full creator browser sign-in/provider integration remains deferred. This document describes the internal command boundary beneath that gateway.

## Entry points and trust boundary

- [Public contracts](../../packages/contracts/src/game.ts): strict versioned command, input, receipt, safe-view and invalidation schemas. No correct-answer data or privileged scoring implementation.
- [Server definition](../../apps/server/src/game/definition.ts): validates private scoring, stage keys, routes, bounds, duplicate keys, unreachable nodes and cycles.
- [Prepared game](../../apps/server/src/game/prepared-game.ts): server-only quiz → judged challenge → text fixture, not an automatically seeded/published game.
- [Service](../../apps/server/src/game/service.ts), [handlers](../../apps/server/src/game/commands.ts), [authorization context](../../apps/server/src/game/model.ts) and [safe views](../../apps/server/src/game/views.ts).

`createGameService(prisma).execute(trustedActor, command)` is internal. The room gateway derives its actor from verified credentials, never a request's claimed role/player/creator ID. It enforces expiry/revocation on actions and retries; the service also rechecks supplied credential proofs within its transaction. Host ownership, active player membership and read-only display scope are checked server-side. There is no temporary authentication bypass.

Session creation uses an existing immutable GameVersion owned by the host. Normal creation requires verified creator identity; the explicit local rehearsal CLI provisions its own prepared version/session/grant. Guest joining uses room codes plus private credentials; UUIDs/nicknames are not admission credentials. Publishing remains later work. Nothing is automatically seeded at startup.

## Definition formats 1 and 2

The first executable definition has `formatVersion`, `title`, `startNodeKey`, nodes with stable keys and ordered internal stages, and explicitly keyed directed edges. Execution follows connections, not node-array order or canvas layout. Format 1 supports finite linear routes and multiple stages per node. Format 2 adds route choices (below); a format 1 definition parses and hashes exactly as before, which a test pins for every built-in game. Loops remain forbidden in both formats.

| Stage | Contract and current execution |
| --- | --- |
| Choice collection | Public options; private optional correct-choice key and exact award. One final individual answer; correctness-only scoring. |
| Choice layout | Optional per-round `layout`: `list` (default) or `tiles` (large pressable tiles). Presentation only; optional so published definitions keep their hash. |
| Order collection | The player arranges 2–8 items. Private `correct-order` scoring is all-or-nothing. Each viewer receives a stable per-viewer shuffle, never the authored order. Arranged with move buttons, not dragging. |
| Media collection | Player uploads one picture, GIF or video; each round lists which of the three it accepts. See "Uploads" below. |
| Vote | Players pick one answer from an earlier unscored text or upload round, never their own. Each vote gives its author a configured award. |
| Info scene | Title and text shown on every screen (cutscene, rules, announcement), optional countdown. No answers or points; Next ends it directly, no close needed. A countdown only closes it; the host still continues. |
| Scoreboard scene | Heading plus player standings, the game's team standings, or both. Same behaviour as an info scene. |
| Text collection | Bounded prompt/text input. No voting/automatic judging yet. |
| Drawing collection | Contract example only. Execution fails closed until asset validation exists. |
| Host challenge | Prompt and maximum individual award; close first, then one judgment per eligible player. |
| Duration | Bounded nullable duration (1 second to 1 hour). Null means the host closes the stage; a value starts a server deadline. |

Initial definition limits: 100 nodes, 20 stages per node, 200 stages total and bounded labels/options. These are resource budgets, not player caps. Definitions must match the supported format and canonical content hash before commands execute.

## Timed stages and host control

A stage with a duration gets a `deadlineAt` on the server clock when it opens. Policy, implemented in `apps/server/src/game/timing.ts`:

- Devices show the nominal deadline. Each view carries `serverTime`, so the countdown follows the server clock, not the phone's.
- The server decides by its own receipt time, taken before waiting for the room lock. Client timestamps are never trusted. An answer received up to 1,000 ms after the deadline is accepted (delivery grace); later ones fail with `TOO_LATE`.
- The stage closes 250 ms after acceptance ends, so an on-time answer still queued behind the lock commits first. Scores stay hidden until the stage is closed.
- Closing is automatic: a bounded 250 ms sweep reads due deadlines from PostgreSQL and issues `stage.timeout`, which is valid only once the stage is due. There is no per-room in-memory timer, so it survives restarts and works with nobody connected.
- Pausing freezes the clock (`pausedRemainingMs`); resuming restarts it with the same remainder. Startup recovery pauses running rooms, so time lost in an outage is shown to the host, who can restore it before resuming.

The host stays in control. `stage.timer` adds time, replaces the remaining time or removes the limit, while running or paused, and can start a clock on an untimed stage. `stage.close` still ends a stage immediately. `stage.reopen` reopens the latest closed stage, with or without a new limit, unless it has been judged; existing answers and scores are kept and cannot be duplicated. A host change that commits before the sweep wins.

Limits: explicit host closing is immediate and follows lock order, so an answer queued behind it fails. The policy does not claim equal fairness across connections, and there is no speed scoring. A future minigame stage that runs without host intervention would need its own rule; none exists yet.

## Commands, revisions and transactions

Every command carries `formatVersion: 1`, `commandId`, `sessionId` and type. Host commands also require `expectedRevision`. Submissions carry their original `stageRunId` and typed value without a global revision, so unrelated players do not invalidate each other's answers.

| Command | Effect |
| --- | --- |
| session.create | Create one lobby from an owned supported version; expected revision 0 |
| session.start | Open first stage; snapshot current eligible players |
| submission.submit | Save one eligible final choice/text answer and supported private correctness award |
| stage.close | Close latest active stage; its recorded points become visible |
| stage.judge | Record one zero/nonzero judgment for an eligible player on the latest closed challenge |
| stage.advance | Open successor of latest closed stage, or finish session |
| session.pause / session.resume | Explicit host-controlled status change preserving saved work |

Same-key retries return the original receipt even after progression. Reusing a key with different normalized data returns `COMMAND_KEY_REUSED`. A fresh key cannot bypass one-answer/one-judgment rules. Host revision mismatches require refreshing/reviewing the state rather than blindly repeating an action with a new revision. Unknown fields, formats and unsupported capabilities fail explicitly.

Every writer takes the same PostgreSQL transaction-scoped advisory lock keyed by session UUID, including creation before its row exists. Hash collisions can serialize unrelated rooms but cannot mix their state. Future command writers must use this protocol; database owners/direct SQL are outside the application authorization boundary. Lock, statement, pool-acquisition and transaction durations are bounded. Infrastructure failures become sanitized `GAME_UNAVAILABLE`; the caller may reconcile/retry the original key after an uncertain outcome.

The interactive transaction writes state/submission, immutable receipt, judgment/score, revision, audit and pending outbox together. A receipt is returned only after commit. No network publication, media processing, remote dependency or telemetry observer runs inside it. [PostgreSQL locks](https://www.postgresql.org/docs/18/explicit-locking.html#ADVISORY-LOCKS), [Prisma 7 transactions](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions)

## Scores and safe views

Public amounts are exact decimal integer strings; server/database use BigInt/BIGINT. 1,000 milli-points = 1 point. Initial configured awards are nonnegative strings up to 12 digits; judgments cannot exceed their stage maximum. Teams, transfers, penalties and score corrections are not implemented here.

Quiz points persist with the answer, but open-stage correctness/amounts are absent from receipts, safe views and outbox payloads. Zero awards do not create ledger entries. StageJudgment separately records zero decisions, with unique stage+player, same-session stage/player/command foreign keys, a nonnegative check and immutable-history trigger. A future correction must append a separate corrective operation.

`readSessionView` reads a consistent database snapshot and explicitly projects only current prompt/input/status, revealed-stage point totals plus host corrections, and the requesting player's own accepted answer. It does not serialize definitions, future prompts, scoring keys or other players' entries; hosts receive no answer content through this safe projection. Totals remain exact strings; results/ranking presentation comes later.

### Reveal, results and corrections

Closing a stage locks answers but shows nothing. `stage.reveal` (host) sets `revealedAt` on the closed stage; `stage.advance` sets it automatically if the host moves on without revealing. Only then does the view carry `reveal`: the correct choice or order, a per-option tally for choice rounds, and that stage's awards per player. Standings count only revealed stages plus host corrections. Individual answers of other players are still never sent. A revealed stage cannot be reopened, because the answer is known.

Every view also carries progress (`submittedCount`/`eligibleCount`) and, for a challenge, the maximum award and which players are already judged.

`score.adjust` (host) adds a signed, non-zero `ADJUSTMENT` ledger entry with a reason. Earlier awards and judgments are never edited or deleted; the database rejects such updates. Corrections apply immediately, also after the game has finished and for players who have left, but not in the lobby. There is no per-entry "undo" link yet: the correction is a free amount, not tied to the entry it corrects.

### Teams

A definition may set game-wide `teams` (how the game's teams are made) and a default `play`; a stage's own `play` overrides it for that round.

- `play` is `solo`, or `teams` with a `lineup`: `game` (the game's teams), `round` (teams for this round only, afterwards the game's teams apply again) or `reform` (new game teams from here on, with a carryover rule). Every team play also sets `answers` (`everyone` or `captain`) and `points` (`team`, `members` or `both`).
- A formation has a split and a method. Splits: a number of balanced teams, or exact sizes where at most one team takes "the rest" (`[1, 'rest']`, `[2, 2]`, `[4, 4]`, `[1, 3]`…). Players beyond fixed sizes sit the round out when no team takes the rest. Methods: `random`, `host`, `players`.
- **The host always confirms.** A stage that needs a new lineup opens in a forming phase: no answers, no clock. Random teams arrive pre-filled; players may pick (`teams.choose`) only when the method is `players`, and only up to a fixed size. The host can move anyone, let them sit out, shuffle, and pick captains, then `teams.confirm` creates an immutable lineup and starts the round's timer. Captains not chosen are drawn at random.
- **Game teams persist.** Later `game` rounds reuse the lineup without forming. Players who joined since are placed in the smallest team, which records a new lineup version with the `keep` rule.
- **Points:** `route` sends each award to the team, to each member, or both. A captain's answer counts for the whole team (one answer per team, stored with the team as author); in `everyone` rounds each player's own correct answer counts for them and, if configured, their team. Team challenges are judged per team (`stage.judgeTeam`), recorded as one judgment per member so nobody is judged twice. Votes cannot go to your own team's entry and score the way the voted-on round scores.
- **Team totals** are shown for the game's current teams. Lineups chain back while their rule is `keep`; the first other rule sets the start: `fresh` counts team points from that lineup on, `members` adds the current members' individual scores (derived, not new awards). A team is identified by its name in the room, so a round team called "Red" adds to the game team "Red" if it receives team points.

Not built yet: the plan's "redistribute old team totals" and "manual starting totals" carryover rules, changing teams or captains after a round has started, team winners and tie-breaks.

Reveals are never stamped before their close, even if the server clock steps back, because the database requires `revealedAt >= closedAt`. The timer sweep skips a room whose automatic close fails (retrying it after 30 seconds) instead of stopping for every room.

### Drafts and publishing

`apps/server/src/authoring/drafts.ts`, used by owner-only routes under `/api/host/games`. A game's draft (`game_drafts`) may be incomplete or invalid while it is edited; it is saved as is (up to 256 KB) and returned with every problem located on its scene (`nodeKey`), stage (`stageIndex`) and field path, so the editor can mark the right card. Saving takes the revision the editor last saw and fails with `REVISION_CONFLICT` if anyone saved since, so a second tab never silently overwrites work. Publishing requires the current revision and a fully valid, playable draft; it freezes it as the next immutable `game_versions` row with its real format number. Publishing an unchanged draft again returns the existing version. Rooms always play the latest published version, never the draft. Built-in games the owner plays are kept apart: authored games are those with a draft.

Problems are written in plain language for authors (`authoring/messages.ts`); each also carries the validator's exact rule as `code`. Removing a game archives it: it disappears from the list, while its published versions and rooms keep working. The draft may carry an `editor` object with card positions; it is stripped before validation and never published. Not built yet: creator sign-in (these routes accept only the local owner) and restoring removed games.

### Editors

`editor-shell.tsx` holds both views over one draft (`use-draft.ts`: loading, automatic saving that never overwrites a newer save, undo/redo with quick typing merged into one step, publishing). The view is kept in the address (`&view=scene`).

**Flow editor** (`flow-view.tsx`), additions in the second version: icons per scene type and a two-column add-scene palette; pick up an arrow by its handle (placed along each arrow, so arrows into the same scene are separately grabbable) or by a connected input, and drop it on another scene, or on empty canvas to remove it; multi-select with Shift-click, Shift-drag box and Ctrl/Cmd+A, moving the selection together (mouse or arrow keys) and deleting it with a confirm step; undo/redo buttons and Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z or Ctrl+Y.

**Scene editor** (`scene-view.tsx`): scenes in play order on the left, each branch indented under its route and rejoins listed after their branches, with unconnected scenes separately; a rough preview of the shared screen and a phone in the middle (not the final game look); every field of the selected part on the right, the parts of a scene (add, reorder, remove), solo or team settings per part (the game default, everyone for themselves, the game's teams, teams for this round, or new teams with a score rule), where the game goes next, and game-wide settings (teams and default play). "Add after this" inserts a scene into the flow after the current one.

**Rehearse** (`POST /api/host/games/:gameId/rehearse`): plays the current saved draft in a practice room without publishing, from the start or from a chosen scene. Scenes the rehearsal cannot reach are left out, so unconnected work in progress does not block it; anything else invalid does (for example starting at a vote without the round it votes on). The practice version lives in a separate game titled "Rehearsal · …" without a draft, so it never appears in Your games or as a published version; identical rehearsals reuse it.

**Copying:** Duplicate (button or Ctrl/Cmd+D) and copy/paste (Ctrl/Cmd+C, V) take the selected scenes with the connections between them, under new names; a vote inside the copy points at the copied round. The copy is kept in the browser's local storage, so it can be pasted into another game. **Minimap:** an overview in the canvas corner; click or drag it to move the view.

**Minigame scenes** are placeholders (`kind: 'minigame'`): they can be placed, connected and saved, are listed as a problem on their scene, and block publishing until minigames are built.

### Flow editor (first version)

`apps/web/src/editor/` (loaded only when opened, so phones never download it). `model.ts` holds the pure rules, tested offline: card geometry and ports, snapping (24-unit grid; level with the output port feeding a card so lines run straight; aligned with nearby card edges; dropped cards slide off overlaps), connection rules (one connection per output, no circles, no self-connections, two route options never to the same scene), scene defaults, automatic layout. `flow-editor.tsx` draws the canvas: drag cards; drag from an output port and release near a card to connect (the line snaps to the nearest valid input within reach and turns red with an explanation when not allowed); release on empty canvas to pick a new connected scene; a + on unconnected outputs; tap an output then a scene to connect without dragging; select a line to remove it; Tidy up, zoom and Fit; arrows show direction. The side panel edits the selected scene's main fields and offers "Next scene" lists as a non-drag alternative. Drafts save automatically after each change; a second tab gets a clear "changed elsewhere" message instead of overwriting. Inspiration beyond the owner's reference: Blender and n8n (drop a connection to add a node, + on outputs), Twine (arrows), canvas collision avoidance and accessible diagram guidance. Not built yet: undo, multi-select, a minimap, editing scenes with several parts (the Scene editor), and team settings in the panel.

### Route choices (format 2)

A route choice is a node whose only stage is a `route` stage: a prompt, 2–6 labelled options, an optional timer, and `decide`. Each option is connected by exactly one edge naming it (`edge.option`), and options lead to different scenes. Routes may rejoin. The flow editor's labelled output ports map directly onto these edges; labels live on the options, so rewiring cannot swap their meaning. Route choices never award points and have no `play` setting.

- **Who decides:** `players` (one vote per player present when voting opens), `captains` (one vote per game team, cast by its captain; a team whose captain is absent gets no vote), or `host`. Late joiners do not vote on an open choice; a voter who leaves still counts.
- **Closing** (host close or timer) tallies once. Most votes wins. `noVotes` and `tie` say what happens otherwise: the host decides, the default route is taken, or a recorded random pick. A default only settles a tie when it is among the tied routes. When the host must decide, the choice stays closed and undecided, and "Next stage" waits (`DECISION_PENDING`).
- **The host is in control:** `route.decide` picks any option at any time before a decision is recorded, including while voting (which closes the vote). A pending vote can be reopened with its votes kept. A recorded decision is final (`ALREADY_DECIDED`).
- **Storage:** votes are ordinary submissions. The outcome is one `route_decisions` row (selected edge, destination, reason VOTE/HOST/TIE_BREAK/FALLBACK, and a snapshot with counts, voter count and any random candidates and draw), written in the same transaction as the deciding command. The unique index and immutability trigger stop a second or changed decision. After a restart the room is paused as usual; advancing follows the saved row, so no vote is repeated and no random pick is redrawn.
- **What screens see:** the host sees live counts, why a closed vote is waiting (tie with leaders, nobody voted, host method) and the decision as soon as it exists. Players and the shared screen see counts only as the choice allows (`live`, at the announcement, or `never`) and the decision only after the host announces it (`stage.reveal`). Where routes lead, later scenes and the tie rules are never sent.
- **Validation** (`graphIssues` in `graph.ts`, shared with the future builder): no cycles, self-connections or duplicate connections; every node reachable; only route choices branch; options and edges match one to one; defaults and host-method timers are consistent; at most 20 route choices and 300 connections. Rules that need something "earlier" hold on every path: a vote's source ran on every path to the vote, every path from a vote source reaches its vote (otherwise its answers could stay anonymous for ever), game teams are defined before use, and captain votes come after teams were formed. A property test checks these against a brute-force walk over every path of random games.
- `StageRun.number` now counts runs in a session (1, 2, 3…); the run's node and stage keys locate its definition.

### Uploads

`POST /api/rooms/:sessionId/assets` (player credential, same origin) streams the file to disk under `MEDIA_DIR` (default: ignored `.local/media`), never holding it in memory. It is accepted only while the player's current round is an open media round they have not answered.

- **Type by content:** the declared type and file name are ignored. PNG, JPEG, WebP, GIF, MP4/MOV and WebM are recognised from their first bytes; SVG, HTML, HEIC/AVIF and everything else is refused (`UNSUPPORTED_MEDIA`).
- **Limits:** 8 MB pictures, 12 MB GIFs, 40 MB videos, 1 GB per room, four uploads at once per server, twelve per player per minute. Nothing is transcoded on the Pi.
- **Phones shrink still photos** to at most 1,600 px before upload, which also drops embedded location data. GIFs and videos are sent unchanged, so their metadata is kept.
- **One pending upload per player and round:** choosing another file replaces the previous one. Submitting `{ kind: 'media', assetId }` binds it to the answer, and only the uploader's own upload for that round is accepted.
- **Download** (`GET …/assets/:assetId`, room credential) is allowed for the uploader and the host at any time, for the room during a vote on that round (without names), and for everyone after the reveal. Files are served with their verified type, `nosniff`, a `sandbox` content policy and byte-range support for video seeking.

Not built: deleting media when a room is finished (no retention or cleanup yet), virus scanning, server-side resizing of GIFs and videos.

### Votes

A vote stage names its source round. When it opens, it records the exact earlier stage run whose answers form the ballot. Every viewer gets the ballot in a stable per-viewer order without author IDs; a player's own entry is only marked `own` and cannot be chosen. Moving on from a source round does not reveal it, and the host's reveal button is replaced by a note, because names would spoil the vote. Revealing the vote reveals the source round too: vote counts per entry with authors, and the points. One vote per player; votes are private until the reveal.

Audit events contain references, not raw answers/jokes. Host/display/session-player outbox events are safe session/revision invalidations; a submitting player's own receipt has a distinct player-specific audience. The bounded publisher routes these to authorized role/player rooms. Never broadcast player-specific receipts to the room. Clients reload safe views and reconcile receipts; publication alone is not proof that all recipients received an event.

## Recovery and observability

The service has no authoritative in-memory game state. A fresh process can retry an uncertain command ID and read persisted state. The networking slice adds single-backend startup pausing, credential expiry/revocation and client state/receipt resynchronization. Multi-instance ownership and full game-night/Pi validation remain future work. Real-phone acceptance is still a required gate.

An optional observer receives only command type, committed/replayed/error outcome and monotonic elapsed milliseconds. It cannot break a committed action and receives no IDs, credentials or answer content. Networking wires it into sanitized server logs; persistent aggregation is future work.

## Verification

- Unit/property tests: exact award strings, strict command/view shapes, graph validity, timed-duration bounds, unsupported drawing execution, canonical hashes.
- Real PostgreSQL tests: retries/key reuse, 20 concurrent submissions, host conflicts, authorization, locked eligibility, privacy, zero judgments, text entry, completion and failing telemetry.
- A test-only outbox constraint forces late transaction failure and verifies submission/score/receipt/revision rollback before retry.
- Real child processes run the actual service and receive SIGKILL before commit, gated after score INSERT, and after commit. A fresh child retries and verifies one saved answer/score/audit plus pending notifications. This is process/service/database recovery testing, not browser/HTTP/socket E2E.
- Migration verification covers fresh installation, repeat deployment and populated upgrade through the new migration.

Run `npm run check`; start the isolated database with `npm run db:test:up`, then `npm run db:test`. Fault/crash tests are isolated to test targets and test-only database gates. There are no production crash hooks, unrestricted seed endpoints or login bypasses.
