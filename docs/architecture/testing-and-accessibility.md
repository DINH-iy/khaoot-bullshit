# Testing, accessibility, and device support

Strategy, 11 November 2026. Unit/API/PostgreSQL tests, Socket.IO protocol tests and initial Playwright desktop/Android-emulated browser flows with axe checks now exist. Broad visual baselines, soak/load suites and later product screens remain planned. See [current networking evidence and real-phone gate](../testing/network-checkpoint.md) and [APP_PLAN.md](../../APP_PLAN.md#26-next-phase-build-order-and-quality-gates).

## Quality starts with each feature

Every feature specifies happy path, permissions, failure/recovery, input/device behavior, and relevant accessibility checks before implementation. Tests protect observable behavior and domain invariants rather than mirroring functions or asserting framework internals. Regression testing is an ongoing practice across layers, not a separate tool: reproduce a bug at the cheapest realistic layer, fix it, and keep that case.

| Layer | Planned tools / location | Important examples |
| --- | --- | --- |
| Unit and property tests | Existing Vitest + fast-check; feature tests under server/web/contracts as needed | Deadlines, score conservation/remainders, eligibility, no duplicate awards, graph validation, drawing bounds, deterministic random outcomes |
| API/service integration | Fastify injection and real PostgreSQL test target | Authorization, concurrent host actions, idempotency/request-hash conflicts, atomic command/submission/score/outbox writes, assets/creation ownership |
| Migration and storage integration | Existing isolated migration tests, extend for asset lifecycle | Fresh install and populated upgrade, schema protections, staged file/DB failures, reconciliation, coordinated restore |
| UI/component behavior | Vitest with DOM tooling selected when UI exists; browser test when layout/input matters | Validation, labels, focus transitions, pending/saved states, keyboard alternatives; avoid duplicating full E2E flows |
| Browser E2E | Playwright, planned root tests/e2e/ and shared fixtures | Independent host/display/phone contexts exercise actual frontend, backend and test database |
| Accessibility | axe-core through Playwright plus manual testing | Dynamic states, dialogs, forms, focus, keyboard-only routes, screen reader, touch and zoom |
| Visual regressions | Small selected Playwright screenshot suite | Phone layout, host/display, scene/flow editors, light/dark, long names, empty/error/reconnecting states |
| Protocol/load/recovery | Socket.IO-aware clients, Artillery as candidate; isolated crash harness | Twenty-plus clients, simultaneous saves/reconnects, slow consumers, dropped acknowledgements, real process kill/restart, soak tests |

Use short deterministic tests for arithmetic and transitions; use a real database for transactional guarantees. Do not claim client recreation is a server-crash test. Mock dependencies to exercise error handling, but keep true end-to-end cases that do not mock the behavior being proved. No arbitrary global coverage percentage substitutes for covered risks; track critical invariants and user journeys explicitly.

Playwright recommends user-visible assertions and isolated tests; its retrying assertions support waiting for actual states rather than fixed sleeps. [Best practices](https://playwright.dev/docs/best-practices), [assertions](https://playwright.dev/docs/test-assertions)

## End-to-end order and isolation

Add the first browser smoke test when joining/host screens exist, before editors. Use distinct browser contexts for host, shared display, each representative player and an unauthorized visitor. Separate contexts prevent accidental credential/storage sharing. Run against isolated test data and clean up only that run's records/files. Existing database scripts allow only explicitly local _test targets; additional E2E setup/cleanup must preserve that safety boundary and accommodate immutable-history constraints.

Use a local test identity issuer/signing setup for deterministic auth E2E; it exists only in the test environment and must not introduce a production login bypass. Run separate explicit real-provider smoke checks after provider selection. Seed prepared versioned games through a test fixture/service; do not add unprotected production seed endpoints. Fixtures should be small and explicit, not dependent on a giant reference game for every test.

Core browser scenarios, introduced as features arrive:

1. Host creates a prepared session; phones join by code, choose names/icons, and see the correct lobby/team state. Private host fields are absent from player/shared payloads.
2. A player submits privately, sees server confirmation, refreshes, and sees the accepted state; another player's phone cannot fetch that answer.
3. Host judges a physical challenge and awards points. Lost acknowledgements/retries leave one accepted effect and correct individual/team totals.
4. Late join/reclaim follows eligibility; expired/revoked credentials and cross-room asset/command requests fail safely.
5. A crash immediately before/after persistence restores the correct answer, score history and presentation. Unconfirmed work is reconciled instead of silently discarded or falsely called saved.
6. Jokes/captions are safely rendered, anonymous entries reveal only when permitted, and self-voting/ties/empty submissions follow configured rules.
7. Avatar/image uploads reject malformed/oversized content; drawing drafts restore with honest save status; final drawings survive retry/restart and cannot be fetched before reveal.
8. A secret-choice round locks choices, resolves once and presents the same result after reconnect. A party-choice route persists before navigation and reaches its defined rejoin.
9. Keyboard-only and touch flows reach essential actions with visible focus; on-screen keyboard/rotation/zoom never hide submit, skip or recovery controls.
10. Later, edit/save/reopen/publish a branching game in both editors; test semantic consistency separately from selected visual screenshots. Add custom character mute/skip/fallback and media failures when built.

Check authoritative API/database state alongside UI confirmation where needed. Never assert reliability solely from a green toast. Exercise privacy at payload/endpoint boundaries as well as visible UI. Browser offline simulation covers some network failure paths, not every form of packet loss, OS suspension, Wi-Fi switch, or process crash; dedicated fault tests and real devices cover the rest.

## Device and browser matrix

Playwright supports Chromium, Firefox, WebKit and device emulation; emulation changes browser/device settings but is not an actual iPhone or Android device. [Emulation documentation](https://playwright.dev/docs/emulation)

| Surface | Design priority | Planned checks |
| --- | --- | --- |
| Player controller | Mobile first, portrait and landscape; tablet/desktop remain usable | Small phone width through tablet, touch/mouse/pen, virtual keyboard, safe areas, zoom/text enlargement, iOS Safari and Android Chrome on real devices |
| Host controls | Laptop plus usable phone/tablet control layout | Narrow stacked controls, visible pending/destructive actions, screen-reader and keyboard navigation, one/separate-display modes |
| Shared display | Laptop/TV/projector, common widescreen and smaller window | Readability from the room, scaled/long content, reconnect overlay, audio ownership, no leaked private controls |
| Scene/flow editors | Desktop first, keyboard/mouse primary, touch/pen where practical | Ordinary laptop sizes, larger screens, browser zoom, pane collapse, reachable settings, keyboard/no-drag editing; no promise of full phone authoring in the first release |
| Admin health | Desktop first with readable responsive diagnostics | No critical controls clipped on a smaller screen; table overflow scoped; permissions and clear unknown/stale signals |

Use representative controller widths such as 320, 375/390, 768 CSS pixels and desktop layouts such as 1280 and 1440, plus nearby widths to catch breakpoint bugs. These are test samples, not hardcoded supported-device limits. Choose exact minimum OS/browser versions before release based on capability checks and actual testing; do not silently require a particular phone brand. Keep a versioned support matrix and dated results.

Run real-phone checks on HTTPS over actual Wi-Fi, including refresh, lock/unlock, background/foreground, low-memory interruptions, orientation, slow upload, and network switching. Include at least one modest Android device and an iPhone. Use the Pi/NUC for final capacity evidence; a developer laptop or CI runner is not a proxy for target hardware.

## Accessibility requirements

Target WCAG 2.2 AA for application chrome and ordinary controls; document mechanic-specific barriers and alternatives without making an unverified whole-product conformance claim. Use native semantic controls, programmatic labels, clear errors, sensible heading/landmark order, visible focus and predictable focus restoration. Text alternatives for avatar art identify the player; decorative art should not repeat the adjacent name to screen readers.

The [WCAG 2.2 standard](https://www.w3.org/TR/WCAG22/) provides the basis for keyboard operation, contrast, non-color cues, status messages, target sizing, and focus. Our implementation checks include readable contrast (ordinary text at least 4.5:1; qualifying large text 3:1; applicable non-text controls 3:1), visible selected/correct/error labels beyond color, and no focus obscured by dialogs or sticky panels. Prefer roughly 44 CSS-pixel effective phone targets; assess WCAG's 24 CSS-pixel minimum and exceptions separately. Do not pack neighboring hit areas so they overlap.

Phone forms and ordinary editor panels must reflow without lost actions at narrow widths and zoom. Do not disable browser zoom. A genuinely spatial graph/canvas can pan in two dimensions, but surrounding forms/toolbars must remain usable. Desktop-first does not waive accessibility. [Reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)

Drag-to-connect, scene reordering, sliders and node placement need a simple click/tap alternative where applicable, as well as keyboard operation. For example: select a source port, select a destination, confirm; use Move before/after actions for the scene list. Keyboard support alone does not provide the required non-drag pointer alternative. [Dragging guidance](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements)

Timers offer untimed/extended modes or host-controlled accommodations where the mechanic permits; disclose essential timing constraints and provide suitable alternate rounds. Do not blanket-exempt all game UI from timing accessibility because one competitive mechanic needs time limits. Warnings and extensions must themselves be accessible. [Timing guidance](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html)

Give concise announcements for meaningful stage/save/error changes, not every countdown tick, stroke or scoreboard animation. Preserve entered text and drafts after validation errors. Honor reduced motion; avoid flashing and essential information conveyed only through animation/audio. Provide captions/text for custom host speech and instructions, mute/volume control, and a static results view. Avoid hover-only actions and unnecessarily forced orientation/fullscreen.

Drawing itself can depend on visual/spatial or motor skills; adding a canvas label does not make that mechanic accessible. Keep tools keyboard operable, provide clear instructions, and plan alternative contribution roles or comparable text/choice rounds where practical. Record limitations and scoring implications with the template; do not silently replace someone's entry or claim equivalent access without testing with users. A full configurable game can still exclude people if its chosen mechanics lack alternatives; rehearsal should surface those requirements.

Automated axe scans catch only some issues; manual keyboard, screen-reader, zoom and real touch testing remains necessary. Include VoiceOver on iOS/macOS and NVDA on Windows where available. Test empty, error, pending, disconnected, modal and revealed states, not only the landing screen. [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing)

## Regression discipline and CI

As the relevant suites are implemented:

- Each pull request: existing types/build/unit/API/database/migration checks, critical Chromium E2E and targeted accessibility scans. Add changed-feature regressions. Keep suite duration bounded.
- Broader CI lane: critical flows in WebKit/Firefox, selected responsive/light-dark snapshots, recovery/concurrency/asset tests. Run on relevant changes and before release; use scheduled runs only if later explicitly configured.
- Release gate: full reference game, actual phones, human accessibility review, protocol-aware 20-player load plus higher-load headroom, multi-hour soak, restart/storage fault tests, and coordinated backup restore.

Use role/label locators where they reflect the UI; stable test IDs are a fallback, not a reason to omit accessible names. Wait for meaningful state with bounded assertions, not arbitrary sleeps. Use reproducible seeds and controllable domain clocks in unit tests; keep true real-time browser/protocol cases for timing integration. Browser clock mocking alone cannot prove a server deadline policy.

Visual baselines cover selected high-value states under fixed browser/OS/fonts/data. Review diffs; do not automatically approve them or snapshot the whole app indiscriminately. Each functional defect belongs in a behavioral test even if a screenshot also changes. [Visual comparisons](https://playwright.dev/docs/test-snapshots)

Capture failure traces/screenshots and sanitized logs with bounded retention. Test artifacts can contain answers, names, tokens or pictures: use synthetic content, restrict access, and redact where possible. Record intermittent failures and fix them; limited diagnostic retries must not hide flaky behavior. Never point crash/load tests or cleanup at a live party database.

## A feature is ready when

Its supported modes are explicit, relevant unit/integration/E2E regressions pass, keyboard and touch actions work, responsive/zoom states are checked, privacy and failure behavior are verified, and real-device limitations are recorded. Confirmed submissions and points survive the tested failure model. Outstanding essential accessibility, data-loss, or authorization defects block that feature's release. Tests grow with behavior; do not create placeholder suites or brittle tests for features that do not exist yet.
