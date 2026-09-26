# CSS Scheduler — design

Assigning UW Bothell CSS instructors to course sections across Autumn, Winter
and Spring.

## The problem

Each year the CSS teaching coordinator has to place roughly 80 sections across
roughly 50 instructors. Every instructor has preferences about which courses
they teach, which quarters they are available, and which days and times suit
them. The constraints that actually bite are mundane — nobody can teach two
courses in the same slot, a teaching professor owes six courses a year, someone
is on sabbatical in Winter — and they are easy to violate when the working
document is a spreadsheet.

The goal is not to automate the decision. It is to make the constraints visible
while a human makes it.

## Decisions

| Area | Choice |
| --- | --- |
| Preference collection | Instructors sign in and submit their own |
| Assignment | Manual board, with continuous conflict detection |
| Solver | None in v1; the data model leaves room for one |
| Stack | Vite + React + TypeScript, static on Netlify |
| Backend | Supabase (Postgres, Google OAuth, row level security) — no server of our own |
| Scope | Undergraduate CSS 100–499 |
| Time model | The standard UW Bothell grid, with a custom override |
| Load | Rank baseline (8 teaching track, 5 tenure track) minus coordinator-granted releases |
| Drafts | Named scenarios; one per year can be marked official |

## Where the seed data comes from

Three real time schedules (`past-course-schedules/*.pdf`, Autumn 2025 through
Spring 2026) were parsed into `scripts/data/history_sections.csv`: 240 sections,
199 of them staffed, 59 distinct instructors. Two things fell out of that which
guesswork would have got wrong:

**The time grid is real, not invented.** CSS uses two-day patterns against six
fixed blocks:

| | |
| --- | --- |
| 8:45–10:45 AM | 11:00 AM–1:00 PM |
| 1:15–3:15 PM | 3:30–5:30 PM |
| 5:45–7:45 PM | 8:00–10:00 PM |

MW and TTh are the standard patterns. Single days (M, T, W, Th, F) appear for
hybrid sections that meet in person one day and online the other. Independent
study and internship courses are "to be arranged" and have no slot at all.

**The roster is wider than the faculty directory.** 21 people taught CSS courses
in those three quarters without appearing on the CSS faculty page, and at least
one emeritus (Robert Dimpsey) is actively teaching. The instructor table is
therefore editable and not derived from the directory.

## Data model

Four groups of tables.

**Reference** — `courses`, `instructors`, `time_slots`, `buildings`, `rooms`.
Slowly changing, coordinator-owned, readable by anyone signed in.

**Academic structure** — `academic_years` and `terms`. Everything scheduled
hangs off a term.

**Preferences** — a `preference_cycles` row opens a submission window for a
year. Each instructor gets one `preference_submissions` row holding their
scalar answers (days, times, modality, new-prep limit, a free-text note), with
`preference_courses` (one row per course, tiered eager / willing / reluctant /
unqualified) and `preference_terms` (availability and desired count per
quarter) hanging off it.

**Scheduling** — a `scenarios` row is one named draft of a year. It owns
`sections`, and each section owns `section_instructors`. Co-teaching is
representable because the join table allows more than one instructor per
section.

Two details worth knowing:

- A section takes its meeting time from `time_slot_id`, *or* from
  `custom_days` + `custom_start` + `custom_end`, *or* is `is_arranged`. A check
  constraint enforces exactly one of the three, and the `section_meetings` view
  flattens the first two into one shape for conflict detection.
- A partial unique index allows only one scenario per year to be `official`.

## Teaching load

The annual baseline comes from rank: **8 courses on the teaching track**, **5
on the tenure track**. Affiliates, part-time lecturers and emeriti carry no
baseline at all — they are hired per course, so their target is null rather
than zero, and the conflict engine skips the load rules for them entirely.

Actual load varies, because the coordinator grants releases for administrative
service, grant buyouts and course development. Those are stored as rows in
`teaching_releases` rather than as an edit to a single number, which buys three
things:

- The *reason* survives, so a target of 3 is defensible a year later.
- A release granted for one year does not quietly carry into the next.
- Several releases accumulate independently and can be removed one at a time.

`academic_year_id` is nullable, and that nullability is the whole mechanism for
ongoing service: a row pinned to a year applies only to that year, while a row
with no year is a standing release that applies to every year until it is
removed. A chair gets a standing release; a grant buyout gets a pinned one.

The `instructor_load_targets` view computes `baseline − releases` per
instructor per year, floored at zero — a full-year leave can release more than
the baseline, which means "teaching nothing", not a negative obligation. That
view is what feeds `annualTarget` in the conflict engine; nothing downstream
needs to know releases exist.

## Conflict detection

`src/lib/conflicts.ts` is a pure function from a snapshot to a list of
findings. It runs in the browser on every drag, so it does no I/O. Rules:

| Code | Severity | Fires when |
| --- | --- | --- |
| `instructor_time_overlap` | error | Same instructor, same quarter, overlapping meetings |
| `instructor_unavailable_term` | error | Assigned in a quarter they marked off |
| `assigned_unqualified_course` | error | Assigned a course they said they cannot teach |
| `instructor_over_quarter_max` | error | More sections in a quarter than their cap |
| `room_double_booked` | error | Two sections, same room, overlapping meetings |
| `section_unstaffed` | warning | No instructor assigned |
| `assigned_reluctant_course` | warning | Assigned a course they would rather not teach |
| `blocked_day` | warning | Meets on a day they asked to keep free |
| `new_prep_over_limit` | warning | More unfamiliar courses than they asked for |
| `instructor_over_annual_target` | warning | Above their annual course target |
| `instructor_under_annual_target` | info | Below their annual course target |
| `modality_mismatch` | info | Format is not among their preferred ones |

New preps count *distinct courses* an instructor has not taught before, drawn
from `teaching_history` — two sections of one new course is one new prep.

## The assignment board

One scenario at a time, one quarter at a time, with the conflict panel and the
load tallies alongside. Three decisions are worth recording.

**The snapshot always spans the whole year, even though the board shows one
quarter.** Annual targets and new-preparation counts are year-wide quantities,
so handing the engine a single quarter would make it quietly wrong in the
direction that matters least — it would stop reporting the overload it exists
to catch.

**Only submitted preferences are honoured.** `buildSnapshot` skips drafts. A
half-filled draft would have the engine judge an assignment against answers the
instructor has not stood behind, and a draft that says "available: no" simply
because nobody has ticked the box yet is worse than no answer at all. The
Responses page is where the coordinator sees who still owes a submission.

**Assignment is ranked, not alphabetical.** `src/lib/suitability.ts` scores
every instructor for the section being filled and puts the reason next to the
name: what they said about the course, whether the time clashes with something
they already teach, whether they marked the quarter off, how far the assignment
would push them past their target. The penalties are ordered so that a hard
objection (cannot teach it, clashes, unavailable, over the quarter cap) always
outranks a soft one (a new preparation, a day they would rather keep free).
Nobody is hidden — someone who said they cannot teach a course still appears,
last, with the reason spelled out, because the coordinator sometimes has to ask
anyway.

Both files are pure functions over a snapshot, tested directly, for the same
reason the conflict engine is: they re-run on every tap and every keystroke.

## Mobile

The coordinator does this work on a phone, so 375px is the width the layout is
designed at, not one it degrades to. Three rules hold everywhere:

- **Tap to assign.** Tap a section, tap an instructor. There is no drag and
  drop yet, and when it arrives it will be an addition to this path rather than
  a replacement for it.
- **No horizontal page scroll, at any width.** The quarter tab strip is the one
  element allowed to scroll sideways, and only within itself.
- **Every control at least 44px tall.** Including the small ones — the chip
  that unassigns somebody, the severity filters on the conflict panel.

Tables become cards rather than scrolling boxes: the load panel renders one
card per instructor below `sm` and a table above it, with the same numbers in
both. The navigation is a drawer below `md`, because ten destinations do not
fit across a phone and a sideways-scrolling nav bar was worse than a menu.

## Security

Google OAuth through Supabase. Sign-in is restricted to `uw.edu` in two places:
the `hd` hint sent to Google, and — the one that actually enforces it — the
`allowed_email_domains` table checked by the `handle_new_user` trigger, which
rejects anything else.

On first sign-in a profile is created, linked to an `instructors` row by
matching email, and granted the coordinator role if the address appears in
`bootstrap_coordinators`.

Row level security is on for every table (19 tables, 37 policies). Instructors
read reference data, read and write only their own submission, and only while
the cycle is open. Coordinators do everything. Non-coordinators can see a
scenario only once it is marked `official`, so drafts stay private while they
are being worked on.

`supabase/tests/rls_test.sql` is the regression test for all of this. It
creates two throwaway users, exercises the matrix as each, and deletes what it
made:

```bash
npm run db:test:rls   # 40 policy checks, in-database
npm run test:e2e      # 20 checks through the real auth + REST API
```

`test:e2e` creates a throwaway uw.edu account through the real auth API, signs
in, exercises every read and write the app performs, confirms an instructor
cannot reach coordinator data or escalate their own role, and deletes what it
made.

### Access log

Supabase's own `auth.audit_log_entries` is empty on this project, so sign-in
history is not retained anywhere by default. `access_log` records it instead,
written by a trigger on `auth.users` rather than by the application: GoTrue
sets `last_sign_in_at` on every successful sign-in, so the log cannot be
bypassed by a bug or an omission in the client.

Two entry kinds: `sign_up` for first contact, `sign_in` for every return. The
trigger fires only when `last_sign_in_at` actually changes, so unrelated
updates to a user row do not manufacture phantom sign-ins.

`user_id` is nullable and rows are kept when an account is deleted — the email
is the durable record of who it was. That retention has a consequence worth
knowing: the test suites create throwaway accounts, so both of them purge
their own `access_log` rows during cleanup. Without that, every test run left
four phantom sign-ins in the real log.

The log and its `access_summary` view are coordinator-only, unlike the rest of
the reference data, which everyone signed in can read.

### Function privileges, and a trap worth knowing

The policy helpers (`is_coordinator`, `my_instructor_id`, `auth_role`,
`cycle_is_open`) are `SECURITY DEFINER`, which is what lets them read the
caller's profile row without recursing into the policies on `profiles`.

`CREATE FUNCTION` grants `EXECUTE` to `PUBLIC` by default, which is how `anon`
ends up able to call them over `/rest/v1/rpc`. That grant is revoked.

The trap: it is tempting to revoke from `authenticated` too. Doing so breaks
every policy that calls one, with `permission denied for function` rather than
an empty result, because a policy expression is evaluated with the privileges
of the querying role. `authenticated` therefore keeps `EXECUTE`. The RLS test
above is what caught this.

### Linter findings accepted

Two Supabase linter warnings are left standing deliberately:

- **`authenticated` can execute four SECURITY DEFINER functions.** Required, as
  above. They disclose nothing the caller cannot already see: three report on
  the caller's own profile, and `cycle_is_open` reports a cycle status every
  signed-in user may read anyway.
- **`citext` is installed in the `public` schema.** Namespace hygiene only.
  Moving an extension that is in active use as a column type risks breaking
  type resolution for no security gain.

## Iterations

**1 — Foundation (done).** Schema, RLS, seeded catalog and roster, imported
history, Google sign-in, app shell, conflict engine with tests.

**2 — Preference collection (done).** Cycle management for the coordinator,
the instructor preference form (quarters and load, tiered course ratings with
a "taught before" hint, days/times/modality, new-prep limit and a free-text
note), draft-then-submit with revision until the cycle closes, and a
coordinator dashboard showing who has responded with a copyable chase list.
Reminder emails are not built.

**3 — The assignment board (mostly done).** Scenarios (create, rename,
archive, mark one official per year, delete), section CRUD against all three
timing shapes, ranked tap-to-assign, the live conflict panel and per-instructor
load tallies. Not yet: drag and drop as an alternative to tapping, undo, and
seeding a scenario from a past year rather than typing each section in.

**4 — Reporting.** How well preferences were met, CSV and print export,
side-by-side scenario comparison, change log.

**5 — Optional.** Solver-assisted suggestions for unfilled sections, importing
a quarter directly from the UW time schedule, student-facing conflict checks
between required courses.
