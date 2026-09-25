-- ============================================================================
-- CSS Scheduler — core schema
-- Assigning UW Bothell CSS instructors to course sections.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------- enums ----
create type user_role            as enum ('coordinator','instructor','viewer');
create type instructor_category  as enum ('full_time','affiliate','part_time','emeritus','other');
create type quarter              as enum ('autumn','winter','spring','summer');
create type course_level         as enum ('undergraduate','graduate');
create type modality             as enum ('in_person','hybrid','online_sync','online_async');
create type pref_tier            as enum ('eager','willing','reluctant','unqualified');
create type time_of_day          as enum ('morning','midday','afternoon','evening');
create type cycle_status         as enum ('draft','open','closed','archived');
create type submission_status    as enum ('not_started','draft','submitted');
create type scenario_status      as enum ('draft','official','archived');
create type section_status       as enum ('planned','staffed','confirmed','cancelled');
create type qualification_source as enum ('coordinator','self','history');

-- Shared updated_at trigger.
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- =========================================================== reference ======

create table instructors (
  id                     uuid primary key default gen_random_uuid(),
  full_name              text not null,
  last_name              text,
  first_name             text,
  -- Nullable: people appear in historical schedules before they have an account.
  email                  citext unique,
  rank                   text,
  category               instructor_category not null default 'other',
  is_active              boolean not null default true,
  -- Load targets. Null means "coordinator has not set one" (per-course hires).
  annual_target_courses  numeric(4,1),
  max_courses_per_quarter int,
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- Names are the stable key for seeding: people appear in historical
  -- schedules long before (or without ever) having a uw.edu account here.
  unique (full_name)
);
create index on instructors (is_active, category);
create trigger t_instructors_updated before update on instructors
  for each row execute function set_updated_at();

create table courses (
  id           uuid primary key default gen_random_uuid(),
  subject      text not null default 'CSS',
  number       int  not null,
  code         text generated always as (subject || ' ' || number::text) stored,
  title        text not null,
  credits_min  numeric(3,1) not null default 5,
  credits_max  numeric(3,1) not null default 5,
  level        course_level not null,
  prereq_text  text,
  -- v1 scope is undergraduate; graduate rows are seeded inactive so that
  -- historical data imports cleanly and the scope can widen without migration.
  is_active    boolean not null default true,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (subject, number),
  check (credits_max >= credits_min)
);
create trigger t_courses_updated before update on courses
  for each row execute function set_updated_at();

create table buildings (
  id   uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text
);

create table rooms (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings on delete cascade,
  room_number text not null,
  capacity    int,
  label       text generated always as (room_number) stored,
  unique (building_id, room_number)
);

-- The standard UW Bothell meeting grid, mined from real CSS time schedules.
-- `days` is ISO day-of-week (1=Mon .. 7=Sun) and drives overlap detection.
create table time_slots (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  day_pattern text not null,
  days        smallint[] not null,
  start_time  time not null,
  end_time    time not null,
  is_standard boolean not null default true,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  unique (day_pattern, start_time, end_time),
  check (end_time > start_time),
  check (array_length(days,1) >= 1)
);

-- ==================================================== academic structure ====

create table academic_years (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,          -- '2025-26'
  start_year int  not null unique,          -- 2025
  is_current boolean not null default false
);

create table terms (
  id               uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references academic_years on delete cascade,
  quarter          quarter not null,
  sort_order       int not null default 0,
  unique (academic_year_id, quarter)
);

-- ========================================================== identity ========

create table profiles (
  id            uuid primary key references auth.users on delete cascade,
  email         citext not null unique,
  full_name     text,
  role          user_role not null default 'instructor',
  -- Links a signed-in account to its instructor record (matched by email).
  instructor_id uuid unique references instructors on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger t_profiles_updated before update on profiles
  for each row execute function set_updated_at();

-- ======================================================== preferences =======

create table preference_cycles (
  id               uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references academic_years on delete cascade,
  name             text not null,
  status           cycle_status not null default 'draft',
  opens_at         timestamptz,
  closes_at        timestamptz,
  instructions     text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (academic_year_id, name)
);
create trigger t_cycles_updated before update on preference_cycles
  for each row execute function set_updated_at();

-- One row per instructor per cycle. Scalar day/time/modality answers live
-- here; the repeating answers hang off it in the two child tables below.
create table preference_submissions (
  id                    uuid primary key default gen_random_uuid(),
  cycle_id              uuid not null references preference_cycles on delete cascade,
  instructor_id         uuid not null references instructors on delete cascade,
  status                submission_status not null default 'not_started',
  submitted_at          timestamptz,
  preferred_days        smallint[] not null default '{}',
  blocked_days          smallint[] not null default '{}',
  preferred_times       time_of_day[] not null default '{}',
  -- Hard blocks against specific grid slots (e.g. a standing Tuesday meeting).
  blocked_time_slot_ids uuid[] not null default '{}',
  modality_prefs        modality[] not null default '{}',
  prefers_repeat_prep   boolean,
  wants_back_to_back    boolean,
  max_new_preps         int,
  note_to_coordinator   text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (cycle_id, instructor_id)
);
create trigger t_submissions_updated before update on preference_submissions
  for each row execute function set_updated_at();

create table preference_courses (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references preference_submissions on delete cascade,
  course_id     uuid not null references courses on delete cascade,
  tier          pref_tier not null,
  rank          int,
  note          text,
  unique (submission_id, course_id)
);
create index on preference_courses (course_id, tier);

create table preference_terms (
  id                   uuid primary key default gen_random_uuid(),
  submission_id        uuid not null references preference_submissions on delete cascade,
  term_id              uuid not null references terms on delete cascade,
  available            boolean not null default true,
  desired_course_count int,
  leave_reason         text,
  unique (submission_id, term_id)
);

create table instructor_qualifications (
  id            uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references instructors on delete cascade,
  course_id     uuid not null references courses on delete cascade,
  source        qualification_source not null default 'coordinator',
  unique (instructor_id, course_id)
);

-- ========================================================= scheduling ======

-- Named what-if drafts. Exactly one scenario per year may be 'official'.
create table scenarios (
  id               uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references academic_years on delete cascade,
  name             text not null,
  description      text,
  status           scenario_status not null default 'draft',
  is_locked        boolean not null default false,
  created_by       uuid references profiles on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (academic_year_id, name)
);
create unique index one_official_scenario_per_year
  on scenarios (academic_year_id) where status = 'official';
create trigger t_scenarios_updated before update on scenarios
  for each row execute function set_updated_at();

create table sections (
  id              uuid primary key default gen_random_uuid(),
  scenario_id     uuid not null references scenarios on delete cascade,
  term_id         uuid not null references terms on delete cascade,
  course_id       uuid not null references courses on delete restrict,
  section_letter  text not null,
  -- A section takes its time from the standard grid, from a custom override,
  -- or has no fixed time at all ("to be arranged", e.g. CSS 498/499).
  time_slot_id    uuid references time_slots on delete restrict,
  custom_days     smallint[],
  custom_start    time,
  custom_end      time,
  is_arranged     boolean not null default false,
  modality        modality not null default 'in_person',
  room_id         uuid references rooms on delete set null,
  enrollment_cap  int,
  -- Overrides the course default for variable-credit courses (CSS 198/498/...).
  credits         numeric(3,1),
  status          section_status not null default 'planned',
  sln             text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (scenario_id, term_id, course_id, section_letter),
  check (
    (is_arranged and time_slot_id is null and custom_days is null)
    or (not is_arranged and time_slot_id is not null and custom_days is null)
    or (not is_arranged and time_slot_id is null
        and custom_days is not null and custom_start is not null and custom_end is not null)
  ),
  check (custom_end is null or custom_end > custom_start)
);
create index on sections (scenario_id, term_id);
create index on sections (course_id);
create trigger t_sections_updated before update on sections
  for each row execute function set_updated_at();

-- Separate table so co-taught sections (capstones) are representable.
create table section_instructors (
  id            uuid primary key default gen_random_uuid(),
  section_id    uuid not null references sections on delete cascade,
  instructor_id uuid not null references instructors on delete cascade,
  is_primary    boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (section_id, instructor_id)
);
create index on section_instructors (instructor_id);

-- =========================================== historical offerings ==========

-- Imported from past UW time schedules. Drives "has taught this before"
-- (repeat-prep matching) and seeds qualifications.
create table teaching_history (
  id                  uuid primary key default gen_random_uuid(),
  instructor_id       uuid references instructors on delete set null,
  instructor_name_raw text not null,
  course_id           uuid references courses on delete set null,
  course_code_raw     text not null,
  academic_year       text not null,
  quarter             quarter not null,
  section_letter      text,
  sln                 text,
  days                smallint[],
  start_time          time,
  end_time            time,
  room_label          text,
  enrollment          int,
  enrollment_cap      int,
  modality            modality,
  unique (academic_year, quarter, sln, section_letter)
);
create index on teaching_history (instructor_id);
create index on teaching_history (course_id);

-- ============================================================== views =======

-- Resolves grid-vs-custom timing into one shape for conflict detection.
create view section_meetings as
select s.id           as section_id,
       s.scenario_id,
       s.term_id,
       s.course_id,
       coalesce(ts.days,       s.custom_days)  as days,
       coalesce(ts.start_time, s.custom_start) as start_time,
       coalesce(ts.end_time,   s.custom_end)   as end_time
from sections s
left join time_slots ts on ts.id = s.time_slot_id
where not s.is_arranged;
