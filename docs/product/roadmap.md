# Roadmap: what is next

Updated 13 November 2026. The owner's wishes and decisions, in build order. Details and history are in [APP_PLAN.md](../../APP_PLAN.md) (section 26); ideas for new game types are in the [game catalog](game-catalog.md); how to start and stop everything is in [Running the party game](../guides/running.md).

## Done recently

- Room polish after the first two-phone test:
  - host menu with game covers and details
  - one round phase at a time on phones, with scores, players, reactions, break and sound in a bottom bar
  - a "+points" celebration with sound
  - host room settings: secret scores, reactions with a limit and allowed set, break voting, "end a round N seconds after everyone answered"
- Wheel of fortune, smoke break, end-of-game awards, and the game-length estimate in the editor.
- Running guide with `npm run status`, `npm run stop` and `npm run host:link`.
- Editing a game together, live: other people's changes, selected scenes and pointers show at once; changes to different things are merged; undo/redo only affects your own steps. Everyone still opens the editor with the owner link.

## Next, in order

1. **Own media in scenes:** pictures, sounds and music that the author uploads for scenes.
2. **Own reactions and sounds** (needs step 1):
   - authors add their own reactions: emoji, text, small pictures (WebP), stickers and GIFs, no video
   - a limited soundboard
   - each team picks or uploads a winning sound and defines its own celebration: particles, emoji, text
3. **Languages:**
   - Dutch, English and Romanian, for the app (host menu, editor, settings) and for games
   - the author sets a game's languages
   - when the host switches several on, each player chooses on their phone; otherwise no choice is shown
4. **Home server and accounts:**
   - runs under `dinnyvanhuizen.com` (details from the owner to follow)
   - sign in with Google; no passwords are stored
   - only invited people can make games: invite by e-mail address or with a shareable link
   - players joining a room never need an account
   - each person sees only their own games
5. **Collaborators:**
   - invite someone to a game as editor or viewer (needs step 4)
   - live editing together is built; with accounts it shows real names and respects the viewer role
6. **Admin dashboard** (owner only):
   - people and invites
   - all games
   - live rooms
   - storage and clean-up
   - health and an action log

## Open questions for the owner

| Question | Suggested answer |
| --- | --- |
| Should the editor set a game's room settings (scores visible, reactions and their limit, break voting, seconds before a round closes) as starting values? | Yes: the editor sets the defaults, and the host can still change them in the room |
| Should these settings be locked once the game has started? (Now they can be changed at any time.) | Lock the "seconds before a round closes" once the game starts; keep the rest changeable |
| Domain details for the home server | To follow from the owner |

## Known limits of what is built

- "Most reactions" in the awards counts only since the last server start.
- A screen that connects in the middle of a Pass the pencil turn sees that turn's earlier strokes only once the turn is saved.
- Editing together: when two people change the very same field at the same moment, the later save wins; the same goes for two people adding a part to the same scene in the same second. People are told apart by a name they type themselves, since there are no accounts yet. Checked with two browsers on one computer, not yet over the public link or with more than two people.
- Nothing has been checked on many real phones yet; the first two-phone test is under way.
