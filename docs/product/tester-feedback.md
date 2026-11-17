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
| E, host and players | **Back to lobby** (host panel): the same game again in a fresh room, everyone follows (new room code; the old room's history stays). Looks are used straight away unless the room setting *Players confirm their look* is on; a drawing in progress is used on Done or when the game starts. Awards: swipe or ‹ ›, auto-play is a toggle (on only on the shared screen). When time runs out the phone sends what the player had: choice, text, order, upload, route vote or drawing (a half-drawn line is kept); drawing rounds accept answers 3 seconds after the deadline instead of 1. | commit `1c61c7a` |
| F1, F2, add menu | One entry per kind: quiz, scoreboard, picture/video, drawing and party choice are added straight away. Their kind is a setting in the scene panel: quiz *Kind of question* (Big tiles / A list / True or false) and scoreboard *Show* (Player scores / Team scores / Both) are buttons; upload types, drawing blind and who decides were already there. Writing prompts, minigames and duels keep their second menu (different games or starter text, not settings). | not committed yet |
| F3, add-menu tabs | The add menu has tabs: **Rounds** (quiz, writing, picture/video, drawing, put in order, challenge, vote), **Games** (minigame, duel, wheel), **Between rounds** (cutscene, scoreboard, party choice, Pick teams) and **Prefabs**. It opens on the tab used last; arrow keys move between tabs. The part menu in the Scene editor shows only the tabs that have parts. | not committed yet |

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

- F4: replace dropdowns with popups (example: "How it is split" in places). Researched (see the note below); being done in three steps:
  1. Short choices (2–3 options, a few up to 5) become buttons in the panel, like the quiz's *Kind of question*. **Done (not committed yet):** scoring, who plays, team split and how teams are made, who answers, points go to, team scores when teams are made again, who decides a party choice / on a tie / when nobody votes / vote counts, who duels, wins needed (rock paper scissors), a team's minigame result, points by place and how a total is split. Long labels are a short list with a hint under each.
  2. Choices that need a description (which minigame, the duel's game, adding an award) open a popup with cards. **Done (not committed yet):** *Change minigame…* and *Change how it is won…* in the scene panel (a changed game starts from its own settings and timer; a title or question the author wrote is kept), and *Add an award…* in Game settings, each card saying how the award is decided.
  3. Lists made from the game itself (next scene, start scene, answers to vote on, wheel per scene, "Change the look of") get a custom dropdown in the editor's style instead of the browser's own. **Done (not committed yet):** every dropdown left in the editor (next scene and route leads-to, the start scene, answers to vote on, the wheel per scene, Look & feel's scope, fonts shown in their own font, animations and movement) is the editor's own dropdown, built to the standard pattern: arrows, Home/End, Page Up/Down, Enter/Space, Escape, type to find, Tab chooses; tap and click work; the list floats over the panel and opens upwards near the bottom. The editor has no browser dropdowns left.
- F5: duel: choose the head-to-head game in a popup with all games. **Done (not committed yet)** with F4 step 2; it can now also be changed after adding the scene.

#### Note: dropdowns, buttons or popups (research, 17 November 2026)

Sources: Nielsen Norman Group ([Dropdowns: when to use them](https://www.nngroup.com/articles/dropdown-list/)), Baymard Institute ([Drop-down usability](https://baymard.com/blog/drop-down-usability), [Custom drop-downs cause issues](https://baymard.com/blog/custom-dropdowns-cause-issues)) and design-system guidance (USWDS, Material, IBM Carbon). Reddit itself could not be read by the research tool.

- **Few options: show them.** Under about 5 options, radio buttons or a row of buttons beat a dropdown: a dropdown hides the choices, and in Baymard's tests 55% of people opened one just to see what was in it. Design systems put the line between 3 (Carbon) and 7 (USWDS).
- **5 to about 15 options: a dropdown is fine**, and it keeps a long panel compact (NN/g: options laid out inline make a form longer and harder to scan).
- **Many options, or options that need a description or picture: a picker** (type to search, or a popup with cards).
- **A popup is no general fix.** Open, pick, close costs as much as a dropdown; it pays off only when each choice needs room.
- **Custom dropdowns carry a risk.** Baymard found usability problems in 31% of custom-made dropdowns (keyboard, scrolling, closing by accident, phones), problems the browser's own dropdown solved long ago. A custom one must follow the standard listbox pattern: keyboard and type-to-find, the chosen item in view, works with touch and screen readers.
- **Watch the panel length.** Buttons with short labels take little room; long labels become a short list of choices, one per row.
- F6: the inspector's action buttons (Start here, Duplicate, Save as prefab, Delete) need a layout that takes more buttons. **Done (not committed yet):** they are in a ☰ *Scene actions* menu next to Close (keyboard: arrows, Escape); *Save as prefab…* opens its name form under the header and *Delete scene…* asks in a popup. The Scene editor still has its own buttons.
- F7: wheel of fortune styling and a preview / test-spin window. **Done (not committed yet):** a wheel uses the game's answer colours or its own (2–8, in the wheel's settings), each label black or white, whichever reads better; **Test spin…** opens the real wheel in the game's look and lands on a random entry (nothing saved).
- F8: as many routes as wanted in a party choice (default 2); the format allows 2–6 now, the editor needs "add route" and the limit may go up. **Done (not committed yet):** up to 8 routes (was 6), in the editor, the server and the text import; arrows for 7 and 8 routes.
- F9: customizable end-of-game awards: authors pick from 9 fixed stats now; could become entries with their own title and rule. **Done (not committed yet):** each award can have its own title (in Game settings → End-of-game awards); new rules *Best in one scene* (most points in a chosen scene, can be added more than once) and *Wooden spoon* (fewest points, 0 counts); older games keep their list and become the new list when edited.

### G. Editor: canvas, layout, mobile

- G1: zoom the Flow canvas with the mouse wheel.
- G2: a long game zooms far out; wrap scenes into rows.
- G3: the Look & feel page is very long. **Done (not committed yet)** with K4: its style page and texts are small groups that open and close.
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
- J2: "chips cannot be disabled and the minigames take too much space": chips can be switched off now; what "the minigames take too much space" means is still open; if it was the add-scene menu, the tabs (F3) may have solved it.

### K. Editor structure (UX designer, 17 November 2026)

From a UX designer's review, with your own additions:

- K1: the top bar can be narrower; it shows too much at once. Fold things into menus. **Done (not committed yet):** one compact row instead of two: game name with a small line (draft, version, save state, length, problems), the editor tabs moved up, the Edit / View switch, who else is editing as coloured initials (your own opens the name field), a *Play & publish ▾* menu (rehearse from the start or a scene, publish, play the published version; each item says why when it cannot be used yet), and a ☰ *Game menu* with Game settings, Invite people and Export as text.
- K2: remember what is open (folded sections, the selected scene, panels) when coming back. **Done (not committed yet):** per game, this browser remembers the editor tab, the selected scenes (dropped if deleted meanwhile), the open panel (Game settings, Invite people or Export as text) and the part of Look & feel, and opens them again; a link with `?view=` still wins. Each settings group (Content, Points, Who plays, Where next, the Game settings groups…) stays open or closed as you left it, from scene to scene and after reloading (kept in this browser only). A group the next scene does not have is simply not shown, and is open again on the next scene that has it (only clicking a group changes what is remembered, not passing through scenes).
- K3: a read mode and an edit mode (look through a game without changing it by accident). **Done (not committed yet):** an *Edit / View* switch in the top bar, remembered in this browser. In View every edit is refused at one place (the draft's change, undo and redo), the panels' fields are locked (greyed out), and on the map cards can be selected and opened but not moved, connected, added, pasted or deleted.
- K4: chunking: group the settings into small, named chunks (see also F6 and G3). **Done (not committed yet):** the long pages are now small named groups that open and close (and stay as left): Look & feel's style page (Style, Colours, Text, Shapes and background, Answer marks; only Style starts open; each shows what is set when closed), the texts (one group per subject with the number changed; a search opens the groups with a match) and the Scene editor's Parts. With the scene panel (Content, Points, Who plays) and Game settings this covers the editor. G3 (the long Look & feel page) is covered by this too.
- K5: make the Flow editor only about the flow (scenes and arrows) and the Scene editor only about the scene (its content and settings), instead of both editing everything. **Done (not committed yet):** the Flow editor's panel shows a summary, problems, a party choice's routes and *Where next*, with **Edit this scene →** (double-clicking a card does the same); the Scene editor has the content and settings, shows the next scene with *Change in the Flow editor*, and its actions (start here, show in the Flow editor, delete) are in its ☰ menu. *Tidy the flow* is only in the Flow editor.
- K6: custom dropdown menus in the editor's style instead of the browser's own (F4 step 3). **Done (not committed yet).**

### L. Look & feel additions (17 November 2026, not committed yet)

- L1: new styles: **MBO Utrecht** (the colours of mboutrecht.nl: deep brand blue, yellow buttons with black text as on the site, orange, mint and light-blue answer tiles, near-square corners, condensed titles; the site's DIN 2014 font is not bundled), **Christmas** (deep green with snow dots, gold buttons, red, green and blue tiles) and **Birthday** (light pink and yellow with confetti dots, pink button, bright tiles, playful titles).
- L2: a **gradient effect** setting under Shapes and background (off unless chosen, in every style): answer tiles and main buttons get a shine and a soft glow; the shine goes towards white under dark text and towards black under light text, so readability never drops. The background has its own *Gradient* choice.
- L4: **answers no longer break in the middle of a word.** Answer tiles (phone) and the answer board (shared screen) sit side by side only when the longest word fits, and go one below the other otherwise; a word only breaks if it is longer than a whole row.
- L5: **answer marks** are part of the look (Look & feel → Answer marks): letters (A B C), numbers (1 2 3), shapes (★ ● ▲…), your own (typed in a field: emoji, letters or short words, up to 8) or none; a circle, square, rounded square or just the mark; before, after or above the answer; and party choices keep their arrows or use the same marks. The phones, the shared screen, the host's route buttons and the preview all follow it.
- L3: **Import colours… / Export colours…** under Colours. Import: paste hex codes (Canva brand kit, Figma), a Coolors link, CSS, design tokens or SVG, or choose an .ase (Adobe, Procreate, Affinity), .gpl, .json, .css, .txt or .svg file; the colours found are shown first, then become the answer tiles and main buttons with readable text on them (the background stays). Export: copy the hex codes, download design tokens (.json, Figma Tokens Studio) or an .ase swatch file.

### M. Instructions for an AI (17 November 2026, not committed yet)

- M1: the instructions the app copies for an AI now cover every feature: wheels (with colours), awards (with titles, scene awards and the wooden spoon), side games and chips, all styles and every look setting (colours, fonts, backgrounds, tiles, gradient, answer marks, animations). A test (`apps/server/test/authoring/ai-instructions.test.ts`) fails and names what is missing when a feature is added without updating them; AGENTS.md says so too.
- M2: the AI first asks the user a few short questions (who plays and the occasion, how long, teams or not, which rounds, language and topics, a style) in one message and waits for the answers before writing the game; "just make it" skips them. The import screen and the guide say so.

### Open questions

- "You're far away" (host screen on an iPhone): that text is not in this app; what was on screen?
- Roulette: not built; a new side game if wanted.

## Known limits and test notes

- Browser test *Look & feel* used to time out: it left the exported text open over the Publish button. Fixed in the test (17 November 2026); it passes on a Mac. The Android *hosting* test can miss its 20-second question on a slow PC; *routes* on Android was flaky once.
- A drawing sent when time runs out needs two requests within 3 seconds; a very slow connection can still miss it.
- Back to lobby gives the room a new code (the old room's scores are history and are never rewritten). Guests' chips belong to one room, so they start over; people keep theirs.

## Running it on this PC (Windows)

- Docker Desktop must be running. `npm run db:env` made the ignored `.env` (new local credentials; an older local database may need them).
- After pulling: `npm run db:migrate:deploy` (the challenge stakes migration is new).
- Run tests from an uppercase `C:\Projects\khaoot-bullshit` path: from `c:\…` Vitest loads twice and every database suite fails with "failed to find the current suite".
- `npm run check`, `npm run db:test:up` then `npm run db:test`, and `npm run test:e2e` (after a build) as in the README.
