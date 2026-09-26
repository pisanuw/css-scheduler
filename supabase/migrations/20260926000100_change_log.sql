-- ============================================================================
-- Change log for the assignment board.
--
-- Written by triggers rather than by the application, for the same reason
-- access_log is: a log the client writes is a log the client can forget to
-- write. Every path that touches a section or an assignment — the board, a
-- seeded scenario, a hand-run SQL fix — lands here without the caller's help.
--
-- Rows are kept when a section is deleted, because "who removed CSS 342 B"
-- is exactly the question the log exists to answer. The summary is stored as
-- text at write time for the same reason: it has to stay readable after the
-- row it describes is gone.
-- ============================================================================

create type change_action as enum
  ('created', 'updated', 'deleted', 'assigned', 'unassigned');

create table scenario_changes (
  id          bigserial primary key,
  scenario_id uuid not null references scenarios on delete cascade,
  -- Set null rather than cascaded: the entry outlives the section.
  section_id  uuid references sections on delete set null,
  action      change_action not null,
  -- Readable on its own, without joining to anything that may have gone.
  summary     text not null,
  actor_id    uuid references profiles on delete set null,
  actor_email citext,
  occurred_at timestamptz not null default now()
);
create index on scenario_changes (scenario_id, occurred_at desc);

-- Who is doing this, recorded by address so the entry survives the account.
create or replace function change_actor() returns table (id uuid, email citext)
language sql stable security definer set search_path = public as $$
  select p.id, p.email from profiles p where p.id = auth.uid()
$$;

create or replace function log_section_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row     sections;
  v_action  change_action;
  v_label   text;
  v_section uuid;
  v_actor   record;
begin
  if tg_op = 'DELETE' then
    v_row := old; v_action := 'deleted'; v_section := null;
  elsif tg_op = 'INSERT' then
    v_row := new; v_action := 'created'; v_section := new.id;
  else
    v_row := new; v_action := 'updated'; v_section := new.id;
  end if;

  select c.code into v_label from courses c where c.id = v_row.course_id;
  select * into v_actor from change_actor();

  insert into scenario_changes
    (scenario_id, section_id, action, summary, actor_id, actor_email)
  values
    (v_row.scenario_id, v_section, v_action,
     coalesce(v_label, 'a course') || ' ' || v_row.section_letter,
     v_actor.id, v_actor.email);

  return coalesce(new, old);
end $$;

create or replace function log_assignment_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row     section_instructors;
  v_action  change_action;
  v_scen    uuid;
  v_section uuid;
  v_label   text;
  v_who     text;
  v_actor   record;
begin
  if tg_op = 'DELETE' then
    v_row := old; v_action := 'unassigned';
  else
    v_row := new; v_action := 'assigned';
  end if;

  -- The section may already be gone when a cascade removes the assignment,
  -- in which case there is nothing left to log against.
  select s.scenario_id, s.id, c.code || ' ' || s.section_letter
    into v_scen, v_section, v_label
  from sections s
  join courses c on c.id = s.course_id
  where s.id = v_row.section_id;
  if v_scen is null then
    return coalesce(new, old);
  end if;

  select i.full_name into v_who from instructors i where i.id = v_row.instructor_id;
  select * into v_actor from change_actor();

  insert into scenario_changes
    (scenario_id, section_id, action, summary, actor_id, actor_email)
  values
    (v_scen, v_section, v_action,
     coalesce(v_who, 'someone') || ' — ' || coalesce(v_label, 'a section'),
     v_actor.id, v_actor.email);

  return coalesce(new, old);
end $$;

create trigger t_sections_log
  after insert or update or delete on sections
  for each row execute function log_section_change();

create trigger t_section_instructors_log
  after insert or delete on section_instructors
  for each row execute function log_assignment_change();

-- ------------------------------------------------------------------ access --
alter table scenario_changes enable row level security;

-- Readable exactly where the scenario is: drafts stay private, the published
-- schedule's history does not.
create policy scenario_changes_read on scenario_changes for select to authenticated
  using (exists (select 1 from scenarios sc
                 where sc.id = scenario_changes.scenario_id
                   and (sc.status = 'official' or is_coordinator())));

-- Deliberately no insert, update or delete policy. The triggers above are
-- SECURITY DEFINER and bypass RLS, so the log can only be appended to by
-- actually changing something — nobody can forge or erase an entry.

grant select on scenario_changes to authenticated;
revoke insert, update, delete on scenario_changes from authenticated;

-- CREATE FUNCTION grants EXECUTE to PUBLIC. These are trigger functions and a
-- SECURITY DEFINER helper; a trigger runs them regardless of the caller's
-- privileges, so unlike the policy helpers in 20260925000300_harden.sql there
-- is no reason to leave the grant in place. See docs/DESIGN.md for why
-- revoking from `authenticated` breaks a function a policy calls — none of
-- these is called from a policy.
revoke all on function log_section_change()    from public, anon, authenticated;
revoke all on function log_assignment_change() from public, anon, authenticated;
revoke all on function change_actor()          from public, anon, authenticated;
