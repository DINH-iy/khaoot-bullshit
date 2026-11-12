# Home-server deployment target

Status: planning guidance, not an installed or benchmarked deployment. A local PostgreSQL/Prisma schema and migration foundation is implemented; durable gameplay services and production proxy configuration are not. Nothing has been deployed to the Pi.

## Hardware and capacity

The user's candidate is a Raspberry Pi 4 with 8 GB RAM, alternatively a NUC/mini PC. A single 20-player quiz is a plausible target for that Pi, subject to actual-device testing. This is an engineering estimate, not a benchmark or player-cap guarantee. Do not buy replacement hardware solely on this estimate.

Recommended setup:

- Supported 64-bit Linux; ARM64 on the Pi.
- SSD for the database and uploaded media; microSD need not hold write-heavy game data/logs.
- Wired Ethernet, adequate cooling, reliable power, and optional UPS for power-loss resilience.
- Backups on a different device/location, with restore testing.
- Built production frontend, one Node backend, PostgreSQL, and a reverse proxy.

A NUC can offer more headroom depending on the model and disk, while retaining the same application/database architecture. Verify target OS/runtime support. Architecture-specific dependencies must be installed/built for their destination; do not transfer macOS node_modules.

The laptop/TV browser renders the game and plays videos. Avoid server-side transcoding, large builds, or a full self-hosted observability cluster during play. Uploaded video traffic can exceed gameplay traffic; test it together with the quiz.

## Database decision

Keep PostgreSQL, a relational SQL database. Players, memberships, game versions, submissions, score operations, and audit/outbox records fit relational constraints and transactional updates. Run it locally/private to the server, not as a publicly exposed database.

SQLite is a valid lighter-weight alternative for a small single-server app; 20 connected phones alone do not make it unsuitable. Its single-writer model and simpler operations are a different tradeoff. We prefer PostgreSQL for the selected concurrency/transaction design and future multiple-room headroom. Do not maintain two database implementations in the initial release.

Prisma 7.10.1 is the installed access/migration layer, not the database itself. PostgreSQL 18.6 containers are configured locally. Verify the full deployment on the target Pi before claiming ARM64 production readiness.

Start with a small bounded pool (for example, 5 connections as a candidate to measure) shared by the backend. Tune pool size, shared buffers, per-query work memory, maintenance, and connection limits together. Defaults or dedicated-database-server percentage rules must not be applied blindly to a shared Pi. Keep durability settings enabled. Store media as files on a dedicated persistent path rather than database blobs; an S3-compatible backend can be added later if needed.

## Deployment responsibilities

| Service | Role |
| --- | --- |
| Reverse proxy | Serve compiled frontend/media, HTTPS, and API/WebSocket forwarding |
| Node backend | Rules, identity, state transitions, commands, scoring, persistence |
| PostgreSQL | Durable authoritative records and transactions |
| Supervisor | Start services on boot and restart failures |
| Lightweight monitoring | Bounded logs, resource checks, optional remote telemetry |

Caddy is one reverse-proxy candidate. Select the final service/container setup when deployment begins; neither Docker nor a specific proxy is required yet. When using Docker, verify ARM64 image support, pin supported versions, and persist data in explicit volumes. Proxy trust must be configured narrowly to match the chosen topology.

Internet access is required: players may connect over Wi-Fi or 5G independently of the host network. Use one public HTTPS/WSS origin with a deliberate tunnel/reverse proxy and stable hostname for production. The [phone checkpoint](../testing/network-checkpoint.md) uses an ephemeral Cloudflare tunnel to the development machine; it is not a Pi deployment. PostgreSQL remains private. External sign-in and YouTube require their own internet availability; fully offline play requires additional design.

## Target-device acceptance checks

- 20 players plus host/display, simultaneous deadline submissions and reconnects.
- Multi-hour memory, temperature, CPU/event-loop, queue and disk-space trends.
- Media playback/file traffic alongside gameplay and database writes.
- Reboot/process kill, persistence interruption, power-loss assumptions, and restore drills.
- Auth/provider reachability and private versus public access configuration.
- Performance budgets from APP_PLAN.md, measured on the actual home hardware.

## References

- [Pi 4 hardware specifications](https://www.raspberrypi.com/products/raspberry-pi-4-model-b/)
- [Node 24 platform support](https://github.com/nodejs/node/blob/v24.x/BUILDING.md)
- [PostgreSQL resource configuration](https://www.postgresql.org/docs/current/runtime-config-resource.html)
- [SQLite deployment tradeoffs](https://www.sqlite.org/whentouse.html)
- [Prisma system requirements](https://www.prisma.io/docs/orm/v7/reference/system-requirements)
- [Official PostgreSQL container images](https://hub.docker.com/_/postgres)
- [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
- [Caddy HTTPS behavior](https://caddyserver.com/docs/automatic-https)
