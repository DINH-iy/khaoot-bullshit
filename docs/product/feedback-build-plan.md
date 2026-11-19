# Feature feedback build plan

Checked against the checkout on 19 November 2026. This covers all 41 feature requests in the feedback export. Each row uses the full ID searchable in **Admin → Feedback**. All 41 were marked **New** in the export. The status below describes what is implemented in the checkout. [Tester feedback tracker](tester-feedback.md)

## Build order

1. **Live round controls are implemented.** The four reports below track automated coverage and remaining real-phone checks.
2. **Player and host controls are implemented.** The reports below record verification and the remaining physical-device and Pi checks.
3. **Voting and results controls are implemented.** Auto-reveal and the host phone came first, followed by result cards, multi-select and ranked ballots, the private birthday vote, and configurable drawing and minigame countdowns. The reports below track remaining device checks.
4. **Authoring and presentation changes are implemented.** Writing opens directly, with prompt starters inside the scene. The editor has an Intro template, a Space preset, a first-run tour, editable map zoom shortcuts, undoable scene-type replacement, and Ctrl/Command-drag selection. Scene and result transitions, the join form, and feedback attachments are covered below.
5. **Prototype new party features.** Start with the speed-run game on a fixed course before adding a course editor. Prototype the animation-and-guessing game after that, building on the existing team drawing tools. Define opt-in phone audio and effects, lobby and team chat rules, and the original creature-battler rules before building those features. Extend fixed reactions before adding free text to the TV.

## Live rounds and voting

| Report ID | Request | Status and remaining work |
| --- | --- | --- |
| `62e1ef79-82f3-4037-97e9-e6476052109e` | Highlight what I voted for | **Implemented.** The server-accepted choice has a private badge on answer ballots and party choices, including after a refresh and when results appear. Chromium checks the saved choice and that other viewers do not see the badge. Real phone: check reconnect after switching networks and verify that the badge remains clear with long labels. |
| `dfa7f885-b706-439e-aa5f-1117c076c743` | Keep Send my drawing within reach | **Implemented.** The submit button sits above the drawing pad. Chromium submitted a blind drawing at 375 × 667. Real phone: check a short viewport with browser bars shown, a long prompt, and enough room to draw and submit. |
| `ddf49fee-2b8d-463d-a4fa-69c8c8be4feb` | Clearer Reaction duel screen | **Implemented.** The pad switches from a neutral Wait state with “Don’t tap yet” to GO with “Tap now.” False starts use a distinct result treatment. Chromium verified an early tap and a successful tap after GO. Real phone: check the cues at game speed, including after a host pause and resume. |
| `472622ac-117d-4faa-ad4a-7f7e3196f759` | Drag to reorder an answer | **Implemented.** Drag the item label by touch or mouse to reorder it. The arrows and keyboard access remain. Chromium verified mouse dragging, emulated touch dragging, and saving the reordered answer. Real phone: check touch dragging, scrolling between moves, and saving a reordered answer on iOS Safari and Android Chrome. |
| `95092c9c-077f-4ad9-b41d-4ae1c0f42e3e` | Reveal results automatically after a configurable delay | **Implemented.** Enable auto-reveal in Game settings → Host tools or adjust it in Room settings. A delay of 0 reveals as soon as a closed round is ready. The host can reveal manually and can assign a connected player as the Host phone. That phone keeps its seat and gains round controls and the auto-reveal setting. Real devices: play with a host phone and a TV, switch networks, and check timing and reconnection. |
| `e235b872-efdb-4448-801a-7308919fd7bf` | Vote on an outcome and reveal results one at a time | **Implemented.** Vote, picture/video upload, and drawing results can show together, advance with Next result, or advance on a set interval. The host phone can step through manual cards. Real devices: check mixed photos and videos on the shared screen and compare timed progression with phones that reconnect mid-sequence. |
| `4d4d87fd-31d5-48d8-946a-0ee4dd51e49c` | Prompt, player submissions and voting with multiple parts | **Implemented.** Vote parts accept a single choice, multiple choices, or ranked choices from a previous submission part. Authors set the selection limit. Multi-select counts each pick once. Ranked ballots award the limit to first choice, then one point less per rank. Ties share a place. Real phones: check selection order, own-entry hints, and a saved ballot after reconnect. |
| `aa53f3ed-4614-42e3-9b4d-ae37db873702` | Birthday-only vote to sing, hidden from the host | **Implemented.** Enable Private birthday vote in Game settings → Host tools. Eligible phones vote through Menu and get a private prompt when a majority agrees. The host, assigned host phone and shared screen do not receive the vote. Real devices: check the surprise flow with a shared screen and multiple phones. |
| `48ad99a1-f037-4c65-b803-424a7f2500b1` | Configurable countdown and explanation before minigames or drawing | **Implemented.** Drawing and minigames offer a countdown of 0–15 seconds. With Explanation first enabled it starts when the host starts play, after the explanation. Real devices: check the countdown and play timer together, including pause and resume during drawing and a minigame. |

Group 3 verification passed on desktop Chromium and emulated Android Chrome. The assigned phone started a round, answered as a player, and closed the round with a 0-second auto-reveal delay. The browser also kept a ranked ballot after reload and advanced the result cards on the configured timer. PostgreSQL tests covered the nonzero delay, judging and anonymity before revealing, eligibility and device takeover, ballot scoring and manual result cards, birthday-vote privacy, and a drawing countdown across pause and resume. The physical-device checks are still open in the rows above.

References: [ballot](../../apps/web/src/room/vote.tsx), [ordering](../../apps/web/src/room/answer-input.tsx), [drawing](../../apps/web/src/drawing/drawing-answer.tsx), [Reaction duel](../../apps/web/src/minigames/controllers.tsx), [room flow](../../apps/web/src/room/room-screen.tsx), [scene and poll options](../guides/importing-games.md).

## Host and player controls

Verification passed on the local build. Desktop Chrome and emulated Android Chrome covered both room exits, saving the active drawing or photo, name and photo moderation, and score correction. PostgreSQL tests covered host permissions, account bans, the idle deadline and the migration.

| Report ID | Request | Status and remaining work |
| --- | --- | --- |
| `976c4c7d-41d2-4d24-9b18-97614957a626` | Return to the main menu from party mode | **Implemented.** Menu → Leave room returns players to the join screen. The player keeps their seat and saved answers if they return. Real phones: exercise the menu during a round and return to the same room. |
| `679c0803-2891-473c-b23e-5de06429d498` | Leave from the end screen | **Implemented.** The party finale has its own Leave room link. Real phones: check that the action is reachable after a long scoreboard or awards sequence. |
| `fbe6dc10-3419-463f-8620-06f058a2f845` | Save my look equips the drawing or photo on the open tab | **Implemented.** With confirmation enabled, Save my look uploads the active drawing or equips the staged photo in the active tab. A draft on another tab does not override the current choice. Real phones: check camera and gallery selection, and retry a failed upload. |
| `7f84e2d9-be63-454a-abfe-25bb9e32debe` | Restyle Correct scores | **Implemented.** Correct scores opens one form with a player selector and a signed adjustment. Browser tests verify the saved adjustment reaches the player. Real device: review the layout with a long roster. |
| `edb34213-3f2f-4bb5-a13f-f7d88e23f120` | Host changes a player's picture or name, kicks or bans | **Implemented.** The host can rename, replace or remove a picture, and kick. A room ban applies to a signed-in account for that room. Guests can be kicked, and a fresh guest admission is still possible. Database tests cover host permissions, kick/rejoin, and room-specific bans. Real phones: verify the upload picker and kicked-player experience. |
| `1e6f0508-4ff1-4962-b110-b83b4f887dcb` | Close game manually or after per-game inactivity | **Implemented.** Room settings offers Close room. Game settings → Host tools configures the idle timeout in minutes, with 0 as the default. When no host or player is connected, a party room can time out. Database tests cover the stored deadline. Pi: check the full timer and reconnect behavior on a deployed server. |
| `c261101d-092f-4729-a902-533f1546dcf5` | Close idle games unless kept open | **Implemented.** Keep this room open overrides the game timeout for the current room. A host or player reconnect clears the deadline. Database tests cover reset, keep open, and expiry. Pi: retest across a temporary disconnect and backend restart. |
| `a20c6703-26e2-47aa-bad2-01501b2fc6d3` | Balance parties | **Built if this means equal team sizes.** Random assignment and Shuffle balance by player count when teams have no fixed target sizes. Clarify if the request means skill-based balance. |

References: [host room controls](../../apps/web/src/room/room-screen.tsx), [scoreboard](../../apps/web/src/room/results.tsx), [look builder](../../apps/web/src/players/look-builder.tsx), [host room-close route](../../apps/server/src/hosting/local-owner.ts), [team assignment](../../apps/server/src/game/teams/teams.ts).

## Editor, themes and media

| Report ID | Request | Status and remaining work |
| --- | --- | --- |
| `75ac2556-1380-4b88-8f62-5b45608771f0` | Single entry for picture/video round | **Built.** One add-scene entry creates it. Accepted media types are edited in the scene. |
| `af438a0a-1077-42d2-a2e2-9b63c7459c10` | Single entry for party choice | **Built.** Add Party choice directly and configure the decision and routes in its settings. |
| `d1bd317a-f35b-4c7f-b6c2-50e4821c8bff` | One writing round entry | **Implemented.** Writing opens directly in Add a scene and Add part. Prompt starters in the scene’s Content group insert a joke, caption, or excuse prompt. Device check: try starters and Undo with the on-screen keyboard. |
| `a0dfc568-cc8d-4ea4-b282-519237ff4b8f` | Dedicated intro scene | **Implemented as a template.** Between rounds → Intro adds an editable welcome cutscene carrying the game title. It supports regular cutscene media and presentation. Device check: rehearse an intro with media on a phone and shared TV. |
| `866611d7-92b2-4fc0-a2b0-8ac17edf62a7` | Space theme and planet variants | **Implemented for the planned Space preset.** Space is available in Look & feel and Admin → Join screen, with a dark palette and reduced-motion-aware starlight. Individual planet variants remain a separate follow-up. Device check: review readability on a TV and in bright light on a phone. |
| `5db00aa5-9ada-46a9-85ae-9662f9a66099` | First-run intro and customizable keybinds | **Implemented for the tour and map zoom.** A first-visit tour can be dismissed or reopened. Help & shortcuts lists the controls and lets each browser remap both map zoom shortcuts. Remapping other commands remains open. Device check: check keyboard navigation and storage on Firefox and Safari. |
| `e3acab8d-0222-4bd3-8f54-c51afdf567e1` | Replace an existing scene with a different type | **Implemented.** Replace scene type is available in Flow and Scene editor actions. It resets the scene to one part of the chosen type, keeps its position and compatible connections, and supports Undo. It blocks incompatible vote-source changes and replacement of a multi-exit branch. Device check: run replacement and undo in a shared edit session. |
| `8f7ccf96-fe9d-4b47-b803-31f1c8a99604` | Ctrl-drag to select multiple items | **Implemented.** Ctrl-, Command-, and Shift-drag from empty canvas box-select multiple scenes. Device check: verify Ctrl and Command on a physical Mac trackpad and Ctrl in Firefox. |
| `3d6e764d-5b8c-4371-84fd-fcb92ec2fb48` | Improve Where next | **Implemented.** Scene editor shows its next destinations and a visible action to open those connections in Flow. Device check: review multiple long branch names at a narrow width. |
| `fad0262c-7efa-4dd8-b3eb-8ec1a6c7be46` | Game and editor transitions | **Implemented for selected moments.** Scene changes and preview dialogs in the editor, result-card progression, and the join menu get short transitions that respect reduced motion. Existing authored scene animations still apply in live play. Device check: verify readability and playback on the Pi and shared TV. |
| `d97be7b2-e14c-4302-baef-98e1e69c88a7` | Main-page redesign and more styles | **Implemented for the join form.** The branded header, room code, and card spacing adapt to narrow screens. More options keeps sign-in, seat recovery, and Arcade together. Admin still controls the join look. Device check: review at 320 px and on iOS Safari with the keyboard open. |
| `cfc896ec-c22a-4cdd-9675-afd947d6232a` | Image/video attachments and stretched feedback Remove buttons | **Implemented.** Remove stays compact alongside the pointed element. Feedback accepts one private image up to 2 MB or one short clip up to 5 MB. The owner can preview or download it in Admin, and deleting the report deletes the file. Device check: attach from iOS and Android and play recordings from both browsers. |
| `d96ba2f5-f10d-4259-9962-69ddc332c79f` | Audio rounds, Spotify or YouTube | **Built for uploaded media and YouTube.** Questions can use songs and visible YouTube clips, with live YouTube verification still open. Spotify is excluded by the product plan for quizzes and games. |
| `72c78437-2f4f-419c-a336-9222c5fd9461` | Bottom-left edit history | **Built for the current visit.** History lists your edits and can restore earlier points. Cross-session history would be separate work if that is the intended scope. |
| `21871cec-1c16-4ae9-94ff-6c0f524a3d1f` | Data-driven scenes and AI prompt that asks follow-up questions | **Built for the current import format.** Copy instructions for an AI describes the available authoring options and tells the AI to ask questions first. A test tracks documented coverage. |
| `26cb0a71-123d-474b-afda-becbd73d89e3` | Try a single scene from the editor | **Built.** Try this scene opens an editor preview. Rehearse only this scene runs it in a practice room when it can run independently. |

References: [scene picker](../../apps/web/src/editor/controls/scene-palette.tsx), [scene editor](../../apps/web/src/editor/scene/scene-view.tsx), [editor history](../../apps/web/src/editor/shell/history-panel.tsx), [theme and animation presets](../../packages/contracts/src/presentation.ts), [AI instructions test](../../apps/server/test/authoring/ai-instructions.test.ts), [feedback help](../../README.md#2-feedback-bugs-wishes-and-minigame-ideas), [Spotify and YouTube decisions](../../APP_PLAN.md#owner-queue-19-november-2026).

## Social features and phone effects

| Report ID | Request | Status and remaining work |
| --- | --- | --- |
| `4f59f184-8273-4242-93f4-3cd41757b0de` | Playful reactions and scoreboard speech bubbles | **Partial.** Players can already send rate-limited emojis and stickers such as GG EZ to the shared screen. Scoreboard-linked bubbles and free text remain. Try preset reactions in the finale first. |
| `b7e48061-baad-4603-9eb8-eb62954d8e7a` | Room-wide, team and private chat | **Missing.** Existing reactions are preset content. Define who can see messages, host mute/report controls and retention. Start with room chat, then team chat and private messages if needed. |
| `d24172ca-a33a-4a0d-a11a-b623519400a4` | Phone audio and a list of phone inputs for game ideas | **Partial.** Phone sound, touch, drawing, photo input and vibration on supported devices already exist. Microphone-based play and a browser/device capability inventory remain. Start with opt-in, local-only sound detection on Android and iPhone. |
| `f1a0cb35-5ede-4227-9f98-c3cd1486128f` | Phone rumble | **Built for some events on supported browsers.** Score celebrations and pack effects already call the Vibration API. A wider haptics setting and physical-device verification remain if general rumble is wanted. |
| `5f2368cd-90c0-4d03-a98c-b1f714b37d5a` | Players choose a sound and screen effect before play | **Missing.** Players can toggle sound and customize their look. Add a game-enabled lobby setting with a small set of selectable effects. |

References: [reaction choices](../../packages/contracts/src/rooms.ts), [shared-screen reactions](../../apps/web/src/room-extras/reactions.tsx), [phone celebrations](../../apps/web/src/room-extras/celebrate.tsx), [pack effects](../../apps/web/src/side-games/packs.tsx).

## New minigames

| Report ID | Request | Status and remaining work |
| --- | --- | --- |
| `02327585-4c17-480d-9204-b90910f77e2a` | Speed run with optional hand-drawn obstacle course | **Missing.** Tap Race counts taps. Build a fixed-course time trial first, then add course drawing and validation. |
| `3f43c16a-87a8-4df5-be38-46dfb49358fd` | Teams draw animation frames and another team guesses the prompt | **Partial foundation.** Pass the pencil lets teams take turns adding to one picture, then vote. Separate frames, playback and the other team's guess are new work. |
| `b9ccc5c3-5ffa-420a-85f2-3279805a275a` | Random creature battle with one creature or a team | **Missing.** Start with an original one-creature turn-based battle and a small randomized move set. Review turn rules and team switching before adding full teams. |

References: [current minigame rules and catalog](../../packages/contracts/src/minigames.ts), [team drawing implementation](../../apps/web/src/minigames/relay-drawing.tsx).
