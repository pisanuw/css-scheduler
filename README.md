# CSS Scheduler

Assigns UW Bothell CSS instructors to course sections across Autumn, Winter and
Spring. Instructors submit their own preferences; the coordinator places them on
a board that flags conflicts as they work.

See [docs/DESIGN.md](docs/DESIGN.md) for the data model, conflict rules and
iteration plan.

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
npm test          # conflict engine
npm run typecheck
npm run build
```

## Database

The hosted project is `css-scheduler` (ref `abvnaelzfriusckqqrfc`, us-west-1).
Migrations live in `supabase/migrations/`, seed data in `supabase/seed.sql`.

```bash
npm run db:test:rls        # row level security regression test (14 checks)
npm run test:e2e           # full stack through the real auth + REST API (20 checks)
python3 scripts/run_sql.py <file.sql> [project_ref]   # run any SQL file
```

Both talk to the hosted project and clean up after themselves.

`scripts/run_sql.py` talks to the Supabase Management API and reads the CLI's
access token from the macOS keychain, so no secret is written to disk.

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
historical imports resolve), 42 time slots, 76 instructors, and 199 historical
section assignments parsed from `past-course-schedules/`.

## Access

Sign-in is restricted to `uw.edu` accounts by the `allowed_email_domains`
table. Coordinator access is granted on first sign-in to addresses listed in
`bootstrap_coordinators` (seeded with `pisan@uw.edu`); everyone else gets the
instructor role.

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
