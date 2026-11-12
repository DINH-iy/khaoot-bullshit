# Game contracts and durable commands

Implemented domain service, 11 November 2026, now integrated with the [verified room/network checkpoint](../testing/network-checkpoint.md). Editors and admin dashboard remain unbuilt; full creator browser sign-in/provider integration remains deferred. This document describes the internal command boundary beneath that gateway.

## Entry points and trust boundary

- [Public contracts](../../packages/contracts/src/game.ts): strict versioned command, input, receipt, safe-view and invalidation schemas. No correct-answer data or privileged scoring implementation.
- [Server definition](../../apps/server/src/game/definition.ts): validates private scoring, stage keys, routes, bounds, duplicate keys, unreachable nodes and cycles.
- [Prepared game](../../apps/server/src/game/prepared-game.ts): server-only quiz → judged challenge → text fixture, not an automatically seeded/published game.
- [Service](../../apps/server/src/game/service.ts), [handlers](../../apps/server/src/game/commands.ts), [authorization context](../../apps/server/src/game/model.ts) and [safe views](../../apps/server/src/game/views.ts).

`createGameService(prisma).execute(trustedActor, command)` is internal. The room gateway derives its actor from verified credentials, never a request's claimed role/player/creator ID. It enforces expiry/revocation on actions and retries; the service also rechecks supplied credential proofs within its transaction. Host ownership, active player membership and read-only display scope are checked server-side. There is no temporary authentication bypass.

Session creation uses an existing immutable GameVersion owned by the host. Normal creation requires verified creator identity; the explicit local rehearsal CLI provisions its own prepared version/session/grant. Guest joining uses room codes plus private credentials; UUIDs/nicknames are not admission credentials. Publishing and host-approved cross-device reclaim remain later work. Nothing is automatically seeded at startup.

## Definition format 1

The first executable definition has `formatVersion`, `title`, `startNodeKey`, nodes with stable keys and ordered internal stages, and explicitly keyed directed edges. Execution follows connections, not node-array order or canvas layout. Format 1 supports finite linear routes and multiple stages per node. Branches, loops, teams and richer capabilities require deliberate versioned extensions, not silently ignored fields. Earlier arbitrary JSONB objects in schema tests are not executable definitions.

| Stage | Contract and current execution |
| --- | --- |
| Choice collection | Public options; private optional correct-choice key and exact award. One final individual answer; correctness-only scoring. |
| Text collection | Bounded prompt/text input. No voting/automatic judging yet. |
| Drawing collection | Contract example only. Execution fails closed until asset validation exists. |
| Host challenge | Prompt and maximum individual award; close first, then one judgment per eligible player. |
| Duration | Contract permits a bounded nullable duration; only null/untimed stages execute now. |

Initial definition limits: 100 nodes, 20 stages per node, 200 stages total and bounded labels/options. These are resource budgets, not player caps. Definitions must match the supported format and canonical content hash before commands execute.

Untimed execution is deliberate: a receipt timestamp alone does not resolve an on-time answer queued behind a closing transaction. Implement the planned admission/closing reconciliation before enabling durations or speed scoring. Current manual close and submit actions follow session-lock order, not guaranteed arrival order; submissions encountering a closed stage fail. This is not the final timed fairness policy.

## Commands, revisions and transactions

Every command carries `formatVersion: 1`, `commandId`, `sessionId` and type. Host commands also require `expectedRevision`. Submissions carry their original `stageRunId` and typed value without a global revision, so unrelated players do not invalidate each other's answers.

| Command | Effect |
| --- | --- |
| session.create | Create one lobby from an owned supported version; expected revision 0 |
| session.start | Open first stage; snapshot current eligible players |
| submission.submit | Save one eligible final choice/text answer and supported private correctness award |
| stage.close | Close latest active stage; its recorded points become visible |
| stage.judge | Record one zero/nonzero judgment for an eligible player on the latest closed challenge |
| stage.advance | Open successor of latest closed stage, or finish session |
| session.pause / session.resume | Explicit host-controlled status change preserving saved work |

Same-key retries return the original receipt even after progression. Reusing a key with different normalized data returns `COMMAND_KEY_REUSED`. A fresh key cannot bypass one-answer/one-judgment rules. Host revision mismatches require refreshing/reviewing the state rather than blindly repeating an action with a new revision. Unknown fields, formats and unsupported capabilities fail explicitly.

Every writer takes the same PostgreSQL transaction-scoped advisory lock keyed by session UUID, including creation before its row exists. Hash collisions can serialize unrelated rooms but cannot mix their state. Future command writers must use this protocol; database owners/direct SQL are outside the application authorization boundary. Lock, statement, pool-acquisition and transaction durations are bounded. Infrastructure failures become sanitized `GAME_UNAVAILABLE`; the caller may reconcile/retry the original key after an uncertain outcome.

The interactive transaction writes state/submission, immutable receipt, judgment/score, revision, audit and pending outbox together. A receipt is returned only after commit. No network publication, media processing, remote dependency or telemetry observer runs inside it. [PostgreSQL locks](https://www.postgresql.org/docs/18/explicit-locking.html#ADVISORY-LOCKS), [Prisma 7 transactions](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions)

## Scores and safe views

Public amounts are exact decimal integer strings; server/database use BigInt/BIGINT. 1,000 milli-points = 1 point. Initial configured awards are nonnegative strings up to 12 digits; judgments cannot exceed their stage maximum. Teams, transfers, penalties and score corrections are not implemented here.

Quiz points persist with the answer, but open-stage correctness/amounts are absent from receipts, safe views and outbox payloads. Zero awards do not create ledger entries. StageJudgment separately records zero decisions, with unique stage+player, same-session stage/player/command foreign keys, a nonnegative check and immutable-history trigger. A future correction must append a separate corrective operation.

`readSessionView` reads a consistent database snapshot and explicitly projects only current prompt/input/status, closed-stage point totals and the requesting player's own accepted answer. It does not serialize definitions, future prompts, scoring keys or other players' entries; hosts receive no answer content through this safe projection. Totals remain exact strings; results/ranking presentation comes later.

Audit events contain references, not raw answers/jokes. Host/display/session-player outbox events are safe session/revision invalidations; a submitting player's own receipt has a distinct player-specific audience. The bounded publisher routes these to authorized role/player rooms. Never broadcast player-specific receipts to the room. Clients reload safe views and reconcile receipts; publication alone is not proof that all recipients received an event.

## Recovery and observability

The service has no authoritative in-memory game state. A fresh process can retry an uncertain command ID and read persisted state. The networking slice adds single-backend startup pausing, credential expiry/revocation and client state/receipt resynchronization. Multi-instance ownership and full game-night/Pi validation remain future work. Real-phone acceptance is still a required gate.

An optional observer receives only command type, committed/replayed/error outcome and monotonic elapsed milliseconds. It cannot break a committed action and receives no IDs, credentials or answer content. Networking wires it into sanitized server logs; persistent aggregation is future work.

## Verification

- Unit/property tests: exact award strings, strict command/view shapes, graph validity, unsupported timed/drawing execution, canonical hashes.
- Real PostgreSQL tests: retries/key reuse, 20 concurrent submissions, host conflicts, authorization, locked eligibility, privacy, zero judgments, text entry, completion and failing telemetry.
- A test-only outbox constraint forces late transaction failure and verifies submission/score/receipt/revision rollback before retry.
- Real child processes run the actual service and receive SIGKILL before commit, gated after score INSERT, and after commit. A fresh child retries and verifies one saved answer/score/audit plus pending notifications. This is process/service/database recovery testing, not browser/HTTP/socket E2E.
- Migration verification covers fresh installation, repeat deployment and populated upgrade through the new migration.

Run `npm run check`; start the isolated database with `npm run db:test:up`, then `npm run db:test`. Fault/crash tests are isolated to test targets and test-only database gates. There are no production crash hooks, unrestricted seed endpoints or login bypasses.
