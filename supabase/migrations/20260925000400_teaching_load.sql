-- ============================================================================
-- Teaching load: a rank-based baseline, reduced by releases.
--
-- Baselines are 8 courses a year on the teaching track and 5 on the tenure
-- track. Individual load varies because the coordinator grants releases —
-- administrative service, grant buyouts, course development — so the target
-- someone is actually held to is the baseline minus whatever they hold.
--
-- Releases are records rather than an edit to a single number, so the reason
-- survives and a release granted for one year does not quietly carry into the
-- next.
-- ============================================================================

alter table instructors rename column annual_target_courses to base_annual_courses;
comment on column instructors.base_annual_courses is
  'Rank-based annual course load before releases. Null for per-course hires.';

create table teaching_releases (
  id               uuid primary key default gen_random_uuid(),
  instructor_id    uuid not null references instructors on delete cascade,
  -- Null means a standing release that applies every year, for as long as the
  -- row exists (a chair while serving). Set it to pin the release to one year.
  academic_year_id uuid references academic_years on delete cascade,
  courses          numeric(4,1) not null check (courses > 0),
  reason           text not null,
  created_by       uuid references profiles on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on teaching_releases (instructor_id);
create index on teaching_releases (academic_year_id);
create trigger t_releases_updated before update on teaching_releases
  for each row execute function set_updated_at();

-- Effective target per instructor per year. Floored at zero: a full-year leave
-- can release more than the baseline, which means "teaching nothing", not a
-- negative obligation.
create view instructor_load_targets as
select
  i.id                     as instructor_id,
  i.full_name,
  i.category,
  ay.id                    as academic_year_id,
  ay.name                  as academic_year,
  i.base_annual_courses,
  coalesce(r.released, 0)  as released_courses,
  case
    when i.base_annual_courses is null then null
    -- Cast the floor too, so a zeroed target reads '0.0' like every other
    -- value rather than an untyped integer '0'.
    else greatest(i.base_annual_courses - coalesce(r.released, 0), 0)::numeric(4,1)
  end                      as effective_target
from instructors i
cross join academic_years ay
left join lateral (
  select sum(tr.courses) as released
  from teaching_releases tr
  where tr.instructor_id = i.id
    and (tr.academic_year_id = ay.id or tr.academic_year_id is null)
) r on true;

-- Without this the view runs with the creator's rights and ignores the
-- caller's policies. See 20260925000300_harden.sql for how that bit once.
alter view instructor_load_targets set (security_invoker = on);

alter table teaching_releases enable row level security;

create policy teaching_releases_read on teaching_releases
  for select to authenticated using (true);
create policy teaching_releases_write on teaching_releases
  for all to authenticated using (is_coordinator()) with check (is_coordinator());

grant select, insert, update, delete on teaching_releases to authenticated;
grant select on instructor_load_targets to authenticated;
