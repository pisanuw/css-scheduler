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

Tests and typecheck:

```bash
npm test          # the pure engines: conflicts, snapshot, ranking, seeding,
                  # reporting, suggestions, undo, the toast queue and the
                  # focus trap (214 tests)
npm run typecheck
npm run build
```

Mobile and accessibility:

```bash
npm run check:mobile            # every over-the-page component at 375px
npm run check:mobile -- chips   # one scene
SHOTS=1 npm run check:mobile    # and write PNGs to dist-harness/shots
```

This builds `harness/` — a second Vite entry that renders the components with
fixture data and no Supabase — and drives it in a headless Chromium, checking
that nothing scrolls sideways, that every control is at least 44px, that every
piece of text clears WCAG AA against what is actually behind it, that the
console is clean, and that dialogs trap Tab and close on Escape. Playwright is
not a dependency; the script finds it locally or globally and tells you what to
install if it finds neither (`npm i -D playwright && npx playwright install
chromium`).

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

After changing the deployed domain, add it to Supabase under **Authentication →
URL Configuration**, or sign-in will bounce. The current allow-list covers the
Netlify domain, its deploy previews, and localhost for development.
