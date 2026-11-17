# Tester feedback (15 November 2026): status and what is left

The feedback reports from the test evening of 14–15 November were sorted into groups A–J. This page tracks what is done, what still needs a real phone, and what is left, so work can continue from here. The product plan stays in [APP_PLAN.md](../../APP_PLAN.md); what is built is in the [README](../../README.md).

## Where we are (17 November 2026)

- Committed: groups A–Q, except H, I and J (A–E in `566660b` and `1c61c7a`; F, G, K–Q in `2b08e6a` and `92a567a`). Checks at the last run: unit 379, database 155, desktop browser tests 34, all passing; the phone-profile browser tests were not rerun for P and Q.
- Committed in `c324945`: R (editor polish from the reports of 17 November evening, with a *Tidy up* menu and shortcuts), S (the review of R's screenshots, below) and *Mark N as done* in Admin → Feedback; this page, the README and one database test followed after it. Checks at the last run: unit 388, database 157, desktop browser tests for the editor, Look & feel, wheels, step games, editing together, side games, room features and hosting (24), all passing; the phone profile and the rest of the browser tests were not rerun. Screenshots of R are in the ignored folder `screenshots/r-polish/` (taken in Chrome; the reports were made in Firefox); S has no screenshots yet.
- Next: look at S in the browser, then H (host menu and admin), then I (testing and feedback tool) and J (side games pack animation).
- Still to check on a real phone: the list below, plus the new room chips, the (i) panel and the explanation screen.
- The reports in the admin Feedback list still say *New* for everything fixed in A–G and P; they are updated by hand.

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

- G1: zoom the Flow canvas with the mouse wheel. **Done (not committed yet):** the plain scroll wheel zooms around the pointer (smoothly; a trackpad pinch too), Shift + scroll moves the map, and you can zoom out to 25%.
- G2: a long game zooms far out; wrap scenes into rows. **Done (not committed yet):** *Tidy up* (and a game without a layout) wraps a long game into rows of columns, about screen-shaped (16:10); games up to 6 steps stay on one row. The arrow from the end of a row runs back neatly along the gap between the rows.
- G3: the Look & feel page is very long. **Done (not committed yet)** with K4: its style page and texts are small groups that open and close.
- G4, G5: the editor on phones (the rehearse menu does not fit). **Done (not committed yet):** on a phone the top bar is three short rows, the map's tools one row of icons, the scene panel a sheet from the bottom, menus (Play & publish, ☰, your name) and the add-a-scene menu sheets at the bottom, and the Scene editor stacks list, preview and settings with the page scrolling. Checked with a phone-sized window, not yet on a real phone.

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

### N. Editor details (17 November 2026, not committed yet)

- N1: **Help & shortcuts**: a ? button in the top bar, the ☰ menu or the ? key open a panel with how the three editors work, every mouse and touch gesture on the map, every keyboard shortcut (⌘ on a Mac, Ctrl elsewhere) and how menus and lists work. New shortcuts belong there too.
- N2: **bend points on arrows**: select an arrow, drag a dashed circle on it to bend it there (to lead it around something); drag a bend point to move it, double-click to remove it, *Straighten* removes them all. The scenes stay put. Bend points are layout (saved with the card positions, also when editing together and in exports).
- N3: selecting an arrow no longer makes the map's toolbar jump: its actions (add a scene on it, straighten, remove) float at the top of the map instead of being added to the toolbar.
- N4: route arrows and shape marks are icons now (Font Awesome Free, CC BY 4.0) instead of text characters: one arrow icon turned to each direction, and star, circle, triangle, square, diamond, heart, plus and bolt.

### O. Step games and new minigames (17 November 2026, not committed yet)

- O1: one engine for minigames played choice by choice: a game only brings its rules and its drawing; who chooses, team votes and their time, captains, saving, results and points are shared (see the architecture note *Step games*). Lucky doors runs on it now; new games of this kind need no new room code.
- O2: how a team decides (scene setting, team rounds): anyone taps it, the team votes (each member once within *Seconds per vote*; who does not vote is not counted; *Decide now* counts the votes cast; a tie goes to the captain or a random pick), or the captain decides (a team without one gets a random captain, fixed for the round and shown to everyone).
- O3: **Drive the bus** (the Dutch drinking game *bussen*, without the final bus): each team guesses red or black, higher or lower, inside or outside, then the suit; a wrong guess costs everyone in the team that round's sips (1, 2, 3, 4 by default); fewest sips wins.
- O4: **Left or right**: everyone (or every team) picks left or right in secret; the majority gets the 1st-place points, a tie gives nobody anything.
- O5: **Lucky doors**: the points behind the doors are shuffled every game, or fixed as listed (scene setting); in a team round the team picks one door together.
- O6: built-in game **Bar games**: random teams with captains, Drive the bus with a team vote, then Left or right.

- O7: **Rainbow** in Drive the bus: a team whose four cards are four different suits makes the other teams drink the last round's sips (scene setting, on by default); the sips per round are a scene setting too.

### P. Room screen: less text, more icons (17 November 2026, not committed yet)

- P1: the connection is a coloured dot in the top bar; its menu has the status, *Reconnect and sync* and the measurements.
- P2: the round is one line of chips: what to do now (with an icon, readable on every style), your team as a coloured flag (a star for the captain), the time, and an (i) with everything else (your team mates, team rules, how to play, how a team decides, sips, rainbow).
- P3: host panel: the big buttons, then one row of icon tools (pause, smoke break, a quick time button, the stopwatch with +1 min, no limit and set time, reopen), then four icons that open one sheet at a time: Room settings, Shared screen & invite, Players (with a count), Back to lobby.
- P4: the scores are a small foldable card: at the bottom of the host panel, floating in a corner of the shared screen; big only at a scoreboard scene and the end.
- P5: the quick time button adds 30 seconds unless the game says otherwise (Game settings → Host tools, `"quickTime"` in the text import); the host can change it in the room's settings.
- P6: the smoke break button is a cigarette icon.

### Q. Explanation before a round (17 November 2026, not committed yet)

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

The owner went through the before and after screenshots of R. **All done**; not yet seen in a browser by the owner.

Top bar and Flow editor:

- S1: the top bar. **Done:** the ? button is gone (Help & shortcuts is in ☰ and on the ? key); ☰ has no border; Edit/View is one button (*Editing* with a pencil / *Viewing* with an eye, highlighted while viewing); Undo and Redo are icons in the top bar (in reach in every editor, also with a long scene list); your initials and the others' are at the far right.
- S2: the line of tips in the Flow toolbar. **Done:** behind one *Tips* button (a bulb) with a bubble listing the gestures and *All shortcuts (?)*. Zooming is a menu showing the zoom (*100% ▾*: zoom in, zoom out, 100%, show the whole game, zoom to selected), next to *Tidy up ▾*.
- S3: **Light mode / Dark mode** in ☰, remembered in this browser, for the editor and the host and admin pages (players' phones follow their device).
- S4: Help & shortcuts had big gaps between its parts. **Done:** plain sections with a line between them.

Scene editor:

- S5: *Add after this* floats over the preview (on top of everything) instead of inside the narrow list. A **Fold all routes / Unfold all routes** button sits next to it.
- S6: *Next:* with an underlined *Change in the Flow editor*. **Done:** a button per way out (*Music → Music Mayhem*) goes to that scene; changing where it leads is in the scene's ☰ (*Change where it leads (Flow editor)*), with *Rehearse from here*.
- S7: trying a minigame needed rehearsing the whole game. **Done:** **Try this scene** in the scene's panel opens a practice room with only that scene (the server's rehearsal takes `only`); a scene that needs something earlier (a vote's round, the game's teams) says so.
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
