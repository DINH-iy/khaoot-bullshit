# Party game builder

Browser frontend and authoritative TypeScript/Node.js backend. This checkout contains scaffolding plus the PostgreSQL/Prisma database foundation, not a playable game. Product decisions live in [APP_PLAN.md](APP_PLAN.md).

## Requirements and local commands

Use Node.js 24 LTS (`nvm use`) and npm 11.

```sh
npm ci
cp .env.example .env
npm run dev
```

Frontend: http://127.0.0.1:5173. Backend: http://127.0.0.1:3001. Vite proxies `/api` to the backend. To override the API port, update both `.env` and the development proxy. Nothing is deployed automatically.

```sh
npm run check       # types, tests, and production builds
npm test            # deterministic offline backend tests
npm run test:watch
npm run build
npm start -w @party/server
```

Build contracts before standalone package development/tests; the root commands handle this. Restart development after changing contracts, or rebuild contracts while watching. Production web files land in `apps/web/dist`; the API currently does not serve them. Deployment/static serving comes in a later slice.

## Package boundaries

- `apps/web`: React/Vite browser UI; presentation only.
- `apps/server`: Fastify API, authentication enforcement, logs and instrumentation.
- `packages/contracts`: public runtime schemas/types; no secrets or privileged engine code.

The UI is deliberately a foundation status page. Do not treat it as the game's visual design.

Detailed deployment notes live in [docs/deployment/raspberry-pi.md](docs/deployment/raspberry-pi.md). The target is a home-hosted Raspberry Pi 4 (8 GB) or NUC, with PostgreSQL and SSD-backed persistent storage. A local Docker PostgreSQL setup and migrations are available; nothing has been deployed to the home server. Folder and contributor conventions are in [AGENTS.md](AGENTS.md).

## Authentication boundary

Creator sign-in provider selection is deferred. There is **no development login bypass**, password store, sign-in screen, or token-issuing endpoint.

The backend can verify API access tokens from a configured OIDC provider using HTTPS JWKS, RS256 signatures, issuer, audience, subject, expiry, issue time, and a one-hour maximum token age. Set `AUTH_ISSUER`, `AUTH_AUDIENCE`, and `AUTH_JWKS_URL` together. Tokens are sent using an Authorization Bearer header. Configure a dedicated API access-token audience; this is not a browser ID-token login flow.

`/api/me` requires a verified identity. `/api/ops/metrics` also requires the trusted issuer's `ops:read` scope. A browser cannot grant itself scopes by sending IDs or role flags. There is no frontend token storage yet.

With no provider in development, protected endpoints return 503 and readiness is 503. Production startup refuses missing authentication configuration. Liveness stays 200 so a deployment does not endlessly restart just because sign-in is unconfigured.

This is the verification boundary, **not complete authentication**. Provider selection, browser sign-in/PKCE or backend session flow, revocation, guest player credentials, roles, rate limits, and WebSocket connection admission must be implemented before public use.

## Logs, timing, and health

- Fastify/Pino JSON logs include generated request IDs, version, route, status, duration, and errors. Request serializers omit headers, query strings, and bodies; configured sensitive fields are redacted.
- `Server-Timing` measures server work through response preparation. Completion logs/metrics measure the lifecycle through response completion. Neither includes phone/network/render time.
- `/api/health/live` reports process responsiveness. `/api/health/ready` checks authentication configuration and database connectivity. It does not prove provider availability, schema compatibility, or game readiness; migration/deploy checks are separate.
- `/api/ops/metrics` exposes fixed-size duration buckets, error/request counts, event-loop delay, memory and uptime to authorized operators. It also includes database pool measurements and last connectivity-probe timing. Metrics reset on process restart and are not a persistent monitoring system.
- Optional manual request spans export over OTLP/HTTP when `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is configured. No exporter or external network telemetry is enabled by default. Request spans are currently standalone; database spans and full browser/server trace correlation come later.
- SIGTERM/SIGINT trigger a bounded shutdown. Fatal exception monitoring logs available diagnostics without swallowing the crash. An external host/process supervisor is required for restarts.

Never commit `.env`, credentials, answers, or recovery codes in logs. Centralized error issue tracking, persistent dashboards, telemetry outage testing, and deployment alerts remain future work.

## Verification and next slice

CI runs type checking, offline tests and builds. Tests cover signed tokens and invalid claims, permission boundaries, configuration failures, error containment, log redaction, request limits, timings and health behavior. No tests depend on a live identity provider.

PostgreSQL schema, code-first migrations, typed client, and integration tests are now present. Next: choose creator authentication and implement durable command handlers, then guest sessions and real-time rooms. The first persistence milestone is a saved submission that survives a server kill/restart without duplicate effects. Integration tests prove database constraints and transaction behavior, not the full server-kill/reconnect recovery milestone.

The [next-phase sequence](APP_PLAN.md#26-next-phase-build-order-and-quality-gates) puts a small playable loop and basic creative mechanics before the editors. [Creative minigame research](docs/architecture/creative-minigames.md) covers avatars, drawing, jokes, team creation/animation and a customizable show-host character. The [testing/accessibility strategy](docs/architecture/testing-and-accessibility.md) defines planned E2E/regression coverage, responsive devices and accessibility gates. Those features and browser test suites are planned, not implemented.

## Editor design reference

The approved [interactive example](docs/design/editor-reference.html) shows Flow and Scene views of the same branching game. [Design notes](docs/design/README.md) preserve the user-supplied workspace styling references and explain the mockup limitations. Actual editors and snap-to-port interactions remain unimplemented.

The [private admin health example](docs/design/admin-health-reference.html) preserves the proposed diagnostics layout and local demonstration controls. Its measurements are illustrative; the actual dashboard remains unimplemented.

## PostgreSQL and code-first migrations

One database per environment holds both authoring and live-game tables. Sessions reference immutable game versions; both editors will use the same editable draft. See the [schema and migration guide](docs/architecture/database.md).

```sh
npm run db:env             # create ignored local credentials if .env does not exist
npm run db:up              # start persistent local PostgreSQL
npm run db:migrate:deploy  # apply reviewed migration files
npm run db:status
npm run db:test:up         # isolated disposable test service
npm run db:test           # migration and integration checks
npm run db:test:stop
```

Use Prisma **7.10.1** commands, not the current Prisma 8 prerelease workflow. `npm run db:migrate:create -- --name describe_change` generates SQL for review; `npm run db:migrate:dev` applies it to a guarded local development database. `npm run db:generate` is also run by root build/test/typecheck commands. No database is reset or migrated automatically by the web server.
