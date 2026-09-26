-- ============================================================================
-- Undo on the assignment board.
--
-- The change log already recorded *that* something happened. It could not say
-- how to put it back: `summary` is prose written for a person to read, and
-- 'Clark Olson — CSS 343 A' does not identify two rows. This migration adds
-- the structured half.
--
--   detail     what the change needs in order to be reversed
--   undone_at  set once it has been, so it cannot be applied twice
--   undoes_id  on the entry an undo writes, pointing at what it reversed
--
-- `detail.section` is the row as it stood BEFORE the change, except for a
-- creation, where there was no before and the new row is what identifies what
-- to remove.
--
-- Undoing is done by a SECURITY DEFINER function rather than by the client so
-- that the log stays append-only — nothing outside the database may mark an
-- entry undone. The reversal itself goes through the ordinary tables, so it
-- fires the ordinary triggers and lands in the log as a change of its own.
-- That is what makes redo fall out for free: the entry an undo writes is
-- itself undoable.
--
-- Section deletion is logged BEFORE the row goes, not after, because the
-- assignments hanging off it are cascaded away and an AFTER trigger is too
-- late to record who was teaching it. Restoring a section restores its
-- instructors with it.
--
-- Entries written before this migration have an empty `detail` and are
-- therefore not undoable. The board does not offer an Undo it cannot honour.
-- ============================================================================

alter table scenario_changes
  add column detail    jsonb not null default '{}'::jsonb,
  add column undone_at timestamptz,
  add column undone_by uuid references profiles on delete set null,
  add column undoes_id bigint references scenario_changes on delete set null;

-- ------------------------------------------------------- triggers, rewritten --

-- Set by undo_change for the length of its transaction, so the entry the
-- reversal writes can point back at what it reversed.
create or replace function undoing_change_id() returns bigint
language sql stable set search_path = public as $$
  select nullif(current_setting('app.undoing_change_id', true), '')::bigint
$$;

create or replace function log_section_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row     sections;   -- the row this entry is about
  v_before  sections;   -- the state to restore to, for undo
  v_action  change_action;
  v_label   text;
  v_section uuid;
  v_detail  jsonb;
  v_actor   record;
begin
  if tg_op = 'DELETE' then
    v_row := old; v_before := old; v_action := 'deleted'; v_section := null;
  elsif tg_op = 'INSERT' then
    -- Nothing to restore to; the new row is what identifies what to remove.
    v_row := new; v_before := new; v_action := 'created'; v_section := new.id;
  else
    v_row := new; v_before := old; v_action := 'updated'; v_section := new.id;
  end if;

  -- The scenario is already gone when this delete is part of its cascade.
  if not exists (select 1 from scenarios where id = v_row.scenario_id) then
    return coalesce(new, old);
  end if;

  select c.code into v_label from courses c where c.id = v_row.course_id;
  select * into v_actor from change_actor();

  -- What it takes to put this back: the row as it was, and for a deletion the
  -- assignments about to be cascaded away with it. This trigger runs BEFORE
  -- the delete, so they are still there to be read.
  v_detail := jsonb_build_object('section', to_jsonb(v_before));
  if tg_op = 'DELETE' then
    v_detail := v_detail || jsonb_build_object(
      'assignments',
      coalesce((select jsonb_agg(jsonb_build_object(
                         'instructor_id', si.instructor_id,
                         'is_primary',    si.is_primary))
                  from section_instructors si where si.section_id = old.id), '[]'::jsonb));
  end if;

  insert into scenario_changes
    (scenario_id, section_id, action, summary, detail, actor_id, actor_email, undoes_id)
  values
    (v_row.scenario_id, v_section, v_action,
     coalesce(v_label, 'a course') || ' ' || v_row.section_letter,
     v_detail, v_actor.id, v_actor.email, undoing_change_id());

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
    (scenario_id, section_id, action, summary, detail, actor_id, actor_email, undoes_id)
  values
    (v_scen, v_section, v_action,
     coalesce(v_who, 'someone') || ' — ' || coalesce(v_label, 'a section'),
     jsonb_build_object('section_id',    v_row.section_id,
                        'instructor_id', v_row.instructor_id,
                        'is_primary',    v_row.is_primary),
     v_actor.id, v_actor.email, undoing_change_id());

  return coalesce(new, old);
end $$;

-- A deletion has to be logged before the row and its assignments go.
drop trigger t_sections_log on sections;
create trigger t_sections_log
  after insert or update on sections
  for each row execute function log_section_change();
create trigger t_sections_log_delete
  before delete on sections
  for each row execute function log_section_change();

-- ----------------------------------------------------------------- undoing --

create or replace function undo_change(p_change_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  v       scenario_changes;
  v_sec   sections;
  v_link  jsonb;
  v_count int;
begin
  -- SECURITY DEFINER bypasses RLS, so the check the policies would have made
  -- has to be made here instead.
  if not is_coordinator() then
    raise exception 'only a coordinator can undo a change';
  end if;

  select * into v from scenario_changes where id = p_change_id for update;
  if not found then
    raise exception 'that change is not in the log';
  end if;
  if v.undone_at is not null then
    raise exception 'that change has already been undone';
  end if;
  if v.detail = '{}'::jsonb then
    raise exception 'that change was recorded before undo existed, so there is nothing to reverse it with';
  end if;
  if exists (select 1 from scenarios where id = v.scenario_id and is_locked) then
    raise exception 'this scenario is locked';
  end if;

  -- Everything below writes through the ordinary tables, so the reversal is
  -- itself logged, and points back here.
  perform set_config('app.undoing_change_id', p_change_id::text, true);

  if v.action = 'assigned' then
    delete from section_instructors
     where section_id    = (v.detail->>'section_id')::uuid
       and instructor_id = (v.detail->>'instructor_id')::uuid;
    get diagnostics v_count = row_count;
    if v_count = 0 then
      raise exception 'that assignment is already gone';
    end if;

  elsif v.action = 'unassigned' then
    if not exists (select 1 from sections where id = (v.detail->>'section_id')::uuid) then
      raise exception 'that section no longer exists, so nobody can be put back on it';
    end if;
    if not exists (select 1 from instructors where id = (v.detail->>'instructor_id')::uuid) then
      raise exception 'that instructor is no longer on the roster';
    end if;
    insert into section_instructors (section_id, instructor_id, is_primary)
    values ((v.detail->>'section_id')::uuid,
            (v.detail->>'instructor_id')::uuid,
            coalesce((v.detail->>'is_primary')::boolean, true))
    on conflict (section_id, instructor_id) do nothing;

  elsif v.action = 'created' then
    v_sec := jsonb_populate_record(null::sections, v.detail->'section');
    if not exists (select 1 from sections where id = v_sec.id) then
      raise exception 'that section has already been removed';
    end if;
    -- Removing it would cascade away work done since. Say so rather than do it.
    if exists (select 1 from section_instructors where section_id = v_sec.id) then
      raise exception 'that section has instructors assigned now; unassign them first';
    end if;
    delete from sections where id = v_sec.id;

  elsif v.action = 'updated' then
    v_sec := jsonb_populate_record(null::sections, v.detail->'section');
    update sections set
      term_id        = v_sec.term_id,
      course_id      = v_sec.course_id,
      section_letter = v_sec.section_letter,
      time_slot_id   = v_sec.time_slot_id,
      custom_days    = v_sec.custom_days,
      custom_start   = v_sec.custom_start,
      custom_end     = v_sec.custom_end,
      is_arranged    = v_sec.is_arranged,
      modality       = v_sec.modality,
      room_id        = v_sec.room_id,
      enrollment_cap = v_sec.enrollment_cap,
      credits        = v_sec.credits,
      status         = v_sec.status,
      sln            = v_sec.sln,
      notes          = v_sec.notes
     where id = v_sec.id;
    get diagnostics v_count = row_count;
    if v_count = 0 then
      raise exception 'that section no longer exists';
    end if;

  elsif v.action = 'deleted' then
    v_sec := jsonb_populate_record(null::sections, v.detail->'section');
    if exists (select 1 from sections where id = v_sec.id) then
      raise exception 'that section is back already';
    end if;
    begin
      insert into sections
      select * from jsonb_populate_record(null::sections, v.detail->'section');
    exception
      when unique_violation then
        raise exception 'another section now holds that course and letter in that quarter';
      when foreign_key_violation then
        raise exception 'something that section referred to has since been deleted';
    end;
    -- Its instructors went with it; put back the ones still on the roster.
    for v_link in select * from jsonb_array_elements(coalesce(v.detail->'assignments', '[]'::jsonb)) loop
      insert into section_instructors (section_id, instructor_id, is_primary)
      select v_sec.id, (v_link->>'instructor_id')::uuid,
             coalesce((v_link->>'is_primary')::boolean, true)
       where exists (select 1 from instructors where id = (v_link->>'instructor_id')::uuid)
      on conflict (section_id, instructor_id) do nothing;
    end loop;

  else
    raise exception 'that kind of change cannot be undone';
  end if;

  perform set_config('app.undoing_change_id', '', true);

  update scenario_changes
     set undone_at = now(), undone_by = auth.uid()
   where id = p_change_id;

  return v.summary;
end $$;

/*
 * Several entries at once — one burst of assignments taken back together.
 * A plpgsql function is one transaction, so either the whole group reverses or
 * none of it does, and newest-first keeps a group internally consistent.
 *
 * An entry that cannot be reversed is skipped rather than fatal, because in a
 * group of two hundred one stale row should not block the other hundred and
 * ninety-nine. If nothing at all could be reversed, the first reason is
 * raised: a silent no-op would be the worst of both.
 */
create or replace function undo_changes(p_ids bigint[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_id  bigint;
  v_n   int  := 0;
  v_err text;
begin
  if not is_coordinator() then
    raise exception 'only a coordinator can undo a change';
  end if;

  for v_id in select unnest(p_ids) order by 1 desc loop
    begin
      perform undo_change(v_id);
      v_n := v_n + 1;
    exception when others then
      if v_err is null then v_err := sqlerrm; end if;
    end;
  end loop;

  if v_n = 0 and v_err is not null then
    raise exception '%', v_err;
  end if;
  return v_n;
end $$;

-- ------------------------------------------------------------------ access --

-- Trigger functions and a helper nothing outside the database calls.
revoke all on function log_section_change()    from public, anon, authenticated;
revoke all on function log_assignment_change() from public, anon, authenticated;
revoke all on function undoing_change_id()     from public, anon, authenticated;

-- Called by the board over /rest/v1/rpc, so `authenticated` needs EXECUTE.
-- Both check is_coordinator() themselves; `anon` must not reach them at all.
revoke all on function undo_change(bigint)  from public, anon;
revoke all on function undo_changes(bigint[]) from public, anon;
grant execute on function undo_change(bigint)  to authenticated;
grant execute on function undo_changes(bigint[]) to authenticated;
