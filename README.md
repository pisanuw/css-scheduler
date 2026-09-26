# CSS Scheduler

Assigns UW Bothell CSS instructors to course sections across Autumn, Winter and
Spring. Instructors submit their own preferences; the coordinator places them on
a board that flags conflicts as they work.

The board is built for a phone: tap a section, tap an instructor, and the
candidate list is ordered by who actually fits — what they said about the
course, whether it clashes with something they already teach, how far it would
push them past their teaching target.

**Live:** https://uwb-css-scheduler.netlify.app — sign-in needs the Google
OAuth client set up first (see **Setting up Google sign-in** below).

See [docs/DESIGN.md](docs/DESIGN.md) for the data model, conflict rules and
iteration plan, and [docs/SESSION-LOG.md](docs/SESSION-LOG.md) for the prompts
and decisions the first build session was driven by.

## Stack

React + TypeScript (Vite), static on Netlify. Supabase provides Postgres,
Google OAuth and row level security — there is no backend server.

## Running it

```bash
npm install
cp .env.example .env.local     # fill in your Supabase URL and anon key
npm run dev
```

Google sign-in additionally needs an OAuth client (see **Access** below); until
that is configured the sign-in button will fail.

**Light and dark.** The button in the header cycles through following your
device, light and dark; a dot under the icon means it is following the device.
The choice lives in `localStorage` under `css-scheduler:theme` and is applied
by an inline script in `index.html` before the first paint, so the page never
flashes white on the way to being dark. `docs/DESIGN.md` explains how the
palette moves, and why printing is deliberately unaffected by it.

Tests and typecheck:

```bash
npm test          # the pure engines: conflicts, snapshot, ranking, seeding,
                  # reporting, suggestions, undo, drag rules, the toast queue,
                  # the focus trap, the theme rules, the route table, chunk
                  # recovery and the service worker's rules (362 tests)
npm run typecheck
npm run build
```

Mobile and accessibility:

```bash
npm run check:mobile            # every over-the-page component at 375px
npm run check:mobile -- chips   # one scene
SHOTS=1 npm run check:mobile    # and write PNGs to dist-harness/shots
npm run check:routes            # the built bundle in a browser: chunks, deep links, roles
npm run check:drag              # a real mouse and a real finger on the board
npm run check:pwa               # installable, offline, and able to update itself
npm run icons                   # redraw the icons (committed; not part of the build)
```

This builds `harness/` — a second Vite entry that renders the components with
fixture data and no Supabase — and drives it in a headless Chromium, checking
that nothing scrolls sideways, that every control is at least 44px, that every
piece of text clears WCAG AA against what is actually behind it, that the
console is clean, that dialogs trap Tab and close on Escape, and — with the
page switched to print media — that everything marked `print:hidden` really
goes and every print-only element really arrives. Every scene is measured
twice, once in each theme: the dark palette re-points every colour in the app,
so a pairing that reads perfectly in daylight has to be measured again rather
than assumed. The printed page is asserted to be identical whichever theme it
was printed from. Playwright is
not a dependency; the script finds it locally or globally and tells you what to
install if it finds neither (`npm i -D playwright && npx playwright install
chromium`).

`check:routes` is the other half: it builds the app and drives the *real*
bundle, with Supabase stubbed and a fabricated session, to check that the code
splitting holds up — that a signed-out visitor does not download the
assignment board, that every destination renders once its chunk arrives, that
a deep link such as `/board/:scenarioId` is still where it was typed, that one
tap fetches one page, that hovering a nav link prefetches it, and that an
instructor can reach no coordinator page by nav or by URL. It also checks the
theme end to end on the real `index.html`: with the app's JavaScript blocked —
the only honest way to ask what the first paint looked like — the attribute is
already right for the device, a stored choice outranks it, the button writes
one that survives a reload, and none of the thirteen pages paints a daylight
surface in the dark. It needs no
credentials and never reaches the live project: it builds into
`dist-routecheck/` with placeholder Supabase values, because every request to
the project is intercepted anyway and `dist/` should be left alone.

`check:pwa` installs the built app in a browser and then takes the network
away. It asserts that the manifest is one a phone will actually install (the
192 and 512px PNGs Chrome requires, checked against the pixels in the files
rather than the sizes claimed in the JSON, and a maskable icon that is a
separate file from the one drawn to fill its square), that the worker activates
and claims the page that installed it, that what it cached is this origin's own
shell and not one byte of anybody's Supabase data, that a reload and an unseen
deep link both still render with no connection while a request to the database
still fails, and — the assertion the script exists for — that a new version on
the server is noticed, *offered* rather than forced, and applied with the old
build's cache deleted when the offer is taken. An installed app that cannot
replace itself is worse than one that was never installable.

The network is taken away by dropping connections at the test's own server
rather than with Playwright's `context.setOffline`, which does not apply to a
service worker's own fetches: with the shell deliberately removed from the
precache list, the offline assertions still passed, because the "offline"
worker was quietly fetching the page the whole time.

`check:drag` drives an actual pointer at an actual board — a mouse, and a
finger through the browser's real touch pipeline — because what makes dragging
work or not work is whether a gesture is recognised as a drag at all, and no
unit test can answer that. It asserts that a name dragged from the load panel
assigns, that a chip dragged between cards moves, that a drop on nothing does
nothing, and — the two that matter most on a phone — that clicking the × still
unassigns and that a flick down the list still scrolls.

## Database

The hosted project is `css-scheduler` (ref `abvnaelzfriusckqqrfc`, us-west-1).
Migrations live in `supabase/migrations/`, seed data in `supabase/seed.sql`.

```bash
npm run db:test:rls        # row level security regression test (70 checks)
npm run test:e2e           # full stack through the real auth + REST API (20 checks)
python3 scripts/run_sql.py <file.sql> [project_ref]   # run any SQL file
```

Both talk to the hosted project and clean up after themselves.

`scripts/run_sql.py` talks to the Supabase Management API and reads the CLI's
access token from the macOS keychain, so no secret is written to disk. That is
also its limit: on any machine without that keychain entry — a CI runner, a
cloud sandbox — neither command can run at all.

```bash
npm run db:test:rls:local  # the same 70 checks, against a throwaway local cluster
```

`scripts/local_db.sh` boots a PostgreSQL cluster of its own, applies
`supabase/tests/local_shim.sql` (the three Supabase objects the migrations
depend on: `auth.users`, `auth.uid()` and the platform roles), then every
migration, the seed and the suite. It needs the postgres server binaries on the
machine and nothing else — no Docker, no project, no credentials. It is the
right thing to run before applying a migration anywhere real.

It does not replace `npm run test:e2e`, which is the only check that exercises
the real auth and REST layers; `local_shim.sql` says in its header exactly what
it leaves out.

For a local stack instead (needs Docker running):

```bash
supabase start
supabase db reset  # apply migrations + seed
```

`supabase/seed.sql` is generated — edit the data files in `scripts/data/` and
regenerate rather than editing it by hand:

```bash
npm run seed:generate
```

Seeded contents: 80 undergraduate courses, 48 graduate courses (inactive, so
historical imports resolve), 42 time slots, 76 instructors, 199 historical
section assignments parsed from `past-course-schedules/`, and the 37 rooms
those schedules use — derived from the import rather than typed out, so the
room inventory is whatever CSS actually teaches in.

## Access

Sign-in is restricted to `uw.edu` accounts by the `allowed_email_domains`
table. Coordinator access is granted on first sign-in to addresses listed in
`bootstrap_coordinators`; everyone else gets the instructor role.

Seeded coordinators:

| Address | Role |
| --- | --- |
| `minchen2@uw.edu` | CSS teaching coordinator |
| `geetha@uw.edu` | Department chair |
| `pisan@uw.edu` | Maintainer |

`handle_new_user` reads that list only at first sign-in, so adding someone who
already has an account would not reach them. `seed.sql` therefore also runs a
sync that promotes any existing profile whose address is on the list. It only
ever promotes — removing someone from the list does not demote them, so revoking
access means changing `profiles.role` directly.

## Setting up Google sign-in

1. In the [Google Cloud console](https://console.cloud.google.com/apis/credentials),
   create an **OAuth 2.0 Client ID** of type *Web application*.
2. Add this authorised redirect URI:
   `https://abvnaelzfriusckqqrfc.supabase.co/auth/v1/callback`
3. In the Supabase dashboard under **Authentication → Providers → Google**,
   enable the provider and paste the client ID and secret.

The app sends Google an `hd=uw.edu` hint so the UW account picker comes up
first, but that hint is only cosmetic. The enforcement is the
`allowed_email_domains` table, checked by the `handle_new_user` trigger, which
rejects any address outside the listed domains.

## Deploying

The frontend is a static bundle on Netlify (project `uwb-css-scheduler`); the
backend is the hosted Supabase project. `netlify.toml` sets the build command
and an SPA fallback so client-side routes survive a hard refresh.

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set as build environment
variables on the Netlify project, because `.env.local` is not committed. If you
point this at a different Supabase project, update them there as well as
locally.

Only `dist/` is published, so nothing in the repo (source, seed data, the PDFs)
is served. Any unmatched path returns `index.html` by design.

`netlify.toml` also pins two cache headers. `/assets/*` is `immutable`, because
every file there is named by the hash of its own contents. `/sw.js` is
explicitly `max-age=0, must-revalidate`: it is the one file that decides
whether every other file can be replaced, so a cached copy is not a stale page
but an app that can never update itself again, on a phone whose cache nobody
can clear.

The app is installable. `public/manifest.webmanifest` and the icons in
`public/icons/` are what a phone reads to offer "Add to home screen"; the icons
are committed rather than generated during the build, so a deploy never depends
on a browser being installed — redraw them with `npm run icons` if the mark
changes. The service worker is built from `src/sw.ts` by
`vite-plugins/pwa.ts`, which works out the shell from the bundle itself and
names the cache after the hash of that list. It precaches the shell plus the
dashboard and the board, caches any other page the first time it is opened, and
never touches a request that leaves this origin.

After changing the deployed domain, add it to Supabase under **Authentication →
URL Configuration**, or sign-in will bounce. The current allow-list covers the
Netlify domain, its deploy previews, and localhost for development.
