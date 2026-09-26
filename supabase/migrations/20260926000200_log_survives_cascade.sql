-- ============================================================================
-- Fix: deleting a scenario failed.
--
-- 20260926000100 logs every section and assignment change by trigger. A
-- cascading delete removes the scenario row before the sections hanging off
-- it, so by the time the section trigger fired there was no scenario left for
-- scenario_changes.scenario_id to reference, and the whole delete rolled back
-- with a foreign key violation.
--
-- The guard is the one the assignment trigger already had for its own parent:
-- if the row this entry would point at is gone, there is nothing to record.
-- The log rows are being cascaded away with the scenario in any case, so
-- skipping the write loses nothing.
--
-- Caught by supabase/tests/rls_test.sql, which deletes an academic year and so
-- cascades three levels at once. A test that only ever deleted sections first
-- would never have found it.
-- ============================================================================

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

  -- The scenario is already gone when this delete is part of its cascade.
  if not exists (select 1 from scenarios where id = v_row.scenario_id) then
    return coalesce(new, old);
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

  select s.scenario_id, s.id, c.code || ' ' || s.section_letter
    into v_scen, v_section, v_label
  from sections s
  join courses c on c.id = s.course_id
  where s.id = v_row.section_id;

  -- Nothing to log against: either the section has gone, or the section is
  -- still visible but the scenario above it is already deleted.
  if v_scen is null or not exists (select 1 from scenarios where id = v_scen) then
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

revoke all on function log_section_change()    from public, anon, authenticated;
revoke all on function log_assignment_change() from public, anon, authenticated;
