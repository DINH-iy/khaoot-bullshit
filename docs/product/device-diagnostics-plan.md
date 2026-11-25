# Device diagnostics: knowing why something did not work

Status: plan only. Nothing here is built yet. Owner request, 25 November 2026.

Start a new chat with: *"Read docs/product/device-diagnostics-plan.md and build phase 1."*

## The problem

When something fails, a player or the leader sees only "That did not work. Try again." Nobody can tell afterwards:

- what they pressed;
- what the browser sent;
- what the server answered;
- why the server refused it.

**Example that started this (24 November 2026).** Starting a Red or black roulette round in the arcade always showed that message. The cause was only found by reproducing it in a database test with server logging turned on. The game key `red-or-black-roulette` (21 characters) did not fit the 20-character `game` columns of `arcade_rounds` and `arcade_results`. That raised an internal error, and the arcade turned it into the generic message. It is fixed now (migration `20261125090000_arcade_game_names`). With the logging below, it would have shown up in the first feedback report.

## What already exists (verify before building)

| Piece | Where | What it gives today |
| --- | --- | --- |
| Feedback reports | `apps/web/src/feedback/*`, `apps/server/src/feedback/routes.ts`, `packages/contracts/src/feedback.ts` | Title, details, page, screen, viewport, user agent, up to 5 pointed-at elements, one attachment. Shown in Admin. No record of what happened before the report. |
| Request ids | `apps/server/src/app.ts` (`genReqId`, `x-request-id` header) | Every HTTP reply carries an id that is also in the server log line. The browser ignores it. |
| HTTP errors | `apps/web/src/room/api.ts` (`roomApi`) | Throws `Error(code)`. The screens turn the code into text, and unknown codes become a generic sentence (`arcadeProblem` in `apps/web/src/arcade/arcade-text.ts`, `explain` in `hosting/my-games.tsx`, and others). |
| Room commands | `apps/web/src/room/use-room.ts` (`emit`, `send`) | Socket.IO commands with acknowledgements; a refused command comes back with a code (`INVALID_SUBMISSION`, `TOO_LATE`…). |
| Server errors | `apps/server/src/arcade/routes.ts`, `side-games/routes.ts`, `hosting/owner-access.ts` | Unexpected errors are logged (`arcade_failed`…) with the stack, but only as `GAME_UNAVAILABLE` to the browser. |
| Command telemetry | `apps/server/src/game/service.ts` (`CommandObservation`) | Type, outcome code and duration of every game command, for metrics. No player or device link. |

## Goal

For any device that played, the owner can see what happened on it in the minutes before a problem, in order:

1. **Taps:** which button or control, on which screen.
2. **What the browser sent:** the request, command or route.
3. **What came back:** the code, the request id and how long it took.
4. **Browser errors:** script errors and lost or restored connections.

All of this must work without slowing the game, without storing secrets, and within the Raspberry Pi's limits.

## Design

### 1. A small event log on each device (browser)

- A ring buffer in memory: the last **200 events** or **10 minutes**, whichever is smaller. Optionally mirrored to `sessionStorage` (wrapped in try/catch) so a reload keeps it. Never `localStorage`: it must not outlive the tab.
- Each event: `{ at, kind, screen, what, code?, requestId?, ms? }`, as short strings.
- **Taps.** One capture-phase `click` listener on `document` records the role and accessible name of the button, link or control (reuse `describe-element.ts` from feedback). It never records typed text or input values.
- **Requests.** Wrap `roomApi` (method, path with ids shortened to their first 8 characters, status, `error.code`, `x-request-id`, duration). Wrap `emit`/`send` in `use-room.ts` the same way: command type, acknowledgement code, duration.
- **Errors.** `window.onerror` and `unhandledrejection` (message and the first stack line, no URLs with hashes), socket connect/disconnect, and the page becoming hidden or visible.
- **Never recorded:** answers before they are revealed, typed text, passwords, tokens, owner keys, cookies, URL hashes, photos or drawings.

### 2. Show the real code to the person

Every generic "That did not work" line gets the code and a short reference in small text, for example *"That did not work. Try again. (GAME_UNAVAILABLE · a1b2c3d4)"*. The reference is the first 8 characters of the request id. The person can then mention it, and the owner finds the server log line with it.

Start with `arcadeProblem`. Then do every `?? 'didNotWork'` fallback. To find them: `grep -rn "did not work\|didNotWork" apps/web/src`.

### 3. Send the log with feedback (phase 1)

- When a feedback report is sent, attach the device's event log. Add a `diagnostics` field to `NewFeedbackSchema`: an array of at most 200 events, each field length-limited, about 32 KB in all.
- Admin → Feedback shows it as a timeline under the report. Request ids link to the matching server log lines when those are available.
- A switch in the feedback panel: *Include what happened on this device (recommended)*, on by default, with a one-line explanation.

### 4. Ask for a device's log afterwards (phase 2)

- In a room or arcade lobby, the host or owner can ask every connected phone to send its log (a Socket.IO event). Phones send it to a new endpoint, `POST /api/diagnostics` (rate-limited and size-capped like feedback), tied to the session and the player's seat.
- Admin → *Device logs*: per room or lobby and per player, kept for **7 days**, then deleted by the existing cleanup sweep.
- Automatic sending on errors: when a device gets an unexpected code (`GAME_UNAVAILABLE`, `INTERNAL_ERROR`), it sends its log once per minute at most. This catches problems nobody reports.

### 5. Server side

- Log unexpected errors with the request id and the actor (player, member, owner) but never their token. `arcade_failed` and the others already log the stack; add the request id and route.
- Keep `CommandObservation` as it is for metrics. Optionally add the request or command id so a device event can be matched to it.
- Store diagnostics in PostgreSQL, using a code-first Prisma model and a reviewed migration (`device_logs`: id, sessionId or lobbyId, player/member id, deviceLabel, createdAt, events JSONB). Add an index on (sessionId, createdAt) and a retention sweep. Do not store them as log files on the Pi's SD card.

## Privacy and limits

- **Who sees it:** only the owner, in Admin. Players are told in the feedback panel what is included.
- **Size:** bounded everywhere (events, field lengths, requests per minute), so a misbehaving phone cannot fill the database.
- **Load:** recording happens in memory only. Nothing is sent during play unless a report is made, the host asks, or a rare unexpected error happens.

## Build order and checks

1. **Phase 1:** event log in the browser, codes and references in error lines, log attached to feedback, timeline in Admin. Tests:
   - unit tests for the ring buffer (bounds, age);
   - a unit test that nothing typed is recorded (fill an input, tap, check the events);
   - a contract test for the size limits;
   - a database test that feedback stores and returns diagnostics;
   - a browser test: force a failing arcade action and check that the message shows the code and that the report carries the events.
2. **Phase 2:** the host's *ask phones for their logs*, automatic sending on unexpected errors, Admin → Device logs, 7-day retention. Tests:
   - permissions (only the owner reads; a phone only writes its own log);
   - rate limit;
   - retention sweep.
3. **Docs:** README (what is built), APP_PLAN owner backlog row, and `docs/architecture/` if a new table is added.

## Open questions for the owner

- Should phones send their log automatically on unexpected errors (phase 2), or only when someone reports a problem?
- Keep device logs for 7 days, or a different period?
- Should hosts (not only the owner) be able to see the logs of their own room?
