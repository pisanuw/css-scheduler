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
  v_draft uuid; v_sub_olson uuid; n int;
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

  select count(*) into n from scenarios;
  insert into _res(check_name,result,expected) values ('instructor sees draft scenarios', n::text, '0');
  select count(*) into n from sections;
  insert into _res(check_name,result,expected) values ('instructor sees draft sections', n::text, '0');
  select count(*) into n from section_meetings;
  insert into _res(check_name,result,expected) values ('instructor sees section_meetings view', n::text, '0');

  -- --------------------------------------------------------- coordinator --
  perform set_config('request.jwt.claim.sub', v_coord::text, true);
  select count(*) into n from preference_submissions;
  insert into _res(check_name,result,expected) values ('coordinator sees all submissions', n::text, '2');
  select count(*) into n from scenarios;
  insert into _res(check_name,result,expected) values ('coordinator sees draft scenarios', n::text, '1');
  select count(*) into n from section_meetings;
  insert into _res(check_name,result,expected) values ('coordinator sees section_meetings view', n::text, '1');

  -- -------------------------------------------------------------- cleanup --
  reset role;
  delete from sections where scenario_id=v_draft;
  delete from scenarios where id=v_draft;
  delete from preference_cycles where id in (v_cycle, v_closed);
  delete from auth.users where email like 'rls-test-%';

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
           (select count(*) from scenarios where name like 'rls-test %')::text || ' scenarios',
           '0 users, 0 profiles, 0 submissions, 0 scenarios';
end $$;

select check_name, result, expected,
       case when result = expected then 'PASS' else 'FAIL' end as verdict
from _res order by ord;
