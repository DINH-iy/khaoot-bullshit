# Tester feedback (15 November 2026): status and what is left

The feedback reports from the test evening of 14–15 November were sorted into groups A–J. This page tracks what is done, what still needs a real phone, and what is left, so work can continue from here. The product plan stays in [APP_PLAN.md](../../APP_PLAN.md); what is built is in the [README](../../README.md).

## Done

| Group | What | Where |
| --- | --- | --- |
| A, bugs | Reaction duel shows no GO while paused (server timer, view and screens). The host's "Start round with these teams" is the big button in the host panel. Chess squares stay even. "Point at something" works on phones (picks on release, swallows the click). "Yes, remove" stays readable on hover. Character counters show near every limit. | commit `566660b` |
| B, joining | Room code shown as `ABC-123`, capitals only, capped at a code's length. Clear messages under an empty name or code. Personal key, seat takeover and host/edit links folded under "More options". | `566660b` |
| C, room screens | Round strip under the top bar (what to do, timer, team round, blind round). Saving shows a spinner instead of moving the page; messages float and can be closed. Host panel folds "Shared screen & invite" and "Room settings" and scrolls on its own. Phone results fit one screen (own result first, everyone's points folded). One Menu button on phones, and a banner when someone challenges you. Bigger break icon (it was shrunk by a CSS rule), big "BLIND ROUND" banner, readable rock paper scissors, signpost arrows for routes, copy code/link buttons. | `566660b` |
| Side games | Side games on by default and playable just for fun; chips are an extra (off by default): host switches *Side games* and *Chips*, per game in Game settings, `sideGames`/`chips` in imports. A migration fixes challenge stakes (accepting a staked challenge always failed before). | `566660b` |
| D, teams | Teams are made in a **Pick teams** scene; rounds after it are played in those teams or solo; a single round can have its own teams (1 against the rest). Team columns in the room: tap a player then a team, or drag; captains; add (up to 12) and remove teams. Older team games are converted when opened in the editor. "Team party" rebuilt. | `566660b` |
| E, host and players | **Back to lobby** (host panel): the same game again in a fresh room, everyone follows (new room code; the old room's history stays). Looks are used straight away unless the room setting *Players confirm their look* is on; a drawing in progress is used on Done or when the game starts. Awards: swipe or ‹ ›, auto-play is a toggle (on only on the shared screen). When time runs out the phone sends what the player had: choice, text, order, upload, route vote or drawing (a half-drawn line is kept); drawing rounds accept answers 3 seconds after the deadline instead of 1. | next commit |

Also fixed on the way: `MEDIA_DIR` accepts Windows paths (local runs and tests), and two browser tests that still expected old screen text (authoring, wheel/awards).

## Check on a real phone

None of this was tried on an actual phone yet; the browser tests emulate one.

- Chess board on iOS (Firefox and Safari): even squares.
- "Point at something" in the feedback panel: tapping picks the element, nothing gets pressed.
- Join screen: typing a code with the dash, the error messages, "More options".
- Round strip and the floating messages: nothing jumps while saving.
- Phone results fit one screen in a busy round (many players, pictures).
- Menu button, challenge banner (Open / Later / "After this round").
- Team columns on a small phone, host drag and drop on a laptop.
- Back to lobby with several phones and the shared screen.
- Time running out in a drawing round on a slow connection.

## Left to do

### F. Editor: add-scene menu and choosing settings

- F1, F2: one entry per kind in the add menu (results/scoreboard, quiz) with the layout as a setting instead of separate tiles.
- F3: tabs in the add-scene menu when it gets long (do F1/F2 first; Pick teams added one more entry).
- F4: replace dropdowns with popups (example: "How it is split" in places). You asked what Reddit/UX discussions say first.
- F5: duel: choose the head-to-head game in a popup with all games (part of F4).
- F6: the inspector's action buttons (Start here, Duplicate, Save as prefab, Delete) need a layout that takes more buttons.
- F7: wheel of fortune styling and a preview / test-spin window.
- F8: as many routes as wanted in a party choice (default 2); the format allows 2–6 now, the editor needs "add route" and the limit may go up.
- F9: customizable end-of-game awards: authors pick from 9 fixed stats now; could become entries with their own title and rule.

### G. Editor: canvas, layout, mobile

- G1: zoom the Flow canvas with the mouse wheel.
- G2: a long game zooms far out; wrap scenes into rows.
- G3: the Look & feel page is very long.
- G4, G5: the editor on phones (the rehearse menu does not fit).

### H. Host menu and admin

- H1: built-in games editable by the owner (copies already are; the built-ins live in `apps/server/src/game/templates.ts`, see the data-driven idea of moving them to JSON files).
- H2: "Your open rooms" buttons aligned right, not indented.
- H3: People page: 24-hour clock, better buttons, more of a dashboard.

### I. Testing and feedback tool

- I1: play every game on a PC with the phone screens next to it, for testing.
- I2: pressing "Feedback" again reopens the form (not only "send another").

### J. Side games

- J1: pack opening with a real animation (like trading-card packs).
- J2: "chips cannot be disabled and the minigames take too much space": chips can be switched off now; what "the minigames take too much space" means (the add-scene menu?) is still open.

### Open questions

- "You're far away" (host screen on an iPhone): that text is not in this app; what was on screen?
- Roulette: not built; a new side game if wanted.

## Known limits and test notes

- Browser test *Look & feel* times out (45 seconds) on this PC, also before these changes. The Android *hosting* test can miss its 20-second question on a slow PC; *routes* on Android was flaky once.
- A drawing sent when time runs out needs two requests within 3 seconds; a very slow connection can still miss it.
- Back to lobby gives the room a new code (the old room's scores are history and are never rewritten). Guests' chips belong to one room, so they start over; people keep theirs.

## Running it on this PC (Windows)

- Docker Desktop must be running. `npm run db:env` made the ignored `.env` (new local credentials; an older local database may need them).
- After pulling: `npm run db:migrate:deploy` (the challenge stakes migration is new).
- Run tests from an uppercase `C:\Projects\khaoot-bullshit` path: from `c:\…` Vitest loads twice and every database suite fails with "failed to find the current suite".
- `npm run check`, `npm run db:test:up` then `npm run db:test`, and `npm run test:e2e` (after a build) as in the README.
