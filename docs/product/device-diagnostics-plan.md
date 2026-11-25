# Device logs: knowing what went wrong, and how a game ran

Status: **first part built (25 November 2026).** Owner request and decisions of 25 November 2026. What is built is in [README](../../README.md#6-device-logs-what-went-wrong-and-how-a-game-ran); what is left is at the end of this page.

## The problem

When something fails, a player or the leader sees only "That did not work. Try again." Nobody could tell afterwards what they pressed, what the browser sent, what the server answered, or why the server refused it.

**The example that started this (24 November 2026).** Starting a Red or black roulette round in the arcade always showed that message. The cause was only found by reproducing it in a database test with server logging turned on. The game key `red-or-black-roulette` (21 characters) did not fit the 20-character `game` columns of `arcade_rounds` and `arcade_results`. That raised an internal error, and the arcade turned it into the generic message. It is fixed (migration `20261125090000_arcade_game_names`). With device logs, the error and its cause would have shown up in Admin the first time it happened.

## Owner decisions (25 November 2026)

- **Players keep the generic message.** They do not see codes or references. The details go to the owner only.
- **Logs are sent automatically** as soon as something bad happens. Nobody has to ask for them or report anything. If nothing goes wrong, nothing is sent.
- **At the end of a game** every device that played sends its whole log once, so the owner can see how the game ran: what worked, what did not, and how fast it was.
- The purpose is debugging and optimising: knowing about every error so it can be fixed, and seeing how responsive games are on real devices.
- Kept **7 days** (a proposal, not changed yet). Only the owner sees them. Whether hosts may see the logs of their own rooms is still open.

## How it works (built)

### On each device (browser)

`apps/web/src/diagnostics/`: `device-log.ts` (the log itself), `capture.ts` (what is recorded), `recorder.ts` (when it is sent).

- A log in memory: the last **300 events**, none older than **30 minutes**. It is kept over a reload of the tab (`sessionStorage`, never `localStorage`).
- Each event: `{ at, kind, screen, what, code?, requestId?, ms?, n? }`, short strings with fixed limits.
- **Taps** on buttons, links and other controls: their name and kind, such as *Join room (button)*. Repeated taps on one control (a tap race) become one event with a count. Text fields are named by their label only.
- **Requests** to the server (one wrapper around `fetch`): method, path with ids cut to 8 characters and long token-like parts cut, the answer's code, the `x-request-id`, and how long it took.
- **Room commands** over Socket.IO (`use-room.ts`): the command type, its answer code and time. Syncs are recorded only when they fail or are slow. Heartbeats count towards the round-trip figures.
- **Connection and page:** connected, disconnected (with reason), reconnected, could not connect, online/offline, hidden/visible, page opened (with its load time).
- **Errors:** script errors and unhandled promise rejections from the app's own files.
- **Figures for the whole log:** typical and slowest server answer, heartbeat round trip, how often and how long the page was busy (Chrome and Edge), number of reconnects.
- **Never recorded:** typed text, input values, passwords, tokens, keys, cookies, URL queries or hashes, photos or drawings.

**When it is sent** (`POST /api/diagnostics`):

- **Problem:** an unexpected answer (`GAME_UNAVAILABLE`, `INTERNAL_ERROR`, any 5xx), a request with no answer in time or no connection, a command not confirmed, or a script error. It is sent 4 seconds later, so the log also shows what came right after. It is sent at most once a minute and 20 times an hour per tab. A log that could not be sent (no connection) is sent again once a request works again. Ordinary refusals (`TOO_LATE`, `RATE_LIMITED`…) are recorded but do not trigger a send.
- **Game over:** when a room's game finishes, once per room per tab, from a device that saw the game played. A device that opens a finished room does not send.

### On the server

- `apps/server/src/diagnostics/problems.ts`: every place that turned an unexpected error into `GAME_UNAVAILABLE` (arcade, side games, host/owner routes, media, room routes and socket events) or an `INTERNAL_ERROR` now **saves it**. It saves where it happened (route pattern or socket event), the error message, the first lines of the stack, the request id and the room. The original error is kept as the `cause` of the `GameError`, on the server only. The same error is saved at most once a minute, with at most 30 a minute in all. Saving never holds up the request.
- `apps/server/src/diagnostics/device-logs.ts`: the endpoint for devices, with an origin check, 60 a minute and 600 an hour per address, at most 160 KB, and 3000 logs an hour in all. A retried send is stored once. It also serves the owner's list and detail, and deletes logs older than 7 days or past 20 000 (hourly and at start).
- Table `device_logs` (migration `20261125120000_device_logs`): source (device or server), reason, summary, room, lobby, player, role, request id, details (JSONB), time. Indexed on time, room + time and request id. No foreign keys, so a log outlives a deleted room.

### For the owner: Admin → Device logs (`/?admin=logs`)

- Filters: *Problems* (device problems and server errors), *Finished games*, *Everything*. Search by room code, player, code or request id.
- Each log shows its time, who (*Player Sam*, *Host screen*, *Server*), and the room or arcade lobby. Open it for:
  - the figures;
  - the server errors that belong to it (same request id, or the same room or lobby in the 15 minutes before);
  - the timeline, with failures in red.
- **Copy as text** gives the whole log in a form to paste into a request to fix it.

## Checks

- Unit: the log's limits, age, tap counting and restoring (`apps/web/test/diagnostics`); request paths never keep queries, hashes or keys; contract size limits, including that the largest allowed log fits the request limit (`packages/contracts/test/diagnostics.test.ts`); which server errors count as problems (`apps/server/test/diagnostics/problems.test.ts`).
- Database (`apps/server/test/database/diagnostics`): a log is stored once; foreign origins and malformed logs are refused; a forced database failure is saved with its request id and shown with the device log of that request; logs are visible to the owner only; logs older than a week are deleted.
- Browser (`tests/e2e/device-logs.spec.ts`, desktop and phone): a failed join sends the log by itself; the player sees only the generic message; the typed name is not in the log; the owner finds the log in Admin with the failed request in red; accessibility check.
- Not checked: real phones on a real network, Safari/iOS, a long game's full log, load on the Raspberry Pi.

## Still to do

- Toasts in the room still show raw codes for some refusals (`use-room.ts` shows `error.message` when it has no text for a code). Give them generic texts too.
- Hosts seeing the logs of their own rooms (open question).
- Retention period: 7 days unless the owner wants another.
- A per-game summary over all devices (slowest phone, failure count), once there are enough game-over logs to see what is useful.
