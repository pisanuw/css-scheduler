-- ============================================================================
-- Row level security regression test.
--
-- Creates two throwaway users, exercises the policy matrix as each of them,
-- then deletes everything it made. Run it against any environment; it reports
-- PASS/FAIL per check and leaves no residue.
--
--   npm run db:test:rls
-- ============================================================================

create temp table _res (ord serial, check_name text, result text, expected text);
grant all on _res to authenticated;
grant usage, select on sequence _res_ord_seq to authenticated;

do $$
declare
  v_coord uuid; v_inst uuid; v_laurie uuid; v_olson uuid;
  v_cycle uuid; v_closed uuid; v_ay uuid; v_term uuid; v_course uuid; v_slot uuid;
  v_draft uuid; v_sub_olson uuid; v_ay2 uuid; n int;
  v_official uuid; v_oterm uuid; v_osection uuid; v_ayt uuid;
begin
  insert into auth.users (id, email) values (gen_random_uuid(), 'rls-test-a@uw.edu') returning id into v_coord;
  insert into auth.users (id, email) values (gen_random_uuid(), 'rls-test-b@uw.edu') returning id into v_inst;
  select id into v_laurie from instructors where full_name='Laurie Anderson';
  select id into v_olson  from instructors where full_name='Clark Olson';
  update profiles set role='coordinator'    where id=v_coord;
  update profiles set instructor_id=v_laurie where id=v_inst;

  select id into v_ay     from academic_years where start_year=2026;
  select id into v_term   from terms where academic_year_id=v_ay and quarter='autumn';
  select id into v_course from courses where number=343;
  select id into v_slot   from time_slots where day_pattern='MW' and start_time='13:15';

  insert into preference_cycles (academic_year_id,name,status) values (v_ay,'rls-test open','open')   returning id into v_cycle;
  insert into preference_cycles (academic_year_id,name,status) values (v_ay,'rls-test closed','closed') returning id into v_closed;
  insert into preference_submissions (cycle_id,instructor_id,status) values (v_cycle,v_olson,'draft') returning id into v_sub_olson;
  insert into scenarios (academic_year_id,name,status) values (v_ay,'rls-test draft','draft') returning id into v_draft;
  insert into sections (scenario_id,term_id,course_id,section_letter,time_slot_id) values (v_draft,v_term,v_course,'A',v_slot);

  -- The official scenario gets an academic year of its own. Only one scenario
  -- per year may be official, so hanging this off a real year would make the
  -- suite fail the day the coordinator publishes one.
  insert into academic_years (name,start_year) values ('rls-test year',1999) returning id into v_ayt;
  insert into terms (academic_year_id,quarter,sort_order) values (v_ayt,'autumn',1) returning id into v_oterm;
  insert into scenarios (academic_year_id,name,status) values (v_ayt,'rls-test official','official') returning id into v_official;
  insert into sections (scenario_id,term_id,course_id,section_letter,time_slot_id)
    values (v_official,v_oterm,v_course,'A',v_slot) returning id into v_osection;
  insert into section_instructors (section_id,instructor_id) values (v_osection,v_laurie);

  -- ---------------------------------------------------------- instructor --
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_inst::text, true);

  select count(*) into n from courses;
  insert into _res(check_name,result,expected) values ('instructor reads catalog', n::text, '128');
  select count(*) into n from preference_submissions;
  insert into _res(check_name,result,expected) values ('instructor sees others submissions', n::text, '0');

  begin
    insert into preference_submissions (cycle_id,instructor_id,status) values (v_cycle,v_laurie,'draft');
    insert into _res(check_name,result,expected) values ('instructor writes own submission (open cycle)','accepted','accepted');
  exception when others then
    insert into _res(check_name,result,expected) values ('instructor writes own submission (open cycle)','BLOCKED: '||sqlerrm,'accepted');
  end;

  begin
    insert into preference_submissions (cycle_id,instructor_id,status) values (v_closed,v_laurie,'draft');
    insert into _res(check_name,result,expected) values ('instructor writes own submission (closed cycle)','ACCEPTED','blocked');
  exception when others then
    insert into _res(check_name,result,expected) values ('instructor writes own submission (closed cycle)','blocked','blocked');
  end;

  begin
    insert into preference_courses (submission_id,course_id,tier) values (v_sub_olson,v_course,'eager');
    insert into _res(check_name,result,expected) values ('instructor writes to others submission','ACCEPTED','blocked');
  exception when others then
    insert into _res(check_name,result,expected) values ('instructor writes to others submission','blocked','blocked');
  end;

  begin
    update profiles set role='coordinator' where id=v_inst;
    get diagnostics n = row_count;
    insert into _res(check_name,result,expected)
      values ('instructor escalates own role', case when n>0 then 'ESCALATED' else 'blocked' end, 'blocked');
  exception when others then
    insert into _res(check_name,result,expected) values ('instructor escalates own role','blocked','blocked');
  end;

  update courses set title='tampered' where number=343;
  get diagnostics n = row_count;
  insert into _res(check_name,result,expected)
    values ('instructor edits catalog', case when n>0 then 'EDITED' else 'blocked' end, 'blocked');

  -- Scoped to this suite's own rows throughout: whole-table counts break the
  -- moment the coordinator has real drafts of their own.
  select count(*) into n from scenarios where id = v_draft;
  insert into _res(check_name,result,expected) values ('instructor sees draft scenarios', n::text, '0');
  select count(*) into n from sections where scenario_id = v_draft;
  insert into _res(check_name,result,expected) values ('instructor sees draft sections', n::text, '0');
  select count(*) into n from section_meetings where scenario_id = v_draft;
  insert into _res(check_name,result,expected) values ('instructor sees section_meetings view', n::text, '0');

  -- The published schedule, on the other hand, is exactly what they should see.
  select count(*) into n from scenarios where id = v_official;
  insert into _res(check_name,result,expected) values ('instructor sees official scenario', n::text, '1');
  select count(*) into n from sections where scenario_id = v_official;
  insert into _res(check_name,result,expected) values ('instructor sees official sections', n::text, '1');
  select count(*) into n from section_instructors where section_id = v_osection;
  insert into _res(check_name,result,expected) values ('instructor sees official assignments', n::text, '1');

  -- Reading the board is not editing it. Both writes are coordinator-only.
  begin
    insert into section_instructors (section_id,instructor_id) values (v_osection,v_olson);
    insert into _res(check_name,result,expected) values ('instructor assigns an instructor','INSERTED','blocked');
  exception when insufficient_privilege or check_violation then
    insert into _res(check_name,result,expected) values ('instructor assigns an instructor','blocked','blocked');
  end;

  delete from section_instructors where section_id = v_osection;
  get diagnostics n = row_count;
  insert into _res(check_name,result,expected)
    values ('instructor unassigns an instructor', case when n>0 then 'DELETED' else 'blocked' end, 'blocked');

  -- --------------------------------------------------------- coordinator --
  perform set_config('request.jwt.claim.sub', v_coord::text, true);
  select count(*) into n from preference_submissions;
  insert into _res(check_name,result,expected) values ('coordinator sees all submissions', n::text, '2');
  select count(*) into n from scenarios where id = v_draft;
  insert into _res(check_name,result,expected) values ('coordinator sees draft scenarios', n::text, '1');
  select count(*) into n from section_meetings where scenario_id = v_draft;
  insert into _res(check_name,result,expected) values ('coordinator sees section_meetings view', n::text, '1');
  select count(*) into n from section_instructors where section_id = v_osection;
  insert into _res(check_name,result,expected) values ('coordinator sees assignments', n::text, '1');

  -- ------------------------------------------------------ teaching load --
  -- Baseline minus releases, as the instructor_load_targets view computes it.
  select id into v_ay2 from academic_years where start_year = 2025;

  -- A tenure-track baseline of 5, untouched.
  insert into _res(check_name,result,expected)
    select 'tenure-track baseline with no releases',
           (select effective_target::text from instructor_load_targets
             where instructor_id = v_olson and academic_year_id = v_ay), '5.0';

  -- A release pinned to one year applies only to that year.
  insert into teaching_releases (instructor_id, academic_year_id, courses, reason)
    values (v_olson, v_ay, 2, 'rls-test grant buyout');
  insert into _res(check_name,result,expected)
    select 'year-specific release reduces that year',
           (select effective_target::text from instructor_load_targets
             where instructor_id = v_olson and academic_year_id = v_ay), '3.0';
  insert into _res(check_name,result,expected)
    select 'year-specific release leaves other years alone',
           (select effective_target::text from instructor_load_targets
             where instructor_id = v_olson and academic_year_id = v_ay2), '5.0';

  -- A standing release (null year) applies to every year. Asserted as "every
  -- row agrees" rather than as a list of values, so adding an academic year
  -- does not break a check that is not about how many years there are.
  insert into teaching_releases (instructor_id, academic_year_id, courses, reason)
    values (v_laurie, null, 3, 'rls-test standing chair service');
  insert into _res(check_name,result,expected)
    select 'standing release applies to every year',
           (select (count(*) > 0 and count(*) = count(*) filter (where effective_target = 5.0))::text
              from instructor_load_targets where instructor_id = v_laurie), 'true';

  -- Releasing more than the baseline floors at zero, never negative.
  insert into teaching_releases (instructor_id, academic_year_id, courses, reason)
    values (v_olson, v_ay, 99, 'rls-test full year leave');
  insert into _res(check_name,result,expected)
    select 'over-release floors at zero',
           (select effective_target::text from instructor_load_targets
             where instructor_id = v_olson and academic_year_id = v_ay), '0.0';

  -- Per-course hires have no baseline, so no target at all.
  insert into _res(check_name,result,expected)
    select 'per-course hire has no target',
           coalesce((select effective_target::text from instructor_load_targets
                      where instructor_id = (select id from instructors
                                              where category='part_time' limit 1)
                        and academic_year_id = v_ay), 'null'), 'null';

  delete from teaching_releases where reason like 'rls-test %';

  -- An instructor may read the view but must not grant themselves a release.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_inst::text, true);
  select count(*) into n from instructor_load_targets;
  insert into _res(check_name,result,expected)
    values ('instructor can read load targets', (n > 0)::text, 'true');
  begin
    insert into teaching_releases (instructor_id, academic_year_id, courses, reason)
      values (v_laurie, v_ay, 4, 'rls-test self-granted');
    insert into _res(check_name,result,expected)
      values ('instructor cannot grant themselves a release','ACCEPTED','blocked');
  exception when others then
    insert into _res(check_name,result,expected)
      values ('instructor cannot grant themselves a release','blocked','blocked');
  end;
  reset role;

  -- --------------------------------------------------------- access log --
  declare uid_log uuid := gen_random_uuid(); before_n int;
  begin
    select count(*) into before_n from access_log;

    insert into auth.users (id, email, raw_app_meta_data)
      values (uid_log, 'log-probe@uw.edu', '{"provider":"google"}');
    insert into _res(check_name,result,expected)
      select 'new account logs sign_up',
             coalesce((select event from access_log where email='log-probe@uw.edu'
                        order by id desc limit 1), 'none'), 'sign_up';

    -- GoTrue bumps last_sign_in_at on every sign-in; that is the signal.
    update auth.users set last_sign_in_at = now() where id = uid_log;
    insert into _res(check_name,result,expected)
      select 'returning sign-in logs sign_in',
             coalesce((select event from access_log where email='log-probe@uw.edu'
                        order by id desc limit 1), 'none'), 'sign_in';

    -- Any other column changing must not produce a spurious entry.
    update auth.users set raw_user_meta_data = '{"noise":true}' where id = uid_log;
    insert into _res(check_name,result,expected)
      select 'unrelated update does not log',
             (select count(*) from access_log where email='log-probe@uw.edu')::text, '2';

    -- History outlives the account it describes.
    delete from auth.users where id = uid_log;
    insert into _res(check_name,result,expected)
      select 'history survives account deletion',
             (select count(*) from access_log where email='log-probe@uw.edu')::text, '2';
    insert into _res(check_name,result,expected)
      select 'deleted account leaves a null user_id, not a dangling one',
             (select count(*) from access_log
               where email='log-probe@uw.edu' and user_id is null)::text, '2';

    delete from access_log where email='log-probe@uw.edu';
    insert into _res(check_name,result,expected)
      select 'access log probe cleanup', (select count(*) from access_log)::text, before_n::text;
  end;

  -- The log is admin information: instructors must not see it at all.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_inst::text, true);
  select count(*) into n from access_log;
  insert into _res(check_name,result,expected)
    values ('instructor cannot read the access log', n::text, '0');
  select count(*) into n from access_summary;
  insert into _res(check_name,result,expected)
    values ('instructor cannot read the access summary', n::text, '0');

  perform set_config('request.jwt.claim.sub', v_coord::text, true);
  select count(*) into n from access_log;
  insert into _res(check_name,result,expected)
    values ('coordinator can read the access log', (n > 0)::text, 'true');
  reset role;

  -- ------------------------------------------------- coordinator grants --
  -- Uses throwaway addresses, never the real coordinators'.
  reset role;

  insert into bootstrap_coordinators (email, note) values ('coord-probe@uw.edu','rls-test probe');
  insert into auth.users (id, email) values (gen_random_uuid(), 'coord-probe@uw.edu');
  insert into _res(check_name,result,expected)
    select 'listed in bootstrap -> coordinator on first sign-in',
           (select role::text from profiles where email='coord-probe@uw.edu'), 'coordinator';

  insert into auth.users (id, email) values (gen_random_uuid(), 'later-probe@uw.edu');
  insert into _res(check_name,result,expected)
    select 'not listed -> plain instructor',
           (select role::text from profiles where email='later-probe@uw.edu'), 'instructor';

  -- Someone added to the list after they already have an account: the trigger
  -- has been and gone, so the sync in seed.sql is what reaches them.
  insert into bootstrap_coordinators (email, note) values ('later-probe@uw.edu','rls-test probe');
  update profiles p set role='coordinator'
    from bootstrap_coordinators b
   where b.email = p.email and p.role <> 'coordinator';
  insert into _res(check_name,result,expected)
    select 'added to bootstrap later -> promoted by sync',
           (select role::text from profiles where email='later-probe@uw.edu'), 'coordinator';

  delete from auth.users where email in ('coord-probe@uw.edu','later-probe@uw.edu');
  delete from bootstrap_coordinators where note = 'rls-test probe';

  -- -------------------------------------------------------------- cleanup --
  delete from sections where scenario_id=v_draft;
  delete from scenarios where id=v_draft;
  -- Cascades through terms, the official scenario, its section and assignment.
  delete from academic_years where id=v_ayt;
  delete from preference_cycles where id in (v_cycle, v_closed);
  delete from auth.users where email like 'rls-test-%';
  -- Every throwaway account this suite creates also lands in access_log, and
  -- those rows deliberately outlive the account. Without this the real log
  -- fills with phantom sign-ins, one set per run.
  delete from access_log
   where email like 'rls-test-%'
      or email like '%-probe@uw.edu';

  -- Scoped to rows THIS test created. Counting whole tables would break the
  -- moment a real person signs in, which is exactly what happened once.
  insert into _res(check_name,result,expected)
    select 'cleanup leaves no residue',
           (select count(*) from auth.users where email like 'rls-test-%')::text || ' users, ' ||
           (select count(*) from profiles p
              join auth.users u on u.id = p.id
             where u.email like 'rls-test-%')::text || ' profiles, ' ||
           (select count(*) from preference_submissions ps
              join preference_cycles c on c.id = ps.cycle_id
             where c.name like 'rls-test %')::text || ' submissions, ' ||
           (select count(*) from scenarios where name like 'rls-test %')::text || ' scenarios, ' ||
           (select count(*) from academic_years where start_year = 1999)::text || ' test years, ' ||
           (select count(*) from bootstrap_coordinators where note = 'rls-test probe')::text || ' probes, ' ||
           (select count(*) from teaching_releases where reason like 'rls-test %')::text || ' releases, ' ||
           (select count(*) from access_log
             where email like 'rls-test-%' or email like '%-probe@uw.edu')::text || ' log rows',
           '0 users, 0 profiles, 0 submissions, 0 scenarios, 0 test years, 0 probes, 0 releases, 0 log rows';
end $$;

select check_name, result, expected,
       case when result = expected then 'PASS' else 'FAIL' end as verdict
from _res order by ord;
