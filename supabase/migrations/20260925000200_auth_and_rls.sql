-- ============================================================================
-- Auth wiring + row level security
-- ============================================================================

-- Emails that should be granted the coordinator role on first sign-in.
create table bootstrap_coordinators (
  email      citext primary key,
  note       text,
  created_at timestamptz not null default now()
);

-- Domains allowed to sign in at all. Google OAuth alone does not restrict
-- this, so it is enforced here as well.
create table allowed_email_domains (
  domain     citext primary key,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------- helpers ----
-- SECURITY DEFINER so policies can read profiles without recursing into
-- the policies defined on profiles itself.

create or replace function auth_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function is_coordinator() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'coordinator' from profiles where id = auth.uid()), false)
$$;

create or replace function my_instructor_id() returns uuid
language sql stable security definer set search_path = public as $$
  select instructor_id from profiles where id = auth.uid()
$$;

-- Is this submission still editable by its owner?
create or replace function cycle_is_open(p_cycle_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select c.status = 'open'
       and (c.opens_at  is null or now() >= c.opens_at)
       and (c.closes_at is null or now() <= c.closes_at)
    from preference_cycles c where c.id = p_cycle_id), false)
$$;

-- --------------------------------------------- new user provisioning ------
-- Creates the profile, enforces the domain allow-list, links the account to
-- an existing instructor row by email, and grants coordinator if listed.

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_domain citext := split_part(new.email, '@', 2);
  v_instructor uuid;
  v_role user_role := 'instructor';
begin
  if not exists (select 1 from allowed_email_domains where domain = v_domain) then
    raise exception 'Sign-in is restricted to approved domains (got %).', v_domain
      using errcode = 'insufficient_privilege';
  end if;

  select id into v_instructor from instructors where email = new.email;

  if exists (select 1 from bootstrap_coordinators where email = new.email) then
    v_role := 'coordinator';
  end if;

  insert into profiles (id, email, full_name, role, instructor_id)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
          v_role, v_instructor)
  on conflict (id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ================================================================ RLS ======

alter table profiles                  enable row level security;
alter table instructors               enable row level security;
alter table courses                   enable row level security;
alter table buildings                 enable row level security;
alter table rooms                     enable row level security;
alter table time_slots                enable row level security;
alter table academic_years            enable row level security;
alter table terms                     enable row level security;
alter table preference_cycles         enable row level security;
alter table preference_submissions    enable row level security;
alter table preference_courses        enable row level security;
alter table preference_terms          enable row level security;
alter table instructor_qualifications enable row level security;
alter table scenarios                 enable row level security;
alter table sections                  enable row level security;
alter table section_instructors       enable row level security;
alter table teaching_history          enable row level security;
alter table bootstrap_coordinators    enable row level security;
alter table allowed_email_domains     enable row level security;

-- profiles: see yourself; coordinators see and manage everyone.
create policy profiles_self_read    on profiles for select using (id = auth.uid() or is_coordinator());
create policy profiles_self_update  on profiles for update using (id = auth.uid()) with check (id = auth.uid() and role = auth_role());
create policy profiles_coord_all    on profiles for all    using (is_coordinator()) with check (is_coordinator());

-- Shared reference data: any signed-in user reads; coordinators write.
do $$
declare t text;
begin
  foreach t in array array['instructors','courses','buildings','rooms','time_slots',
                           'academic_years','terms','teaching_history',
                           'instructor_qualifications'] loop
    execute format('create policy %1$s_read on %1$s for select to authenticated using (true)', t);
    execute format('create policy %1$s_write on %1$s for all to authenticated using (is_coordinator()) with check (is_coordinator())', t);
  end loop;
end $$;

-- Coordinator-only tables.
create policy bootstrap_coord on bootstrap_coordinators for all to authenticated
  using (is_coordinator()) with check (is_coordinator());
create policy domains_coord   on allowed_email_domains  for all to authenticated
  using (is_coordinator()) with check (is_coordinator());

-- Preference cycles: everyone signed in can see them; coordinators manage.
create policy cycles_read  on preference_cycles for select to authenticated using (true);
create policy cycles_write on preference_cycles for all to authenticated
  using (is_coordinator()) with check (is_coordinator());

-- Submissions: an instructor owns their own row and may edit it only while
-- the cycle is open. Coordinators see and edit everything.
create policy subs_owner_read on preference_submissions for select to authenticated
  using (instructor_id = my_instructor_id() or is_coordinator());
create policy subs_owner_write on preference_submissions for insert to authenticated
  with check (instructor_id = my_instructor_id() and cycle_is_open(cycle_id));
create policy subs_owner_update on preference_submissions for update to authenticated
  using  (instructor_id = my_instructor_id() and cycle_is_open(cycle_id))
  with check (instructor_id = my_instructor_id() and cycle_is_open(cycle_id));
create policy subs_coord on preference_submissions for all to authenticated
  using (is_coordinator()) with check (is_coordinator());

-- Child rows inherit access from their parent submission.
do $$
declare t text;
begin
  foreach t in array array['preference_courses','preference_terms'] loop
    execute format($f$
      create policy %1$s_owner on %1$s for all to authenticated
      using (exists (select 1 from preference_submissions s
                     where s.id = %1$s.submission_id
                       and (s.instructor_id = my_instructor_id() or is_coordinator())))
      with check (exists (select 1 from preference_submissions s
                     where s.id = %1$s.submission_id
                       and ((s.instructor_id = my_instructor_id() and cycle_is_open(s.cycle_id))
                            or is_coordinator())))
    $f$, t);
  end loop;
end $$;

-- Scenarios and their sections: coordinators work on all of them; everyone
-- else may read only the one marked official.
create policy scenarios_read on scenarios for select to authenticated
  using (status = 'official' or is_coordinator());
create policy scenarios_write on scenarios for all to authenticated
  using (is_coordinator()) with check (is_coordinator());

create policy sections_read on sections for select to authenticated
  using (exists (select 1 from scenarios sc where sc.id = sections.scenario_id
                 and (sc.status = 'official' or is_coordinator())));
create policy sections_write on sections for all to authenticated
  using (is_coordinator()) with check (is_coordinator());

create policy si_read on section_instructors for select to authenticated
  using (exists (select 1 from sections s join scenarios sc on sc.id = s.scenario_id
                 where s.id = section_instructors.section_id
                   and (sc.status = 'official' or is_coordinator())));
create policy si_write on section_instructors for all to authenticated
  using (is_coordinator()) with check (is_coordinator());

-- ============================================================== grants =====
-- Supabase's default privileges usually cover this, but stating it here keeps
-- the migration self-contained and reproducible on a bare Postgres.

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
-- NOTE: function EXECUTE is deliberately not granted here; see 20260925000300_harden.sql.

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

