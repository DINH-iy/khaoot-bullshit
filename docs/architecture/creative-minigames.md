# Creative minigames: research and technical direction

Planning/research, 11 November 2026. No drawing tools, uploads, minigames, avatar services, animation system, or show-host character are implemented by this document. See [APP_PLAN.md](../../APP_PLAN.md#25-player-customization-and-creative-minigames) for product scope and [testing/accessibility](testing-and-accessibility.md) for release gates.

## Inspiration and what it does not prove

Nintendo's [Mario Party minigame catalog](https://media.nintendo.com/supermarioparty/minigames/) demonstrates free-for-all, team, and asymmetric formats. [Drawful](https://www.jackboxgames.com/games/drawful) combines private mobile drawing, invented titles, and reveals. [skribbl.io](https://skribbl.io/) uses rotating drawing and guessing turns. These support the proposed variety of mechanics, not a claim that their implementations or player capacities transfer to ours. Create original names, prompts, art, sound, and presentation.

## Research findings and project decisions

| Finding | Consequence for this project | Primary documentation |
| --- | --- | --- |
| Pointer Events support drawing with touch, pen, and mouse; browser gestures can interfere with a canvas | Reuse one input model; limit touch-gesture suppression to the drawing surface; handle cancellation | [MDN Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Using_Pointer_Events) |
| Hidden tabs can throttle timers and stop animation callbacks | Resynchronize on return; never count rendered frames or client timer ticks as authoritative score/time | [Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API), [requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) |
| IndexedDB works asynchronously; browser storage has quotas and can be evicted | Local draft recovery is useful but must not be presented as server confirmation | [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), [storage eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) |
| Socket.IO defaults to at-most-once arrival; recovery may fail | Use durable commands and snapshots for accepted content, bounded transient updates for previews | [Delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/), [connection recovery](https://socket.io/docs/v4/connection-state-recovery/) |
| File extensions and MIME headers are not trustworthy by themselves | Validate actual image content and sizes, generate storage keys, and restrict access | [OWASP uploads](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) |
| Canvas export requires origin-clean content and may fail | Do not draw arbitrary external images into editable canvases; handle export errors and null output | [Canvas toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob) |

Everything below is a project design recommendation informed by those constraints, not a guarantee provided by a library. Numerical limits must be benchmarked before acceptance.

## Player identity and customization

Use the existing session player ID and credential independently of display name/avatar. Names are bounded plain text, safely rendered, with Unicode handling, wrapping, and a readable duplicate-name discriminator. Do not require unique names or use them for reclaim. Define user-visible character-count rules as well as byte/storage limits; the current database column alone is not the complete policy.

Offer a bundled icon immediately and allow avatar setup to be skipped. Add a small reusable drawing pad and validated picture upload after the asset service exists. Keep a fallback icon while processing fails or is pending. Guests need no permanent account. Session-scoped customization survives refresh/reconnect through server-confirmed profile state; automatic cross-game retention is deferred.

Host controls can rename players and hide/reset inappropriate avatars or creations. Define whether profiles may change during active rounds; default to between stages. Historical entries retain stable author IDs. Avoid copying personal images into immutable audit/event payloads; record a reference and moderation action. Anonymity hides authorship from eligible viewers until the configured reveal; it does not prevent the trusted server from knowing the author or a friend recognizing a drawing style.

## A reusable mechanic contract

Separate participation topology from score recipients. Support individual, fixed team, rotating representative, cooperative, and one-versus-many configurations only where a mechanic declares them compatible. One-versus-many needs its own balancing rules; changing 1-vs-3 to 1-vs-19 is not automatically fair.

A versioned mechanic definition declares:

- Supported input kinds: choice, text, drawing reference, frame sequence, or a bounded live-input mode.
- Roles and private/public presentation, including what a participating host may see.
- Stages such as instruct, create, lock, reveal, judge/vote, resolve, and results; optional/repeated stages are explicit.
- Timing, editing window, eligible actor snapshot, turn/contribution ownership, completion rules, and late-join behavior.
- Result data, scoring adapter, ties, empty entries, disconnected actors, and host pause/skip/void paths.
- Required capabilities, payload/work limits, definition/input format versions, and accessibility alternatives.

Use trusted application-owned handlers with schemas and explicit state transitions. Store configured parameters in definitions; do not build a general scripting language, runtime plugin loader, or a huge universal minigame interpreter now. Register a few supported mechanics as they are implemented. Rehearsal and future editors consume the same contract; UI layout never decides execution order.

Twenty-player pacing needs design as well as capacity tests. Use simultaneous creation, reveal batches, representative rotation, or configurable short showcases. Twenty one-minute solo turns already take twenty minutes before instructions/results. Do not invent round-robin matches or elimination silently; expose schedules, byes, vote groups, and score normalization. Late joiners do not change locked voter/entry sets halfway through a result.

## Storage and database evolution

Keep the single PostgreSQL database per environment. Existing models have names, JSONB submissions, stages, lineups, commands, and scores; they do not yet have an asset catalog, avatar references, creation lineage, or contribution ownership. JSONB capacity does not implement those features.

Proposed additions, to design and migrate only in the relevant build slice:

| Responsibility | Proposed records/fields | Required boundary |
| --- | --- | --- |
| Profile image | Nullable validated avatar reference or bundled-icon identifier on player profile | Same-session ownership, moderation, safe replacement |
| Stored media | Asset metadata: owner/scope, generated storage key, detected type, dimensions/bytes, hash, status, retention | No raw paths/credentials exposed; access checked separately from ID knowledge |
| Creation history | Drawing document/checkpoint revisions and finalized immutable creation references | Stable document/schema version; optimistic revision conflict detection |
| Relays/animation | Parent creation, ordered frame/contribution slot, author, turn revision and assignment | No overwriting another player's turn or another session's creation |

Store raster files in an SSD-backed managed directory outside the public webroot initially; keep metadata/references in PostgreSQL. Store small bounded stroke documents/checkpoints as versioned structured data when suitable. Do not put base64 images or every pointer event in submission/audit JSON. A validated file ID is not permission to view an unrevealed drawing. Public or long-lived static URLs would defeat reveal rules; protected delivery must respect stage/role and cache policy. Never preload private art to unauthorized devices.

Database and filesystem writes are not one transaction. Use an explicit staged lifecycle: authorized upload → temporary quarantine → bounded validation/normalization → durable finalized file → ready metadata → final submission command. A submission may reference only a ready asset in its allowed scope. Confirm acceptance after the required file-durability step and database commit. Use unique upload/finalization keys so retries are safe, plus reconciliation for orphaned files, interrupted processing, missing files and disk-full errors. Finalized content is immutable; edits create a revision. Persist enough recovery state to retry or report failure rather than silently accepting a broken reference.

Back up database and assets as a coordinated recoverable set and test restoration. Deletion needs a separate retention design: existing immutable-history triggers intentionally restrict deletes, while personal media must not become undeletable through embedded copies. Keep personal content out of append-only logs and plan reference tombstones/purge permissions before retention is released. This is an engineering dependency, not a researched legal compliance conclusion.

## Drawing, submission and deadlines

Start with Canvas 2D and normalized logical coordinates, a bounded device-pixel ratio, a small palette/brush set, undo/clear, and an explicit submit action. Handle pointer capture/cancel, resize/orientation without clearing artwork, keyboard focus, and page scroll outside the pad. Pressure is optional; drawing must work without a stylus. Bound points, strokes, undo memory and canvas pixels. Avoid React state updates for every raw point; coalesce input and paint locally on animation frames. Profile before adding OffscreenCanvas, workers, or a new rendering dependency.

Use draft ID + stage/player + schema/revision for recovery. Periodically save a bounded draft to IndexedDB; add server checkpoints when the drawing round needs them. Show distinct states: local draft, server checkpoint saved, submitting, and accepted. Local storage failures are visible and never block ordinary submission. Restore only the matching stage/identity and reconcile with server state. Do not rely on a final page-close event to save the last stroke; a hard kill may lose work since the last checkpoint.

For the first drawing round, freeze edits at the authoritative drawing deadline, then allow a separately configured submission stage with a stated deadline. No votes/reveals start before that stage closes. This reduces upload races but cannot prove an untrusted client stopped editing on time. Accept only a server-received eligible version; never trust client timestamps. A future stricter live-drawing mechanic needs sequenced server-received operations/checkpoints and its own fairness policy. The host can explicitly extend/void under the existing audited rules.

Final creation acceptance stores the command result, asset/document reference, stage state and outbox event atomically in PostgreSQL. Retrying after a lost acknowledgement returns the same result. Duplicate-command protection does not mean transports deliver exactly once. Draft checkpoint revisions and final submission revisions are separate; an old draft cannot overwrite a finalized entry.

## Live drawing, relays, and animation

Build in increasing consistency complexity:

1. Independent private drawings, finalized and then revealed.
2. Single-author live drawing with server-validated batched operations, sequence IDs, checkpoints and authorized viewers. Define undo/clear ordering; recover missing operations through a checkpoint plus ordered tail.
3. Turn-based creation chains and team relay. Persist assignment/turn ownership and creation ancestry; define timeout handoff and departed-player behavior.
4. Frame-by-frame team animation. One author per frame/turn first, bounded frame count/resolution/playback duration, private previous-frame or onion-skin view as configured. Persist frame order and completion, not video frames at playback frequency.
5. Simultaneous shared canvases only after a dedicated conflict/undo prototype. An operation log, server ordering, ownership rules, or CRDT has tradeoffs; do not add a CRDT merely because drawing exists.

Preview traffic may be dropped/coalesced under load, but authoritative operations/checkpoints cannot be treated as disposable if required to recover accepted work. Bound per-player and room work, queue length, and outgoing fan-out; disconnect or resynchronize slow consumers rather than buffering forever. Twenty producers sending to nineteen peers can multiply traffic even when each message is small. Authorize each action and room audience, not just the initial connection. [OWASP WebSocket guidance](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)

Guessing uses server-private prompts and server-side normalization, duplicate/rate handling, and correctness checks. Never send the answer to every phone and hide it with CSS. Do not broadcast successful guesses as plaintext while others are still guessing. Voting uses locked entry/voter sets, ownership restrictions, deterministic ties, and exactly-once score effects through existing command/ledger rules.

Animation playback stays on the host/display browser; avoid server video encoding during play on the Pi. A slideshow is the first fallback. Refresh rate must not affect playback speed or scores. Keep exports optional; video encoding and browser codec support are later research.

## Upload safety and resource budgets

Initial image support should be a narrow allowlist such as PNG/JPEG/WebP, decoded and normalized with orientation handled and metadata stripped. Do not initially accept SVG, HTML, arbitrary animated files, remote avatar URLs, or raw camera/video streams. Generated raster/drawing content is still untrusted input. Isolate heavy decode/normalization in bounded work with time/memory/concurrency limits and verify target ARM64 support before selecting an image library. Local storage serving checks authorization; thumbnails have the same privacy classification as originals.

Define tested limits for encoded bytes, decoded pixels, request rate, per-session storage, checkpoint frequency, strokes/points, frames and concurrent processing before each feature ships. These are resource controls, not an arbitrary game-player cap. Start from explicit conservative values during implementation and record benchmark-based adjustments. Browser resize is an optimization only; repeat server validation. Show useful retry/error states without exposing parser details.

Measure draw-input-to-paint delay, long tasks, dropped preview batches, checkpoint/final-save latency, reconnect snapshot bytes/time, upload/processing queues, file failures, and disk usage. Report p95/p99/window/sample counts as applicable. Never log raw strokes, pictures, jokes, prompts or guesses. Diagnostics failing must not block play.

## Customizable show-host character

An optional puppet, minion, mascot, or other original character can introduce the game, explain rounds, react to results, bridge scenes, and celebrate the finale. It belongs to game presentation, separate from the human host's authority and builder workspace appearance.

Plan a game-level character definition with name, supplied/uploaded art, supported poses/expressions, position/size, dialogue, prerecorded voice clips, sounds, supported transitions, and per-round overrides. A bounded set of character assets and cues can express many styles; fully customizable does not mean arbitrary executable code or unlimited media. No paid AI or external voice service is required for the baseline.

First use static poses, dialogue/caption panels, and optional short clips. Add authored sprite/pose sequences after media reliability; rigged animation, generated dialogue, TTS, lip sync and conversational AI are separate later decisions. A cue has a stable ID, trigger, priority, media references and fallback. Triggers include game opening, instructions, stage start/end, reveal, scores and finale. Decorative cues never advance stages or award points. An authored character cutscene that intentionally waits for completion uses normal bounded stage/skip rules.

One selected display owns shared voice/audio. Support mute, skip, captions/transcript, reduced motion, and replay with explicit behavior after reconnect. Recover current presentation state without replaying every old reaction. Prevent overlapping announcements; deduplicate cues and cap queue length/duration. If assets/audio fail, display text or continue without the character. Keep controls, answer choices and TV captions unobscured; express results in readable UI independently of voice or character gestures.

Use the same asset validation/retention rules as other media. Test repeated cues, reconnect, autoplay denial, missing art/audio, hidden tabs, reduced motion and extra Pi/network load. This is presentation work after the reliable loop and basic creative rounds, not an engine dependency.

## Technical debt and explicit deferrals

| Risk or tempting shortcut | Planned mitigation / exit condition |
| --- | --- |
| Quiz-only fields spread through host/phone UI | Typed input/stage capabilities; prove text plus drawing plus choice before editor schema stabilizes |
| Overbuilding a universal game engine | Implement a few trusted handlers and versioned definitions; general stage editing follows real use |
| Raw pointer events written to PostgreSQL/audit | Bounded local rendering, batching/checkpoints and separate durable finalization |
| In-memory socket ID used as player identity | Stable player credential, permission checks, role-filtered resynchronization |
| Files accepted before they are recoverably stored | Explicit lifecycle, reconciliation, restore tests and failure states |
| Team collaboration implemented by last-write-wins | Turn ownership first; prototype concurrent conflict/undo before enabling shared drawing |
| Precision games trust phone clocks or frame counts | Defer ranked reflex/rhythm modes; design and measure fairness separately |
| Every new game adds bespoke transport/scoring | Reuse command, stage, role, asset, judging/voting and score boundaries |
| Fun presentation blocks gameplay | Bounded optional character/media cues; text fallback and human-host escape paths |
| Data deletion conflicts with immutable history | Reference personal assets, avoid raw copies, design purge/tombstones before retention ships |
| Browser emulation mistaken for real-device evidence | Real phones, actual Wi-Fi and Pi/NUC measurements before capacity/support claims |

Open decisions: upload/drawing limits, local draft lifetime, retention/purge policy, supported browser versions, score normalization for unequal teams, strict live-drawing deadline behavior, precise reaction fairness, and simultaneous-canvas conflict strategy. Only the last two require advanced real-time work; they do not block the first drawing/voting game.
