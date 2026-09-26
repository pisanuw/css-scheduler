-- ============================================================================
-- Just enough Supabase to run this project's migrations, seed and RLS suite
-- against a plain PostgreSQL 16 — no Docker, no hosted project, no secrets.
--
-- Why this exists: `npm run db:test:rls` and `npm run test:e2e` read a token
-- from the maintainer's macOS keychain, so in a cloud sandbox neither can run
-- and the only way to check a policy change was to fire SQL at the live
-- project. That is a poor place to find out a migration is wrong.
--
-- The migrations touch exactly three things the platform provides, and nothing
-- else, which is what makes a shim this small possible:
--
--   auth.users   the identity table `profiles` hangs off, and the one the
--                sign-up and sign-in triggers fire on
--   auth.uid()   the current request's user, read from a JWT claim
--   the roles    anon, authenticated, service_role, supabase_auth_admin
--
-- What it deliberately does NOT reproduce: GoTrue itself, `service_role`
-- semantics beyond BYPASSRLS, the REST layer, or Supabase's own grants on
-- schemas other than public. Those are what `npm run test:e2e` covers against
-- the real API, and it stays the authority on them.
--
--   scripts/local_db.sh   boots a cluster, applies this, then the migrations
-- ============================================================================

-- Roles live in the cluster, not in the database, so a rebuilt database finds
-- them already there. Has to be re-runnable.
do $shim$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role','supabase_auth_admin'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin noinherit', r);
    end if;
  end loop;
  if not (select rolbypassrls from pg_roles where rolname = 'service_role') then
    alter role service_role bypassrls;
  end if;
end $shim$;

grant usage on schema public to anon, authenticated, service_role;

create schema if not exists auth;
create extension if not exists citext;
create extension if not exists pgcrypto;

-- Only the columns the migrations actually read. Adding one here without a
-- migration needing it would make the shim a fiction of its own.
create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              citext unique,
  raw_app_meta_data  jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  last_sign_in_at    timestamptz,
  created_at         timestamptz not null default now()
);

-- GoTrue puts the signed-in user's id in the request's JWT claims. Both
-- spellings the platform uses are honoured: the flat setting is the one
-- `set_config('request.jwt.claim.sub', ...)` in the test suite writes, and the
-- JSON one is what PostgREST sends in production.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')
  )::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
