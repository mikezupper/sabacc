# Security policy

## Supported versions

Only the `main` branch and the live site at <https://sabacc.starwars.run/> get fixes.
There are no release branches.

## Reporting a vulnerability

Please **don't open a public issue**. Report it privately through GitHub's
[private vulnerability reporting](https://github.com/mikezupper/sabacc/security/advisories/new)
(the repository's **Security** tab, then **Report a vulnerability**). Only the maintainer
can read it.

Include what you can: the page or endpoint, the steps, the replay seed shown under
the table (`?seed=…`) or the room code, and what you expected to happen. You should get a
reply within a week. This is a hobby project, so there is no bounty, but you'll be
credited in the fix unless you'd rather not be.

## What counts

The multiplayer server is the main attack surface. In particular:

- **Seeing hidden information.** A browser must receive only `viewFor` its own seat
  (`src/domain/view.ts`): never another player's hand, the deck or the shuffle. Any way
  to learn them, or to predict a server-side shuffle, is a vulnerability.
- **Acting for someone else.** Moving in another seat, taking a seat without its token,
  or acting as a spectator.
- **Breaking a table or the server.** Messages that crash a room, lock it up, corrupt the
  SQLite save, or get around the per-address room limit (`ROOMS_PER_IP_PER_HOUR`).
- **Script injection** through player names or anything else rendered in the page.

Out of scope: solo games (they run entirely in your browser, so you can always cheat
against the droids), replaying a `?seed=` link, and denial of service by sheer volume.
