# Owner bar, signed-out message and real client IP (14 November 2026)

Branch `owner-nav-and-client-ip`, two commits:

```
a8cfa78  Add owner navigation bar and fix signed-out owner message
9861d33  Use the real visitor address behind a local cloudflared tunnel
```

Verified with `npm run check` (typecheck, 22 test files with 169 tests, builds). Not verified in a real browser, on a phone or through the real tunnel.

## Owner bar

- Code: `apps/web/src/owner/owner-nav.tsx`, `owner-nav.css`, `owner-session.ts`.
- Links: Play (`/`), Host (`/?host=1`), Editor (`/?host=1#my-games`), Admin (`/?admin`), People (`/?admin=people`). Shown on the host menu, the editor and the admin pages. The current section is marked with `aria-current`. The bar scrolls sideways at phone width and has visible keyboard focus.
- Shown only when `GET /api/host` succeeds. The host menu reuses its own menu request; the editor and admin pages each make one extra call on load. Cookies are never read in the browser.
- Editor leads to Your games on the host menu (the editor opens per game). The host menu scrolls there once the list has loaded, and the bar then highlights Editor.
- The admin page's own Feedback / People / Host menu links were replaced by the bar. A signed-out admin page therefore has no links back.
- The editor and admin pages are still separate lazy-loaded chunks. The bar itself is in the main bundle with the host menu.

## Player screen

- Never calls `/api/host`.
- The "Host a game instead" link on the join screen only shows in a browser that signed in as the owner before. This is a localStorage hint (`party.ownerBrowser`), never the key and never proof of anything. It is cleared only when the server answers that the browser is not the owner, not on a network error.

## Signed-out message

The host menu, Feedback and People now say: "This browser is not signed in as the owner. Open your private owner link once in this browser to sign in, then come back here." It replaces the old "npm run host" text, which was wrong on the hosted version, and says nothing about the key.

## Real client IP behind cloudflared

Behind a cloudflared tunnel on the same machine every request comes from `127.0.0.1`, so all per-address rate limits (join, feedback, owner sign-in, people, socket connects) were shared by every visitor.

- Setting: `TRUST_CLOUDFLARE_LOCAL` in `apps/server/src/config.ts`, default `false`. Logic in `apps/server/src/client-address.ts`.
- When `true` and the TCP peer is `127.0.0.1`, `::1` or `::ffff:127.0.0.1`, a single valid IP in `CF-Connecting-IP` becomes `request.ip`. The room and editor Socket.IO connect limits use the same rule.
- The header is ignored when the setting is off, when the peer is not loopback, and when it is missing, repeated, comma-joined, over-long or not a plain IP address.
- Fastify's `trustProxy` stays off: it reads `X-Forwarded-For` and also changes how host and protocol are read.
- Tests: `apps/server/test/client-address.test.ts` (header ignored when off, used for a loopback peer when on, ignored for other peers, invalid values ignored, different visitors get different addresses, config validation).
- Documented in `.env.example`; to use it, see [the Pi deployment notes](../deployment/raspberry-pi.md#cloudflare-tunnel-and-visitor-addresses).

## Not verified

- Playwright browser tests were not run; the bar has not been checked in a real browser or on a phone.
- Nothing has been tried through the real tunnel.
- No e2e tests were changed; the host-menu "Admin: …" links they click are still there.

## Running the tests on Windows

Vitest fails on every file with "failed to find the current suite" when started from a lower-case drive path (`c:\Projects\…`). Start it from `C:\Projects\…` instead. The project expects Node 24 (`engines`: `>=24 <25`).
