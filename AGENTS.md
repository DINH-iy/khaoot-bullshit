# Project conventions

## Scope and structure

- Read APP_PLAN.md for product decisions and README.md for what is actually implemented. Do not report planned capabilities as working features.
- Keep browser presentation in apps/web, authoritative logic in apps/server, and public runtime schemas/types in packages/contracts. Do not ship secrets, unrevealed answers, or privileged server implementation in browser bundles.
- Use feature/responsibility folders as modules grow. Keep entry points small and separate auth, room/game logic, scoring, persistence, and diagnostics. Avoid single giant files and generic dumping-ground utility modules; do not add empty speculative folders or unnecessary abstractions.
- Group tests by the feature they verify. Keep detailed architecture/deployment documents in docs/ and deployment assets in infra/ when needed. Root documents are README.md, APP_PLAN.md, and this file, alongside root tooling configuration.

## Reliability and home hosting

- Target a Raspberry Pi 4 with 8 GB RAM or a NUC, with 64-bit Linux. Verify ARM64 dependencies and measure actual hardware before claiming capacity.
- Use code-first Prisma definitions and version-controlled migrations for PostgreSQL. Review generated operations and test clean installs/upgrades; no untracked schema pushes or destructive resets on persistent databases. Pin the Prisma version and use its matching commands.
- PostgreSQL is the selected database. Keep durable state out of process-only memory. Preserve transactional command deduplication, score history, and explicit recovery as these features are introduced.
- Use bounded pools, queues, retries, telemetry, logs, and media preloading. Keep heavy processing off the live game path. Never disable database durability for speed.
- Keep credentials, .env files, runtime data, media uploads, database volumes, logs, and generated builds out of tracked source.

## Verification

- For code/dependency changes, run npm run check and relevant targeted checks. Add meaningful tests for permissions, transactions, state/scoring invariants, and recovery; avoid tests that merely mirror an implementation.
- For documentation-only changes, check links/consistency and git diff --check; do not run unrelated full test suites.
- Keep production sign-in fail-closed. No implicit development bypass in production paths.
- Distinguish local checks from actual-device load tests, provider integration tests, and deployments. Report remaining verification limits clearly.

## Dependency discipline

- Prefer browser/Node APIs and existing dependencies for straightforward work. Avoid unnecessary wrappers, large convenience packages and duplicative libraries. Review the purpose, maintenance, transitive dependencies and security advisories before adding a runtime package.
- Keep tests/tooling in development dependencies; keep the lockfile and CI audit current. Prefer small dependency-free packages for isolated algorithms where sensible. Do not replace vetted authentication/cryptography, database or networking foundations with improvised security-sensitive implementations merely to reduce package counts.
