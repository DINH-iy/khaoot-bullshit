# Capacity load test

`npm run load` measures how many rooms can play at the same time on the machine it runs on. It is meant for the Pi (or NUC) itself; a laptop result says nothing about the Pi.

## What it does

- Starts its own copy of the built server on port 3101 (`--port`), with its own room secret and no owner access. A server you already have running is not touched, but it does compete for CPU: stop it first (`npm run stop`).
- For each level in `--rooms` (default `1,2,4,6,8,10,12,15,20`), opens that many synthetic rehearsal rooms. Each room gets a host and `--players` simulated phones (default 20).
- Each phone behaves like the web app: it re-reads the room on every change (debounced, one read at a time) and sends a heartbeat plus a re-read every 10 seconds. Each phone has its own visitor address, as real phones behind the Cloudflare tunnel do, so per-address limits apply per phone.
- Every room plays a quiz of `--questions` (default 6), with every third one a written answer. All rooms run at the same moment, which is the worst case; `--spread 60` starts them at random within a minute instead. Each phone answers after a random 0–`--think` seconds (default 3). The host closes and advances once everyone has answered.
- Stops at the first level that fails (`--keep-going` runs all levels). Closes every room it opened and revokes its credentials, also after Ctrl+C.

A level **passes** when:

- every phone joined,
- there were no errors,
- every acknowledged answer is stored exactly once,
- 95% of answers are confirmed within 500 ms (`--max-answer-p95`),
- 95% of phones show a new question within 1500 ms of the host pressing next (`--max-screen-p95`).

## Columns

| Column | Meaning |
| --- | --- |
| answer ms | Time from tapping an answer until the server confirms it (p50/p95/max) |
| screen ms | Time from the host pressing next until a phone shows the new question. Includes the 150 ms client debounce and the server's 250 ms notification tick |
| server cpu | Backend process; 100% = one core fully busy (avg/peak). The backend is single-threaded, so a peak near 100% means it is the bottleneck |
| srv RAM | Backend peak resident memory |
| pg cpu | All PostgreSQL processes together, peak (Linux only; macOS hides Docker processes) |
| mem free | Lowest MemAvailable during the level (Linux only) |
| temp | Peak SoC temperature (Pi). Around 80 °C the Pi 4 starts throttling |

The full numbers, including sync and heartbeat times, the generator's own CPU and the error codes, are saved in `.local/load-results/` (ignored by git).

## Running it on the Pi

It refuses to run unless `DATABASE_URL` is a local database whose name ends in `_dev` or `_load`. It also refuses while any room is running in that database, because a starting server pauses running rooms. Use a separate load database so test rooms never mix with real ones:

```sh
npm run build
docker exec party-game-builder-postgres-1 psql -U party_dev -d party_dev -c "CREATE DATABASE party_load"
export DATABASE_URL=postgresql://party_dev:<password>@127.0.0.1:55432/party_load   # the password from .env
npm run db:migrate:deploy
npm run load
npm run load -- --rooms 1,2,3,4,5 --players 30 --spread 30
```

The simulated phones run on the Pi too and use some of its CPU (shown as `generatorCpuPct` in the saved file), so the Pi's real capacity is a little higher than measured.

## What it does not cover

- Real phones, Wi-Fi/5G and the Cloudflare tunnel. Those are the [network checkpoint](network-checkpoint.md).
- Pictures, videos and drawings: upload and media traffic, where the Pi serves the files.
- Minigames with live taps, multi-hour soak and reconnect storms.

## Limits found in the code

- The server admits at most 511 connections in total: phones, host and shared screens together ([network.ts](../../apps/server/src/rooms/network.ts)). That is about 23 rooms of 20.
- If more than 100 rooms are running when the server starts, it refuses to start.
- The rate limiter keeps at most 4096 entries, about 4 per active phone. Beyond that, new requests are refused as rate-limited.

## Results

| Date | Machine | Rooms × phones | Result |
| --- | --- | --- | --- |
| 2026-11-19 | Developer Mac (M-series, 14 cores). Not the target hardware | 1, 4, 10 × 20, 3 questions | All passed. At 10 rooms: answer p95 267 ms, screen p95 633 ms, server CPU peak 88% of one core, server RAM 590 MB |
