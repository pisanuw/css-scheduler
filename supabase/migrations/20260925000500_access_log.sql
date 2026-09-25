-- ============================================================================
-- Access log: who has signed in, and when.
--
-- Supabase's own auth.audit_log_entries is empty on this project, so sign-in
-- history is not retained anywhere by default. This records it ourselves.
--
-- GoTrue sets last_sign_in_at on every successful sign-in, so a trigger on
-- that column is a reliable signal without the application having to remember
-- to write anything.
-- ============================================================================

create table access_log (
  id          bigint generated always as identity primary key,
  -- Kept nullable so history survives an account being deleted; the email is
  -- the durable record of who it was.
  user_id     uuid references auth.users on delete set null,
  email       citext not null,
  event       text not null check (event in ('sign_up', 'sign_in')),
  provider    text,
  occurred_at timestamptz not null default now()
);
create index on access_log (occurred_at desc);
create index on access_log (email);

create or replace function log_access() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- First contact. GoTrue populates last_sign_in_at on the insert itself for
    -- OAuth, so this row is both the account creation and the first sign-in.
    insert into access_log (user_id, email, event, provider, occurred_at)
    values (new.id, new.email, 'sign_up',
            new.raw_app_meta_data->>'provider',
            coalesce(new.last_sign_in_at, now()));
  elsif new.last_sign_in_at is distinct from old.last_sign_in_at
        and new.last_sign_in_at is not null then
    insert into access_log (user_id, email, event, provider, occurred_at)
    values (new.id, new.email, 'sign_in',
            new.raw_app_meta_data->>'provider',
            new.last_sign_in_at);
  end if;
  return new;
end $$;

-- Named to sort after on_auth_user_created, so a sign-in that the domain gate
-- rejects is never logged: that exception rolls the whole transaction back.
drop trigger if exists on_auth_user_created_log on auth.users;
create trigger on_auth_user_created_log
  after insert on auth.users
  for each row execute function log_access();

drop trigger if exists on_auth_user_signin_log on auth.users;
create trigger on_auth_user_signin_log
  after update on auth.users
  for each row execute function log_access();

-- One row per person: when they first arrived, when they were last seen, and
-- how many times. Left joins so someone who signed in but has no instructor
-- record still appears.
create view access_summary as
select
  al.email,
  i.full_name,
  p.role,
  min(al.occurred_at) as first_seen,
  max(al.occurred_at) as last_seen,
  count(*)            as visits
from access_log al
left join profiles    p on p.email = al.email
left join instructors i on i.id = p.instructor_id
group by al.email, i.full_name, p.role;

alter view access_summary set (security_invoker = on);

-- Admin information: coordinators only, unlike the rest of the reference data.
alter table access_log enable row level security;
create policy access_log_coord on access_log for all to authenticated
  using (is_coordinator()) with check (is_coordinator());

grant select on access_log to authenticated;
grant select on access_summary to authenticated;

-- Backfill from accounts that already exist, so the log is not misleadingly
-- empty for people who signed in before it was added.
insert into access_log (user_id, email, event, provider, occurred_at)
select u.id, u.email, 'sign_up', u.raw_app_meta_data->>'provider',
       coalesce(u.last_sign_in_at, u.created_at)
from auth.users u;
