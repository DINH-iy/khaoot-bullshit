# Tester feedback status

Last checked against the checkout on 19 November 2026. This tracks feedback from the 14–15 November test evening and the follow-ups through 19 November. [Product plan](../../APP_PLAN.md) · [README](../../README.md)

The separate build plan tracks the 41 feature requests from Admin → Feedback by report ID. The build plan records the work in Groups 1–4 and lists remaining checks and follow-ups by report. [Feature feedback build plan](feedback-build-plan.md)

## At a glance

- The primary changes in **23 of 25 lettered groups (A–W)** are implemented. Most of **X and Y** is implemented too. The remaining work and checks are listed below, with the original group details kept further down.
- The 18 November work, the four-language editor and host screens, the media library, and YouTube audio import and trimming are committed.
- The current checkout includes the direct **Game menu → Media library** entry, the compact editor header, the invite-panel layout fix, and the X7, X13 and Y7 work described below.
- Local verification passed 423 tests in `npm run check` and 21 Chromium tests across the editor and scene media suites. Earlier Chromium checks also covered language switching, drawing and minigames.

## Left to build

| Item | Remaining work |
| --- | --- |
| **Authoring diagnostics** | Server-generated problem descriptions in the editor are still English. Admin and People are intentionally English. |
| **Roulette** | Optional side-game idea, awaiting a decision. |

The product plan also tracks media follow-ups such as captions and alt text, more host playback control, playlist shuffle and fades, and event sounds. The People leaderboard still needs individual credit for answers submitted as a team. [Product plan](../../APP_PLAN.md#owner-queue-19-november-2026)

## Still needs testing

| Area | Evidence and outstanding checks |
| --- | --- |
| **Real-phone networking** | Android Chrome joining over 5G and restoring a saved answer after refresh were confirmed. Wi-Fi/mobile switching, sleep and foreground recovery, and reconnecting after a live backend restart are still open. [Network checkpoint](../testing/network-checkpoint.md#actual-phone-acceptance-sequence) |
| **Real-phone and TV UI** | Work through the [device checklist](#real-phone-and-tv-checklist), including media playback and the room controls. Browser emulation and the documented test-bench trial cover some flows. |
| **Pi capacity (Y1)** | The load runner is built and the Mac passed 10 rooms × 20 phones. A comparable Pi run has no recorded result. Also measure People stats with a long game history on the Pi. [Load-test results](../testing/load-test.md#results) |
| **Pack admin (X6)** | Existing unit tests cover pack odds, rarity fallback and god packs. Database tests cover pack purchases and chip spending. Dedicated owner-facing **Chips & packs** browser tests are still missing. [Odds tests](../../apps/server/test/side-games/rules.test.ts) · [Purchase tests](../../apps/server/test/database/people/people-side-games.integration.test.ts) |
| **Firefox (R7, R12)** | Recheck the scene panel scrollbar and the wheel test window on Firefox, where the original bugs were reported. |
| **Language review (X7)** | Automated checks cover translation completeness, placeholders, and an author-translated question and choice in a Dutch room. Review the German and Romanian wording with native speakers. [Translation tests](../../apps/web/test/i18n/texts.test.ts) |
| **Moving backgrounds (X13)** | Chromium covers an editor preview and reduced motion on the join screen. Check animation performance and legibility on a phone and the Pi display. |
| **YouTube playback (Y7)** | Chromium uses a stubbed YouTube frame to check clip times and which screen displays the player. Check real YouTube playback, autoplay restrictions, blocked embeds and fullscreen on actual devices. [Editor-to-room test](../../tests/e2e/scene-media.spec.ts) |

### Review and documentation

- The last recorded owner-review list was **H1–H3, I1, T, U, W, X1–X5 and X8–X12**. Current sign-off on that list is unconfirmed.
- Check **Admin → Feedback** before closing reports. The old notes identify A–G and P as having fixed reports that still showed **New** at the time.
- The README still needs its chips and packs instructions refreshed, particularly the starting balance and old refill behavior. It already describes the test bench, arcade appearance and media library.

## Implemented details

| Group | What | Where |
| --- | --- | --- |
| A, bugs | Reaction duel shows no GO while paused (server timer, view and screens). The host's "Start round with these teams" is the big button in the host panel. Chess squares stay even. "Point at something" works on phones (picks on release, swallows the click). "Yes, remove" stays readable on hover. Character counters show near every limit. | commit `566660b` |
| B, joining | Room code shown as `ABC-123`, capitals only, capped at a code's length. Clear messages under an empty name or code. Personal key, seat takeover and host/edit links folded under "More options". | `566660b` |
| C, room screens | Round strip under the top bar (what to do, timer, team round, blind round). Saving shows a spinner instead of moving the page; messages float and can be closed. Host panel folds "Shared screen & invite" and "Room settings" and scrolls on its own. Phone results fit one screen (own result first, everyone's points folded). One Menu button on phones, and a banner when someone challenges you. Bigger break icon (it was shrunk by a CSS rule), big "BLIND ROUND" banner, readable rock paper scissors, signpost arrows for routes, copy code/link buttons. | `566660b` |
| Side games | Side games on by default and playable just for fun; chips are an extra (off by default): host switches *Side games* and *Chips*, per game in Game settings, `sideGames`/`chips` in imports. A migration fixes challenge stakes (accepting a staked challenge always failed before). | `566660b` |
| D, teams | Teams are made in a **Pick teams** scene; rounds after it are played in those teams or solo; a single round can have its own teams (1 against the rest). Team columns in the room: tap a player then a team, or drag; captains; add (up to 12) and remove teams. Older team games are converted when opened in the editor. "Team party" rebuilt. | `566660b` |
| E, host and players | **Back to lobby** (host panel): the same game again in a fresh room, everyone follows (new room code; the old room's history stays). Looks are used straight away unless the room setting *Players confirm their look* is on; a drawing in progress is used on Done or when the game starts. Awards: swipe or ‹ ›, auto-play is a toggle (on only on the shared screen). When time runs out the phone sends what the player had: choice, text, order, upload, route vote or drawing (a half-drawn line is kept); drawing rounds accept answers 3 seconds after the deadline instead of 1. | commit `1c61c7a` |
| F1, F2, add menu | One entry per kind: quiz, scoreboard, picture/video, drawing and party choice are added straight away. Their kind is a setting in the scene panel: quiz *Kind of question* (Big tiles / A list / True or false) and scoreboard *Show* (Player scores / Team scores / Both) are buttons; upload types, drawing blind and who decides were already there. Writing prompts, minigames and duels keep their second menu (different games or starter text, not settings). | `2b08e6a`, `92a567a` |
| F3, add-menu tabs | The add menu has tabs: **Rounds** (quiz, writing, picture/video, drawing, put in order, challenge, vote), **Games** (minigame, duel, wheel), **Between rounds** (cutscene, scoreboard, party choice, Pick teams) and **Prefabs**. It opens on the tab used last; arrow keys move between tabs. The part menu in the Scene editor shows only the tabs that have parts. | `2b08e6a`, `92a567a` |

Also fixed on the way: `MEDIA_DIR` accepts Windows paths (local runs and tests), and two browser tests that still expected old screen text (authoring, wheel/awards).

## Real-phone and TV checklist

The following checks still need recorded results on the relevant devices.

- Chess board on iOS (Firefox and Safari): even squares.
- "Point at something" in the feedback panel: tapping picks the element, nothing gets pressed.
- Join screen: typing a code with the dash, the error messages, "More options".
- Round strip and the floating messages: nothing jumps while saving.
- Phone results fit one screen in a busy round (many players, pictures).
- Menu button, challenge banner (Open / Later / "After this round").
- Team columns on a small phone, host drag and drop on a laptop.
- Back to lobby with several phones and the shared screen.
- Time running out in a drawing round on a slow connection.
- Room chips, the (i) panel and the explanation screen.
- Scene pictures, video and audio on real phones and the shared display.

## Implementation notes by group

### F. Editor: add-scene menu and choosing settings

- F4: replace dropdowns with popups (example: "How it is split" in places). Researched (see the note below); being done in three steps:
  1. Short choices (2–3 options, a few up to 5) become buttons in the panel, like the quiz's *Kind of question*. **Done:** scoring, who plays, team split and how teams are made, who answers, points go to, team scores when teams are made again, who decides a party choice / on a tie / when nobody votes / vote counts, who duels, wins needed (rock paper scissors), a team's minigame result, points by place and how a total is split. Long labels are a short list with a hint under each.
  2. Choices that need a description (which minigame, the duel's game, adding an award) open a popup with cards. **Done:** *Change minigame…* and *Change how it is won…* in the scene panel (a changed game starts from its own settings and timer; a title or question the author wrote is kept), and *Add an award…* in Game settings, each card saying how the award is decided.
  3. Lists made from the game itself (next scene, start scene, answers to vote on, wheel per scene, "Change the look of") get a custom dropdown in the editor's style instead of the browser's own. **Done:** the editor settings dropdowns (next scene and route leads-to, the start scene, answers to vote on, the wheel per scene, Look & feel's scope, fonts shown in their own font, animations and movement) is the editor's own dropdown, built to the standard pattern: arrows, Home/End, Page Up/Down, Enter/Space, Escape, type to find, Tab chooses; tap and click work; the list floats over the panel and opens upwards near the bottom. The language selector uses the browser’s native control.
- F5: duel: choose the head-to-head game in a popup with all games. **Done** with F4 step 2; it can now also be changed after adding the scene.

#### Note: dropdowns, buttons or popups (research, 17 November 2026)

Sources: Nielsen Norman Group ([Dropdowns: when to use them](https://www.nngroup.com/articles/dropdown-list/)), Baymard Institute ([Drop-down usability](https://baymard.com/blog/drop-down-usability), [Custom drop-downs cause issues](https://baymard.com/blog/custom-dropdowns-cause-issues)) and design-system guidance (USWDS, Material, IBM Carbon). Reddit itself could not be read by the research tool.

- **Few options: show them.** Under about 5 options, radio buttons or a row of buttons beat a dropdown: a dropdown hides the choices, and in Baymard's tests 55% of people opened one just to see what was in it. Design systems put the line between 3 (Carbon) and 7 (USWDS).
- **5 to about 15 options: a dropdown is fine**, and it keeps a long panel compact (NN/g: options laid out inline make a form longer and harder to scan).
- **Many options, or options that need a description or picture: a picker** (type to search, or a popup with cards).
- **A popup is no general fix.** Open, pick, close costs as much as a dropdown; it pays off only when each choice needs room.
- **Custom dropdowns carry a risk.** Baymard found usability problems in 31% of custom-made dropdowns (keyboard, scrolling, closing by accident, phones), problems the browser's own dropdown solved long ago. A custom one must follow the standard listbox pattern: keyboard and type-to-find, the chosen item in view, works with touch and screen readers.
- **Watch the panel length.** Buttons with short labels take little room; long labels become a short list of choices, one per row.
- F6: the inspector's action buttons (Start here, Duplicate, Save as prefab, Delete) need a layout that takes more buttons. **Done:** they are in a ☰ *Scene actions* menu next to Close (keyboard: arrows, Escape); *Save as prefab…* opens its name form under the header and *Delete scene…* asks in a popup. The Scene editor still has its own buttons.
- F7: wheel of fortune styling and a preview / test-spin window. **Done:** a wheel uses the game's answer colours or its own (2–8, in the wheel's settings), each label black or white, whichever reads better; **Test spin…** opens the real wheel in the game's look and lands on a random entry (nothing saved).
- F8: as many routes as wanted in a party choice (default 2); the format allows 2–6 now, the editor needs "add route" and the limit may go up. **Done:** up to 8 routes (was 6), in the editor, the server and the text import; arrows for 7 and 8 routes.
- F9: customizable end-of-game awards: authors pick from 9 fixed stats now; could become entries with their own title and rule. **Done:** each award can have its own title (in Game settings → End-of-game awards); new rules *Best in one scene* (most points in a chosen scene, can be added more than once) and *Wooden spoon* (fewest points, 0 counts); older games keep their list and become the new list when edited.

### G. Editor: canvas, layout, mobile

- G1: zoom the Flow canvas with the mouse wheel. **Done:** the plain scroll wheel zooms around the pointer (smoothly; a trackpad pinch too), Shift + scroll moves the map, and you can zoom out to 25%.
- G2: a long game zooms far out; wrap scenes into rows. **Done:** *Tidy up* (and a game without a layout) wraps a long game into rows of columns, about screen-shaped (16:10); games up to 6 steps stay on one row. The arrow from the end of a row runs back neatly along the gap between the rows.
- G3: the Look & feel page is very long. **Done** with K4: its style page and texts are small groups that open and close.
- G4, G5: the editor on phones (the rehearse menu does not fit). **Done:** the top bar uses a compact layout as the window narrows. Undo, Redo and Editing / Viewing move into the Game menu, and the editor tabs get their own row on phones. The map toolbar scrolls sideways, the scene panel and menus open as bottom sheets, and the Scene editor stacks the list, preview and settings on one scrolling page. Checked in Chromium at desktop and phone-sized widths. Real-device acceptance is still open.

### H. Host menu and admin

- H1: built-in games editable by the owner. **Built (18 November 2026).** The owner chose editing in the app. In the host menu each built-in game has **Edit this game** (owner only): the first time it makes the owner's own version (a game with `builtInKey`, migration `20261118120000_builtin_overrides`) from the built-in and opens it in the editor; later it opens the same one. Once published, the menu shows it (title, rounds, facts; the description stays) with *Your version*, and rooms play it; until then rooms play the original (*Being edited · not published*). **Restore original…** asks first, then archives the owner's version (games played with it keep their history). It is not listed under Your games; *A copy of …* copies what the menu shows. In the editor its top bar says *Built-in games / Your version of “Timed quiz”* (with a tooltip on what publishing and restoring do). Tried in the browser: edit, publish, the menu and a room use it, restore. Screenshots in `screenshots/h1-builtins/`.
- H2: "Your open rooms" buttons aligned right, not indented. **Built (18 November 2026):** a card per room (name; badges for the code as `ABC-123`, *In the lobby / Playing / Paused / Reconnecting / Finished* and players; *Return to room* on the right) and the section moved up, right under the header. Owner's review: a red bin button next to it **closes the room** after *Close this room? … Keep it / Yes, close* (`POST /api/host/rooms/:id/close`, `apps/server/src/rooms/close.ts`): the room ends like a finished game (a running round is closed first, phones are told), its history stays; closing twice is harmless. After the name: the room code (`TRW-BCB`, without *Room*) and a small copy button (a tick once copied). The *Host a game* header is smaller (less padding, smaller title) and its *HOST* label readable on the purple.
- H3: People page: 24-hour clock, better buttons, more of a dashboard. **Built (18 November 2026)** (changed twice after the owner's look): the list shows only what matters: tiles at the top (people and editors, seen this week and never signed in, phones signed in), an *Add a person* card, a search box (capitals and accents ignored, *5 of 16*), and per person initials (filled for editors), name, an *Editor* switch, phones, *Last seen* on a 24-hour clock in words (*Today 10:04*, *Yesterday 21:30*, *Mon 16 Nov 21:30*, the full date on hover, a green dot when seen this week), *Show key* and *Open ›*. Chips and games moved off the list. A name opens **the person's own page** (`?admin=people&person=…`, back returns to the list): stats (last seen, games played, phones, chips, bet in total), *What … may do* (Can edit games), *Personal key* (show, new, sign out phones) and *Account* (rename, remove). Third review: **stats per person and a leaderboard**, worked out from the history the games already keep (`GET /api/host/people/stats`, `apps/server/src/people/stats.ts`; finished real games only, practice rooms never count): games, wins and top 3 (by own points, ties share; nobody wins a game in which no player scored), points, right and wrong answers in quiz and ordering rounds, minigames, arcade rounds and wins, challenges (duels) won/lost/drawn, per head-to-head game, and the **main rival** (the one challenged most, either way, with the score against them; a person opens their page), solo side games and the biggest chip win, favourite and last game. A person's page shows them with their rank (*#2 of 16*); the People page has a **Leaderboard** tab: titles with the top three each (Champion, Brainiac, Confidently wrong, Sharpshooter (10+ answers), Never misses a party, Arcade king, Duel master, High roller) and a table that sorts by any column. Not yet: answers given in team rounds (sent as the team) do not count as anyone's; the totals are worked out on every visit (fine for a home group; to measure on the Pi with a long history). On phones each person is one line (initials, name, last seen, ›) that opens their page. Screenshots in `screenshots/h-host-admin/` (before and after).

### I. Testing and feedback tool

- I1: play every game on a PC with the phone screens next to it, for testing. **Built (18 November 2026).** **Test bench** (host room → *Shared screen & invite* → *Open test bench ↗*, or `/?bench=<room>`), for whoever hosts the room, on any server including `party.dinnyvanhuizen.com`, without commands: the host screen on the left, virtual phones on the right (1–8, *−/+*, remembered), each its own player (*Player 1*, *Player 2*…) that joins by itself; a reload button per phone keeps its seat. **Real phones can join too** (a switch on the bench) shows the QR code and room code on the host screen again, so real players join next to the virtual ones; without it the bench's host screen has no join strip. How: a browser keeps one cookie per name, so each phone frame is named after a seat and sends it with every request, its uploads and its live connection; the server then reads that seat's own cookies (`party_…_seat3`) as the usual ones, ignores the rest (a seat is never the host, the owner or a signed-in person) and stores the cookies it sets under the seat's name (`apps/server/src/rooms/test-seats.ts`). This gives no access the browser did not have (anyone can be several players with several browsers) and other sites cannot send it (origin check), so it also works in production; still, a seat may only **join** a room whose host allows it: the room setting **Test bench phones may join** (Room settings → Joining), switched on by opening the bench (refused otherwise: tried). Pictures are fetched with the host's cookie (it may see every picture in the room). The Feedback tab is hidden inside frames. Tried in the browser: three virtual players and a real phone in one room, all answering; the host's own tab stayed the host. Screenshots in `screenshots/i1-test-bench/`.
- I2: pressing "Feedback" again reopens the form (not only "send another"). **Done (18 November 2026):** after a report is sent, pressing Feedback again (the top bar's button) opens a fresh, empty form; while a report is being written it stays as it is. Screenshots in `screenshots/i2-feedback/`.

### J. Side games

- J1: **Built.** Tap the foil pack to tear it open, then turn over cards one at a time or reveal them all. Rare pulls have additional effects. [Pack opening](../../apps/web/src/side-games/packs.tsx)
- J2: chips can be switched off now. "The minigames take too much space": closed, nobody knows what was meant (owner, 18 November 2026).

### K. Editor structure (UX designer, 17 November 2026)

From a UX designer's review, with your own additions:

- K1: the top bar can be narrower; it shows too much at once. Fold things into menus. **Done:** one compact row instead of two: game name with a small line (draft, version, save state, length, problems), the editor tabs moved up, the Edit / View switch, who else is editing as coloured initials (your own opens the name field), a *Play & publish ▾* menu (rehearse from the start or a scene, publish, play the published version; each item says why when it cannot be used yet), and a ☰ *Game menu* with Game settings, Media library, Invite people and Export as text. In compact windows it also holds Undo, Redo and the Editing / Viewing switch.
- K2: remember what is open (folded sections, the selected scene, panels) when coming back. **Done:** per game, this browser remembers the editor tab, the selected scenes (dropped if deleted meanwhile), the open panel (Game settings, Invite people or Export as text) and the part of Look & feel, and opens them again; a link with `?view=` still wins. Each settings group (Content, Points, Who plays, Where next, the Game settings groups…) stays open or closed as you left it, from scene to scene and after reloading (kept in this browser only). A group the next scene does not have is simply not shown, and is open again on the next scene that has it (only clicking a group changes what is remembered, not passing through scenes).
- K3: a read mode and an edit mode (look through a game without changing it by accident). **Done:** an *Edit / View* switch in the top bar, remembered in this browser. In View every edit is refused at one place (the draft's change, undo and redo), the panels' fields are locked (greyed out), and on the map cards can be selected and opened but not moved, connected, added, pasted or deleted.
- K4: chunking: group the settings into small, named chunks (see also F6 and G3). **Done:** the long pages are now small named groups that open and close (and stay as left): Look & feel's style page (Style, Colours, Text, Shapes and background, Answer marks; only Style starts open; each shows what is set when closed), the texts (one group per subject with the number changed; a search opens the groups with a match) and the Scene editor's Parts. With the scene panel (Content, Points, Who plays) and Game settings this covers the editor. G3 (the long Look & feel page) is covered by this too.
- K5: make the Flow editor only about the flow (scenes and arrows) and the Scene editor only about the scene (its content and settings), instead of both editing everything. **Done:** the Flow editor's panel shows a summary, problems, a party choice's routes and *Where next*, with **Edit this scene →** (double-clicking a card does the same); the Scene editor has the content and settings, shows the next scene with *Change in the Flow editor*, and its actions (start here, show in the Flow editor, delete) are in its ☰ menu. *Tidy the flow* is only in the Flow editor.
- K6: custom dropdown menus in the editor's style instead of the browser's own (F4 step 3). **Done.**

### L. Look & feel additions (17 November 2026)

- L1: new styles: **MBO Utrecht** (the colours of mboutrecht.nl: deep brand blue, yellow buttons with black text as on the site, orange, mint and light-blue answer tiles, near-square corners, condensed titles; the site's DIN 2014 font is not bundled), **Christmas** (deep green with snow dots, gold buttons, red, green and blue tiles) and **Birthday** (light pink and yellow with confetti dots, pink button, bright tiles, playful titles).
- L2: a **gradient effect** setting under Shapes and background (off unless chosen, in every style): answer tiles and main buttons get a shine and a soft glow; the shine goes towards white under dark text and towards black under light text, so readability never drops. The background has its own *Gradient* choice.
- L4: **answers no longer break in the middle of a word.** Answer tiles (phone) and the answer board (shared screen) sit side by side only when the longest word fits, and go one below the other otherwise; a word only breaks if it is longer than a whole row.
- L5: **answer marks** are part of the look (Look & feel → Answer marks): letters (A B C), numbers (1 2 3), shapes (★ ● ▲…), your own (typed in a field: emoji, letters or short words, up to 8) or none; a circle, square, rounded square or just the mark; before, after or above the answer; and party choices keep their arrows or use the same marks. The phones, the shared screen, the host's route buttons and the preview all follow it.
- L3: **Import colours… / Export colours…** under Colours. Import: paste hex codes (Canva brand kit, Figma), a Coolors link, CSS, design tokens or SVG, or choose an .ase (Adobe, Procreate, Affinity), .gpl, .json, .css, .txt or .svg file; the colours found are shown first, then become the answer tiles and main buttons with readable text on them (the background stays). Export: copy the hex codes, download design tokens (.json, Figma Tokens Studio) or an .ase swatch file.

### M. Instructions for an AI (17 November 2026)

- M1: the instructions the app copies for an AI now cover every feature: wheels (with colours), awards (with titles, scene awards and the wooden spoon), side games and chips, all styles and every look setting (colours, fonts, backgrounds, tiles, gradient, answer marks, animations). A test (`apps/server/test/authoring/ai-instructions.test.ts`) fails and names what is missing when a feature is added without updating them; AGENTS.md says so too.
- M2: the AI first asks the user a few short questions (who plays and the occasion, how long, teams or not, which rounds, language and topics, a style) in one message and waits for the answers before writing the game; "just make it" skips them. The import screen and the guide say so.

### N. Editor details (17 November 2026)

- N1: **Help & shortcuts**: a ? button in the top bar, the ☰ menu or the ? key open a panel with how the three editors work, every mouse and touch gesture on the map, every keyboard shortcut (⌘ on a Mac, Ctrl elsewhere) and how menus and lists work. New shortcuts belong there too.
- N2: **grid-aligned arrows**: select an arrow and drag a handle on its path to insert a snapped bend (to lead it around something); drag a bend point to move it, double-click to remove it, *Straighten* removes them all. The scenes stay put. Bend points are layout (saved with the card positions, also when editing together and in exports).
- N3: selecting an arrow no longer makes the map's toolbar jump: its actions (add a scene on it, straighten, remove) float at the top of the map instead of being added to the toolbar.
- N4: route arrows and shape marks are icons now (Font Awesome Free, CC BY 4.0) instead of text characters: one arrow icon turned to each direction, and star, circle, triangle, square, diamond, heart, plus and bolt.

### O. Step games and new minigames (17 November 2026)

- O1: one engine for minigames played choice by choice: a game only brings its rules and its drawing; who chooses, team votes and their time, captains, saving, results and points are shared (see the architecture note *Step games*). Lucky doors runs on it now; new games of this kind need no new room code.
- O2: how a team decides (scene setting, team rounds): anyone taps it, the team votes (each member once within *Seconds per vote*; who does not vote is not counted; *Decide now* counts the votes cast; a tie goes to the captain or a random pick), or the captain decides (a team without one gets a random captain, fixed for the round and shown to everyone).
- O3: **Drive the bus** (the Dutch drinking game *bussen*, without the final bus): each team guesses red or black, higher or lower, inside or outside, then the suit; a wrong guess costs everyone in the team that round's sips (1, 2, 3, 4 by default); fewest sips wins.
- O4: **Left or right**: everyone (or every team) picks left or right in secret; the majority gets the 1st-place points, a tie gives nobody anything.
- O5: **Lucky doors**: the points behind the doors are shuffled every game, or fixed as listed (scene setting); in a team round the team picks one door together.
- O6: built-in game **Bar games**: random teams with captains, Drive the bus with a team vote, then Left or right.

- O7: **Rainbow** in Drive the bus: a team whose four cards are four different suits makes the other teams drink the last round's sips (scene setting, on by default); the sips per round are a scene setting too.

### P. Room screen: less text, more icons (17 November 2026)

- P1: the connection is a coloured dot in the top bar; its menu has the status, *Reconnect and sync* and the measurements.
- P2: the round is one line of chips: what to do now (with an icon, readable on every style), your team as a coloured flag (a star for the captain), the time, and an (i) with everything else (your team mates, team rules, how to play, how a team decides, sips, rainbow).
- P3: host panel: the big buttons, then one row of icon tools (pause, smoke break, a quick time button, the stopwatch with +1 min, no limit and set time, reopen), then four icons that open one sheet at a time: Room settings, Shared screen & invite, Players (with a count), Back to lobby.
- P4: the scores are a small foldable card: at the bottom of the host panel, floating in a corner of the shared screen; big only at a scoreboard scene and the end.
- P5: the quick time button adds 30 seconds unless the game says otherwise (Game settings → Host tools, `"quickTime"` in the text import); the host can change it in the room's settings.
- P6: the smoke break button is a cigarette icon.

### Q. Explanation before a round (17 November 2026)

- Q1: every round people play (quiz, poll, order, writing, upload, drawing, challenge, vote, minigame) can switch on **Explanation first** (scene panel). The round opens untimed and closed to answers (a minigame does not start its countdown); everyone sees the text, players tap **Got it!**, the host and shared screen see who is ready (faces light up, "2 of 3 ready"), and the host's big button **Start the round** starts the timer. In a team round the teams are made first.
- Q2: a minigame may leave the text empty: it then shows its standard "how to play". Those texts are per game in Look & feel → Texts → **Minigames** (one box per minigame), and the screens use them everywhere (phone, shared screen, the (i)). The words of the explanation screen itself (How it works, Got it!, …) are in the group *Explanation before a round*. Other scenes need their own text (the editor and the publish check say so).
- Q3: text import: `"explain": "text"` on a scene, or `"explain": true` on a minigame; texts `minigame.how.<game>`. The AI instructions mention it. Bar games now explains Drive the bus first.

### R. Editor polish (tester reports, 17 November 2026, evening)

Reported on the Windows desktop (Firefox, 1741×1320) after F, G, K and N were built. **All done**; still to look at in Firefox, where R7 and R12 were seen.

Flow editor and top bar:

- R1: the top bar's controls have uneven spacing and the ? looks bad. **Done:** one height (40 px) and one gap for Edit/View, your initials, *Play & publish*, help and ☰; help is an icon button (a question mark in a circle) like ☰.
- R2: *Tidy up* is hard to find. **Done:** a **Tidy up ▾** menu with a wand icon in the Flow toolbar: *Tidy up into rows* (⌘/Ctrl + Shift + L), *Tidy up in one line*, *Line up selected in a row* (Alt + Shift + H) or *in a column* (Alt + Shift + V), *Straighten all arrows*, *Show the whole game* (Shift + 1) and *Zoom to selected* (Shift + 2). Each item shows its shortcut; Help & shortcuts lists them; each is one change that Undo takes back.

Scene editor:

- R3: a party choice's routes fold. **Done:** each route has a heading (*Route: Music · 1 scene*) that folds its scenes away; a folded route shows its problem count; selecting a scene on a folded route opens it.
- R4: *Add a scene after this one* is clipped. **Done:** it opens inside the scene list, as wide as the list.
- R5: the add menu's tabs are not centred. **Done:** one height, text centred; in a narrow menu the tabs share the row equally.
- R6: the *Scene actions* menu's items are not full width. **Done:** items fill the menu (all ☰ menus), and a menu is as wide as its items.
- R7: a scrollbar appearing in the scene panel makes it jump. **Done:** the panels keep room for their scrollbar (`scrollbar-gutter`); the page itself does not scroll.
- R8: no space above *Seconds per vote*. **Done.**
- R9: the minigame cards have different shapes. **Done:** one even grid (all popups with cards): equal widths, equal heights per row. The cause: the panel's "buttons as wide as their text" rule also reached the cards (and menu items, R6).

Game settings, wheel:

- R10: the slice colours' × overlap *+ Colour*. **Done:** colours are swatches with a small × on the corner (on hover or focus; always on touch screens) and a dashed + tile, the same as the answer colours (R14).
- R11: **Done:** *Test spin…* and *Remove this wheel* side by side.
- R12: broken scrollbars in the Test spin window. **Done:** the window never scrolls sideways (the turning wheel's corners stay inside) and the wheel fits the window's height.

Look & feel:

- R13: *Import colours… / Export colours…* **Done:** quiet links under the colours they change.
- R14: the answer colours' × and *Add a colour*. **Done:** swatches as in R10. The look panel's buttons now have the editor's style (they had the page's black default), and the colour pickers match the swatches.
- R15: checkboxes on two lines. **Done:** box and words on one line.
- R16: the Animations page. **Done:** a card per moment: its name, the animation chosen, then the sample with *Play* and *Build your own*.

### S. Review of R's screenshots (17 November 2026, late evening)

The owner went through the before and after screenshots of R. **Implemented.** Owner review in the browser remains unconfirmed.

Top bar and Flow editor:

- S1: the top bar. **Done:** the ? button is gone (Help & shortcuts is in ☰ and on the ? key); ☰ has no border; Edit/View is one button (*Editing* with a pencil / *Viewing* with an eye, highlighted while viewing); Undo and Redo are icons in the wide header and move into the Game menu in compact windows; your initials and the others' are at the far right.
- S2: the line of tips in the Flow toolbar. **Done:** behind one *Tips* button (a bulb) with a bubble listing the gestures and *All shortcuts (?)*. Zooming is a menu showing the zoom (*100% ▾*: zoom in, zoom out, 100%, show the whole game, zoom to selected), next to *Tidy up ▾*.
- S3: **Light mode / Dark mode** in ☰, remembered in this browser, for the editor and the host and admin pages (players' phones follow their device).
- S4: Help & shortcuts had big gaps between its parts. **Done:** plain sections with a line between them.

Scene editor:

- S5: The scene list keeps *Add after this* on one line. The picker floats over the canvas, and the header also has **Fold all routes / Unfold all routes**.
- S6: *Next:* with an underlined *Change in the Flow editor*. **Done:** a button per way out (*Music → Music Mayhem*) goes to that scene; changing where it leads is in the scene's ☰ (*Change where it leads (Flow editor)*), with *Rehearse from here*.
- S7: **Try this scene** opens the current draft in a large popup. To play a minigame or round, **Rehearse only this scene** remains in Scene actions.
- S8: options with a lot of text (*How a team decides* and every list of choices). **Done:** a short name with a round marker; the explanation is behind an ⓘ (on hover, focus or tap) and is still read out with the option. Long checkbox texts (Drive the bus's rainbow) work the same way.
- S9: the minigame popup. **Done:** tabs by sort (All, Speed, Drawing, Luck & choices, Drinking), cards in equal columns, and the chosen one filled (purple with white text).
- S10: checkboxes in the editor have their own style: a rounded box in the editor's colour, aligned with their words.

Wheels and colours:

- S11: colour chips: the chip is the colour (click to change it); on hover a pencil and a bin show on the chip itself (the bin always on touch screens); a dashed + chip adds one. Wheels and answer colours alike.
- S12: a wheel's *Test spin…* and a bin icon to remove it, on one line.
- S13: the Test spin: **click the wheel** to turn it; clicking again while it turns gives it a **boost** (it speeds up and keeps going). For less motion it stops at once.

Look & feel:

- S14: the animations were cramped. **Done:** each moment shows the sample next to a **timeline** (a bar per item from its wait to its end, a diamond at every block, a play head when it plays), a line in words (*Fades in and rises · 0.45 s, slows down*) and *Build your own* as a quiet link. The builder shows the same timeline while you change it.

Side games:

- S15: **open challenge invites per player** (was a fixed 3) is a setting: Game settings → Side games & chips (standard 3, 1 to 10, `"openInvites"` in the text import), and the host changes it in the room's side-games box, also before the game starts.

### T. People in a room (owner, 18 November 2026)

**Built.** Choices made by the owner: accounts while joining only when the host allows it; picking a name needs the host's approval.

- T1: room setting **Players can make an account when joining** (off by default): *Make me an account* on the join screen; the phone is signed in as the new person (`POST /api/rooms/signup`) and shows the key once (*Welcome, Tess! … Continue to the game*). A phone that already is someone cannot make a second account by accident; names stay unique; 10 tries a minute per address.
- T2: **People you added** in the host's Players sheet (*Add people…* ticks people from the People list; `POST /api/rooms/:id/expected`): each with their key and *in the room / not yet*. The join screen shows *Played with us before?* with those not in the room yet (refreshed every 10 seconds). Tapping a name asks the host (`POST /api/rooms/pick`, repeated while waiting); the host panel shows *A phone says it is Anouk: Yes, it is Anouk / No* (`POST /api/rooms/:id/name-requests`); after yes, only that phone (it alone knows its request ID) is signed in as that person, once; the request then counts as used. Requests last 10 minutes; at most 20 waiting. Both lists and the setting carry over to *Back to lobby*. Server: `apps/server/src/rooms/room-people.ts`; making a person and signing a phone in are shared with the People page (`apps/server/src/people/accounts.ts`).
- Tried in the browser (Chrome, test database): a guest made an account and joined as it; the host added Anouk and Bram, a second phone picked Anouk, the host approved, and that phone was signed in as Anouk and joined. Screenshots in `screenshots/people-in-room/`.

### U. Host room layout (owner's review of T, 18 November 2026)

**Built.** Existing host browser tests cover opening a room and returning to the lobby. Screenshots before and after in `screenshots/host-room/`.

- U1: the host screen uses the width (stage up to 1680 px wide, a fixed 360 px panel; phones unchanged).
- U2: **Room settings**, **Shared screen & invite** and, during the game, **Players** open as a wide popup over the screen (Escape, × or a click outside closes it) instead of making the panel long; settings in columns (phones while waiting and joining on the left; *During the game* in two columns on the right). On a phone the popup is a sheet from the bottom.
- U3 (also: a narrow host screen, such as on the test bench, puts the QR code under the code, sized to the card, and the link icon sits next to *Join on your phone*): lobby on the host and shared screen, after Kahoot's and Jackbox's lobbies: a band across the top (*Join on your phone*, *Go to … and enter*, the big code with a copy icon, the QR code, a link icon in the corner that copies the join link; no copy buttons on the TV) and below it a stage of seats that fill with players' faces and names as they join, with a big player count and empty dashed seats still to fill (at least 8, then always a few more; they pulse gently unless reduced motion is on). On a computer it fills the screen; on a phone it stacks. The address is no longer written out twice. **Shared screen & invite** is a compact popup: the QR code next to the code and the address (each with a copy icon), and the shared screen as one slim row (*Create display link*, then *Open shared display* with a copy-link icon). Escape closes a popup wherever focus is.
- U4: icons over text, one size (38 px): a **boot** to kick a player or take someone off the added list (drawn for this app; Font Awesome Free has no boot), a person with a plus to add people (a tick when done), copy icons (Font Awesome *copy*, a tick once copied), × to close.
- U5: the new-code page: a person icon, *Welcome, …!*, the code with a copy icon next to it, one full-width *Continue to the game*.
- U6: the connection button is a square box (44 px) with the round dot in the middle: green when connected, **orange when slow** (the last three round trips took more than 400 ms on average; its menu says so), red when not connected.
- U7: host menu, *Your open rooms*: the room code and its copy icon stay together on one line (on a narrow screen they move down as one).

### V. Editor and menu polish (owner, 18 November 2026)

**Built.** Screenshots in `screenshots/editor-polish/`.

- V1: **Light mode / Dark mode did not work** in the built app: the build rewrites `light-dark()` into two helper variables that follow the device, not the chosen mode. `applyTheme` now sets those too (`apps/web/src/theme.ts`).
- V2: the ring around your initials in the editor's top bar was an oval (the bar's 40 px minimum height stretched the 36 px circle): now a 40 px circle.
- V3: **problem count**: problems of one scene that carried no scene path (a quiz's correct answer that is not one of its options, a wrong correct order, a duplicate part) were merged into one when several scenes had the same mistake; they now carry their scene and part, so each counts and shows on its own card. Note: problems found only after the basic checks pass (such as unreachable scenes) still appear once the earlier ones are fixed.
- V4: *Your games*: **Show problems** becomes **Hide problems** while they are shown.
- V5: Flow toolbar: *Add a scene*, *Tidy up*, the zoom menu and *Tips* are one height (44 px) and weight. The ☰ menu has icons: a cog (Game settings), a person with a plus (Invite people), an arrow out of a tray (Export as text), next to Help and Light/Dark mode.
- V6: **Tidy up** is tighter: 96 px between columns (was 144), each row only as tall as its own tallest column, 96 px between rows (was the tallest column of the whole game plus 192). *Line up in a row* uses the same spacing. The map's messages (*Tidied up into rows.*) are a neutral pill instead of red text.
- V7: host room, *Add people…*: the ticks fill the row (the player list's chip style no longer reaches them).

### W. Problems and history boxes (owner, 18 November 2026)

**Built.** Screenshots before and after in `screenshots/problems-panel/`.

- W1: **Problems** at the bottom left of every editor (Flow, Scene, Look & feel): folded, a small *4 problems* button; open, every problem grouped by scene in the game's order (problems of the whole game first, under *Whole game*). Clicking one selects its scene: the map centres it (zoomed to at least 80%), the Scene editor opens it, Look & feel switches to the Scene editor. Open or folded is remembered in this browser. It replaces the old box for whole-game problems.
- W2: **History** next to it: your edits in this visit, newest on top, each in words (*Added “…”*, *Changed “…”*, *Removed …*, *Moved …*, *Changed the connections*, *Renamed the game to …*, *Changed the look*, *Changed the game settings*) with the time; undone steps above **Now** in grey. Clicking one goes back to just after it (or forward to it), the same as that many Undo/Redo presses, so other people's changes stay; *When you opened the game* undoes everything; after going back, **Back to the latest** at the top redoes everything again. Rows are highlighted on hover. The button has its own icon (a clock with an arrow turning back). Locked in View mode.
- W3: with problems, **Play & publish** shows a warning triangle and one red line, *⚠ 4 problems to fix first* (its tooltip says where they are listed). Rehearsing works as the server does: it skips scenes it cannot reach from where it starts, so only problems of the whole game and of the scenes it would play stop it; those items then say *(fix 3 problems first)* and cannot be clicked. Publish needs every problem fixed.
- W4: the corner stays quiet over the map: the folded buttons and the open lists are see-through with a blur behind them (solid when *Reduce transparency* is on). Not an opacity on the whole button: that made the text too faint for the contrast check.

### X. Owner's follow-ups, 18 November 2026

- X1: **Chips & packs** (Admin → Chips & packs, owner only): the chip amounts (to start, per point, 1st/2nd/3rd place, everyone else, minigame or duel won, arcade win) and the pack sets. A set has a name, price, chance per rarity (adds up to 100), god pack odds (1 in N, 0 = never) and items (emoji, name, rarity, a line on the card). Each set row has an **Active** button (players see it, or it is hidden), an **On sale** button (a percentage off, 50% by default, set per set) and edit and remove. Removing a set or item never takes it from a collection. Players pick which set to open on their phone; a sale shows the old price struck through.
- X2: the arcade moves between its lobby and a round **without reloading the page** (a reload went black on phones and could swallow a tap mid-round). Parts of the app that load when opened (editor, admin, arcade) are tried again when a download fails and never leave the page black; the server now serves a new build's files at once, and keeps built files in the browser's cache.
- X3: editor: the right-click add menu stays on screen; a problem of the whole game says what is wrong (for example an end-of-game award about a removed scene) and clicking it opens the game settings (the ☰ menu then shows a red *!*, *Game settings* a red count, and in the panel the group with the problem has a red line, its title and *1 problem* in red, opens by itself and shows the problem in red at its top, and can be collapsed while keeping the count visible); scenes with a problem have a red border in the map and the scene list; History and Problems open one at a time without pushing each other aside; the people editing now are named (*Also here*), your own circle says *You* in the wide header; the phone preview wraps long questions and puts long answers below one another.
- X4: a person's page uses the full width on a computer (stats left, rights, key and account right).
- X5: **item pictures**: in a set's items, the picture button takes any picture, makes it square (cut to the middle) and 256 pixels on this device, and the server keeps only its image (as with players' photos). It shows instead of the emoji everywhere on the phone; the small × on it goes back to the emoji.
- X6: **Pack odds and purchases are covered** by unit and database tests. Owner-facing pack management still needs browser coverage. See [Still needs testing](#still-needs-testing).
- X7: **Player and author translations** use English, Dutch, German and Romanian. Minigame, drawing and character builder controls follow the phone’s language. Authors can translate prompts, titles, explanations and option labels under **Scene editor → Translations**, and customize room interface text by language in **Look & feel → Texts**. Empty fields use the original.
- X8: **Join screen** (Admin → Join screen, owner only): the look of the first screen players see (room code and name), with the editor's own style controls, without what the join screen never shows (answer colours, answer tiles, answer marks): styles, colours, text, shapes and background and a live phone preview. Once a code is typed the screen takes that room's game look; rooms and scenes always use their game's look.
- X9: **no separate dark bar any more.** The host and admin pages have a header in the page's own colours: the logo, then Play, Host and Editor (the current one underlined) on the left; Feedback and, for the owner only, an *Owner ▾* menu (Feedback reports, People, Chips & packs, Join screen) on the right. An editor sees only Play and Editor; anyone else sees no header. In the editor the bar is gone: its *p.* button with a chevron opens the same places. On phones Feedback and the owner menu show only their icon.
- X10: side games: one button with the game being played (*🎰 Slots ▾*) opens all games as a grid over the screen (it pushes nothing down; Escape or a tap outside closes it), so there is room for many more games.
- X11: editing together: the wide header shows a single collaborator by name. With several collaborators it shows initials and a count that opens the full list. Compact windows keep the avatar controls in less space.
- X12: **Try this scene** previews the draft in the editor, including scenes with validation issues. The Scene editor uses a single editable canvas; **Phone preview** opens separately.
- X13: **Moving backgrounds** offer Starlight and Light lines in **Look & feel → Shapes and background**, and in **Admin → Join screen**. The motion stops when the device requests reduced motion.
- X14: opening the editor, the admin pages or the arcade (the parts phones never download unless needed) shows a **loader** instead of *Opening the …*: nothing for the first moment, then the party logo with a soft pulse and three dots, in the page's colours (still with *Reduce motion*). The owner's pages fetch the editor and the admin menu ahead while idle, and the start page the arcade, so switching usually shows no loader at all. Never during a game: the room screen is in the first download.

### Y. Owner's queue, 19 November 2026

Details and status per item are in the plan's *Owner queue (19 November 2026)* ([APP_PLAN.md](../../APP_PLAN.md)).

- Y1: **capacity load test** `npm run load` ([load test](../testing/load-test.md)): built; run it on the Pi. A Mac passed 10 rooms × 20 phones.
- Y2: long page scrollbar in Look & feel → Animations: fixed (hidden labels escaped their panel); a browser test checks it.
- Y3: the arcade wears the join screen's look (Admin → Join screen): built.
- Y4: **groups of people** (People → Groups; tick a whole group in a room's *Add people…*; a person can be in several groups): built, with tests.
- Y5: **picture, video or song in a question** (and in cutscenes), from a shared **media library**. The canvas and themed popup show the attached media and its placement and size. The scene media popup can crop pictures and cut uploaded video or audio clips. Host Pause also pauses video and song playback. Real phone and TV checks remain open.
- Y6: **background music** (Game settings → Music) and per-scene music (keep, own song, quieter, silence), host on/off and volume, credits shown as a song starts; standard songs (Kevin MacLeod: Hotrock, At Launch, The Show Must Be Go; Gichco: Loop 3) via `npm run music:defaults`. Sascha Ende's “The Question Is” is available as a manual scene-song upload. Spotify is not possible (its developer terms forbid games and trivia).
- Y7: **Visible YouTube clips** are available through **Scene editor → Add media → Add YouTube video**. Start and end times are optional. The shared display gets the player, with the host screen as a fallback. The Media library also imports audio as MP3 and saves trimmed copies using FFmpeg and yt-dlp.

## Known limits and test notes

- Browser test *Look & feel* used to time out: it left the exported text open over the Publish button. Fixed in the test (17 November 2026); it passes on a Mac. The Android *hosting* test can miss its 20-second question on a slow PC; *routes* on Android was flaky once.
- A drawing sent when time runs out needs two requests within 3 seconds; a very slow connection can still miss it.
- Back to lobby gives the room a new code (the old room's scores are history and are never rewritten). Guests' chips belong to one room, so they start over; people keep theirs.

## Running it on this PC (Windows)

- Docker Desktop must be running. `npm run db:env` made the ignored `.env` (new local credentials; an older local database may need them).
- After pulling: `npm run db:migrate:deploy` to apply pending migrations.
- Run tests from an uppercase `C:\Projects\khaoot-bullshit` path: from `c:\…` Vitest loads twice and every database suite fails with "failed to find the current suite".
- `npm run check`, `npm run db:test:up` then `npm run db:test`, and `npm run test:e2e` (after a build) as in the README.
