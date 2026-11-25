# Tester feedback: what is still open

Feedback from the 14–15 November test evening and the owner's follow-ups through 19 November (groups A–Y) is built; that history is in git. This page keeps only what is still open: checks on real devices, reviews, and a few loose ends. Cleaned up on 25 November 2026. [Product plan](../../APP_PLAN.md) · [README](../../README.md) · [Feature feedback build plan](feedback-build-plan.md)

## Left to build

- The People leaderboard still needs individual credit for answers submitted as a team. Tracked in the [product plan](../../APP_PLAN.md#owner-queue-19-november-2026), with the media follow-ups (captions and alt text, more host playback control, playlist shuffle and fades, event sounds).

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

## Reviews

- The owner's review in the browser of **H1–H3, I1, S, T, U, W, X1–X5 and X8–X12** is unconfirmed.
- Check **Admin → Feedback** before closing reports: fixed reports of groups A–G and P still showed **New** when last checked.

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

## Known limits and test notes

- The Android *hosting* test can miss its 20-second question on a slow PC; *routes* on Android was flaky once.
- A drawing sent when time runs out needs two requests within 3 seconds; a very slow connection can still miss it.
- Back to lobby gives the room a new code (the old room's scores are history and are never rewritten). Guests' chips belong to one room, so they start over; people keep theirs.
