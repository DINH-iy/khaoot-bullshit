# Running the party game: start, check, stop

How to launch everything on this computer, with a temporary public test link for phones, how to see what is running, and how to take it all down. Nothing here deletes games, players, pictures or database data.

## What you need

- Node.js 24 and Docker Desktop (running).
- Once, in the project folder:

```sh
npm ci                      # install
npm run db:env              # creates the private .env with generated secrets (only if it does not exist)
npm run db:up               # starts the game database (Docker)
npm run db:migrate:deploy   # brings the database up to date (safe to repeat)
```

Run `npm run db:migrate:deploy` again after pulling new code: it only adds what is new and never resets data.

## Option A: play on this computer only

```sh
npm run host
```

Builds the app, starts it and opens the host menu in your browser, signed in as the owner. Phones cannot reach it in this mode (it listens on this computer only). Stop it with Ctrl+C in that window, or `npm run stop`.

## Option B: play with phones, using a temporary test link

```sh
npm run build
npm run network:public
```

This starts the app and a temporary Cloudflare test link, prints `PUBLIC ADDRESS: https://….trycloudflare.com` and opens the host menu signed in. Phones (on any Wi-Fi or mobile data) open that address and join with the room code or the QR code.

Good to know:

- The test link is temporary: it changes every start and can expire after some hours. When it stops working, stop and start again; never reuse an old link.
- Keep the window running. Do **not** also run `npm run host` while it runs (it refuses now, with a message).
- Lost the host tab, or it says "not signed in"? Run `npm run host:link`: it opens the host menu again, signed in, on the running link.
- Your Mac says it cannot find the brand-new address for a few minutes (it looked it up too early)? Wait, or clear the Mac's lookup cache: `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`. Phones are not affected.
- The host key is part of the host link (after `#owner=`). Do not share that link or screenshots of it; players only need the room code.

### Updating the app while the test link runs

```sh
npm run build
npm run network:restart
```

The server restarts on the new version and the public address stays the same. Rooms that were running are paused; the host continues them. Rebuilding without the restart leaves the running server with a blank page, so always do both.

## Option C: the home server with your own domain (planned)

The final setup runs on the home server under `dinnyvanhuizen.com`, with a fixed address, HTTPS and sign-in for creators. It is not built yet; this guide gets that section when it is.

## Checking what runs

```sh
npm run status
```

Shows the app servers and public link of this project (with process numbers), whether the app answers on this computer and on the public link, and the database containers.

Other checks:

| Check | Command |
| --- | --- |
| Is the app healthy? | open `http://127.0.0.1:3001/api/health/live` (or the public address + `/api/health/live`) |
| Code checks and unit tests | `npm run check` |
| Database tests | `npm run db:test:up` once, then `npm run db:test` |
| Browser tests (desktop and phone) | `npm run test:e2e` (needs the test database) |
| Database up to date? | `npm run db:status`; `npm run db:drift` must say "No difference detected" |

The browser tests use their own server and database; they do not disturb a running test link.

## Taking everything down

```sh
npm run stop                 # app servers and the public link; the databases keep running
npm run stop -- --databases  # also stops both database containers (their data is kept)
```

Or press Ctrl+C in the window of `npm run host` / `npm run network:public`. `npm run stop` only touches this project's own processes and tells you what it stopped. After stopping the public link, its address is gone for good; the next start gives a new one.

Starting again later: `npm run db:up` (if you stopped the databases), then option A or B.

## When something looks wrong

| You see | Do this |
| --- | --- |
| A blank page on the test link | `npm run network:restart` (the app was rebuilt underneath the running server) |
| "This browser is not signed in as the owner" | `npm run host:link` |
| The test link does not open at all | `npm run status`; if it says "not reachable", `npm run stop` and start option B again |
| "address already in use" | Something is already running: `npm run status`, then `npm run stop` |
| Database errors when starting | Is Docker running? `npm run db:up`, then `npm run db:migrate:deploy` |
