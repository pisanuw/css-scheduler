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
  that unassigns somebody, the severity filters on the conflict panel, the Undo
  beside a line of the history.

The load panel renders one card per instructor below `sm` and a table above it,
with the same numbers in both. `DataTable`, which backs Courses, Instructors,
History, Responses and Access, is **still a sideways-scrolling box** rather than
cards — no horizontal *page* scroll, but not the card treatment either. That is
the largest remaining gap against the rule above.

The navigation is a drawer below `md`, because thirteen destinations do not fit
across a phone and a sideways-scrolling nav bar was worse than a menu. A skip
link sits before it so a keyboard user does not have to Tab past every
destination to reach the page.

### Checking it, rather than believing it

`npm run check:mobile` builds `harness/`, a second Vite entry that renders each
over-the-page component with fixture data and no Supabase at all, then drives
every scene in a 375px headless Chromium and asserts:

- the document does not scroll sideways, and nothing sticks out past the
  viewport;
- every control is at least 44px in the direction a finger aims at;
- every piece of text clears WCAG AA against the colour actually painted behind
  it — measured by painting each `oklch()` into a canvas and reading the pixel
  back, rather than trusting the palette name;
- the console stays clean;
- and, where a dialog is on screen, that focus moves into it, that neither Tab
  nor Shift+Tab escapes it at any point, and that Escape closes it.

`SHOTS=1 npm run check:mobile` also writes a PNG per scene. Playwright is
deliberately not a dependency — the script finds it locally or globally and
says what to install if it finds neither, so `npm test` stays fast and
dependency-free.

Three runs in a row rebuilt this scaffolding by hand in a temporary directory
and threw it away. The first time it ran as committed code it found five
controls between 24px and 42px and three pieces of text below AA, in pages
that had each been "checked at 375px" by eye.

## Feedback and focus

Every transient message in the app goes through one provider
(`src/components/Toast.tsx`), over one queue whose rules live as plain data in
`src/lib/toast.ts` and are tested there. Before it, the board had a status
strip, the preferences page had a "flash", three dialogs rendered a red
paragraph next to their Save button, and roughly half the mutations — archiving
a scenario, making one official, removing a teaching release, changing a
cycle's status — reported nothing at all whether they worked or failed.

The rules that turned out to matter:

- **An error stays until it is dismissed; anything else clears itself.** A
  failure that has gone by the time the coordinator looks up from the phone is
  worse than no message.
- **The same message twice in a row refreshes rather than stacks.** Tapping a
  failing Save three times is one problem.
- **Two live regions, not one.** Politeness is a property of the region, so
  errors go in an `assertive` region and confirmations in a `polite` one. Both
  are ordinary boxes, not `display: contents`, which drops an element out of the
  accessibility tree in some browsers and would silence them.
- **The stack can be lifted.** `useToastInset` moves it clear of a page's own
  fixed bottom bar; the preferences page's Save and Submit live exactly where
  the toasts otherwise land.

Every modal goes through `src/components/Dialog.tsx`: Escape, backdrop tap,
focus into the dialog on open and back to whatever opened it on close, Tab
cycling inside it, and no scrolling of the page behind. Focus lands on the
dialog itself rather than its first field, on purpose — these are phone-first
sheets, and a keyboard springing up over the list you were about to read is
worse than a tap. The trap's index arithmetic is in `src/lib/focus.ts` so it
can be tested like everything else.

The conflict tally is announced through a visually-hidden `aria-live` region.
The pills above the list are the right shape to scan and the wrong shape to
hear: three button labels read out after every assignment give you the numbers
without telling you whether anything broke.

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
npm run db:test:rls        # 70 policy checks, in-database, against the project
npm run db:test:rls:local  # the same 70, against a throwaway local cluster
npm run test:e2e           # 20 checks through the real auth + REST API
```

The first and third read the CLI's access token from the maintainer's macOS
keychain, which is why neither runs on CI or in a cloud sandbox. That left
firing SQL at the live project as the only way to check a policy change, which
is a poor place to find out a migration is wrong.

`scripts/local_db.sh` closes that gap. The migrations depend on exactly three
things the platform provides — `auth.users`, `auth.uid()` and the four platform
roles — so `supabase/tests/local_shim.sql` can stand them up on a plain
PostgreSQL 16 in a few lines, and the whole suite then runs with no Docker, no
project and no credentials. It is not a replacement for `test:e2e`, which
remains the only check on the real auth and REST layers.

`test:e2e` creates a throwaway uw.edu account through the real auth API, signs
in, exercises every read and write the app performs, confirms an instructor
cannot reach coordinator data or escalate their own role, and deletes what it
made.

### Change log

`scenario_changes` records every section and assignment change, written by
triggers on `sections` and `section_instructors` rather than by the client, for
the same reason `access_log` is: a log the client writes is a log the client
can forget to write.

It is append-only to everyone, coordinators included. There is no insert,
update or delete policy, and the table grant is revoked, so the only way to add
an entry is to actually change something. An audit trail its subject can edit
is not one.

Entries outlive what they describe: `section_id` is set null rather than
cascaded, and the summary is stored as text at write time, because "who removed
CSS 342 B" is exactly the question the log exists to answer and it has to stay
answerable once the row is gone.

One trap, found by the test suite and fixed in
`20260926000200_log_survives_cascade.sql`: a cascading delete removes the
scenario before the sections beneath it, so the section trigger tried to log
against a scenario that no longer existed and the foreign key took the whole
delete down with it. Deleting a scenario failed outright. Both triggers now
check that the row they would point at still exists.

### Undo

The log knew *that* something happened but not how to put it back: `summary` is
prose written for a person, and 'Clark Olson — CSS 343 A' does not identify two
rows. `20260926000400_undo.sql` adds the structured half — `detail`, `undone_at`
and `undoes_id` — and two functions.

Four decisions hold it together.

**Reversing happens in the database, not in the client.** `undo_change(id)` is
`SECURITY DEFINER`, because the log is append-only to everyone and nothing
outside it may mark an entry undone. That means the check RLS would have made
has to be made inside the function instead, which it does: coordinator only,
scenario not locked.

**A reversal is an ordinary write, so it is logged like one.** `undo_change`
does not patch tables behind the triggers' backs; it inserts, updates or deletes
through them, and the entry that results points at what it reversed through
`undoes_id`. Two things fall out of that. The log stays a complete account of
how the schedule got to where it is, and **redo costs nothing** — the entry a
reversal writes is itself undoable, so undoing an undo is a redo with no extra
machinery.

**`detail.section` is the row as it stood *before* the change** — except for a
creation, where there was no before and the new row is what identifies what to
remove. That one convention makes all three section actions reversible from the
same field.

**A section deletion is logged before the row goes, not after.** Its
assignments are cascaded away with it, and an `AFTER DELETE` trigger is too late
to read them, so undoing a deletion would silently bring the section back empty.
`sections` therefore has two log triggers now: `AFTER INSERT OR UPDATE`, and
`BEFORE DELETE`.

Two refusals are deliberate. An entry recorded before this migration has an
empty `detail` and says so rather than half-reversing something; the board does
not offer an Undo it cannot honour. And undoing the *creation* of a section that
has since been staffed would cascade that work away, so it refuses and says to
unassign first.

What the board offers, in `src/lib/undo.ts` and tested there: a single change is
always offered; a burst is offered as one tap only when it is all assignments.
Undoing two hundred section creations at once is a different and much larger
thing, and it already has a name — deleting the scenario. Those entries keep
their own Undo buttons in the expanded list. ⌘Z reverses the most recent change
*I* made that still can be, not the most recent change: someone else's later
edit is theirs to take back, and reversing it should be a deliberate tap rather
than a reflex.

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

Three Supabase linter warnings are left standing deliberately:

- **`authenticated` can execute six SECURITY DEFINER functions.** Four are the
  policy helpers, where the grant is required, as above; they disclose nothing
  the caller cannot already see, since three report on the caller's own profile
  and `cycle_is_open` reports a cycle status every signed-in user may read
  anyway.

  The other two are `undo_change` and `undo_changes`, which the board calls
  over `/rest/v1/rpc`, so the grant is what makes undo work at all. Both are
  `SECURITY DEFINER` because they write a table nothing outside the database
  may write — `scenario_changes` has no insert, update or delete policy — and
  both make `is_coordinator()` their very first statement, before they so much
  as read the row they were given. An instructor who calls one learns only that
  they are not a coordinator: not whether that change id exists, nor what it
  was. The RLS suite asserts the refusal, and that `anon` cannot reach either
  function at all.
- **`citext` is installed in the `public` schema.** Namespace hygiene only.
  Moving an extension that is in active use as a column type risks breaking
  type resolution for no security gain.
- **Leaked password protection is disabled.** Sign-in is Google OAuth only;
  this project never sees a password, so there is nothing for the check to
  test.

One finding that was *not* accepted, closed in
`20260926000300_revoke_log_access_execute.sql`: `log_access()` was callable by
`anon` at `/rest/v1/rpc/log_access`. The harden migration above revokes EXECUTE
on every function that existed when it ran, trigger functions included, but
`log_access()` arrived two migrations later and was missed. Calling a trigger
function outside a trigger fails immediately, so nothing was exposed — it is
revoked because "it happens to be harmless" is a worse reason to leave a
`SECURITY DEFINER` function reachable than "nothing needs it". A trigger fires
its function regardless of the caller's EXECUTE privilege, so the access log is
unaffected; the trap above does not apply, because that concerns functions
called from a policy expression and this one is not.

## Iterations

**1 — Foundation (done).** Schema, RLS, seeded catalog and roster, imported
history, Google sign-in, app shell, conflict engine with tests.

**2 — Preference collection (done).** Cycle management for the coordinator,
the instructor preference form (quarters and load, tiered course ratings with
a "taught before" hint, days/times/modality, new-prep limit and a free-text
note), draft-then-submit with revision until the cycle closes, and a
coordinator dashboard showing who has responded with a copyable chase list.
Reminder emails are not built.

**3 — The assignment board (done).** Scenarios (create, rename, archive, mark
one official per year, delete), seeding a scenario from a past year's schedule,
section CRUD against all three timing shapes, ranked tap-to-assign, the live
conflict panel and per-instructor load tallies. Undo — of an assignment, a
burst of them, or a section added, edited or removed — arrived with the change
log; see above. Not yet: drag and drop as an alternative to tapping.

**4 — Reporting (done).** How well preferences were met, CSV export of both
the schedule and the report, a print stylesheet, side-by-side scenario
comparison, and a change log written by database triggers.

**5 — Partly done.** Solver-assisted suggestions for unfilled sections and
student-facing conflict checks are built. Importing a quarter directly from a
pasted UW time schedule is not; seeding from an already-imported year covers
most of what it was for.

## Suggestions

`src/lib/suggest.ts` proposes instructors for unstaffed sections. It is not a
solver in the optimising sense, deliberately: the point of the application is
that a human decides with the constraints visible. It fills the obvious gaps so
attention goes to the hard ones, and every proposal is shown with its reasons
before anything is written.

Two things make it better than ranking each section on its own:

**Hardest first.** A section three people could teach is placed before one that
twenty could. The other order lets a common section take the only person a rare
one had.

**It accounts for its own proposals.** Each placement goes into the working
snapshot, so the next section is ranked against the schedule as it would then
stand. Ranking everything against the original state would cheerfully propose
one person for two sections at the same hour.

A candidate is refused outright, never merely warned about, when taking the
section would break a rule rather than disappoint someone: they said they
cannot teach it, they are busy at that hour, they are away that quarter, or
they are at their cap. Those are exactly the conflicts the engine reports as
errors, so an accepted suggestion cannot introduce one — which is asserted as a
property in the tests rather than assumed.

## Student checks

Two questions, and the difference between them is the point. A pair of
*sections* clashing is common and usually fine, because another section of one
of them fits. A pair of *courses* with no workable combination at all is a
problem with the schedule. `unavoidableStudentClashes` answers the second, and
is the only one worth acting on; the first is shown as detail beneath it.

The page is open to everyone signed in, not just coordinators. Row level
security already limits non-coordinators to the official scenario, so an
adviser sees the published schedule and nothing else, with no extra rule
needed.
