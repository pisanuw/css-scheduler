# CSS Scheduler

Assigns UW Bothell CSS instructors to course sections across Autumn, Winter and
Spring. Instructors submit their own preferences; the coordinator places them on
a board that flags conflicts as they work.

The board is built for a phone: tap a section, tap an instructor, and the
candidate list is ordered by who actually fits — what they said about the
course, whether it clashes with something they already teach, how far it would
push them past their teaching target.

A quarter does not have to be typed in. Copy the CSS listing out of the
published UW time schedule, paste it into the board's import sheet, and it
arrives as a draft: courses matched against the catalogue, names matched
against the roster, meetings landed on the standard grid, and everything it
could not place named rather than dropped. Nothing is written until you confirm
it. See **Importing a quarter** in [docs/DESIGN.md](docs/DESIGN.md).

Two coordinators can work on the same scenario at once. The board watches the
change log and brings itself up to date when the other one writes something,
naming who did what — so the conflict panel is never answering from a snapshot
that is minutes old. See **Two coordinators at once** in
[docs/DESIGN.md](docs/DESIGN.md).

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

**`.env.asc`.** The repository carries one encrypted file, added in `dd09666`
("fix(auth): Added encrypted .env file"). It is an ASCII-armoured OpenPGP
message encrypted to RSA key id `A4C59E8DCB190977`; `gpg --list-packets
.env.asc` reports the same without needing the secret key. It is an encrypted
`.env`, per that commit message, and why it is committed rather than kept out
of the repository is not recorded anywhere. It is **not** needed to build,
test or run this project, and nothing automated reads it — use `.env.example`
→ `.env.local` as above. If you hold that key, `gpg -d .env.asc` opens it; if
you do not, ignore the file. Whoever added it should replace this paragraph
with the key's owner and what is inside: this note records only what the file
itself discloses.

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
                  # recovery, the service worker's rules and the Supabase
                  # clients this build leaves out, the offline rules, the
                  # keyboard shortcuts and the database row checks (581 tests)
npm run typecheck
npm run lint         # ESLint: hook dependency lists, unhandled promises,
                     # dead code, stray `any` — 132 files, no warnings allowed
npm run build        # needs the two Supabase values in the environment
npm run build:check  # the same build with placeholders, for when you only
                     # want to know that it builds
```

`npm run lint` is deliberately small, and it is not a formatter: no rule in
`eslint.config.js` reflows a line, so lint and the build can never disagree
about a file. Formatting is Prettier's argument and not worth having twice.
`tsc` has the types, the four browser checks have the behaviour, and 581 unit
tests have the rules; what those leave is the class of mistake that type-checks
and runs and is still wrong.

It is **type-aware** — `projectService` hands it the same program `tsc` reads —
which is what buys the rules that pay for the config. `no-floating-promises`
found two `.then` chains in `src/lib/auth.tsx` with no rejection handler, one of
which left a reader on "Loading…" for ever the moment a phone lost signal.
`no-base-to-string` found `failureText` rendering a Postgrest error as
"[object Object]" in the toast under the coordinator's thumb. Neither rule can
exist without type information.

`react-hooks/exhaustive-deps` is set to an **error** rather than the warning it
ships as. The board keeps its conflict findings, tallies and drop hints in
`useMemo`, and a stale dependency list there does not crash — it shows
yesterday's conflicts beside today's assignment, which is the exact failure this
app exists to prevent.

There are no standing warnings: the script fails on one. Three rules are off and
two narrowed, each with its reason written beside it, because a rule switched off
without one becomes a rule nobody can argue with later.

`@typescript-eslint/no-unsafe-assignment` was a fourth. It was off because no
`src/lib/database.types.ts` had ever been generated, so every Supabase row
arrived as `any` and was cast at the boundary. `npm run db:types` has been
run: the client is `createClient<Database>` now, rows arrive as their row types,
and the rule is an **error** with nothing suppressed but one `expect.any` in a
test. Turning it on cost seven type errors, and every one was a place the code
claimed more than the schema can promise — a `tier` typed `string` that Postgres
only accepts four values for, `access_log.event` narrowed to two values the
column enforces with a `check` rather than an enum, a `jsonb` column read as an
object, and four columns that are non-null in fact but nullable in the catalogue.
`src/lib/rows.ts` holds those reconciliations as tested functions; see its header
for which kind each one is.

Regenerate the types with `npm run db:types` after every migration, from the
hosted project, or `npm run db:types -- local` from a `supabase start` stack. The
generated file is committed, because the build needs it and CI has no database;
`scripts/db_types.sh` replaces it only when the CLI actually produced types,
which a plain redirect does not — the CLI reports "is the docker daemon running?"
on stdout, so `> database.types.ts` writes the error message into the file the
app is typed against and the next build goes quietly back to `any`.

**`npm run build` will not build without `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`,** and that is deliberate. `src/lib/supabase.ts` throws
at module scope when they are missing; Vite inlines them at build time, so
without them the bundler can prove the whole app shell is unreachable and drop
it — leaving a 2.5 kB entry, a build that reports success, and no application.
`vite-plugins/envGuard.ts` turns that into an error that says so. Use
`build:check` when you only want the gate, and real values when you are going
to compare the output against what Netlify serves.

Mobile and accessibility:

```bash
npm run check:mobile            # every over-the-page component at 375px
npm run check:mobile -- chips   # one scene
SHOTS=1 npm run check:mobile    # and write PNGs to dist-harness/shots
npm run check:routes            # the built bundle in a browser: chunks, deep links, roles
npm run check:drag              # a real mouse and a real finger on the board
npm run check:keys              # real key presses: shortcuts fire, fields keep their keys
npm run check:pwa               # installable, offline, and able to update itself
npm run check:deployed          # the live site: what the server says about the bytes
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

`check:deployed` is the one that looks outward, at the running site (or at a
deploy preview, passed as an argument). Everything else checks bytes a build
produced; this checks what a server decided to say about them, which no local
check can see. It asserts that the page still carries the manifest, the
apple-touch icon and the pre-paint theme script; that a deep link still gets
the app; that `/sw.js` is served as JavaScript and is *not* cacheable; that
every file the served worker promises to precache is actually there; and that
the manifest is served as `application/manifest+json` with every icon present
and really the size it claims. Its first run found that Netlify was serving a
perfectly good manifest as `application/octet-stream` — a build that passed
every other check, and an app a phone would not install.

`check:drag` drives an actual pointer at an actual board — a mouse, and a
finger through the browser's real touch pipeline — because what makes dragging
work or not work is whether a gesture is recognised as a drag at all, and no
unit test can answer that. It asserts that a name dragged from the load panel
assigns, that a chip dragged between cards moves, that a drop on nothing does
nothing, and — the two that matter most on a phone — that clicking the × still
unassigns and that a flick down the list still scrolls.

### Dependencies

`package-lock.json` is committed, so `npm ci` — which is what Netlify runs when
it finds a lockfile — installs the exact versions every check in this
repository was last run against. Without it each deploy re-resolved every
`^` range at build time, which means the app that reaches the coordinator is
not the app anybody tested: `@supabase/supabase-js: ^2.45.0` currently resolves
to 2.117.2, and a future minor of it landing straight in production with no one
watching is the kind of surprise this project cannot see until somebody cannot
sign in.

Upgrade deliberately (`npm update <package>`, then the checks above, then
commit the lockfile with the result). `zod` used to be a dependency and was
imported nowhere; it is gone.

**Node is pinned to 22** in `.nvmrc`, which Netlify honours. Vite 8 requires
`^20.19.0 || >=22.12.0`, so this is partly a floor — but mostly it is the same
argument as the committed lockfile: a byte-for-byte comparison between a local
build and what Netlify serves is only meaningful if both ran on the same
toolchain, and Netlify's default Node version is not ours to hold still.

`npm audit` reports nothing. Getting there meant `react-router-dom` 7,
`vite` 8, `vitest` 5 and `esbuild` 0.28 — see `docs/DESIGN.md` for what each was
for and what the router upgrade cost. When a finding does appear, the thing to
write down is whether it is *reachable from this app*, not its severity label:
three runs recorded these seven as "all in dev tooling", which was wrong, and
the entry that said so was the reason nobody looked again.

## Database

The hosted project is `css-scheduler` (ref `abvnaelzfriusckqqrfc`, us-west-1).
Migrations live in `supabase/migrations/`, seed data in `supabase/seed.sql`.

```bash
npm run db:test:rls        # row level security regression test (70 checks)
npm run test:e2e           # full stack through the real auth + REST API (24 checks)
npm run db:types           # regenerate src/lib/database.types.ts from the schema
python3 scripts/run_sql.py <file.sql> [project_ref]   # run any SQL file
```

The first two talk to the hosted project and clean up after themselves.

`npm run db:types` reads the schema through the CLI's own access token, so it
needs the same keychain entry the next paragraph describes — which is why its
output is committed rather than generated during the build. A migration that is
not followed by a `db:types` run leaves the application typed against the
previous schema, and `tsc` cannot tell: the types still describe *a* database.

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

The first load is 401 kB, 117 kB over the wire: the shell, React, React Query
and Supabase, with every page fetched when it is opened. Three of the five
clients inside `@supabase/supabase-js` — realtime, storage and edge functions —
are aliased out of the build by `vite-plugins/supabaseTrim.ts`, because this
app uses none of them and `SupabaseClient` constructs two of them whether
anything asks or not. `src/lib/supabase-trim/README.md` explains what to delete
if that changes.

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
