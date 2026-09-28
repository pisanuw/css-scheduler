# Progress log

The running record of what is built, what was learned, and what the next
session should pick up. Newest entry first. `docs/DESIGN.md` is the design;
this file is the state of play.

## Where things stand

| Iteration | State |
| --- | --- |
| 1 — Foundation | done |
| 2 — Preference collection | done |
| 3 — Assignment board | done |
| 4 — Reporting | done (export and print on both the report and the comparison) |
| 5 — Solver, import, student checks | done |
| Polish | undo, toasts, focus management, tables-as-cards, code splitting, drag and drop, print output, dark mode, the installable PWA, the Supabase trim and offline awareness done |
| Concurrency | **all four** scenario pages watch `scenario_changes` — board, report, comparison and student check — and each notice names its own page. `Compare` watches both sides; the student check withholds the actor from anybody who is not a coordinator |
| Dependencies | `npm audit` clean; Node pinned to 22 |
| Keyboard | nine shortcuts on the board, with a `?` sheet rendered from the same table |
| Lint | `npm run lint` runs: ESLint 10, type-aware, fails on one warning. **Every `react-hooks` v7 rule is now an error**, nothing grandfathered and nothing suppressed — `refs` was the last one off |
| Types | **`src/lib/database.types.ts` is generated and committed** and the client is `createClient<Database>`, so rows arrive as their row types rather than `any`; `no-unsafe-assignment` is an **error**. Regenerate with `npm run db:types` after every migration — nothing in the build can tell that you did not |
| Deploy | **Netlify builds from git pushes.** The sixth run's claim that it does not was wrong — see the seventh-run entry. `deploy_source` says `api` either way; `commit_ref` and `manual_deploy` are what discriminate |
| Sandbox | `npm ci` is **unreliable**: allowed in the sixth and seventh runs, refused in the eighth (*Git Destructive*). `npm install --no-audit --no-fund` has worked every time and is what the hook should run. No hook can be committed from here (the classifier blocks writing `.claude/`, correctly, as self-modification). **A maintainer still needs to add the SessionStart hook.** |
| Live data | 76 instructors, 128 courses, 3 profiles, 1 preference cycle, 2 academic years, 6 terms, 42 time slots, 37 rooms, 199 history rows — and **no scenarios, sections, assignments or submissions at all**. What the two real users currently meet is every page's empty state. |
| Cold start | **Done, in production.** The coordinator created "First pass at scenario" (2026-27, draft) on a phone and it seeded **199 sections and 198 assignments** — exactly what `seedPlan.real.test.ts` predicted. The empty states are one component, checked at 375px. |
| Import | **Checked against a real published quarter, from two sources.** Autumn 2026 as PDF text *and* as the web page (`scripts/data/aut2026_timeschedule{,_web}.txt`): 75 sections each, nothing ignored, 74 rows ready, no unknown courses, and the two agree field for field. Three bugs found on first contact, all fixed and pinned. |
| Excel auto-fill | **Done, on the real year.** `/autofill` and `npm run autofill`: the year-at-a-glance workbook and both survey exports in, the workbook back with full-time names in purple. On AY 2026-27: 143 of 144 full-time load placed, every hard constraint held, 149 sections proposed, 125 left open with who could take each. Not merged to `main` yet at the time of writing — see the tenth-run entry. |
| Board at real size | The real Autumn is **67 cards — about 34 phone screens** at 375px. Nothing breaks; there is no search or filter, so finding one section means scrolling past sixty-six. `board-real-size` scene holds it. |

## Next up

See the newest entry below for the specific handoff.

---

## 2026-09-28 (tenth run) — Excel in, Excel out

The coordinator sent the real AY 2026-27 inputs — the year-at-a-glance
workbook with every instructor cell emptied for Autumn to Spring, and the
full-time and part-time survey exports with names replaced by F1…F26 and
P1…P35 — and asked whether the full-time names could be filled in from the
preferences and the loads, part-time later, and whether this app could take
Excel like that. The prompt is in `docs/SESSION-LOG.md`.

**Built.** `src/lib/autofill/` — five modules and their tests — the
`/autofill` page (coordinator-only, with a card on the dashboard), and
`npm run autofill` for a terminal. The design, and what was rejected, is in
**Excel auto-fill** in `docs/DESIGN.md`.

- `xlsx.ts` — reads a workbook and edits it where it lies: only the rows it
  writes into, only the fill and italics of those cells, plus new sheets. One
  new dependency, `fflate` (zip, no dependencies of its own; `npm audit` still
  clean).
- `glance.ts` — finds the quarter blocks by their headings, reads times with
  the campus's meridiem, and knows arranged, online, TBD, reserved, joint,
  lab and "Non-CSS" rows.
- `text.ts` and `prefs.ts` — turn survey paragraphs into loads, ranked courses
  with the quarter, count, time and days said about each, prefer-not lists and
  time rules; unsure readings become review notes; the `FT preferences` and
  `PT preferences` sheets read back exactly what they wrote.
- `engine.ts` — regret-ordered greedy start, then trades, transfers, swaps and
  a per-person branch and bound, all on one objective: load first (shortfalls
  shared), then preferences, then tidiness. Lectures travel with their own
  labs; a skills lab that meets with its lecture is one class.
- `run.ts` — the whole run, and the sheets it adds: summary, faculty load,
  assignments (with who else wanted each), open sections (with why not, and
  which part-time instructors are free), by faculty, and the two editable
  preference sheets.

**Verified.** 664 unit tests (83 new) plus three that run against the real
workbooks when `AUTOFILL_REAL_DIR` is set, typecheck, lint (149 files, no
warnings), `build:check`, `check:mobile` (38 scenes, two new),
`check:routes` (the new page renders, instructors cannot reach or download
it, 14 pages swept in the dark) and `check:pwa`. Every output workbook was
read back with openpyxl and checked part by part: well-formed XML, rows and
cells in order, style indices in range, content types present, the 109 merged
ranges, frozen pane and print area intact.

On the real year: 143 of 144 full-time load placed in under a second; the one
shortfall is a Winter service release where most of that person's courses are,
and the output says so. Each of the 26 results was read against the response
it came from, and that reading changed the engine four times:

- *Naming quarters for a course means one each.* "497 (Autumn, Winter and
  Spring), 421 (Winter), 360 (Autumn, Spring), 506 (Autumn), 507 (Winter), 101
  or 142 (Spring)" first came back as seven sections of 497. The list sums to
  exactly eight; it now comes back as written.
- *Two out, three in.* A response that laid out its own timetable lost its
  requested SKL123 labs to a single-trade local optimum; the per-person branch
  and bound finds it.
- *A co-taught lab is not a clash.* Winter's 123A (1:15 M/W) and SKL123A (1:15
  W) meet together; treated as a clash, the timetable above was infeasible.
- *A pinned list means one of each.* "3: 502, 584, 343" came back as 343 twice
  and 584, because a preparation saved outweighed the note. It now holds.

**Learned.**

- *The parser does not have to be right, it has to be correctable.* The real
  answers include "Cannot teach 8-10pm course, but willing to teach 845am if
  necessary", "the latest course I can teach on WEDNESDAY is 3:30", and "I
  just have to work at like 545pm due to having a full time job" — which the
  first draft read as a refusal of the one slot that person *can* teach. Each
  is pinned in `text.test.ts`, but the design answer is the review sheet: every
  reading visible, every one editable, read back exactly.
- *The coordinator's conventions are the protocol.* Purple for unconfirmed and
  italics for part-time were already in the sheet's legend, so they are how
  the tool marks a proposal and how she accepts one.
- *Re-running must not wander.* A second run on its own output first moved 7
  of 149 names with nothing changed. It starts from the previous proposals now,
  and moves none.
- *Anonymised is not the same as shareable.* The survey answers describe leave,
  health and family. None of them is in the repository: the tests build their
  own workbooks, and the real-data test reads a folder only when told to.

**Deliberately not done.** Part-time placement is a draft behind a toggle, as
asked — title-based caps are not modelled; the `PT preferences` sheet has
two-quarter and year cap columns for the coordinator to fill. Nothing is
written to the database: carrying the result into a scenario is what the
board's import is for.

**Where it is.** Committed and pushed to `claude/faculty-schedule-preferences-93rbjl`.
It reaches https://uwb-css-scheduler.netlify.app when that branch is merged
into `main`, which deploys itself.

**Next run should pick up.**

1. Merge, and watch the coordinator use it on the real files; the review
   sheet's notes are where the parser will need new phrasings.
2. A structured version of the survey (or the app's own preference form, which
   already asks these questions as fields) would make next year's parse
   unnecessary.
3. Part-time caps by title, once the policy is written down.

---

## 2026-09-27 (ninth run) — the types were generated, and the rule that was off found seven real things

Picked up the note the README had carried for five runs:
`@typescript-eslint/no-unsafe-assignment` was off only because
`src/lib/database.types.ts` had never been generated, and `npm run db:types` was
the fix "and it needs a linked Supabase CLI". The file is generated and
committed, the client is `createClient<Database>`, and the rule is an error.

**The blocker was the wrong shape.** The CLI is *not* linked on this machine —
`supabase projects list` says `linked: false` for all four projects and
`supabase/.temp` holds no ref — and Docker is not running either, so the old
`db:types` (`supabase gen types typescript --local`) could not have worked here
at all. It never needed a link: `--project-id abvnaelzfriusckqqrfc` needs only
the access token `scripts/run_sql.py` already depends on. That is the default
now, and `db:types` works without `supabase link`.

**The redirect was a trap, and worth replacing on its own.** The CLI reports its
failures as JSON on *stdout*. So `supabase gen types … > src/lib/database.types.ts`
on a machine with no Docker truncates the file, writes `{"_tag":"Error",…}` into
it, and exits 1 — after which nothing fails: a junk module still imports,
`Database` becomes `any`, every row in the app silently goes back to `any`, and
the lint rule that is supposed to notice has nothing to say because there is no
longer a type to be unsafe about. `scripts/db_types.sh` generates into a
temporary file, refuses to install anything without `export type Database` in it,
prints what the CLI actually said, and leaves the real file alone. Both failure
paths were run on purpose.

**Then the client got its type parameter, and `tsc` reported seven errors.**
Every one was a place the code claimed more than the schema can promise. They
sort into three kinds, which is what `src/lib/rows.ts` is organised around:

- *A `check` constraint is not a type.* `access_log.event` is `text` with
  `check (event in ('sign_up','sign_in'))` and `AccessLogRow` narrowed it to
  those two — true today, unprovable by the compiler, checked at the boundary now.
- *`jsonb` is `Json`.* `scenario_changes.detail` is read as an object by
  `canUndo` and `undo.ts`; the column would accept an array or a number.
- *View columns are always nullable.* Postgres records no not-null constraint for
  a view, so all eight columns of `instructor_load_targets` and all six of
  `access_summary` generate as nullable even though the tables they select from
  are not. `courses.code` is the same problem from a different cause: a generated
  column carries no not-null constraint of its own, so the one column that
  provably cannot be null reads as `string | null`.

The view cases are the ones with a judgement in them. A cast compiles and is what
the old code did; instead each is a function that checks and returns `null`, and
the caller drops the row. **Checked against the live project before believing it:**
152 rows in `instructor_load_targets`, 3 in `access_summary`, 128 courses —
nothing dropped, no null `released_courses`, no null `code`, no `event` outside
the two, no `tier` outside the four. The checks cost nothing today, and the only
way to make one fire is to change a view, which is exactly when someone should
hear about it.

The seventh error was `ids[0]` under `noUncheckedIndexedAccess`, reachable only
because `rpc('undo_change')` has a typed argument now. Nine casts came out as
dead weight on the way past — `data as Scenario` twice, `as SectionRow`,
`as PreferenceSubmission`, `as PreferenceCycle`, the two on the undo RPCs' return
values, and the four-property inline type on the seed-plan insert.

**Merged with the eighth run's four parts, which landed while this was in
progress** — fifteen commits, and the only conflict was this file. The
interesting part is what did *not* conflict: `useScenarioFeed`, `liveSync.ts` and
`useLiveScenario.ts` arrived from upstream with no knowledge of the generated
types and needed **no change at all**. `rows<WatchEntry>` over
`select('id, action, summary, actor_email')` type-checks, which means
`WatchEntry.action` is now *verified* against the `change_action` enum rather
than asserted alongside it. That is the first evidence that this change pays
rent on code written without it.

One correction to the sixth run's entry, since it describes current state rather
than history: "the two rules still off are `react-refresh/only-export-components`
… and nothing else" was not right even then. Three are off — that one plus
`require-await` and `prefer-promise-reject-errors`, both scoped to test files —
and two are narrowed rather than off. The README says so now.

**Learned.** *"It needs a linked CLI" read as "wait for the maintainer's
machine", and the real requirement was a token this repo already depends on
twice.* A blocker written down once is a note about one afternoon; written down
five times it becomes a fact about the project. Worth asking of any blocker that
has survived a few runs: is that still the requirement, or just the first thing
that was tried?

Second: *a generated file's generator belongs to the build and deserves the same
scrutiny as the build.* The rule was off for a real reason, the fix was one
command, and that command would have quietly destroyed the file it was meant to
produce on every machine this project's checks run on except one.

**Verified.** 581 tests (16 new in `src/lib/rows.test.ts`, upstream's 565 all
still passing), typecheck, `lint --max-warnings 0` with `no-unsafe-assignment`
now an **error** and one inline disable for `expect.any` in `swClient.test.ts`,
and `build:check`. `npm run db:types` run three times, reporting the committed
file already current — so what is checked in is byte for byte what the CLI
produces. The live-data counts above were read-only through the Management API.

**`npm run test:e2e` now passes 24/24, and fixing it was the rest of this run.**
It failed on `upsert own submission` with an RLS 403 — nothing to do with this
change, since that script talks to the REST API directly and never loads the
TypeScript. The cause is that the test hard-coded the instructor it borrows,
**Clark Olson, who has since signed up for real** (`cfolson@uw.edu`).
`profiles.instructor_id` is unique, so the PATCH that borrows him was rejected;
the test never checked that PATCH, so the throwaway profile kept a null
`instructor_id`, `my_instructor_id()` returned null, and the policy's
`instructor_id = my_instructor_id()` failed four checks later. *A real user
arriving is not a reason for a test to break.* It picks the first active
instructor that no profile has claimed and no submission belongs to now — the
second condition because the upsert merges on `(cycle_id, instructor_id)` and the
purge deletes what it finds, so the old version would have edited and then
deleted a real instructor's answers had Clark Olson filled the form in before
running it. Both the choice and the link are checked, so the next failure of this
kind names itself where it happens. Residue confirmed independently afterwards,
not just from the test's own cleanup line: 3 profiles, no submissions, no child
rows, no `e2e-test@uw.edu` anywhere.

*Still not verified here:* every browser check (`check:routes`, `check:mobile`,
`check:drag`, `check:keys`, `check:pwa`) skips on this machine — Playwright is not
installed — and `db:test:rls:local` cannot run either, because only libpq's client
binaries are present, with no PostgreSQL server. Nothing here has watched the
access log or the load table render.

**Next run should pick up — in this order.**

1. **`npm install --no-audit --no-fund` first**, and expect detached HEAD.
2. **Run the browser checks** before deploying this — they are the only gate
   this run could not reach. `npm run test:e2e` has been run: 24/24.
3. **Make the board usable at 67 sections** — the eighth run's top item, with a
   measurement behind it rather than an opinion. Unchanged by this run.
4. **The two migration histories are not the same shape.** The hosted project
   records twelve applied migrations; `supabase/migrations/` holds nine
   consolidated files. The generated types come from the hosted one and the
   schemas are believed identical, but nothing has proved it —
   `supabase gen types --db-url` against a `scripts/local_db.sh` cluster, then a
   diff, would, on a machine with a PostgreSQL server. Worth doing once, and
   worth a line in the README either way.
5. **`courses.code` could stop being a special case.** `alter table courses alter
   column code set not null` on a stored generated column over two not-null
   columns is a one-line migration, after which `courseFrom`'s recomputation is
   dead code. Left undone deliberately: it is a schema change, and this run was
   asked for a types fix.
6. **The watcher's cost, with a stopwatch** — carried five times now.
7. **The SessionStart hook** — maintainer only.
8. **Re-run the database sweep whenever the schema next moves.** It still has not
   moved; `npm run db:types` is now part of what "moving it" means.

---

## 2026-09-27 (eighth run, fourth part) — the same quarter, copied a second way, broke it again

The coordinator sent the Autumn 2026 **web page** after the PDF. That is not a
spare copy of the same thing, and the difference is the whole lesson.

**A third bug, from the same note.** The page wraps its course notes elsewhere
than the PDF. Where the PDF left `OF CSS 112, 132, OR 142.` on one line, the page
leaves a line that is nothing but `OR 142` — two capitals and three digits,
directly above CSS 142's sections. It read as a heading for a subject called
"OR" and took **all four CSS 142 sections and two of CSS 143** with it.

**The fix stopped playing whack-a-mole with English.** Patching the subject
pattern a second time would have invited a third wrap. The rule that covers
every shape is the one the published format follows: *a course heading names its
course.* `CSS 101 DIGITAL THINKING` has a title after the number, and every
published heading does, because the title is a link to the catalogue. A code and
a number with nothing after them is prose that wrapped there. A heading with no
title is now no heading, and the sections under it are **reported** as having
none rather than filed under a conjunction.

Limits written down rather than hidden: a note wrapping to `OR 142 REQUIRED`
would still fool it (nothing in either listing does), and `resolveImport` is a
second net, since a phantom course is not in the catalogue and its sections are
named and dropped where the coordinator can see them.

**Both renderings are committed, and checked against each other.** The equality
assertion — same 75 sections, field for field, from two sources with different
whitespace, different line breaks and `&nbsp;` in one of them — is now the
strongest thing in `timeSchedule.aut2026.test.ts`. *A parser that depends on how
the page was copied is a parser that will fail on somebody's phone.*

Honest about the web fixture: the text was produced by stripping markup, not
captured from a real clipboard, so the tabs between table cells are a reading of
what a browser would do. The line breaks inside the notes are the page's own,
and they are the part that mattered.

**The board at real size, at last — and it is too long.** The coordinator's live
scenario has 67 sections in Autumn; every board scene to date used four or five.
The new `board-real-size` scene parses the committed listing and renders a card
per section. It **passes**: nothing overflows, no horizontal scroll, every target
44px, contrast clean in both themes. What passing does not cover is the length:
**13,630px at 375px wide, about 34 phone screens.** The board renders every
section in the quarter sorted by course, with no search and no filter, so finding
one section means scrolling past sixty-six. Nothing is broken; it is simply not
usable at that length.

**Still blocked, and only a human can clear it: the SessionStart hook.** Writing
`.claude/` from this sandbox was refused again (*Self-Modification*), this time
with the maintainer explicitly asking for it. The content was handed to them in
chat instead. This is the third run it has been requested and it should stay on
the list until `.claude/hooks/session-start.sh` appears in the repo.

**Verified.** 565 tests (5 new), typecheck, `lint --max-warnings 0`, build,
`check:mobile` over **36 scenes** at 375px. Bite checked: with the previous
pattern restored, four of the new tests fail. Deployed `39477ce`, all **38 files
byte for byte**, served entry `index-BHXUVnwa.js`, `check:deployed` clean.

**Next run should pick up — in this order.**

1. **`npm install --no-audit --no-fund` first**, and expect detached HEAD.
2. **Make the board usable at 67 sections.** This is the top item and it now has
   a measurement behind it rather than an opinion. The cheapest thing that would
   work is a filter above the list — by course code, by instructor, and
   "unstaffed only" — since `visible` in `Board.tsx` is already a single derived
   list and the conflict panel already knows how to filter by severity. Check it
   against `board-real-size`, which is exactly the case it has to fix.
3. **The watcher's cost, with a stopwatch** — carried four times now.
4. **The SessionStart hook** — maintainer only.
5. **Re-run the database sweep whenever the schema next moves.** It still has not.

---

## 2026-09-27 (eighth run, third part) — the maintainer cleared three blockers, and a real quarter broke the parser twice

Everything below was unblocked by the maintainer in one message: they signed in
on a phone and created a scenario, they ran the install command on their laptop,
and **they attached the Autumn 2026 time schedule** — the thing three runs of
this log had asked for and could not get, because the published schedule is
behind a NetID.

**The cold start is done, in production, and the prediction held exactly.** The
live database now has `First pass at scenario` (2026-27, draft) with **199
sections, 198 assignments** and 397 change-log rows, all by `pisan@uw.edu`. That
is precisely what the previous part of this run predicted from the live history
(199 timed rows, one instructor no longer on the roster). The seed path is no
longer an argument: it ran, on a phone, against the real database, and produced
the right number of everything.

**A real published quarter found two bugs in ten minutes.** Both were in code
that already had tests over real rows, and neither was reachable from those
tests.

- **A wrapped sentence read as a course heading.** Course notes are prose. One
  wrapped so a line began `OF CSS 112,`; the subject pattern accepted any two
  short words, so `OF CSS` + `112` was a heading, and the two CSS 142 sections
  printed under that note were filed against a course no catalogue holds — the
  import dropped them as "not in the catalogue". Two real sections gone, with a
  nonsense course name as the only clue. A subject is now one code word, or a
  campus letter and a code word (`B CUSP 110`), and a heading's number must be
  followed by a space or the line's end.
- **A person called "to be arranged".** The phrase is in the meeting-times
  column of every independent study. The parser *noticed* it — it already
  refused to read a day pattern from it — but never consumed the words, so they
  fell through the room reader and into the instructor reader, which takes
  everything up to the status column. Six sections came back taught by "to be
  arranged", one by "to be arranged * *".

**The general lesson, and it is the most transferable thing this run produced.**
*A round trip over data you extracted yourself cannot find what your extraction
removed.* `timeSchedule.real.test.ts` has guarded this parser since iteration 5
over all 240 real rows — but it synthesises tidy course headings and never
writes a note, because `history_sections.csv` has no notes in it. The data was
real; the *shape* was this repo's own. One page nobody here had ever parsed found
two bugs immediately.

**With both fixed, the real listing reads clean.** 75 sections, nothing ignored,
74 rows ready to import (the one lab section dropped by design, the one section
that meets twice reported rather than silently halved), **no unknown courses at
all**, and against the live roster only three unmatched names: Theodore Longtchi,
genuinely new to the department, and Robert Dimpsey and Bill Erdly, both marked
inactive and teaching again. The awkward published spellings match as they
stand — `Rubin,Zak` → Zachary Rubin, `Carr,Matt` → Matthew Carr, `Shaw,Carol A`
→ Carol Shaw.

**The fixture is committed, because nobody can obtain it again.**
`past-course-schedules/aut2026.pdf` and the text extracted from it at
`scripts/data/aut2026_timeschedule.txt`. Worth knowing: it is PDF text, not a
browser paste, which makes it a *harder* input — `UW1  040` arrives with two
spaces, page furniture is interleaved, and every course note is present as the
wrapped prose it really is. If a browser paste ever turns out to differ, that is
a new fixture, not a reason to distrust this one.

**Verified.** 560 tests (16 new: 12 over the real listing, 4 pinning the exact
lines that broke), typecheck, `lint --max-warnings 0`, build. Checked for bite:
with the old pattern and the old token handling restored, **nine** of them fail.

**Next run should pick up — in this order.**

1. **`npm install --no-audit --no-fund` first** (not `npm ci`), and expect
   detached HEAD. The maintainer ran the install on their laptop; whether a
   `SessionStart` hook now exists in the repo should be checked with
   `ls -a .claude` rather than assumed — nothing had appeared as of this run.
2. **Ask the maintainer to paste the same quarter from the browser, not the
   PDF.** The parser is now proven against PDF text. A browser copy out of the
   `<pre>` is what the import sheet actually receives, and it may space or wrap
   differently. This is a five-second ask and it closes the last real unknown in
   the import path.
3. **A board with 199 sections has never been looked at on a phone** — and it is
   no longer hypothetical, because the coordinator's scenario has exactly that.
   Autumn alone is 67 cards. One scene at real size.
4. **The watcher's cost, with a stopwatch** — carried over three times now.
   `Compare` polls two feeds; four pages poll where one did.
   `refetchOnWindowFocus` is already on, so the question is whether 20s can go
   *up*.
5. **Re-run the database sweep whenever the schema next moves.** Still has not
   moved; no migration in this whole session.

---

## 2026-09-27 (eighth run, continued) — the cold start, walked rather than assumed

Picked up item 2 of the handoff written an hour earlier in this same session.
Two commits, both deployed and verified.

**The cold start's data half is sound, and that is now a fact rather than a
hope.** The worry was that a coordinator's first tap — *New scenario → start
from the year as it was taught* — would produce a board full of holes and leave
them typing two hundred sections into a phone. It does not. All 240 rows of
`scripts/data/history_sections.csv` come through `planFromHistory` as **240
sections: nothing skipped, no off-grid times, every room resolved**, the 41
"to be arranged" rows kept as arranged rather than dropped, letters A–G
preserved with one letter per course per quarter. `seedPlan.real.test.ts` now
holds all of that, including the dialog's own sentence — "240 sections · 199
assignments · 41 to be arranged" — because that is the only description of the
plan the coordinator sees before committing to it.

It also writes down a number this repo had not: `teaching_history` holds **199**
rows live rather than 240 because the seed SQL excludes the arranged ones.

**One test exists because of a mistake made while measuring, and it is the most
valuable one in the file.** The first probe reported `roomsUnresolved: 197` and
looked like a serious bug. It was not: the probe had passed `rooms.label`, which
holds `'050'`. `useRooms` joins `buildings` and composes `'UW1 050'` from `code`
and `room_number`, and the seed derives the room list from those same labels by
splitting on the space. A room list built from the number alone matches
**nothing, on every row, silently** — the year would land with no rooms and the
room-clash check would have nothing to work with. A test now feeds bare numbers
in and asserts exactly that failure. *A measurement that looks like a bug gets
checked against the code that builds its inputs before it is believed* — the
seventh run learned the same lesson about a lint finding.

**Also measured, and needing nothing: the engines at real size.** A real year is
199 sections and 69 instructors, while every scene to date has used five.
`detectConflicts` 1.4 ms, `buildSnapshot` 0.5 ms, `buildReport` 0.6 ms,
`loadTallies` 0.1 ms, `studentClashes` under 0.1 ms. No work needed; recorded so
nobody spends a run optimising them.

**The second commit: the empty states, which are the cold start.** With no
scenario in the database a first visit is the same card on five pages in a row,
and not one of them had ever been measured at 375px. Three things had drifted,
and the third was a bug: the styling (`text-slate-500` on cycles,
`text-slate-600` elsewhere); the report's dropped the page heading, leaving a
floating sentence with no title; and the way out was sometimes a real button and
sometimes **an underlined link inside the prose — about twenty pixels of tap
target, and the only thing to tap** on the report, the comparison and the
student check.

`EmptyState` takes its action as *data*, not as children, so an inline link
cannot be passed to it: it renders a 44px control or nothing. Nothing is a real
answer — a student looking at an unpublished schedule has nowhere to be sent and
is told what will appear here instead of reaching a dead end. Cycles gained a
way out it never had. The harness now has a `MemoryRouter` around it, because a
`<Link>` outside a router throws; nothing navigates, the point is that scenes
hold real links rather than fakes that would let a broken one through.

**Verified.** 544 tests (11 new), typecheck, `lint --max-warnings 0`, build,
`check:drag`, `check:keys`, and `check:mobile` over **35 scenes** at 375px — the
new `empty-states` scene carries all four shapes, including the longest label an
action can hold and the disabled one. The new assertions were checked for bite
rather than trusted: removing one block from the grid turns 32 real sections
into off-grid times and fails three tests.

**Deployed and verified, twice.** `3dbfdbf` (the test) and `4ccc11a` (the
component) — deploy `6ab91ee0e24ac300081dee33`, commit_ref `4ccc11a…`,
`manual_deploy: false`, published `13:49:48Z`, 25 new files. All **38 files byte
for byte** by `cmp` against a local `dist/`; served entry `index-bIc9_Vbw.js`
matches the local one. `check:deployed` clean, 17 precached files. Three
git-triggered builds in a row now.

**Next run should pick up — in this order.**

1. **`npm install --no-audit --no-fund` first** (not `npm ci`), and expect
   detached HEAD.
2. **The rest of the cold start is the half a sandbox cannot reach.** The data
   path and the empty states are done; what is untested is a real coordinator
   signing in and tapping through *year → scenario → seed → board* against the
   live database. `test:e2e` needs the maintainer's keychain token, so this is
   either a maintainer item or a request for one screenshot of the New scenario
   dialog on a phone. Worth asking for rather than simulating again.
3. **The watcher's cost, with a stopwatch** — carried over twice now.
   `Compare` polls two feeds, so six requests a minute there, and four pages poll
   where one did. `useScenarioFeed` already sets `refetchOnWindowFocus: true`;
   the question is how much of the benefit focus alone carries. Do not shorten
   the 20s interval; the flicker gate would suffer.
4. **A board with 199 sections has never been looked at on a phone.** The
   engines are fast enough, but the *page* has only ever been seen with five
   cards in a quarter; the real Autumn is 67. Worth one scene at real size
   before the coordinator finds out for us.
5. **The SessionStart hook still needs the maintainer** — `npm install
   --no-audit --no-fund`, guarded by `[ "$CLAUDE_CODE_REMOTE" = "true" ]`.
6. **A real paste through the time-schedule import is off the list** (Shibboleth).
7. **Re-run the database sweep whenever the schema next moves.** No migration in
   this session at all.

---

## 2026-09-27 (eighth run today) — the other three pages notice too, and the sentence learned which page it is on

`npm ci` was **refused** this run (classifier: *Git Destructive*), and
`npm install --no-audit --no-fund` was allowed and worked in 6s. That is the
command the SessionStart hook is meant to run, so the request on the handoff is
the right one — and this run is evidence that `npm ci` specifically cannot be
relied on. Detached HEAD again; `git branch -f main <commit> && git checkout
main` again the fix. Expect both every run. No `.claude/` directory has
appeared, so the hook is still a maintainer item and was not retried from here.

**Item 3 done, and the interesting half was the sentence, not the wiring.**
`Report`, `Compare` and `StudentCheck` now call `useLiveScenario` like the board
does. Three calls. The handoff already knew the hard part: "the board has been
brought up to date" is a lie on three of the four surfaces, and a coordinator
told that while reading a report goes looking for a board that is not on screen.

So `syncFeed` takes a `Viewer` now — `{ email, surface, named, where? }` —
instead of a bare address, and `SURFACE_TAIL` holds one clause per page. The
surface is **required**, not defaulted to `'board'`, which is the whole point: a
page that forgot to say what it was would otherwise quietly claim to be the
board, which is exactly the bug being fixed. The report and the comparison say
"brought up to date"; the student check says "this check has been run again",
because that is what happens there — the answer to "can I take these two?" may
now be different.

**Two decisions came out of the pages rather than the plan.**

- **`Compare` watches both sides, and names which draft moved.** Either side
  going stale makes the *difference* wrong, which is the one thing that page
  exists to get right, so both are watched. But "2 changes by mashhadi@uw.edu"
  on a page showing two drafts sends the coordinator to check whichever column
  they happened to be reading, so the notice carries an `in <draft name>`
  clause. The second watcher stands down when both selects point at the same
  scenario — a state the page allows and warns about — so one change is not
  announced twice in identical words.
- **The student check tells a student *that* it changed, not *who*.**
  `/student-check` is the only scenario page that is not `coordinatorOnly`, and
  the read policy on `scenario_changes` genuinely does let any authenticated
  user see the *official* scenario's history. The policy was read back from the
  live database to be sure (`pg_policy`: `status = 'official' or
  is_coordinator()`, exactly as the migration says) and **left alone**. But
  readable is not the same as worth showing: `Viewer.named` follows
  `isCoordinator`, so anybody else gets "1 change to the schedule" with no
  address and no section code in it. A display decision, not a policy one, and
  worth keeping those two questions apart.

No migration, no new table, view or policy, so `rls_test.sql` is untouched and
stays complete.

**Verified.** 533 tests (7 new: every surface's wording, the withheld
attribution, the "at least" wording surviving into the unnamed form, the draft
clause, and a missing draft name leaving the clause out rather than printing
"in undefined"), typecheck, `lint --max-warnings 0`, build, and `check:mobile`
over **34 scenes** at 375px. The `toast-live-sync` scene was extended rather
than left alone, because the longest sentence the app can produce moved: it is
now the comparison's, which spells out an instructor, a section *and* a draft
name — "mashhadi@uw.edu assigned Rob Nash — CSS 342 A in Winter 2027 (second
draft) — this comparison has been brought up to date." The scene builds it from
`syncFeed` rather than typing it, so what is checked cannot drift from what the
app says, and the shortest form (the unnamed one) is in the same scene.

**Deployed and verified — by a git build, which settles the sixth run's
correction.** Commit `24ee2f7`, deploy `6ab90d2593a9a500086241f8`, published
`12:33:55Z`, 14 seconds after `git push`, `commit_ref: 24ee2f7…`,
`manual_deploy: false`, 24 new files. **No MCP deploy was run this session at
all.** All **37 files byte for byte** by `cmp` against a local `dist/` built
with `sb_publishable_71_-uGHRKjaXisg8DLjmjw_dVMFbYsa`; the served entry chunk
is `index-DvmkrmVP.js` and so is the local one. `check:deployed` clean, 16
precached files. Two runs in a row now: **a push to `main` ships.**

**Learned, and it is about the shape of an API rather than this feature.** The
tidy version of this change would have defaulted `surface` to `'board'` so the
board's call site and fourteen existing tests did not have to move. That default
is precisely the failure mode being fixed — a page saying nothing and getting
the board's sentence — so the churn was the correct price. *When a wrong value
is the thing that hurts, do not give it a default; make the caller say it.* The
same reasoning made `named` required: the safe answer to "may this person be
told who?" is the one that should have to be asked for.

**One fact about the live database that is worth more than it looks.** Read this
run while checking the policy: **there are no scenarios at all.** 76
instructors, 128 courses, 3 profiles and 1 preference cycle, but `scenarios`,
`sections`, `section_instructors`, `preference_submissions` and
`scenario_changes` are all **empty**. So every concurrency feature of the last
three runs is, against real data, untested by use — and more to the point, what
the two real people actually see when they open the deployed app is the *empty
state* of every page built so far. Nobody has created a scenario. That reframes
what "next most valuable" means (see item 2 below).

**Next run should pick up — in this order.**

1. **`npm install --no-audit --no-fund` first** (not `npm ci` — refused this
   run), and expect detached HEAD.
2. **Walk the cold-start path as a coordinator with an empty database, and fix
   what is in the way.** This is the item with the most evidence behind it: the
   live database has no scenario, so the first thing either real user meets is
   the zero state, and every screenshot check to date has been of a scene with
   data in it. Specifically — from `/scenarios` with nothing there, can a
   coordinator create a year, create a scenario, and get sections into it
   without reading the source? `seedPlan` and `ImportSheet` exist but the
   time-schedule paste cannot be sourced from the sandbox; the hand-built path
   is what needs to work. Check it at 375px, and check the empty states of
   `Report`, `Compare` and `StudentCheck`, which now all poll a feed that will
   be empty.
3. **The watcher's cost, with a stopwatch rather than an argument** — carried
   over, and now with more reason to look: `Compare` polls *two* feeds, so the
   worst case on that page is six requests a minute, and four pages poll where
   one did. Twenty seconds was chosen against the gesture, never measured.
   `useScenarioFeed` already sets `refetchOnWindowFocus: true`, so the question
   worth answering is how much of the benefit focus alone carries — if it is
   most, the interval can go up. Do not shorten it; the flicker gate is the part
   that would suffer.
4. **A real paste through the time-schedule import still needs the maintainer.**
   Not re-attempted, per the sixth run's finding: the published UW time schedule
   is behind a Shibboleth redirect now. **This is off the list.**
5. **The SessionStart hook still needs the maintainer** — `.claude/` cannot be
   written from the sandbox (auto-mode classifier, *Self-Modification*,
   correctly). `npm install --no-audit --no-fund`, guarded by
   `[ "$CLAUDE_CODE_REMOTE" = "true" ]`. This run's `npm ci` refusal is the
   third data point that the install step needs to be outside the classifier.
6. **Re-run the database sweep whenever the schema next moves.** It has not
   moved since the fifth run — no migration this run either — so it was not
   repeated. The query is `pg_class.relrowsecurity` + `reloptions` over
   `public`, joined to `pg_policy`.

---

## 2026-09-27 (seventh run today) — the board notices the other coordinator, and Netlify does build from git after all

`npm ci` worked again, unprompted. Detached HEAD again; `git branch -f main
<commit> && git checkout main` again the fix. Expect both every run. No
`.claude/` directory has appeared, so the SessionStart hook is still a
maintainer item and was not retried from here.

**Item 3 done: a stale board is no longer a silent wrong answer.** The handoff
asked for the decision to be written into `docs/DESIGN.md` before any code, and
for one fact to be established first — whether the database already refuses a
conflicting double-assignment. Both were done, and the fact changed the design.

**It does not refuse one.** `section_instructors` carries exactly four
constraints — a primary key, two foreign keys, and `unique (section_id,
instructor_id)` — checked against the live database with `pg_constraint`, and
there is no trigger anywhere that looks at times. Two coordinators assigning two
different people write two different rows, so **both writes succeed**. There is
no lost update to detect: every time conflict in this app is a client-side
reading of `conflicts.ts`, and deliberately so, because the coordinator is
sometimes right to create one knowingly. Freshness was therefore the whole of
the gap, and optimistic concurrency would have been solving a problem that does
not exist while breaking one that works.

**The fix watches the change log, not the board.** `scenario_changes` was
already there: append-only, trigger-written, one row per board write, carrying a
`bigserial` id, the actor's address and a readable summary. `useLiveScenario`
polls its newest six rows — three columns, a few hundred bytes — and invalidates
the board only once the feed has passed the watermark it holds. That is cheaper
than refetching the board blindly (the board is every section and assignment in
the year) and it is *better*, because the feed names the person: the toast reads
"mashhadi@uw.edu assigned Rob Nash — CSS 342 A — the board has been brought up
to date." A board that silently rearranged itself under somebody's thumb would
have been a new problem in place of the old one.

No migration. No new table, view or policy — `scenario_changes` already has its
read policy and its `select` grant, and `rls_test.sql` already exercises it 22
times, so the local suite stays complete without being touched.

Rejected, with the reasons now in `docs/DESIGN.md` under *Two coordinators at
once*: turning realtime back on (~40 kB on a phone for what 300 bytes solves), a
blind board refetch on a timer, and a version column on the scenario (it would
reject two coordinators working on two different quarters as readily as the case
worth rejecting, and add a failure path to every write).

**Four decisions, each with a test.** The first look is silent, with `0`
distinguished from "not looked yet" so the first real change is still news. The
watcher pauses while a write of its own is outstanding — a refetch between an
optimistic insert and its settle returns rows without the pending assignment, so
the pill the coordinator just placed would vanish and come back. Changes are
counted, never inferred from the ids, because `scenario_changes.id` is one
sequence across every scenario; a full window says "at least" rather than
claiming a total. And the caller is never told about their own tap, compared
case-insensitively because `actor_email` is `citext`.

**Learned — the general point, and it cost nothing because a test caught it.**
That last comparison was written as `(e.actor_email?.toLowerCase() ?? null) !==
(mine ?? null)`, which is the tidy one-liner and is wrong: with no profile
loaded *and* an entry with no actor, `null !== null` is false, so a
trigger-written change read as this coordinator's own tap and the notice was
suppressed — exactly the case that most needs showing. *A nullable field
compared against a nullable field needs the missing case named, not coalesced.*
The test asserting "every change is somebody else's when the caller is unknown"
failed on the first run and is the only reason this is a note rather than a bug
in production.

**One duplicate removed.** `HistoryPanel` kept its own copy of the action verbs;
it imports `CHANGE_VERB` now, so the panel and the notice cannot word the same
log entry two ways.

**Verified.** 526 tests (16 new), typecheck, `lint --max-warnings 0`, build,
`check:drag` (both mice and fingers, and a flick still scrolls), and
`check:mobile` over **34 scenes** — one new, `toast-live-sync`, whose text comes
out of `syncFeed` itself so what is checked at 375px cannot drift from what the
app says. That scene exists because the longest string the toast stack now
carries is not the one you would guess: naming a single change spells out an
instructor *and* a section, and that is what has to wrap inside a 375px strip
without pushing the dismiss button off the edge.

**Deployed and verified — and the previous run's note about the pipeline was
wrong.** Commit `dae023e`, deploy `6ab8f04d144ffe0008f8a766`, published
`10:31:03Z`, 27 new files. All **37 files byte for byte** by `cmp` against a
local `dist/` built with the `sb_publishable_…` key; `check:deployed` clean, 16
precached files.

The correction matters because it changes the procedure. The sixth run recorded
"Netlify is not building from git pushes on this project — a push alone ships
nothing." **It does.** This deploy was created 22 seconds after `git push`,
carries `commit_ref: dae023e…`, `branch: main`, `committer: pisanuw` and
`manual_deploy: false`, and its title is the commit message — no MCP deploy was
run this session at all. Two things misled the earlier reading: `deploy_source`
is `"api"` even on a git-triggered build, so it does not discriminate, and the
earlier session's *own* uploads legitimately carried `commit_ref: null`. Use
`commit_ref` and `manual_deploy` to tell the two apart, and check whether a git
build has already landed before uploading one on top of it. Which key the live
build uses can be read out of the served bundle — grep the entry chunk for
`sb_publishable_` — so a byte comparison never has to guess.

**Next run should pick up — in this order.**

1. **`npm ci` first**, and expect detached HEAD.
2. **A second look at the watcher's cost, with a stopwatch rather than an
   argument.** Twenty seconds was chosen against the gesture (shorter than it
   takes to read the conflict panel and decide), not measured. Worth checking
   what an hour on the board actually costs in requests, and whether
   `refetchOnWindowFocus` on the feed alone would carry most of the benefit at a
   fraction of that — the interval could then go up. Do not shorten it without a
   reason; the flicker gate is the part that would suffer.
3. **The other pages that read a scenario are still stale.** `Report`, `Compare`
   and `StudentCheck` build the same snapshot through `useScenarioSnapshot` and
   have no watcher. A coordinator exporting a report while somebody edits the
   board exports last hour's answer. `useLiveScenario` takes a scenario id and
   nothing else, so this is three one-line calls — but the *notice* is wrong on
   a report page ("the board has been brought up to date" when you are looking
   at a report), so the sentence needs a subject before this is done rather than
   just wired.
4. **A real paste through the time-schedule import still needs the maintainer.**
   Unchanged and not re-attempted: the published UW time schedule is behind a
   Shibboleth redirect now, so only somebody signed in can supply one. **This
   should come off the list rather than be retried each run.**
5. **The SessionStart hook still needs the maintainer** — writing `.claude/` from
   here is blocked by the auto-mode classifier as self-modification, correctly.
   `npm install --no-audit --no-fund`, guarded by `[ "$CLAUDE_CODE_REMOTE" =
   "true" ]`.
6. **Re-run the database sweep whenever the schema next moves.** It has not moved
   since the fifth run — this run added no migration — so it was not repeated.
   The query is `pg_class.relrowsecurity` + `reloptions` over `public`, joined to
   `pg_policy`.

---

## 2026-09-27 (sixth run today) — the last lint rule is on, and the false positives were half real

`npm ci` **worked this run**, unprompted and with no settings file in the repo,
so the fifth run's classifier refusal was transient rather than a permanent
wall. That was item 1 on the handoff and it cleared, so there was a real run to
have. Detached HEAD again, as predicted; `git branch -f main <commit> && git
checkout main` again the fix. Expect both every run.

**Item 2 done: `react-hooks/refs` is an error, with nothing suppressed.** The
plan on the handoff was to scope the rule off to `LoadPanel.tsx` and take the
gate everywhere else. That turned out to be the wrong trade, because the ten
findings were fixable — and the previous run's diagnosis of them was wrong in a
way worth recording.

The comment said the rule "sees a property called `ref`" on the object
`useRowDrag` returns, and that there was no ref anywhere near it. Renaming the
key from `ref` to `setNodeRef` was the obvious test of that claim, and **it
changed nothing: still ten findings, still including `drag.className`, a
string.** The rule does not key on the name. It taints the whole object once it
holds a callback ref, and then reports every property read off it. Which means
the finding was pointing at something real after all — not a wrong ref access,
but a bundle that put dnd-kit's node-ref callback and the row's plain props on
one object and made them indistinguishable.

So `useRowDrag` returns `[setNodeRef, props]` now. Both call sites read
`<li ref={dragRef} {...dragProps}>`, which is shorter than the five-attribute
spread it replaces, and all ten findings go with it. `SectionCard.tsx` never
had the problem because it calls `useDraggable` in the component and passes
`setNodeRef` straight to `ref` — the taint needs the wrapper to travel.

`eslint-plugin-react-hooks` v7 is now fully on: `refs`, `set-state-in-effect`
and `exhaustive-deps` all errors, nothing grandfathered, no file-scoped
exception, no inline disable. The two rules still off are
`react-refresh/only-export-components` (a different plugin, off for the reason
in the config) and nothing else.

**Learned — the general point.** *A lint finding recorded as a false positive
deserves one cheap experiment against the stated cause before it is believed.*
The cause here was written down confidently and was wrong, and the experiment
that disproved it was a two-line rename that took a minute. Ten "false
positives" were one design smell; the rule was right and the comment was the
thing that had drifted.

**Verified.** 510 tests, typecheck, `lint --max-warnings 0` with the new rule
on, build, `check:drag` — which exercises exactly this code, "dragging a name
from the load panel assigns it", with a real mouse and a real finger, and
asserts a flick still scrolls rather than dragging (that path depends on the
`touchAction` style the refactor moved) — and `check:mobile`, 33 scenes clean at
375px including `load-panel`.

**Deployed and verified.** Commit `953206b`, Netlify deploy
`6ab8d34cacb1816cd7aba708`, published `08:27Z`. All **37 files byte for byte**
by `cmp` against a local `dist/` built with the `sb_publishable_…` key,
including the new `Board-DChZRRu5.js` chunk that carries the change.
`check:deployed` clean, 16 precached files. Worth knowing: this deploy's
`commit_ref` is `null` and its title is "Deploy triggered by upload" — the MCP
deploy uploads the working tree and builds it in Netlify's build system, so the
deploy record does **not** name the commit. The byte comparison is the only
evidence that what shipped is what `main` says, which is precisely why the
standing instruction asks for it.

Also learned about the pipeline: **Netlify is not building from git pushes on
this project.** The deploy that was live at session start was `deploy_source:
api` at the previous commit, not a git-triggered build. A push alone ships
nothing; the deploy step is not optional.

**Two items are blocked, and neither is blocked on effort.**

- **The SessionStart hook cannot be committed from this sandbox.** Writing
  `.claude/hooks/session-start.sh` and `.claude/settings.json` was denied by the
  auto-mode classifier as *Self-Modification* — an agent editing the config that
  governs the agent. That is a reasonable guardrail and was not worked around.
  So the fifth run's request stands and only a human can satisfy it: add a
  `SessionStart` hook running `npm install --no-audit --no-fund`, guarded by
  `[ "$CLAUDE_CODE_REMOTE" = "true" ]` so local checkouts are untouched. A hook
  runs outside the per-command classifier, which is the whole point — `npm ci`
  happened to be allowed this run, but nothing in the repo makes that reliable,
  and the fifth run shows what a refusal costs: the entire window.
- **Item 4, a real paste through the time-schedule import, cannot be sourced
  from here.** `https://www.washington.edu/students/timeschd/B/AUT2026/css.html`
  returns 200 and a **Shibboleth authentication redirect** — the published time
  schedule is behind UW NetID now. `WIN2027` is a 404, so the current quarter is
  not posted yet either. This is not a small obstacle to route around: it is why
  `ImportSheet` takes a paste rather than a URL in the first place, and it means
  the parser can only ever be checked against real current data by a human who
  is signed in pasting it. `timeSchedule.real.test.ts` remains a round trip over
  the three archived quarters, honest about what that does and does not prove.
  **Ask the maintainer for one paste of a current listing**; without it this item
  should come off the list rather than be re-attempted each run.

**Next run should pick up — in this order.**

1. **`npm ci` first, before planning anything**, and expect detached HEAD.
2. **Check whether a `.claude/` directory has appeared.** If the maintainer
   added the hook, nothing here needs doing again; if not, this stays a
   maintainer item and should not be retried from the sandbox.
3. **Two coordinators on one scenario do not see each other's edits.** This
   started as a note about undo and that was wrong — undo is not local state,
   it is `undo_change` in the database, and `myLastUndoableIds` already scopes
   ⌘Z to the caller's own changes for exactly this reason, argued in
   `docs/DESIGN.md` under *Undo*. That case is designed and handled. The real
   gap is one layer down, and it was checked rather than assumed:
   `main.tsx` sets `refetchOnWindowFocus: false`, the board's queries carry a
   five-minute `staleTime`, there is no polling, and realtime is deliberately
   aliased out of the bundle by `vite-plugins/supabaseTrim.ts`. So a board only
   refetches in response to *its own* mutations. A second coordinator's
   assignment is invisible until this one happens to write something — and the
   conflict panel is computed from that stale snapshot, so it can report a slot
   clear that somebody else filled minutes ago. **The wrong answer is to switch
   realtime back on**; the trim is worth ~40 kB on a phone and the design argues
   for it. Cheaper options worth weighing first: refetch on focus for the board
   alone, a short `refetchInterval` while the board is the visible page, or a
   version column on the scenario that a write checks and a stale board is told
   about. This wants the decision written into `docs/DESIGN.md` before any code.
   What is *not* yet known, and should be established first: whether the
   database already refuses a conflicting double-assignment, or whether
   last-write-wins silently. That changes which option is enough.
4. **An `aria-busy` or equivalent on a paused write** — still only if the
   offline banner turns out not to be enough in practice. Unchanged, and still
   speculative; consider dropping it.
5. **A re-run of the database sweep whenever the schema next moves.** It was
   clean in the fifth run and the schema has not moved since, so it was not
   repeated here. The query is `pg_class.relrowsecurity` + `reloptions` over
   `public`, joined to `pg_policy`.

## 2026-09-27 (fifth run today) — blocked: no dependencies can be installed in this sandbox

**Nothing was built this run, and the reason is worth more than the run would
have been.** `npm ci` and `npm install` were both refused by the sandbox's
permission classifier — `npm ci` as "Irreversible Local Destruction" (it
deletes `node_modules` before rebuilding it), `npm install` as a bare "Blocked
by classifier". `node_modules/` was **absent** at session start, so there was
nothing to destroy; the container is fresh each run and the previous runs
evidently had the install allowed.

That makes the verification bar — `npm test`, `npm run typecheck`, `npm run
build` — unreachable, and with it every code change. So no code was touched.
This is the documented response to an unmeetable bar, not a run that gave up
early: a commit that cannot be verified is worse than no commit.

**What the maintainer needs to do.** Allowlist the install in the project's
`.claude/settings.json` (there is no `.claude/` directory in this repo at all
right now, which is probably the root cause — nothing tells the classifier that
`npm ci` is expected here). Something like:

```json
{ "permissions": { "allow": ["Bash(npm ci)", "Bash(npm install)", "Bash(npm run :*)"] } }
```

A `SessionStart` hook that runs `npm ci` would be better still — it would put
the install outside the per-command classifier entirely and every future
scheduled run would start with a working tree. Until one of those lands, **every
scheduled run will stall exactly here.**

**What was done instead**, both needing no build:

- **A database security sweep, first-hand, and it is clean.** All 22 tables in
  `public` have RLS enabled and at least one policy; all three views
  (`access_summary`, `instructor_load_targets`, `section_meetings`) carry
  `security_invoker=on`. The Supabase security advisor returns exactly the three
  warnings `docs/DESIGN.md` already accepts and argues for — the six
  `SECURITY DEFINER` functions, `citext` in `public`, and leaked-password
  protection off on a Google-OAuth-only project. No drift, nothing new, no
  untracked table. Worth re-running each time the schema moves; the query is
  `pg_class.relrowsecurity` + `reloptions` over `public`, joined to
  `pg_policy`.
- **Item 4 off the handoff: `.env.asc` is documented in the README.** It could
  be answered without the maintainer after all. `gpg --list-packets` reads the
  public packet header without the secret key, so the file names its own
  recipient: an ASCII-armoured OpenPGP message encrypted to RSA key id
  `A4C59E8DCB190977`, AES-256/OCB. The README now says that, says it is not
  needed to build or run anything, and asks whoever added it to fill in the
  owner. *The general point: "needs the maintainer" deserves one cheap check
  first — the artefact often describes itself.*

**Next run should pick up — in this order.**

1. **Check `npm ci` works before planning anything.** If it is still refused,
   do not start a code item; write the blocker forward and stop. The two
   docs-only items on this list are the fallback.
2. **`react-hooks/refs`** — the last rule still off, for ten `LoadPanel` false
   positives against dnd-kit's `setNodeRef`. Scope the rule off to that one file
   and see whether it becomes a gate everywhere else. This was item 1 for this
   run and is untouched.
3. **An `aria-busy` or equivalent on a paused write** — only if the offline
   banner turns out not to be enough in practice.
4. **A real paste** through the time-schedule import, from the *current* UW
   listing rather than the three quarters already imported.
5. **`git fetch origin main` first**, and note that this session again started
   in **detached HEAD** at `origin/main` with local `main` stale — the fix from
   the previous entry (`git branch -f main <commit> && git checkout main`)
   worked. It is not a one-off; expect it every run.

---

## 2026-09-27 (fourth run today) — the lint rule was right, and it had found real data loss

Took item 1 off the handoff: the three `set-state-in-effect` sites left.
`git fetch origin main` first, per the merge note — nothing new had arrived, and
nothing arrived during the run either.

All three are cleared and **the rule is now an error with nothing
grandfathered.** The interesting part is not that the rule is on; it is what the
third site turned out to be.

- **`MyPreferences.tsx` was losing what instructors typed.** The form was
  hydrated by an effect keyed on the query's data, so any refetch that returned
  a *different* object put the saved answers back over the fields. Saving a
  draft is exactly that: the mutation invalidates `['submission', cycleId]`, the
  server echoes the row it was just sent, and every keystroke between the tap on
  Save and the answer coming back was silently reverted. `refetchOnReconnect`
  reaches it the same way on a phone that loses signal and finds it again
  (`refetchOnWindowFocus` is off, so that path — which an earlier draft of this
  entry claimed — is not real). The page is now a loader plus a
  `PreferenceForm` child seeded once at mount from `initialFormState()` and
  remounted by `formKey()` = cycle + submission id. A refetch of the same
  submission cannot touch the fields.
- **`auth.tsx` stopped clearing the profile.** `profile` and `profileFor` are
  one `loaded: { userId, profile }` now, and `resolveProfile()` (pure, tested)
  compares its owner against the current session. Sign-out needs no effect at
  all, and the hole the old effect had is closed on the way past: for one render
  after an account switch the previous user's profile was still the current one,
  `isCoordinator` with it.
- **`Layout.tsx` closes the drawer during render** rather than in an effect, so
  the render that opens the new page is the one that closes the nav over it.
  Deriving it from "the path it was opened on" is tidier and wrong — Back to
  that path re-opens the drawer — which is why the check tests Back.

**Tests.** `src/lib/prefsForm.ts` and `src/lib/authState.ts` are new pure
modules with 18 unit tests between them, in the house style: the logic worth
testing leaves the component. Two new sections in `scripts/route_check.mjs`
drive the real bundle — the drawer (closes on navigate, stays closed through
Back, still opens, still closes on Escape) and the preferences form (type, save,
keep typing while the save is in flight, and the refetch must leave it alone).

**Learned — the part worth carrying.** *The regression test passed against the
broken page the first time I ran it.* The stub returned a fixed row, React
Query's structural sharing kept the previous object, the old effect never fired,
and the check went green over a bug that was live in production. It only became
a test when the stub started echoing what the save sent it, the way the real
project does. **Run a new regression check against the old code before believing
it** — `git show HEAD:<file> > <file>`, run it, restore. Two minutes, and here
it was the difference between a test and a decoration.

Second: the five findings were recorded as debt rather than dismissed, and that
record is what made this run possible — but "genuine debt, worth its own piece
of work" undersold it. One of the five was user-visible data loss affecting the
instructor who is actually using this. Debt that has been looked at closely
enough to name is also debt that has been looked at closely enough to triage,
and this one was never triaged.

**Verified.** 510 tests (up from 492), typecheck, lint at `--max-warnings 0`,
build, 33 mobile scenes at 375px, drag, keys, PWA, and `check:routes` — which
now fails against the pre-run `MyPreferences.tsx`, checked.

**Deployed and verified.** Commit `2eaf45b`, Netlify deploy
`6ab88168a62d650008d00076`, built from `main`. All 37 files byte for byte by
`cmp` against a local build made with the `sb_publishable_…` key — 34 assets
plus `sw.js`, `manifest.webmanifest` and `index.html`. `check:deployed` clean
(16 precached files), and `route_check.mjs` run against that same `dist/`, which
is literally the deployed bytes — so the drawer and the preferences form were
checked in a real browser in the bundle the coordinator will load, not in a
build that resembles it.

*One thing for the next run:* this session started in **detached HEAD** at
`origin/main`, with the local `main` branch 38 commits stale. `git push -u
origin main` therefore tried to push that stale branch and was rejected as
"behind its remote counterpart" — which reads exactly like a concurrent run
having pushed first, and is not. `git status -sb` says `## HEAD (no branch)`
when this is the case. The fix is `git branch -f main <commit> && git checkout
main`, then push.

**Next run should pick up — in this order.**

1. **An `aria-busy` or equivalent on a paused write.** The offline banner says
   how many changes are waiting in total; an individual pill on the board still
   looks exactly like a saved one. Worth doing only if the banner turns out not
   to be enough in practice.
2. **A real paste** through the time-schedule import, from the *current* UW
   listing rather than the three quarters already imported. The parser reports
   what it cannot read, so the failure mode is a list of lines rather than a
   wrong board — but nobody has watched it meet a live page yet.
3. **`react-hooks/refs`** is the last rule still off, for ten `LoadPanel` false
   positives against dnd-kit's `setNodeRef`. Worth a look at whether scoping the
   rule off to that one file turns it back into a gate everywhere else.
4. `.env.asc` arrived in `dd09666` with nothing saying which key opens it or what
   to do with it — worth a line in the README, from whoever added it. Needs the
   maintainer; nothing in this sandbox can decrypt it.
5. **Before picking any of the above, `git fetch origin main` and look.** See the
   merge note at the top of this file.

## 2026-09-27 (later) — a third run at the same item, and the one thing it added

**Read the merge note below first.** A *third* scheduled run picked the lint item
off the handoff before the merge note existed to warn it. It built its own config,
found the same nineteen findings, and got as far as a commit before the push was
rejected. That commit is discarded: the config already on `main` is the better
piece of work — type-aware, `react-refresh` registered, better-reasoned ignores —
and there is nothing to be gained by merging two answers to one question. The
branch was reset to `origin/main` and only what `main` did *not* have was applied
on top.

Which was three things.

- **`useShortcuts` was writing its ref during render, and the config said that was
  fine.** It is not. `latest.current = { state, onAction }` in the render body
  mutates the ref even on a render React throws away — an abandoned concurrent
  re-render, or StrictMode's second pass — so the key listener could read state
  from a render that never committed. Now written in an effect with no dependency
  array; `npm run check:keys` confirms in a real browser that this still wins the
  race against a key press, because effects flush before the browser processes the
  next input event. The paragraph in `eslint.config.js` that called it deliberate
  and safe has been corrected, because a future run would otherwise have trusted
  it. `react-hooks/refs` stays off: the ten `LoadPanel` false positives are real
  and this was the eleventh finding, the true one.
- **Two of the five `set-state-in-effect` sites are cleared**, and they were the
  two where deriving during render is strictly better rather than merely
  different. `Board` defaulted the selected quarter in an effect and `Compare`
  defaulted its two sides, so each rendered once with nothing selected: an empty
  tab strip and section list for a frame on the board, and the "choose two
  different scenarios" notice appearing before the defaults landed on the
  comparison. Both now read `chosen ?? first`, with state holding only what the
  coordinator actually picked — which also means the default follows the data if
  the data changes and nothing has been picked.
- **The config's own record is up to date** about which three sites remain and why
  each is harder than it looks.

**Learned.** *Concurrent runs are now frequent enough that "fetch first" is not
advice, it is the first step.* This is the second collision on the same item
within hours, and the cost both times was a whole run's work thrown away. The
merge note below says to fetch; it needs to be the thing a run does before it
reads the handoff, not after. *And the more valuable lesson: a comment asserting
something is safe is not evidence that it is.* The config said the
write-during-render was deliberate and documented at length, and the length of the
documentation was doing the persuading. Checking the actual React semantics took
two minutes.

**Verified.** Lint clean at `--max-warnings 0`, 492 tests, typecheck, build, 33
mobile scenes at 375px, drag, keys, PWA and routing — the last being what covers
the `Board` and `Compare` changes.

**Deployed and verified.** Commit `895dd02`, deploy `6ab86cbe52316d000869d454`,
published in 20s. All 32 files byte for byte by `cmp` against a local build — 29
assets plus `sw.js`, `manifest.webmanifest` and `index.html`. `check:deployed`
clean, and `route_check.mjs` run against that same `dist/`, which is the deployed
bytes. `git fetch origin main` immediately before the push, and again before this
commit: nothing new had arrived either time.

## 2026-09-27 — two runs, one task, and what came of merging them

**Read this before the two entries below it.** Two scheduled runs fired close
enough together to pick the same item off the handoff, and both built it. The
other one pushed first (`4c9efed`), this one merged into it (`867c849` and the
merge commit above). Both entries are kept, because the collision is more useful
on the record than either entry alone.

What the merge kept, and why:

- **The type-aware config**, from this run. That is the whole difference in what
  the two found. `recommendedTypeChecked` with `projectService` gives
  `no-floating-promises`, `no-base-to-string`, `no-unnecessary-type-assertion`
  and `no-misused-promises`; none of those rules can decide anything without
  type information, and the other run's `configs.recommended` does not have
  them. Three real bugs came out of exactly those rules. The cost is that lint
  now reads the same program `tsc` does, so it is slower than a syntactic pass.
- **`react-refresh/only-export-components: 'off'` and `--max-warnings 0`**, from
  the other run, and this is the better call. This run left fourteen standing
  warnings and wrote them up as "real and deliberately left". The other run
  checked why they fire: pages export their column definitions *on purpose* so
  `harness/scenes.tsx` measures the real ones — `Courses.tsx` says so on the
  line above the export. So they are permanent by design, nobody can ever act on
  them, and fourteen of those is the same lie as a gate that cannot run.
  Verified before adopting: the comment is there and the harness does import it.
- **`undoChanges` over `undoMutate`** for the board's undo, from the other run —
  the same fix, the better name — with this run's note on why the rule's own
  suggestion (depend on `undo`) would have been worse than the warning.
- **ESLint 10 and react-hooks 7** over 9 and 5. This run's config is written
  against react-hooks 7's flat API (`configs.flat.recommended`; `configs
  .recommended` is still the eslintrc shape in v7 and fails at startup).

**What to learn from it.** Nothing prevents this happening again — two runs two
hours apart will both read the same "next run should pick up" list and start at
item 1. The cheap mitigation is to `git fetch` and check `origin/main` **before**
choosing the work, not only before pushing; this run checked at the start, found
itself apparently in sync, and spent a whole run duplicating an item that was
being built as it read. The tell was available and not looked for.

---

## 2026-09-27 (seventeenth run) — the gate that was lying about existing

**Built.** `npm run lint` now runs. It had been a script with no config behind it
for long enough that nobody remembered, which is worse than having no gate: it
reads like a check that runs.

- `eslint.config.js` — ESLint 10 flat config. Type-aware
  (`recommendedTypeChecked`, `projectService`), `eslint-plugin-react-hooks` 7,
  `react-refresh` scoped to the app. 119 files: `src/`, `harness/`, `scripts/`,
  `vite-plugins/`, both Vite configs and itself.
- `src/vite-env.d.ts` — the two `VITE_*` values declared, so
  `import.meta.env.VITE_SUPABASE_URL` is `string | undefined` instead of `any`.

No rule in the config reflows a line. Formatting is left alone entirely, so lint
and the build can never disagree about a file.

**The first run reported 153 problems. What they turned out to be.**

*Two real bugs, both in `src/lib/auth.tsx`, both found by
`no-floating-promises`.* Neither `.then` had a rejection handler. `getSession()`
rejecting was survivable — `session` starts null, so the reader lands on the
sign-in page — but it was an unhandled promise and now says so deliberately. The
profile select was not survivable: a rejection meant a reader kept a session,
never got a profile, and `loading` stayed true **for ever**. The comment directly
above it already argued that leaving somebody on "Loading…" for ever is
unacceptable, and the code did exactly that on any rejected select — which on a
phone means walking into a lift. It is the second argument to `then` rather than
a chained `.catch`, because a Postgrest builder is a bare `PromiseLike` and has
no `catch`. **That is also why the linter never flagged that one** — it only
found the `getSession()` call above it. The bug came out of reading the file the
finding pointed at, not out of the finding.

*One real bug from `no-base-to-string`, and it was user-facing.* `failureText`
did `e instanceof Error ? e.message : String(e ?? '')`. A Postgrest error is a
plain object with `message` and `code`, not an `Error`, so any failure arriving
unwrapped rendered as **"Could not save the section: [object Object]"** under the
coordinator's thumb. There is now one `messageOf(e)` in `src/lib/online.ts` that
both `failureText` and `isOfflineError` share — so they cannot drift — and it
returns `''` rather than a guess when there is nothing readable, which
`failureText` already renders as the prefix alone.

*One stale-dependency warning, in `Board.tsx`.* `runUndo` listed `undo.mutate`,
which was correct and unverifiable, so the rule asked for the whole `undo`
object — which would rebuild `runUndo` and the shortcut dispatch twice per undo.
`const undoMutate = undo.mutate` says the same thing in a form the rule can
check.

*Eighteen dead type assertions.* Mostly `(e as Error).message` in mutation
handlers, where react-query already types the error as `Error`. One of them,
`navigator.serviceWorker as unknown as ContainerLike`, was dead because a real
`ServiceWorkerContainer` satisfies `ContainerLike` structurally — removing it
left the import unused, so that went too.

*One dead function.* `lumOf` in `scripts/mobile_check.mjs`, never called, a
Node-scope duplicate of the `luminance` helper that already exists inside the
browser-side code and is used there. Checked before deleting, because the
previous run's log records deleting dead code that was doing something.

*Fifty-five false positives from one cause.* `scripts/*.mjs` are Node programs
that also contain browser code: the callback passed to `page.evaluate()` is
serialised and run inside Chromium, so `document` and `getComputedStyle` are
genuinely defined where they appear. Both global sets are now declared for those
files.

**Learned.**

- *The linter's value was not in its findings but in where it pointed.* The
  worst bug of the three — "Loading…" for ever on a lost signal — was in a
  promise the linter could not see, three lines below one it could. A finding is
  a reason to read a file.
- *`String()` on an `unknown` is a user-facing decision, not a formality.* Every
  failing write in this app funnels through one function, so "[object Object]"
  had exactly one place to come from and one place to fix. The narrowing has to
  name its primitives one at a time, too: what is left after ruling out
  `Error`, string, null and object still includes a function, and a function
  stringifies its own source into the toast.
- *A rule turned off without a reason is a rule nobody can argue with later.*
  Six are off and a seventh is narrowed; each carries the specific reason.
  `no-unsafe-assignment` is the one to revisit — it is off only because no
  `database.types.ts` has ever been generated, so Supabase rows arrive as `any`
  and are cast at the boundary. Its sharper relatives (`no-unsafe-call`,
  `no-unsafe-member-access`, `no-unsafe-return`, `no-unsafe-argument`) stay on,
  and those are the ones that catch an `any` being *used*.
- *react-hooks 7 ships the React Compiler's rules next to the classic two, and
  they are not all for a codebase this age.* `refs` gave eleven findings, ten of
  them the same false positive: `useRowDrag` returns an object whose `ref` key
  holds dnd-kit's `setNodeRef`, and the rule sees a property called `ref` read
  during render. `set-state-in-effect` gave five, all genuine "you might not
  need an effect" debt — real work, on five components' state flow, and not
  something to do under a lint gate. Both off, both sites listed in the config.
- *A gate is worth what it catches, so it was tested.* A throwaway component
  with a conditional hook, a missing dependency and an unhandled promise: all
  three reported, exit 1. Then deleted.
- *`exhaustive-deps` was promoted from warning to error*, because it had reached
  zero findings and so cost nothing, and because it has the best record on this
  codebase — a stale `openNew` closure and a listener rebuilt on every keystroke
  are both in this log.

**Verified.** `npm run lint` clean — 0 errors and 0 warnings, under
`--max-warnings 0`. (This run first left fourteen `react-refresh` warnings
standing and argued for them; the merge note above explains why the other run's
answer was better and what replaced it.) 492 tests (483 before, 9 new —
`messageOf` and the two `failureText` cases). Typecheck and build green. All 33 mobile scenes
clean at 375px, and `check:drag`, `check:keys`, `check:routes` and `check:pwa`
all clean — worth running in full this time because `auth.tsx`'s behaviour
changed and because two of the check scripts were themselves edited.

No migration: nothing in the database changed, so the RLS suite was not re-run.

**Deployed and verified.** Deploy `6ab866bc4b460000081844e7` built the merge
commit `894e5ad` from `main` and published in 22s. **All 37 files byte for byte**
against the served site by `cmp` — 0 differing, 0 missing — plus
`check:deployed` clean and the served entry chunk carrying the failure-message
strings, which matters because a hash match alone would not say whether the
behaviour shipped.

One trap worth recording, because it wasted a build. The procedure below says to
recover the publishable key by grepping the served entry chunk, and it is still
right — but a *second* deploy landed between reading the entry's name from
`index.html` and fetching it, so the fetch returned a 404 body, the grep found no
key, and the build failed on the env guard. It looked like the key had moved into
another chunk with the code splitting. It had not. **Read `index.html` and fetch
the chunk it names in the same breath**, and if the key comes back empty, check
for a rotated hash before concluding anything about where it lives.

**Watch out for.**

- **The verification bar is now four commands, not three.** `npm test`,
  `npm run typecheck`, `npm run build` and `npm run lint`. Lint is deliberately
  not wired into `build` — Netlify runs the build, and a lint failure should not
  be able to take the site's deploy down. It runs under `--max-warnings 0`, so
  anything it reports at all is a failure.
- **`react-hooks/set-state-in-effect` is off with five named sites.** That is
  recorded debt, not a dismissal. `auth.tsx:52` is one of them, and its loading
  window has already caused one real bug.

**Next run should pick up — in this order.**

1. **The three `set-state-in-effect` sites left** — `Layout.tsx`, `auth.tsx`,
   `MyPreferences.tsx`. `Board` and `Compare` are done (see the entry below).
   `Layout` and `auth` are worth attempting; `MyPreferences` hydrates an editable
   form and is the one site where the rule has no good answer, so the honest end
   state may be the rule on with a single suppression there.
2. **An `aria-busy` or equivalent on a paused write.** The offline banner says
   how many changes are waiting in total; an individual pill on the board still
   looks exactly like a saved one. Worth doing only if the banner turns out not
   to be enough in practice.
3. **A real paste** through the time-schedule import, from the *current* UW
   listing rather than the three quarters already imported. The parser reports
   what it cannot read, so the failure mode is a list of lines rather than a
   wrong board — but nobody has watched it meet a live page yet. (From the
   concurrent run's list; it is the better third item.)
4. `.env.asc` arrived in `dd09666` with nothing saying which key opens it or what
   to do with it — worth a line in the README, from whoever added it. Needs the
   maintainer; nothing in this sandbox can decrypt it.
5. **Before picking any of the above, `git fetch origin main` and look.** See the
   merge note at the top of this file.

---

## 2026-09-27 (seventeenth run, the concurrent one) — the gate that could not run

*Pushed first, as `4c9efed`. Kept in full; see the merge note above for which of
its decisions survived and which this run's replaced.*

**Built.** `npm run lint` runs. It had been in `package.json` for fifteen runs
with no config and no ESLint installed, so it failed with a migration notice
that read like a warning — a gate everything passes.

- **`eslint.config.js`**: the recommended sets, `react-hooks` with
  `exhaustive-deps` as an **error**, and no stylistic rules at all. Formatting
  is Prettier's argument and not worth having twice.
- **`npm run lint` fails on a single warning** (`--max-warnings 0`), which is
  only honest now that there are none left.

**Three real findings, all fixed.**

- *A dependency list the linter could not verify.* `runUndo` on the board
  depended on `[undo.mutate, toast]`. A member access is not something the rule
  can prove stable — and neither can a reader. It depends on a destructured
  `undoChanges` now.
- *Dead code.* `lumOf` in the mobile check, left behind when the print
  assertions started comparing colours directly.
- *An unused binding* in the routing check's dark sweep.

**Learned.**

- *The browser globals in the check scripts are not a mistake.* 26 of the 62
  errors were `document is not defined` in `scripts/*.mjs` — inside functions
  that `page.evaluate` serialises and runs in Chromium, where `document` is
  exactly as real as `fs` is outside. The config gives those files both global
  sets rather than silencing the rule.
- *A rule you have decided against belongs in the config, off, with the
  reason.* `react-refresh/only-export-components` fired fifteen times, all on
  pages that export their column definitions so the mobile harness can measure
  the real ones rather than a copy. Fifteen standing warnings nobody acts on is
  the same lie as a gate that cannot run.

**Checked rather than believed.** The gate was made to fail on purpose twice
before being trusted: an unused import, and a `useMemo` over the board snapshot
with an empty dependency list — the exact bug the rule is here for.

**Verified.** 483 tests, typecheck, build, lint, and all four browser checks
(33 mobile scenes in both themes and on paper, routing, drag, PWA).

**A collision worth recording.** This session and the two-hourly one were both
working on this repository at once, and both built the time-schedule import —
the same feature, the same file names, within a few hours. The scheduled run
got there first and its version is what shipped (`20332dc`); this session's
duplicate was thrown away rather than merged, and it had nothing the other
lacked, down to reading `scripts/data/history_sections.csv` as its fixture.
Before starting anything, `git fetch` and read this file: it is the only thing
that stops two runs spending a window each on one feature.

**Next run should pick up — in this order.**

1. **An `aria-busy` or equivalent on a paused write.** The offline banner says
   how many changes are waiting in total; an individual pill on the board still
   looks exactly like a saved one. Worth doing only if the banner turns out not
   to be enough in practice.
2. **A real paste** through the time-schedule import, from the *current* UW
   listing rather than the three quarters already imported. The parser reports
   what it cannot read, so the failure mode is a list of lines rather than a
   wrong board — but nobody has watched it meet a live page yet.
3. `.env.asc` arrived in `dd09666` with nothing saying which key opens it or
   what to do with it — worth a line in the README, from whoever added it.
   Needs the maintainer; nothing in this sandbox can decrypt it.

---

## 2026-09-27 (sixteenth run) — nine keys, and a list that cannot lie about them

**Built.** Keyboard shortcuts on the board, and the discoverability that was the
larger half of the problem.

- `src/lib/shortcuts.ts` — the table, and `activeShortcuts`, `matchShortcut`,
  `isTypingTarget`, `keyCap`, `looksApple`, `shortcutGroups`. All pure.
- `src/hooks/useShortcuts.ts` — the window listener, attached once.
- `src/components/board/ShortcutHelp.tsx` — the `?` sheet, rendered from the
  table rather than from a copy of it.
- `src/pages/Board.tsx` — the hand-rolled ⌘Z effect is gone, replaced by a
  dispatch over the keymap. `openNew` moved above the early returns and became a
  `useCallback`.
- `scripts/keys_check.mjs` and `npm run check:keys` — real key presses in a real
  browser, on a new `shortcut-sandbox` harness scene.

The nine: ⌘Z undo, `N` add a section, `I` import a quarter, `F` fill the gaps,
`1`–`4` the quarters, `?` the list.

**Learned.**

- *Rendering the help from the binding table is the whole design.* A shortcut
  cannot be added without appearing in the help, and the help cannot claim a key
  that does nothing. A hand-kept list would have drifted by the second shortcut,
  and a wrong help sheet is worse than none — somebody presses the key it
  promised, nothing happens, and they conclude the feature is broken.
- *The harness scene found a real bug on its first run, which is the whole point
  of having it.* `Board` was passing its own live state to the help sheet. That
  state says a sheet is open — this one — so `activeShortcuts` correctly reported
  that nothing else was bound, and the sheet greyed out every row. What a help
  sheet wants is what the keys do *once it is closed*. Nothing in the unit tests
  could have caught it: both halves were behaving exactly as specified.
- *`check:mobile` rejected the obvious way to show "unavailable", and it was
  right for a better reason than the one it gave.* `text-slate-400` on the sheet
  is 2.6:1 in daylight and 3.5:1 in the dark. But colour alone is a poor way to
  say "this does nothing" regardless of contrast, and the rows that do nothing
  are the ones most in need of being read. The label stays legible, the key cap
  takes a dashed border, and the row carries `aria-disabled` and a sentence
  giving the reason.
- *An assertion can pass for the wrong reason, and removing unrelated code is how
  you find out.* "A matched key is prevented and an unmatched one is not" was
  green only because a step I later deleted had moved focus out of the textarea.
  Without it the key landed in a field, was suppressed by the typing guard rather
  than prevented by a match, and the check failed. The line that moves focus is
  now there on purpose with a comment saying why. Worth remembering that I
  deleted that block because it was dead code — and it was dead code doing
  something.
- *Single letters, not chords.* `g` then `b` buys a namespace bigger than nine
  actions need and costs a mode: press `g`, go and answer the door, come back to a
  board that is waiting for a second key and will not respond to the first thing
  you try.
- *The old ⌘Z handler had a subtler problem than its dependency array.* Fourteen
  dependencies meant a `keydown` listener rebuilt on every keystroke in the import
  sheet, which is ugly and harmless. The refs in `useShortcuts` fix that — and
  introduce the risk they exist to remove: `runAction` closes over `openNew`,
  which closes over `termId`, so a stale callback would open the section editor
  preset to the quarter the coordinator had left. `openNew` is memoised on
  `termId` and listed in `runAction`'s dependencies for exactly that reason.

**Verified.** 483 tests (446 before, 37 new), typecheck and build green. All 33
mobile scenes clean at 375px including `shortcut-help` — measured in its tallest
state, a locked scenario where four of the nine rows carry a reason — and
`shortcut-help-open`. Drag, PWA and routing clean. And `check:keys`, twelve
assertions: a plain letter fires, `?` fires with Shift, ⌘Z and Ctrl+Z both fire,
⇧⌘Z does not, an unclaimed key does nothing, a field and a textarea keep every
character and fire nothing, a sheet takes the keyboard away and gives it back,
Tab still moves focus, and a matched key is prevented where an unmatched one is
not.

No migration: nothing new in the database.

**Deployed and verified.** Commit `c6116eb`. Every file byte for byte again — 29
assets plus `sw.js`, `manifest.webmanifest` and `index.html`, by `cmp` — and the
served board chunk holds the new strings ("Keyboard shortcuts", "Show this list",
"Go to the first quarter", "closes any sheet"), which matters because the entry
chunk would have matched whether or not the feature shipped. `check:deployed`
clean, and `route_check.mjs` run against that same `dist/`.

**Watch out for.**

- **`npm run lint` cannot run.** There is no `eslint.config.js` and ESLint is not
  a devDependency; the script has presumably been dead for a while and nothing
  noticed, because nothing runs it. Either write the config or delete the script —
  a gate that cannot run is worse than no gate, and this is the second one of
  those this week.
- **`?` is hidden below `sm`.** Deliberate: shortcuts are no use to a phone and a
  44px target listing keys nobody has is worse than nothing. If the coordinator
  turns out to work on an iPad in portrait, that is 768px and still `sm`, so it
  is there.

**Next run should pick up — in this order.**

1. **`npm run lint`**, per above. Small, and it closes a gate that is currently
   lying about existing.
2. **An `aria-busy` or equivalent on a paused write.** The offline banner says
   how many changes are waiting in total; an individual pill on the board still
   looks exactly like a saved one. Worth doing only if the banner turns out not to
   be enough in practice.
3. `.env.asc` arrived in `dd09666` with nothing saying which key opens it or what
   to do with it — worth a line in the README, from whoever added it. Needs the
   maintainer; nothing in this sandbox can decrypt it.

---

## 2026-09-26 (fifteenth run) — seven findings, and what they were really about

**Built.** `npm audit` reports nothing. Two commits, because the two halves are
independent and one of them ships to the coordinator.

- **`react-router-dom` 6.30 → 7.18** (`32059ba`). The correction first: three
  runs recorded these seven findings as "all in dev tooling". That was wrong.
  `react-router-dom` is a runtime dependency and two of the seven were against
  it.
- **`vite` 5.4 → 8.3, `vitest` 2.1 → 5.0, `esbuild` 0.21 → 0.28,
  `@vitejs/plugin-react` 4 → 6** (`8f0d206`), plus two problems the upgrade
  uncovered — see below.
- **Node pinned to 22** in `.nvmrc` (`7b8fd83`).
- Also, unrelated but cheap and in the same files: `dist-buildcheck/` is
  gitignored, and `npm run build:check` exists.

**Learned.**

- *Severity is not reachability, and the entry that said "dev tooling" is why
  nobody looked again.* Worth being precise, because the precision is what
  decides whether to act: the router's SSR finding needs `deserializeErrors()`
  and there is no server renderer; its open redirect needs a target beginning
  with a backslash, and every target here is a template literal with a fixed
  `/board/` or `/report/` prefix and a UUID after it. The critical vitest one
  needs the Vitest UI server, which is not installed. So nothing was exploitable
  — and it was all still worth upgrading, because "not reachable" is a property
  of the call sites. The first `?next=` parameter anybody adds to the sign-in
  flow makes a navigation target user-controlled, and nothing would connect that
  change to this advisory.
- *`npm run build` can succeed with no application in it.* The biggest thing
  this run found, and it was found by accident. Rolldown — Vite 8's bundler —
  eliminates dead code across modules. `src/lib/supabase.ts` throws at module
  scope when the two Supabase values are missing; Vite inlines them at build
  time; so an env-less build lets the bundler prove the entire app shell is
  unreachable and drop it. What comes out is a 2.5 kB entry, every page chunk
  still present because those are dynamic imports, and a build that prints its
  usual table of chunks and reports success. `npm run build` is one of this
  project's three verification gates. Under Vite 5 it produced something that
  failed loudly in a browser; under Vite 8 it passes silently.
  `vite-plugins/envGuard.ts` now refuses it.
- *Guard the cause, not the symptom.* The obvious check — assert `src/App.tsx`
  is in the output — was written first, wired up, and passed: `chunk.moduleIds`
  still lists a module after its code has been eliminated, because the module was
  reached and then emptied. A size threshold would need revising whenever the
  shell grew and would not say what was wrong. Two absent environment variables
  are unambiguous.
- *Tailwind generates utilities from prose.* `scripts/` is Playwright selectors,
  so `[data-drag-id="instructor:i4"]:visible` became
  `.instructor\:i4\"\]\:visible:is()` in the *shipped* stylesheet. Vite 5's CSS
  minifier warned about it on every build and nobody had scrolled up far enough
  to see it; Vite 8 stopped warning without fixing it, which is the worse state —
  the noise went and the rule stayed. `@source not "../scripts/**"` was the wrong
  tool: adding any directive changes what automatic detection considers, so it
  removed one junk rule and introduced three from `docs/`. Declaring sources
  (`source(none)` plus `@source "../src"` and the app's `index.html`) dropped
  thirteen rules and 1,159 bytes, all junk — the bare `.bg-white`,
  `.transition`, `.grow` and `.text-slate-400` that went are not used anywhere
  in `src/`; what is used is `hover:bg-white/10`, `transition-colors` and
  `placeholder:text-slate-400`, which are different rules and are still there.
- *npm cannot raise a peer-dependency floor in place.* `npm install -D
  vite@^8 @vitejs/plugin-react@^6` fails with ERESOLVE naming the installed
  plugin-react 4.7.0 as the blocker, and keeps failing after `rm -rf
  node_modules`, because the lockfile is what it is reading. The lockfile has to
  go too. Which means re-resolving every `^` range — the exact hazard the twelfth
  run committed the lockfile to prevent — so the eight runtime packages were
  compared by version before and after. All eight identical,
  `@supabase/supabase-js` included. Do that comparison; do not skip it.

**Measured, not assumed.**

| | raw | gzipped | requests |
| --- | --- | --- | --- |
| vite 5 + router 6 (was deployed) | 403,136 | 116,704 | 5 |
| vite 5 + router 7 | 419,110 | 122,284 | 5 |
| vite 8 + router 7 (now deployed) | 401,468 | 116,539 | 6 |

React Router 7 costs +15,974 raw and +5,580 gzipped over 6.30 — 4.6% of a
signed-out visitor's first load. Rolldown more than paid for it. The extra
request is a 368-byte rolldown runtime chunk. The build is also about 3× faster
(600ms against ~2s), which matters here only because every check in this
repository builds at least once.

**Verified.** 446 tests, typecheck and build green on the new toolchain, all 30
mobile scenes clean at 375px, drag, PWA (16 precached files now, the runtime
chunk being the new one) and routing — including the vite-8 chunk split, which
was the real risk: rolldown could have grouped the vendor chunks differently and
quietly undone the split. Every per-page chunk assertion still holds.

**Deployed and verified.** Commit `7b8fd83`, published from `main`. This is the
first deploy where **every single file matches byte for byte** — all 29 assets
plus `sw.js`, `manifest.webmanifest` and `index.html`, by `cmp`, against a local
build. That is what pinning Node bought: previous runs could only compare a
subset and had to reason about the rest. Then `scripts/route_check.mjs` was run
against that same `dist/`, which is now literally the deployed bytes.
`npm run check:deployed` clean.

**Watch out for.**

- **`npm run build` now needs the two Supabase values**, or it fails with an
  explanation. Use `npm run build:check` for the gate; use the real values when
  building something to compare against Netlify. Netlify has them, so the deploy
  is unaffected.
- **Vitest suggests `isolate: false`** for about 860ms. Deliberately not taken:
  `src/lib/routes.test.ts` exercises `prefetchRoute`, whose `inFlight` map is
  module-level state, and sharing workers across files is how that becomes
  flaky on some future Tuesday. 1.8s is not a problem worth a flaky suite.
- **TypeScript went 5.5.4 → 5.9.3** with the lockfile regeneration, since it was
  already `^5.5.4`. Typecheck is clean, and it is worth knowing it moved.

**Next run should pick up — in this order.**

1. **Keyboard shortcuts on the board.** Now the most valuable thing left: undo
   exists but only as a button, and nothing tells anyone what is available. A `?`
   overlay listing them is the other half of the job.
2. **An `aria-busy` or equivalent on a paused write.** The banner says how many
   changes are waiting in total; an individual pill on the board still looks
   exactly like a saved one. Worth doing only if the banner turns out not to be
   enough in practice.
3. `.env.asc` arrived in `dd09666` with nothing saying which key opens it or what
   to do with it — worth a line in the README, from whoever added it. This one
   needs the maintainer; nothing in this sandbox can decrypt it.

---

## 2026-09-26 (fourteenth run) — the change that looked saved

**Built.** The app now says when it is offline, and says what that means for
the changes made while it is.

- `src/lib/online.ts` — the rules, pure. `nextConnection` is a three-state
  machine (`online`, `offline`, `restored`); `bannerFor` turns it plus the
  number of queued writes into the one sentence to show; `isOfflineError`
  recognises a request that never arrived; `offlineFailureText` is what to say
  instead of the browser's words for it.
- `src/hooks/useConnection.ts` — subscribes to React Query's `onlineManager`
  and counts paused mutations out of the cache with `useMutationState`.
- `src/components/OfflineBanner.tsx` — the strip, in the flow between the nav
  and the page, from a live region that is always in the document.
- `src/App.tsx`, `src/components/Layout.tsx` — one hook call above the early
  returns, rendered in both branches, so the sign-in page has it too. Signing in
  is the only thing in this app that genuinely cannot work offline.
- `src/lib/toast.ts` — `failureText` now translates a dead connection. Every
  failing write in the app funnels through it, so this was one change rather
  than thirty.
- `src/lib/format.ts` — a `plural` helper, and with it the `describePlan`
  singularisation the last run left on the list: importing one section read
  "1 sections · 0 assignments" next to a button correctly saying "Import 1
  section". `conflictSummary` now uses it rather than its own inline copy.

**Learned.**

- *The handoff note was wrong about the symptom, and the truth was worse.* It
  said a coordinator tapping Assign with no signal "gets a Supabase error".
  They do not. React Query's default `networkMode: 'online'` **pauses** a
  mutation started while the browser is offline: `onMutate` runs so the
  optimistic pill appears, `mutationFn` never runs so nothing reaches Supabase,
  and the mutation waits in the cache until the connection returns. An error
  would have been a message. What actually happened was a change that looked
  saved, with a spinner nobody watches, for as long as the signal was out. That
  is the bug this run fixes, and `src/lib/online.test.ts` pins the React Query
  behaviour the banner's promise depends on — if a future version rejects
  instead of pausing, "they go through when the connection comes back" becomes a
  lie and that test is what says so.
- *Measuring the queue rather than keeping a count of it was the only honest
  option.* React Query resumes paused mutations by itself on reconnect, so any
  counter the app kept would have drifted within a second of the signal
  returning. `useMutationState` filtered on `isPaused` cannot drift: it is the
  same cache the resume reads.
- *`onlineManager` over `window`.* Both would have worked and only one cannot
  disagree with the app. The manager is what decides whether a mutation runs or
  pauses; a banner reading `window`'s events directly could say the connection
  was back while React Query still held every write.
- *An always-present empty live region is the correct accessibility choice and
  it broke a check.* A region that appears together with its text is, in several
  screen readers, a region that is never announced. Keeping it in the document
  empty means `[role="status"]` now matches two elements on every page, which is
  what `scripts/pwa_check.mjs` was using to read the update offer. Fixed by
  asking for the region *containing the Reload button* — a better locator than
  the one it had.
- *A three-state machine, not a boolean, for one reason: browsers lie about
  coming back.* `online` fires on waking from sleep and on changing access
  point. Treating every one as a recovery would flash "Back online" at somebody
  whose connection never dropped, which is how a banner becomes something people
  learn to ignore.

**Verified.** 446 tests (420 before, 26 new), typecheck and build green. All 30
mobile scenes clean at 375px including the new `offline-banner`, measured with
the longest wording it can produce (12 queued changes, four lines at 375px) —
the shortest one would have proved nothing. Drag and PWA checks clean. And the
routing check now drops the connection for real with
`context.setOffline(true)`: the banner arrives on the sign-in page and on the
board, sits between the header and the page, is not fixed, does not overflow
375px, and goes away by itself when the signal returns. That is the only
assertion covering the wiring between `online.ts` and the browser, and it reads
`RESTORED_MS` out of the source rather than carrying its own copy of the number.

No migration: no new table, view, column or policy, so there is nothing for
`supabase/tests/rls_test.sql` to grow.

**Deliberately not done.** Buttons are not disabled while offline. The
temptation is obvious and it would make the app worse: React Query's pause
means an assignment made offline really does get saved, so taking the button
away would remove a working feature to prevent a problem the banner already
explains. Reading and planning on a phone with no signal, with the writes
catching up later, is the behaviour worth having.

**Watch out for.** The banner trusts the browser about being online, which is
the half `navigator.onLine` gets right. The other half — connected to a portal
that answers everything with a login page — has no event, so there is no banner
for it; what that case gets is the translated failure message on the first
write that dies. Closing the gap properly would mean a heartbeat against
Supabase, which is a request every N seconds on a phone, for a case the
translated message already explains.

**Deployed and verified.** Commit `7566069`, deploy `6ab8476b193d2c0008654e51`,
published in 21s. The served entry chunk (`index-BXDTX_Ua.js`), the stylesheet,
and the `react` and `supabase` chunks all compare byte for byte — `cmp`, not a
matching hash — against a local build. The entry is the chunk that matters this
time: `App`, `Layout`, `OfflineBanner`, `useConnection` and `online.ts` are all
eager, so the whole feature is in there, and it is visible in the served bytes
("waiting to save", "Nothing is lost", "You can keep reading", "Back online",
"no connection to the server", `isPaused`). Then `scripts/route_check.mjs` was
run against that same `dist/` — the bytes proven identical to what is served —
so the live banner is checked in a real browser rather than inferred.
`npm run check:deployed` is clean: 15 precached files, every icon, the worker
replaceable.

**Two things worth knowing for the next deploy verification.**

- *Netlify builds with the modern publishable key, not the legacy anon JWT.*
  `VITE_SUPABASE_ANON_KEY` on the site is
  `sb_publishable_71_-uGHRKjaXisg8DLjmjw_dVMFbYsa`. Both are publishable and
  either works, but only one reproduces the entry chunk's hash — a local build
  with the legacy key produced `index-ByeMcle6.js` against the served
  `index-BXDTX_Ua.js`, which looks exactly like a deploy that did not ship.
  `mcp__Supabase__get_publishable_keys` lists both; the `type: "publishable"` one
  is the right one.
- *Do not build into a directory `.gitignore` does not name.* Tailwind 4 scans
  the project for class names and skips ignored paths, so a build into
  `dist-verify/` gets scanned by the *next* build and inflates its stylesheet —
  37.51 kB instead of 36.74 kB, a different hash, and a comparison that fails
  for a reason that has nothing to do with the deploy. Build into `dist/`, which
  is ignored, or add the directory to `.gitignore` first.

**Next run should pick up — in this order.**

1. **`npm audit` reports 7 vulnerabilities** (1 critical, 1 high), all in dev
   tooling as far as three runs have looked. The lockfile is committed now, so
   upgrading is a deliberate act with a reviewable diff — worth a run of its
   own, and it is the oldest thing on this list.
2. **Keyboard shortcuts on the board.** The last unbuilt item on the polish
   list with real value for the coordinator: undo exists but only as a button,
   and there is no `?` telling anyone what is available.
3. `.env.asc` arrived in `dd09666` with nothing saying which key opens it or
   what to do with it — worth a line in the README, from whoever added it.
4. **An `aria-busy` or equivalent on a paused write.** The banner says how many
   changes are waiting in total; the individual pill on the board still looks
   exactly like a saved one. Worth doing only if the banner turns out not to be
   enough in practice.

---

## 2026-09-26 (thirteenth run) — the schedule, pasted

**Built.** The last unbuilt piece of the original plan: importing a quarter from
a pasted UW time schedule. Iteration 5 is now complete.

- `src/lib/timeSchedule.ts` — the parser and the resolver, both pure.
  `parseTimeSchedule` reads the published listing; `resolveImport` turns what it
  read into the `HistoryRow` shape the seed planner already understands;
  `matchInstructor` maps a schedule name onto the roster.
- `src/lib/seedPlan.ts` — one addition, `existingKeys`. Importing into a quarter
  that already holds sections would otherwise fail the whole insert on the first
  `(term, course, letter)` collision.
- `src/components/board/ImportSheet.tsx` — paste, see what it read, confirm.
  Everything below the textarea recomputes as the text changes.
- `src/pages/Board.tsx` — an Import button in the quarter toolbar, and the empty
  quarter now offers the import rather than only "add a section".
- `src/hooks/useScenarioSnapshot.ts` — returns `instructors` as rows. The
  snapshot narrows them to id and name; matching needs `full_name` and
  `is_active`.

**Verified.** 420 tests (369 before, 51 new), typecheck and build all green.
All 29 mobile scenes clean at 375px including the new `import-sheet` — measured
with a paste actually in the field, not on an empty sheet, so the summary, the
three disclosure lists and the long unimportable lines are what got measured.
The dialog checks came free with it: focus enters the sheet, Tab and Shift+Tab
stay inside it for 16 presses each, Escape closes it. Routing and drag checks
still clean. No migration: the import writes to `sections` and
`section_instructors` through the same `useApplySeedPlan` the seeding path
already used, so there is no new table, view or policy — and nothing for the
RLS suite to grow.

**Learned.**

- *Reading fixed-width text by column is the obvious approach and the wrong
  one.* The published schedule is a `<pre>`, so counting characters looks
  right — but the coordinator gets the text by copying it, and a copy collapses
  runs of spaces. Recognising each field by its own shape costs a little more
  code and survives the paste. One field is still taken by position, and it has
  to be: `F` is both a section letter and Friday, and only its place after the
  SLN tells them apart.
- *The time format carries a rule that is not in the string.* `1100-100` is
  11:00 to 13:00 — the two halves of one range get different meridiems. That
  rule was already in `scripts/generate_seed.py` from the original PDF parse.
  Porting it rather than re-deriving it is the whole reason the six real time
  blocks come out right.
- *Resolving into `HistoryRow` and reusing `planFromHistory` was worth more than
  it looked.* Grid matching, off-grid times, co-teaching merges, room
  resolution and the unique-key rules all applied to the import for free, and
  the import needed exactly one new thing from the planner. Two importers with
  two sets of edge cases was the alternative.
- *A tie must not be a match.* `matchInstructor` returns null rather than
  picking one of two people with the same surname. A wrong match is worse than
  no match here: it lands a section on somebody's annual load and looks exactly
  like a correct import.
- *The round-trip test paid for itself immediately.* Writing all 240 real rows
  back out in published layout and parsing them found nothing on the first run
  that the hand-written tests had not — but only because the hand-written tests
  had already been fixed by it. Two bugs: a regex that made the meridiem suffix
  mandatory, so every morning class failed to parse; and a course-heading
  pattern loose enough that the `W` on a continuation meeting line read as a
  subject code and `115-315` as its course number.

**Deliberately not done.** No instructor or course rows are created by an
import. A name the roster does not hold is reported and the section lands
unstaffed; `CSS 999` is reported and left out. Creating reference rows from a
paste nobody reviewed is the kind of convenience that is very hard to undo.

**Watch out for.** `describePlan` does not singularise, so a one-section import
reads "1 sections · 0 assignments" in the summary while the button beside it
correctly says "Import 1 section". It is shared with the Scenarios seed dialog,
where it has always read that way. A small fix with a test, worth doing next
time something else touches that file.

**Deployed and verified.** Commit `20332dc`, built by Netlify from `main`. Both
the served entry chunk (`index-DsIn9mWU.js`) and the served board chunk
(`Board-D1iDzB5Y.js`, which is where the import sheet and the parser live)
compare byte for byte against a local build made with the same environment
values — `cmp`, not a matching hash. The board chunk is checked as well as the
entry this time because the entry would match whether or not the new code
shipped: it is lazily imported, and the whole feature is in the other file.

**Next run should pick up — in this order.**

1. **An offline banner.** Unchanged from last run and now the most valuable
   thing left: the app renders offline and says nothing about it, so a
   coordinator tapping Assign with no signal gets a Supabase error rather than
   an explanation. The service worker already knows; the app does not ask.
2. **`npm audit` reports 7 vulnerabilities** (1 critical, 1 high), all in dev
   tooling as far as two runs have looked. Now that the lockfile is committed,
   upgrading is a deliberate act with a diff — worth a run of its own.
3. **`describePlan` pluralisation**, per above.
4. `.env.asc` arrived in `dd09666` with nothing saying which key opens it or
   what to do with it — worth a line in the README, from whoever added it.

---

## 2026-09-26 (twelfth run) — the same app twice

**Built.** Nothing visible: this run is about the build being reproducible.

- **`package-lock.json` is committed.** It was in `.gitignore`, which meant
  Netlify re-resolved every `^` range at build time and the app that reached
  the coordinator was not the app anybody had run a check against.
  `@supabase/supabase-js: ^2.45.0` resolves to 2.117.2 today; a future minor
  arriving straight in production, unattended, is exactly the failure this
  project cannot see until somebody cannot sign in — and it would take the
  `supabase-trim` stubs with it, since those track a specific client's calls.
  Netlify runs `npm ci` when it finds a lockfile, so this is now pinned.
- **`zod` is gone.** A dependency imported nowhere, and in no chunk; it had
  been on the "decide about this" list for four runs.

**Verified.** `node_modules` deleted and reinstalled with `npm ci` from the
committed lockfile, then everything: 369 tests, typecheck, build, and all four
browser checks (28 mobile scenes, routing, drag, PWA). The build produced
`supabase-obE7GL4B.js` — the same hash as the build that is deployed and was
verified byte-for-byte, which is the point of a lockfile stated as an
observation rather than a hope.

**Learned.** *The decision had been deferred four times, and each deferral was
a deploy that could have shipped something untested.* The reason it kept being
deferred is that it is policy rather than code; the reason to stop deferring is
that the cost of the default was invisible and the cost of the fix is a file.
It is reversible in one commit if the maintainer disagrees.

**Deployed and verified.** Commit `d90bc08`, deploy `6ab81bd365da910008968a67`,
published in 20s — so Netlify's `npm ci` path works, which was the one real
risk in this change. Netlify reported "all files already uploaded by a previous
deploy with the same commits": the bundle is byte-identical to the deploy
before it, which is what committing a lockfile *should* produce and is the
cleanest possible evidence that it changed nothing but reproducibility.

**Next run should pick up — in this order.**

1. **Importing a quarter from a pasted UW time schedule** — the one part of
   iteration 5 still unbuilt, and the only thing left in the original plan.
2. **An offline banner.** The app renders offline and says nothing about it, so
   a coordinator tapping Assign with no signal gets a Supabase error rather
   than an explanation. The service worker already knows; the app does not ask.
3. **`npm audit` reports 7 vulnerabilities** (1 critical, 1 high) in the
   dependency tree, all in dev tooling as far as this run looked. Now that the
   lockfile is committed, upgrading is a deliberate act with a diff — worth a
   run of its own.
4. `.env.asc` arrived in `dd09666` with nothing saying which key opens it or
   what to do with it — worth a line in the README, from whoever added it.

---

## 2026-09-26 (eleventh run) — three clients nobody here uses

**Built.** `@supabase/supabase-js` is five clients in one package, and this app
uses two of them. Realtime, storage and edge functions are now aliased out of
the build.

- **`src/lib/supabase-trim/`** holds a stand-in for each, with a README
  explaining what to delete to get the real one back.
  **`vite-plugins/supabaseTrim.ts`** maps the three package names onto them,
  and is shared by the app's build and the harness's so the mobile check
  measures what ships.
- **Measured, both ways.** The `supabase` chunk goes from 227 kB to 136 kB, and
  a signed-out visitor's first load from 491 kB to 401 kB — 141 kB to 117 kB
  over the wire. That is 17% of what somebody on a phone waits for, to delete
  a WebSocket client, a Phoenix channel implementation, a presence layer, an
  uploader and a function caller that no line of this app calls.

**Learned.**

- *No bundler could have done this.* `SupabaseClient`'s constructor builds a
  `RealtimeClient` and a `StorageClient` unconditionally, so the code is
  reachable and ships. Aliasing is the smallest honest lever; the alternative,
  assembling a client by hand out of `postgrest-js` and `auth-js`, means owning
  the wiring between auth state and PostgREST headers, which is the part of
  `supabase-js` actually worth having.
- *A stub has two opposite obligations.* Silent where the client uses it
  unasked — the constructor, and `realtime.setAuth()` on every sign-in, sign-out
  and token refresh, which would otherwise break signing in for a reason with
  nothing to do with realtime. Loud everywhere else, naming the file to edit,
  because a stub that quietly did nothing would turn "this build has no
  realtime" into a subscription that never fires: a bug that reads as a
  database problem and cannot be found from the console.
- *What the stubs must cover is a fact about a dependency, so it is read out of
  the dependency.* A test scans the installed `supabase-js` for every
  `this.realtime.*` and `this.storage.*` call and asserts the stubs implement
  each one. An upgrade that adds a call fails there, at `npm test`, rather than
  on somebody's sign-in. Proved by deleting `getChannels` from the stub and
  watching it fail.

**Verified.** 369 unit tests (7 new), typecheck and build green. The routing
check drives the real trimmed bundle — sign-in, profile, all thirteen pages,
both roles, both themes — and the mobile (28 scenes), drag and PWA checks are
clean against it. The harness builds with the same aliases, so its client is
constructed from the stubs too.

**Deliberately not done.** Trimming `auth-js`, which is most of the remaining
136 kB and is load-bearing. Splitting `query` further: React Query is 41 kB and
every page uses it.

**Deployed and verified.** Commit `1790002`. All 28 assets and `sw.js` are
byte-for-byte identical to a local build made with the `sb_publishable_…` key
recovered from the served entry chunk, `npm run check:deployed` passes, and the
served `supabase` chunk is 136,276 bytes with no `phoenix`, `RealtimeChannel`
or `websocket` anywhere in it. The hash of the *entry* chunk never matches a
local build — Vite inlines `import.meta.env.VITE_*`, so a build without
`.env.local` bakes in different bytes. Compare content, not the hash in the
HTML: that has cost a detour more than once.

**Next run should pick up — in this order.**

1. **Decide about `package-lock.json`**, and about `zod`, still a dependency
   and still imported nowhere. Deleting `zod` is another ~12 kB if anything
   pulls it in, and nothing should.
2. **Importing a quarter from a pasted UW time schedule** — the one part of
   iteration 5 still unbuilt, and the only thing left in the original plan.
3. **An offline banner.** The app renders offline and says nothing about it, so
   a coordinator tapping Assign with no signal gets a Supabase error rather
   than an explanation. The service worker already knows; the app does not ask.
4. `.env.asc` arrived in `dd09666` with nothing saying which key opens it or
   what to do with it — worth a line in the README, from whoever added it.

## 2026-09-26 (tenth run) — installable, and able to replace itself

**Built.** The last item on the polish list: the scheduler installs on a phone,
opens with no signal, and can still ship a fix to the person who installed it.

- **`src/lib/swStrategy.ts`** holds what the worker decides — pure, 16 tests.
  **`src/sw.ts`** is the wiring only. **`src/lib/swClient.ts`** is the page's
  half: register, notice a waiting version, offer it, apply it (14 tests,
  driven entirely from fakes). **`vite-plugins/pwa.ts`** works the shell out of
  the bundle, names the cache after the hash of that list, and bundles the
  worker with esbuild to an unhashed `/sw.js`.
- **The offer is a toast**, because the app already has one voice for feedback.
  `pushToast` takes an optional action — one, not two: a message with two
  buttons is a dialog in the wrong place — and a message carrying an action
  never times out, which is its own test.
- **Icons** are drawn by `npm run icons` (a UW-purple calendar with one gold
  day assigned) and committed. A build must not depend on a browser being
  installed, and regenerating them per build would change a deploy's bytes for
  nothing. `maskable` is a separate file from `any`, because Android crops one
  and not the other.
- **`netlify.toml`** now pins `/assets/*` immutable and `/sw.js` to
  `max-age=0, must-revalidate`.

**Learned — four things, three of them the hard way.**

- *Playwright's offline mode does not reach a service worker's own fetches.*
  The offline assertions passed with the shell deliberately deleted from the
  precache list, because the "offline" worker was fetching the page from the
  test's own server the whole time. `context.setOffline(true)` is emulation for
  the page context; the worker has its own. The check now drops connections at
  the server, which is offline for everybody. **Any future check that pulls the
  plug has to do it this way.**
- *A browser will answer a disconnected reload from its own HTTP cache.* Found
  on the way to the above: the first fix looked like it worked because Chromium
  served `index.html` from its cache. The check's server sends `no-store` for
  HTML so that only the worker can be the one answering.
- *`register()` can resolve with nothing.* The specification says registration
  or rejection; an environment that blocks workers resolves with `undefined`,
  and the app then threw `Cannot read properties of undefined (reading
  'waiting')` during startup. Found by the routing check the first time it ran
  against a build that registers a worker. Guarded, and tested.
- *A theme flip was being measured mid-transition.* The mobile check's print
  pass compared "printed from light" against "printed from dark" without
  letting the flip back to light settle, so `chips` failed intermittently with
  two navy readings eight units apart. Adding a longer sleep would have made it
  rarer here and no less possible on a slower machine; the check now disables
  transitions and animations outright in every scene, and three consecutive
  full runs are clean.

**Checked rather than believed.** `npm run check:pwa` asserts six things, and
each assertion was made to fail on purpose before being trusted: `clients.claim`
removed (the worker never took the page), the shell dropped from the precache
list (nothing to show offline), the maskable icon removed from the manifest,
and a "deploy" that changed no bytes (nothing to offer). The icon sizes are
read out of the PNGs' own IHDR chunks rather than believed from the manifest.

**Verified.** 362 unit tests (33 new), typecheck and build green; 28 mobile
scenes clean at 375px in both themes and on paper — including a new
`toast-offer` scene for the one action button in the app, whose contrast was
re-checked by breaking it on purpose; drag, routing and PWA checks all clean.
No migration this run and no database change of any kind.

**Deliberately not done.** Trimming Supabase's realtime and storage clients.
Background sync or any write-while-offline: the app is read-only offline, and
queueing assignment changes made with no connection would need conflict
resolution that the coordinator, not the app, should be doing. Push
notifications.

**Deployed and verified.** Commits `14c426a` and `462a6ad`. All 28 assets and
`sw.js` are **byte-for-byte identical** to a local build made with the
`sb_publishable_…` key recovered from the served entry chunk, and
`npm run check:deployed` passes against the live site.

*The trap this run added a check for.* The first deploy shipped a correct
manifest that Netlify served as `application/octet-stream`, which is not a type
a browser reads a manifest from — so the app was not installable, and every
local check passed. Nothing in the repository could see it, because everything
else here checks bytes a build produced rather than what a server says about
them. `npm run check:deployed` now asks the server directly: the worker's
content type and cacheability, every file its precache list promises,
the manifest's type, every icon's real pixel size, and the SPA fallback. It
found the problem on its first run; `netlify.toml` pins the type, and the
re-deploy passes.

**Next run should pick up — in this order.**

1. **Trim Supabase's realtime and storage clients**, 227 kB of the 408 kB a
   signed-out visitor downloads — and now also the largest single thing the
   worker precaches on every deploy, so it costs twice.
2. **Decide about `package-lock.json`**, and about `zod`, still a dependency
   and still imported nowhere. `esbuild` is a real dependency now — it was
   already there transitively, and the plugin uses it directly.
3. **Importing a quarter from a pasted UW time schedule** — the one part of
   iteration 5 still unbuilt, and the only thing left in the original plan.
4. An offline banner would be worth considering once (2) is done: the app
   renders offline but says nothing about it, and a coordinator tapping Assign
   with no signal currently gets a Supabase error rather than an explanation.

## 2026-09-26 (ninth run) — the app after dark

**Built.** Dark mode, as a three-state setting: follow the device, light, dark.
One attribute on `<html>` drives it, written before the first paint by an
inline script in `index.html` and thereafter by React.

- **The palette moves, not the markup.** Tailwind 4 compiles every colour
  utility to `var(--color-…)`, so re-pointing those variables under
  `:root[data-theme="dark"]` moves the whole app at once. The alternative — a
  `dark:` variant on each of two thousand class names — is a migration that is
  never finished and that every new page has to remember. Six hundred existing
  class names were themed without being touched.
- **`src/lib/theme.ts`** holds the rules as pure functions (resolve, cycle,
  label, read, write) with storage wrapped in `try`/`catch` throughout; 11 new
  tests. **`useTheme`** owns the state in `App`, above every early return,
  because the sign-in page has no header to put a button in and still has to
  follow a phone that turns dark at sunset. **`ThemeToggle`** is one button in
  the header: sun or moon for what you are looking at, a dot underneath when
  that is the device's doing rather than a choice.

**Learned — the four decisions that were not just values.**

- *The neutral ramp inverts; the accent ramps must not.* Inverting slate keeps
  every light-on-dark pairing in the app a pairing, untouched. But red, amber,
  emerald and sky are not ramps in practice — they are three jobs sharing a
  scale: 50–300 tinted backgrounds, 400–600 dots and filled buttons that keep
  white text, 700–900 the text that sits on the tints. Inverting those would
  have turned the Delete button pale pink under a finger, because `red-700` is
  both its hover state and the colour of every error message.
- *Some colours are roles.* `surface`, `canvas`, `ink`/`onink`, `danger`.
  `bg-white` could not become the dark surface, because white also has to stay
  white on the purple header and on a red button. The brand purple splits the
  same way: `--uw-purple` fills, `--uw-purple-ink` is the same brand as text
  and goes light.
- *Paper has no dark mode.* The dark block sits inside `@media screen`. The
  print stylesheet needs `print-color-adjust: exact` or badges come out as
  empty outlines — which means a dark theme would have been faithfully printed
  as a page of near-black ink, in a meeting, on the one output this app exists
  to produce.
- *A theme flip animates.* Half these surfaces carry `transition-colors`, so
  measuring immediately after the flip reads a blend of two themes: the first
  dark pass reported a navy card as daylight-white and sent me looking for a
  CSS specificity bug that did not exist. The check waits 300ms.

**Checked rather than believed.** Four new assertions, each made to fail on
purpose before being trusted:

- every mobile-check scene is measured **twice, once per theme** — it found
  three real failures on its first run;
- **the printed page is asserted identical from either theme**, comparing every
  element's background, text and border colour under `media: print`. Not "the
  printout is light": the brand purple on a button is legitimately dark, in
  both. This caught the one `dark:` variant in the app, on the gold badge,
  printing differently depending on the theme it was printed from — it uses a
  pinned `--color-slate-950` now, and the app has no `dark:` variants at all;
- **the routing check blocks the app's JavaScript** before reading the
  attribute. Module scripts are deferred, so `DOMContentLoaded` has already
  waited for React: the first version of this check passed with the inline
  script deleted, which is exactly the regression it exists to catch;
- **a sweep of all thirteen real pages in the dark** for the three light
  surfaces the stock palette paints, which is what a stray `bg-white` written
  after today would look like.

**Verified.** 329 unit tests (11 new), typecheck and build green, 27 harness
scenes clean at 375px in **both** themes, the drag check clean, and the routing
check clean including the two new sections.

**Deployed and verified.** Commit `9b67d1f`; Netlify deploy published in
seconds and **all 28 assets are byte-for-byte identical** to a local build made
with the `sb_publishable_…` key recovered from the served entry chunk. The
served `index.html` carries the inline theme script and the served CSS carries
the `[data-theme=dark]` block, so the new code is the code being served.

*Two traps met on the way.* The first fetch after the push returned the
previous deploy's HTML and the second, seconds later, returned the new one —
the CDN, not a failure; check `state` and `published_at` before believing a
stale hash. And driving the **live** site with Playwright from this sandbox
fails with `ERR_CERT_AUTHORITY_INVALID`, because Chromium does not trust the
egress proxy's CA. That is not worth working around: `check:routes` drives the
identical bytes locally, and they are identical by `cmp`.

**Deliberately not done.** The installable PWA. Trimming Supabase's realtime
and storage clients. A `prefers-contrast` or forced-colors pass.

**Next run should pick up — in this order.**

1. **The installable PWA.** The last item on the polish list, and the chunk
   split already did the hard part: a service worker can precache the shell and
   fetch pages on demand. Worth a `check:` script of its own — an offline
   second load that still renders.
2. **Trim Supabase's realtime and storage clients**, which look unused and are
   227 kB of the 408 kB a signed-out visitor downloads. The largest remaining
   byte win, and the first that needs care rather than configuration.
3. **Decide about `package-lock.json`**, and about `zod`, still a dependency
   and still imported nowhere.
4. **Importing a quarter from a pasted UW time schedule** — the one part of
   iteration 5 still unbuilt, and the only thing left in the original plan.

## 2026-09-26 (eighth run) — the comparison leaves the screen

**Built.** The last missing piece of iteration 4: the Compare page can now be
downloaded and printed, the way the report has been able to since it was
written.

- **`comparisonCsv`** is one row per number the page shows and one column per
  scenario — long-ways, because that is how the choice is actually made: the
  eye runs across a row asking which of the two is better at this, rather than
  down a column. Percentages are written as the page reads them and left blank
  when nothing was rated, matching `reportCsv`.
- **`ExportBar`** is the row of buttons, now shared. The report's version was
  about to be copied into Compare wholesale, including the one part that has to
  stay identical: what the app says afterwards. A download on a phone is the
  least visible thing this app does — the file lands somewhere the browser
  chose and nothing on the page moves — so `Saved <filename> to your
  downloads.` is the whole confirmation, and it should not drift into two
  wordings.
- **`PrintStamp`** is a line that exists only on paper: what the page is about
  and the date, with the month spelled out. Two undated printouts of two drafts
  of the same year, carried into the same meeting, is exactly the situation
  this app exists to prevent. On Compare it names both scenarios, because the
  dropdowns that say which two are `print:hidden`.

**Learned.**

- *Nothing in this repository could see the printed page, and three checks now
  can.* A `print:hidden` control and a print-only stamp both look exactly
  correct on screen whether or not their variant works — the failure only
  appears on paper, in a meeting, after it is too late. The mobile check now
  runs a second pass per scene under `emulateMedia({ media: 'print' })` and
  asserts that everything marked `print:hidden` really goes, that every
  `data-print-only` element really arrives, and that no print-only element is
  visible on screen. All three were seen to fail on purpose before being
  believed: the stamp switched to `block` (caught on screen), its `print:block`
  removed (caught missing from paper), and a `!block` put on a `print:hidden`
  div to imitate a competing rule winning (caught printing).
- *`.trim()` eats a BOM.* The CSV helper writes a leading `\ufeff` so Excel
  opens UTF-8 course titles correctly, and the first version of the header test
  asserted it on a trimmed string — which is not where it is. JavaScript counts
  U+FEFF as whitespace. The BOM is now asserted on the untrimmed text, which is
  the only place it can be.
- *Two lazy pages sharing a 1.3 kB component costs a chunk.* Rollup split
  `PrintStamp`/`ExportBar`/`download` into their own file the moment Report and
  Compare both imported it. One extra request, shared between the two pages and
  cached across both — cheaper than duplicating the code into each, and not
  worth a `manualChunks` entry.

**Verified.** 318 unit tests (6 new), typecheck and build green with no
chunk-size warning, 26 harness scenes clean at 375px including two new ones
(the two comparison cards stacked, and the export row with its stamp), and the
routing check clean — it now shows `PrintStamp` arriving on both `/report` and
`/compare`, which is the shared chunk doing what it should. No database change
this run, so no migration and no RLS run.

**Deliberately not done.** Dark mode. The PWA. A schedule CSV on Compare —
each scenario's own report page has one, and three buttons on a page whose job
is to choose between two drafts is a page that has stopped being about the
choice.

**Deployed and verified.** Commit `2baf7f5` pushed to `main`; Netlify built it
as deploy `6ab7d633510c050008758b57` in 18 seconds and published at 14:27 UTC.
**All 28 assets are byte-for-byte identical** to a local build made with the
`sb_publishable_…` key recovered from the served entry chunk, by the procedure
the sixth run wrote down. The served `Compare-*.js` contains "Download this
comparison (CSV)" and the served `PrintStamp-*.js` contains `data-print-only`,
so the new code is the code being served and not a matching hash on old bytes.

*One trap worth knowing:* the first fetch after the push returned the previous
deploy's HTML, which looked like a failed deploy — the CSS hash had not moved,
and this run's changes do add Tailwind classes, so it should have. It was
simply too early. Check the deploy's `state` and `published_at` through the
Netlify MCP tools before reading a stale asset hash as a broken build.

**Git note.** The sandbox started on a detached HEAD with the local `main` ref
ten commits behind `origin/main`, so `git push -u origin main` pushed that
stale ref and was rejected as non-fast-forward — nothing to do with the remote
having moved. `git branch -f main HEAD && git checkout main` fixed it. Worth
checking `git branch -vv` first if a push is rejected while `git rev-list
--count HEAD..origin/main` says 0.

**Next run should pick up — in this order.**

1. **Dark mode.** The contrast check already runs every scene; teaching it to
   run each one twice, once with `prefers-color-scheme: dark` emulated, is most
   of the work of doing it safely, and the print pass added this run is the
   pattern to copy — a second `emulateMedia` over the same page.
2. **The installable PWA**, which the chunk split made more worthwhile: a
   service worker can precache the shell and fetch pages on demand.
3. **Trim Supabase's realtime and storage clients**, which look unused and are
   227 kB of the 408 kB a signed-out visitor loads. The largest remaining byte
   win, and the first that needs care rather than configuration.
4. Decide about `package-lock.json`, and about `zod`, which is still a
   dependency and still imported nowhere.
5. Importing a quarter from a pasted UW time schedule — the one part of
   iteration 5 still unbuilt, and the only thing left in the original plan.

## 2026-09-26 (seventh run) — drag and drop, and a check that uses a finger

**Built.** The top item on the list for five runs: a name can be dragged from
the load panel onto a section card, and a name on a card can be dragged to
another card, which moves it rather than copying it. Tapping is untouched and
still the primary path.

- **`src/lib/dnd.ts` is what a drop means**, pure over a snapshot as the
  conflict engine is: whether a drop is an assignment, a move or nothing;
  what colour every visible card wears for the person in the air; what the
  confirmation says afterwards. 32 tests, no browser.
- **A move is judged against where the instructor is going.** `withoutAssignment`
  takes the old assignment off a copy of the snapshot before ranking, because
  otherwise dragging someone from one Monday 8:45 section to another reports a
  clash with the section they are in the act of leaving and every move looks
  forbidden. The same copy is what makes a move past a quarter maximum legal
  when an addition would not be — they end on the same number of sections.
- **Red is a warning, not a veto**, exactly as the assign sheet ranks an
  unwilling instructor last rather than hiding them. A disliked card still
  takes the drop and the toast carries the reason: "Assigned Bo Li to CSS 342 A
  — clashes with another section."
- **`useMoveAssignment`** does the delete and the insert, puts the delete back
  if the insert is refused, and updates the cached board optimistically so the
  conflict panel reacts on the same gesture.
- **⌘Z understands a move.** It is two entries in the change log — an
  assignment is a row and there is no such thing as moving one — so
  `myLastUndoableIds` recognises the pair (same instructor, different sections,
  seconds apart, both mine) and reverses both. Without it, ⌘Z after a drag left
  the person teaching neither section, which reads as a broken undo.
- **`npm run check:drag`** drives a real mouse and a real finger at a real
  board: the sandbox scene wires the board's own sensors, collision detection
  and drop rules, with the mutations replaced by a list of what would have
  happened. Touch goes through CDP `Input.dispatchTouchEvent` rather than
  synthetic DOM events, because a synthetic touchmove cannot scroll a page and
  scrolling is one of the things being asserted.

**Learned.**

- *The tap having right of way is the whole design, and it is two numbers.* A
  mouse must travel 6px before a press is a drag; a finger must rest 250ms
  within 8px before a hold is. Both were checked by breaking them on purpose:
  with the touch delay swapped for a 4px distance, "a flick down the list
  scrolls the page and starts no drag" fails, and with the mouse distance at 0
  a shaky click on the × picks the chip up instead of unassigning. The checks
  have teeth because they were seen to fail.
- *The scenes found a contrast bug that had been shipping for four runs.* The ×
  that unassigns somebody was `text-slate-500` on the chip's `slate-100` —
  4.35:1, where AA wants 4.5. Nothing was wrong with the mobile check; the
  section card simply had no scene until this run put one there. Every
  component the board renders now has one.
- *Dragging adds no keyboard path, and that is the honest choice.* dnd-kit
  offers one, but taking it means a tab stop on every name in the load panel
  and a `role="button"` wrapped around the real button inside each chip — to
  reach a destination the card's own Assign button already reaches in two
  keystrokes. The chips take the library's pointer listeners and not its ARIA
  attributes. Screen readers hear `dragAnnouncement` instead of dnd-kit's
  default, which reads the drag id aloud, and this board's ids are
  `assignment:<uuid>:<uuid>`.
- *`npm run check:routes` had been broken since the moment the sandbox stopped
  having a `.env.local`, and said so only as a 30-second timeout.* Vite inlines
  `import.meta.env.VITE_*` at build time, so a build without them throws on
  boot and every assertion waits for an element that will never exist. It now
  builds its own bundle into `dist-routecheck/` with placeholder values — every
  request to the project is intercepted anyway — and says plainly what is wrong
  if it ever happens again. **This failure predates this run's changes**: it
  reproduces on `7c0ff5b` untouched.
- *There is no `package-lock.json` in this repository — it is gitignored.* So
  `npm ci` cannot run, and a fresh sandbox resolves whatever minor versions are
  current that day (`@supabase/supabase-js` came back as 2.117.2 against a
  `^2.45.0` range). Nothing broke this time. It is worth deciding on purpose
  rather than by omission.

**Verified.** 312 unit tests (38 new across `dnd.test.ts` and the move-aware
undo), typecheck and build green with no chunk-size warning, 24 harness scenes
clean at 375px (four new: the cards, the cards mid-drag, the load panel and the
drag pill), the routing check clean once it could build, and the new drag check
green on both a mouse and a finger. No database change this run, so no
migration and no RLS run.

**Cost.** The board's chunk went from 40.3 kB to 90.5 kB (11.4 kB to 27.5 kB
gzipped): dnd-kit, paid only by a coordinator who opens the board, and only
once per deploy that touches it. If it ever matters, the wiring could be a
dynamic import that the board renders without until it arrives — worth about
16 kB gzipped and some complexity, which is not a trade worth making yet.

**Deliberately not done.** Export and print on Compare. Dark mode. The PWA.
Dragging a chip off a card to unassign — the × is right there, 44px, and a
gesture whose whole meaning is "drop this in the bin" wants a bin to drop it
in, which is a design decision rather than a wiring one.

**Deployed and verified.** Commit `5c5b503` pushed to `main`; Netlify built it
automatically and published within about three minutes. **All 27 assets are
byte-for-byte identical** to a local build made with the `sb_publishable_…`
key recovered from the served entry chunk, by the procedure the sixth run
wrote down — which worked exactly as written. The served `Board-*.js` contains
"Drag a name onto a section to assign it", so the new code is the code being
served and not a matching hash on old bytes.

**Next run should pick up — in this order.** *(Superseded by the eighth run's
list at the top of this file; item 1 is done.)*

1. ~~**Export and print on the Compare page.**~~ Done in the eighth run.
2. **Dark mode.** Teach the contrast check to run each scene twice, which is
   most of the work of doing it safely.
3. **The installable PWA**, which the chunk split made more worthwhile: a
   service worker can precache the shell and fetch pages on demand.
4. **Trim Supabase's realtime and storage clients**, which look unused and are
   227 kB of the 408 kB a signed-out visitor loads. The largest remaining byte
   win, and the first that needs care rather than configuration.
5. Decide about `package-lock.json`, and about `zod`, which is still a
   dependency and still imported nowhere.

## 2026-09-26 (sixth run) — every page its own chunk

**Built.** The oldest item on the list, five runs unattended: the bundle was
one 585 kB file and is now an entry chunk of **17 kB**, three vendor chunks and
a chunk per page.

- **Nobody downloads the whole app any more.** An instructor who only opens My
  preferences was downloading the assignment board, the report, the scenario
  comparison and the access log to get there. A signed-out visitor now loads
  four chunks and sees the sign-in button; `Login` is the one page deliberately
  *not* split, because making the first paint wait on a second request to show
  one button is a poor trade.
- **Three vendor chunks, grouped by how often they change** — `react` 165 kB,
  `supabase` 227 kB, `query` 41 kB. A deploy that changes a label no longer
  invalidates the 380 kB that did not move. Grouped rather than split per
  package: React, the router and the scheduler refer to one another, and
  cutting between them produces circular chunks that cost a request each and
  buy nothing. The chunk-size warning is down from 500 kB to 250 kB now that
  nothing should be near it.
- **`src/lib/routes.ts` is the whole nav and the whole router.** There were two
  hand-maintained lists describing the same thirteen pages with nothing holding
  them together. It is also what makes the split safe to do well: a page
  arrives over the network now, so something must decide when to fetch it, and
  the loader belongs beside the label a finger is about to touch. The table is
  data and imports no page, so a Node test reads it without constructing a
  Supabase client — including one that lists `src/pages` on disk and fails if a
  page is not routed.
- **Nobody waits when there is nothing to wait for.** The dashboard's chunk
  starts as soon as a session exists, in parallel with the profile request it
  would otherwise queue behind. Every other page is fetched when a pointer
  settles on its nav link, a focus ring lands on it, or a finger touches down
  — `touchstart` to `click` is the ~100 ms it takes to lift a finger, which is
  most of a fetch off a warm CDN. `RouteFallback` fades in over the first
  second rather than appearing at once, because a skeleton that flashes for one
  frame on a cached chunk reads as a fault.
- **A floor under a failure that used to be impossible.** `RouteErrorBoundary`
  plus the pure rules in `src/lib/chunkError.ts`: reload once for a chunk that
  will not load, never for a render bug, and at most once per document so a
  phone with no signal gets a button instead of a loop.
- **`npm run check:routes`** — the built bundle in a real browser with Supabase
  stubbed and a fabricated session, no credentials, nothing reaching the live
  project. It asserts a signed-out visitor does not download the board, every
  destination renders, a deep link stays where it was typed, one tap fetches
  one page, hovering prefetches, an instructor reaches no coordinator page by
  nav or URL, and the console stays clean.

**Learned.**

- *The new check found a bug that was not the one it was written for, and had
  been shipped for four runs.* `AuthProvider` kept `loading` as its own flag,
  and between the render that received the session and the effect that set the
  flag back to true there was one commit with a session, no profile and
  `loading` false — long enough for the router to conclude the reader was not a
  coordinator and redirect. **A coordinator opening a bookmarked
  `/board/:scenarioId` landed on the dashboard**, and those links are ones the
  app generates itself. It was invisible until now because with one bundle
  there was no observable difference between rendering the board and
  redirecting away from it; with chunks, the Board chunk is simply never
  requested. `loading` is now derived from which user the profile in hand
  belongs to, so the window does not exist rather than being narrow. Reverting
  the fix makes the check fail on all seven coordinator pages — the teeth were
  confirmed, not assumed.
- *A rejected prefetch must be forgotten, not cached.* The first version
  memoised the promise unconditionally. One flaky fetch in a tunnel would then
  poison that route for the rest of the session, and `React.lazy` would inherit
  the rejection — a page permanently unreachable without a reload, caused by a
  guess nobody asked for.
- *The error boundary had to be split in two to be testable.* Catching means
  logging a stack, and the mobile check reads any console error as a failure.
  `RouteErrorNotice` is now the markup and `RouteErrorBoundary` only catches,
  so the check renders the notice directly and measures what actually ships.
- *`DESIGN.md` claimed something this run measured to be false.* It said a
  Netlify deploy "stops serving the old name". After the split shipped, the
  previous single bundle still answered **200**. Netlify keeps previous
  deploys' assets addressable, so a stale chunk usually still resolves here and
  the dead connection is the likelier of the two causes. The recovery is still
  worth having — deletions, rollbacks and purges do break it, and the failure
  is total when it happens — but the doc now says what was measured.

**Verified.** 274 unit tests (38 new across `routes.test.ts` and
`chunkError.test.ts`), typecheck and build green with no chunk-size warning, 19
harness scenes clean at 375px (two new: the loading skeleton and both variants
of the error notice), routing check clean. No database change this run, so no
migration and no RLS run.

**Deployed and verified.** Commit `d83a66c` pushed to `main`; Netlify built it
automatically. **All 27 assets are byte-for-byte identical** to a local build
made with the key recovered from the served bundle — that key is the
`sb_publishable_…` one, not the legacy anon JWT, which is why a local build
with the JWT produces a different entry hash and the comparison has to recover
the key first. The served HTML references the new `react`, `query` and
`supabase` chunks, and the SPA fallback still returns `index.html` for
`/board/abc123`. The whole routing check was then re-run against those exact
bytes and passed.

One limit of this sandbox worth recording: **Chromium cannot reach the live
site**, because the agent proxy's CA is not in its trust store
(`ERR_CERT_AUTHORITY_INVALID`), and disabling TLS verification is not an option.
`curl` works, so byte comparison is available; driving the *live* URL in a
browser is not. Since `dist/` was proved identical to what is served, serving
those bytes locally and driving them is equivalent — but that equivalence has
to be established by the byte comparison first, every time.

**Deliberately not done.** Drag and drop. Export and print on Compare. Dark
mode. The PWA. `@dnd-kit` and `zod` are both still dependencies and **neither
is imported anywhere** — they cost nothing in the bundle, but `zod` at least
looks like it should be removed rather than left as a promise.

**Next run should pick up — in this order.**

1. **Drag and drop on the board**, as an addition to tapping and never a
   replacement. `@dnd-kit` is already a dependency and has never been used.
   `npm run check:routes` and `npm run check:mobile` both have to stay clean.
2. **Export and print on the Compare page**, matching the report's.
3. **Dark mode.** The contrast check should be taught to run each scene twice,
   which is most of the work of doing it safely.
4. The installable PWA. Worth noting the split makes this more valuable: a
   service worker can now precache the shell and fetch pages on demand, rather
   than having one 585 kB file to cache or not.
5. **Supabase is 227 kB of the 408 kB a signed-out visitor loads**, and the
   realtime and storage clients inside it look unused. Confirming that and
   trimming them is the largest remaining byte win, and the first one that
   needs care rather than configuration.

## 2026-09-26 (fifth run) — the five list pages on a phone

**Built.**

- **`DataTable` is a table on a laptop and a list of cards on a phone.** One
  component, five pages — Courses, Instructors, History, Responses and Access —
  and the honest version of a claim `docs/DESIGN.md` had been making for three
  runs. A card is not a row with its borders removed, so each column declares
  where it goes: `title`, `subtitle`, `badge`, `meta` (a labelled pair, the
  default), `action` or `hidden`. `renderCard` lets a column say something
  different on a card, which the access log needs: its heading is a name *or*
  an address and the column beside it is the address, so someone with no name
  on file got theirs twice.
- **Two decisions taken from the content, not declared.** A value long enough
  to wrap twice takes the whole card width instead of half — the prerequisite
  paragraph next to "Credits 5" was a column of syllables. And a cell holding
  only a placeholder is dropped: a table needs `—` to keep its columns lined
  up, a card has no columns to line up, and "Room —, Enrolled —, Released —"
  is five labels answering nothing. `src/lib/cards.ts` holds all of it as pure
  functions; `useMediaQuery` picks the shape.
- **`Toolbar`**, shared by those five page headers. Each had grown its own, and
  each was a single non-wrapping flex row with a `w-64` search box pushed right
  by `ml-auto` — at 375px, a page that scrolls sideways — holding selects and
  inputs about 34px tall against a 44px floor. Instructors' "Include inactive"
  checkbox, a 13px target, became a pill like the filters elsewhere.
- **Eight new harness scenes**: the six real tables, the empty state, and the
  toolbar. They import the columns *from the pages*, so a column added without
  a thought for the phone fails the check rather than slipping past it.

**Verified.** 236 unit tests (22 new in `cards.test.ts`), typecheck and build
green. All 16 harness scenes clean at 375px. No database change this run, so no
migration and no RLS run.

The new assertions were checked for teeth by forcing the table back on at
375px: six of the seven table scenes failed at once, the access log's at
**1060px wide in a 375px viewport** — nearly three screens of sideways scroll,
which is what a coordinator had been living with. Then the other direction,
which the 375px check cannot see: at 1280px the table still renders (`1 table,
0 cards`), and narrowing the window flips it live to cards. Shipping cards to a
laptop would have been a regression invisible to every check here.

**Learned.**

- *Coverage found a bug in the first thing it looked at.* The toolbar scene
  failed on its first run: the "1,284 sections" count, `text-slate-500` on the
  page's own background, measures **4.49:1 against a 4.5 floor**. That text has
  been in all five page headers for weeks. It passes on white, which is where
  it was eyeballed, and fails on the background it actually sits on.
- *`isBlankCell` had to look through elements to be worth anything.* The first
  version compared strings, and the Instructors card still read "RELEASED —
  TARGET —", because the page renders its dashes as
  `<span className="text-slate-500">—</span>`. Following `props.children` fixes
  it. The guard that matters: an element with *no* children is not blank — an
  `<hr>`, an icon, a progress bar draws itself, and dropping those would be a
  silent hole.
- *Do not render both shapes and hide one.* `sm:hidden` is the usual trick and
  it would have put twelve thousand table cells in the document to show six
  thousand rows of teaching history. `matchMedia` costs a hook and renders one.
- *A fixture is only useful if it is awkward.* The long names, the 78-character
  course title, the instructor with no rank and no target, the person with no
  name on file, the section with no room — every layout problem found this run
  came from one of those rows and none from the tidy ones.

**Deployed and verified.** Commit `bc06307` is live as deploy
`6ab782f2`, published 08:32:03 UTC, secret scan clean. The served
`index-59lZ64Af.js` is **byte-for-byte identical** to a local build made with
the key recovered from the served bundle, and `index-BoIMMdSA.css` matches too.
Five strings only the new code contains are present in the served JavaScript
(`Filter history by course or instructor`, `Preference cycle`, `Academic year`,
`col-span-2`, `matchMedia`). The shipped bytes were then served locally and
rendered at 375px: the sign-in card lays out correctly, its button is the
full-width 44px one, no sideways scroll, console clean.

One trap worth knowing: **the Netlify project API lags.** Queried a minute
after the push it still named the *previous* deploy as current, while the site
was already serving the new bundle. Trust the bytes — fetch the asset and
compare it — and read the deploy record only to confirm which commit it came
from. Believing that first response would have meant reporting a deploy that
had not happened, or waiting for one that already had.

**Deliberately not done.** Code-splitting: the bundle is 585 kB (163 kB
gzipped) and Vite still warns — this is now the oldest item on the list, five
runs unattended. Drag and drop. Export and print on Compare. Dark mode and the
PWA.

**Next run should pick up — in this order.**

1. **Code-split the report, compare and student-check routes** off the main
   chunk. It has been the next-but-one item for five runs; make it the next
   one.
2. **Drag and drop**, as an addition to tapping and never a replacement.
   `@dnd-kit` is already a dependency.
3. **Export and print on the Compare page**, matching the report's.
4. **Dark mode.** The contrast check should be taught to run each scene twice,
   which is most of the work of doing it safely.
5. The installable PWA.

## 2026-09-26 (fourth run) — one voice for feedback, and a mobile check that runs

**Built.**

- **One place for every transient message.** `src/lib/toast.ts` holds the queue
  as plain data; `src/components/Toast.tsx` renders it. The board's status
  strip, the preferences page's "flash" and the red paragraphs beside four Save
  buttons are all the same thing now — and so are the mutations that previously
  said *nothing at all*: making a scenario official, archiving and unarchiving
  one, deleting one, opening or closing a preference cycle, recording or
  removing a teaching release, saving a section, exporting a CSV.
- **One place for every modal.** `src/components/Dialog.tsx`: Escape, backdrop
  tap, focus in on open and back to the opener on close, Tab cycling inside,
  and no scrolling of the page behind. The assign sheet, section editor and
  suggestion sheet moved onto it; the scenario, cycle and releases dialogs —
  which had no `role`, no Escape and no focus handling whatever — did too.
- **The conflict tally, spoken.** A visually-hidden `aria-live` region on the
  conflict panel, driven by `conflictSummary` in `src/lib/format.ts`.
- **A skip link**, before thirteen nav destinations, and Escape plus focus
  handling on the mobile nav drawer.
- **`npm run check:mobile`** — `harness/`, a second Vite entry that renders each
  over-the-page component with fixtures and no Supabase, plus
  `scripts/mobile_check.mjs`, which drives all eight scenes in a 375px headless
  Chromium. It asserts no sideways scroll, no control under 44px, WCAG AA on
  every piece of text, a clean console, and — where a dialog is on screen —
  that focus enters it, that neither Tab nor Shift+Tab escapes it at *any*
  step, and that Escape closes it.

**Verified.** 214 unit tests (47 new: 21 on the toast queue, 10 on the focus
trap, 16 on formatting including the spoken tally), typecheck and build green.
All 8 harness scenes clean at 375px. Each assertion was checked for teeth by
breaking the thing it guards and confirming it failed: the touch minimum, the
focus trap, the Escape handler and the contrast floor each reported the
regression, and each passed again once reverted. No database change this run,
so no migration and no RLS run.

**Learned.**

- *A committed harness finds what eyes do not.* Three runs recorded "rendered
  at 375px in headless Chromium" and each rebuilt the scaffolding in a
  temporary directory. The first run of the same check as committed code found
  **five controls between 24px and 42px** — the chip group that is the whole
  preferences page on a phone, the only way into an instructor's releases, the
  cycle status buttons, the Responses and Access filters, and the sign-in
  button — and **three pieces of text below WCAG AA**. All in pages previously
  signed off by eye.
- *A check that passes can still be measuring nothing.* The harness's first run
  reported failures everywhere; the cause was that Tailwind 4 detects its
  sources from the Vite root, which for the harness is `harness/`, so it
  generated utilities for the scene file and none for the components under
  test. Every assertion had been measuring an unstyled page. `@source "../src"`
  in `harness/harness.css` fixes it, and it is worth remembering that a
  *green* run under the same bug would have been the real disaster.
- *Assert at every step, not at the end.* The first Tab-trap check pressed Tab
  fourteen times and looked once. With the trap deliberately disabled it still
  passed — focus had left the dialog and come back round. Checking after every
  press catches it on the fifth.
- *Two assertions needed the fixture to be honest.* The sheets were handed
  `onClose={() => {}}`, so "Escape did not close the dialog" fired against
  correct code. A sheet given a no-op close looks exactly like a sheet that
  ignores Escape; the scenes now really unmount.
- *Do not reimplement `oklch`.* The first contrast pass reported five
  impossible failures because it parsed `oklch(0.432 0.095 166.913)` as if it
  were `rgb`. Painting the colour into a 1×1 canvas and reading the pixel back
  lets the browser do the conversion, and the real answer was three failures,
  all `text-slate-400` on white at 2.63:1.
- *Politeness belongs to the region, not the message,* so there are two live
  regions — and they must be real boxes. `display: contents` drops an element
  out of the accessibility tree in some browsers, which would have silenced
  both of them without any visible symptom.
- *Where the toasts land is where the buttons already are.* The preferences
  page pins Save and Submit to the bottom of the screen. `useToastInset` lifts
  the stack clear of them; a confirmation that covers the button that produced
  it is worse than none.

**One correction to the design doc.** `docs/DESIGN.md` said "tables become
cards rather than scrolling boxes". That is true of the load panel and false of
`DataTable`, which backs Courses, Instructors, History, Responses and Access
and is still a sideways-scrolling box. The doc now says so, and this is the
largest remaining gap against the mobile rules.

**Deliberately not done.** Drag and drop. Code-splitting — the bundle is 582 kB
(161 kB gzipped) and Vite still warns. `DataTable` as cards. The Compare page
gained no toasts because it has no mutation and no export to report on; giving
it the report page's CSV and print buttons is the change worth making there,
and it is a feature, not feedback.

**Next run should pick up — in this order.**

1. **`DataTable` as cards below `sm`.** One component, five pages, and the
   honest version of a claim the design doc has been making for three runs.
   Add the five pages to the harness as scenes while you are there — they are
   the ones with no coverage.
2. **Code-split the report, compare and student-check routes** off the main
   chunk. Vite has warned for four runs.
3. **Drag and drop**, as an addition to tapping and never a replacement.
   `@dnd-kit` is already a dependency.
4. **Export and print on the Compare page**, matching the report's.
5. Then dark mode and the installable PWA. Dark mode now has a natural home:
   the colours are already centralised enough that the contrast check would
   catch a bad pair, and the check should be taught to run each scene twice.

**Deployed and verified.** Commit `54f7c41` is live. The served
`index-CakV4AsO.js` is **byte-for-byte identical** to a local build made with
the key recovered from the served bundle, and `index-CJj915yG.css` matches too.
Six strings only the new code contains are present in the served JavaScript
(`Skip to the page`, `useToast must be used inside a ToastProvider`,
`No conflicts.`, `to your downloads`, `is now the official schedule for this
year`, `Nothing of yours left to undo`). The shipped bytes were then served
locally and rendered at 375px in Chromium: the sign-in card lays out correctly,
the button is the full-width 44px one, and the console is clean.

**A note on checking a deploy from here.** Chromium in this sandbox cannot
reach `*.netlify.app` directly — the egress proxy re-terminates TLS and there
is no `certutil` to load its CA into the browser's NSS store, so `page.goto`
fails with `ERR_CERT_AUTHORITY_INVALID`. `curl` is fine, because it reads the
bundle from the environment. So: fetch the assets with `curl`, serve them from
a local directory, and point the browser at that. Do **not** reach for
`ignoreHTTPSErrors`. One trap in doing this: a one-line static server that
derives the content type from the *request path* serves `/` as `text/plain`,
and the browser then renders the HTML as text. The first run of that check
reported "no console errors, no sideways scroll" about a page of source code.
Derive the type from the resolved file, and look at the screenshot.

**Watch out for.**

- `npm run check:mobile` needs Playwright. The cloud sandbox has it installed
  globally and the script finds it there; on the maintainer's machine it is
  `npm i -D playwright && npx playwright install chromium` once. It is
  deliberately not in `package.json` — `npm test` should stay a second and a
  half with no browser anywhere near it.
- `harness/` is now in `tsconfig.json`, so `npm run build` typechecks the
  scenes. A fixture that drifts from a component's props breaks the build,
  which is the point.
- Adding a scene means only adding to `SCENES` in `harness/scenes.tsx`; the
  check script reads the list off the page rather than keeping its own.

## 2026-09-26 (later still) — undo, and a suite that runs anywhere

**Built.**

- **Undo on the board.** `20260926000400_undo.sql` gives `scenario_changes` the
  structured half it was missing — `detail`, `undone_at`, `undoes_id` — and two
  functions, `undo_change(id)` and `undo_changes(ids[])`. Every one of the five
  logged actions reverses: an assignment, an unassignment, a section added,
  edited or removed. `src/lib/undo.ts` decides what the board offers;
  `HistoryPanel` grew Undo buttons, an `undone` marker and a two-tap confirm on
  a burst; ⌘Z / Ctrl+Z takes back my own most recent change.
- **A test harness that needs no credentials.** `scripts/local_db.sh` plus
  `supabase/tests/local_shim.sql` run the whole schema, seed and RLS suite
  against a throwaway local PostgreSQL. `npm run db:test:rls:local`.

**Verified.** 167 unit tests (17 new in `undo.test.ts`, 2 added to
`groupChanges.test.ts`), typecheck and build green. **70 of 70 RLS checks
against a fresh local cluster** — the first time this suite has run in the
sandbox at all — and 23 of 23 undo-specific checks against the hosted project
before the migration was trusted. No residue; the three real accounts
untouched. The history panel rendered at 375px in headless Chromium in three
states (collapsed, confirming a burst undo, expanded with per-entry buttons):
no horizontal scroll, no control under 44px, no console errors.

**Deployed and verified.** Commit `c653ad7` is live. The served
`index-0GzTiO1Q.js` is **byte-for-byte identical** to a local build made with
the key recovered from the served bundle, and the CSS matches too. The four new
strings (`undoing an earlier change`, `Nothing of yours left to undo`,
`undo_change`, `Undo puts a change back`) are all present in the served bundle.

**Learned.**

- *The suite could have run here all along.* The migrations depend on exactly
  three things Supabase provides: `auth.users`, `auth.uid()`, and four platform
  roles. That is a seventy-line shim, and with it the whole suite runs on a
  plain PostgreSQL 16 with no Docker, no project and no secrets. Two previous
  runs recorded "these scripts cannot run in the sandbox" as a fact of life and
  fired SQL at the live project instead. It was a fact about the *token*, not
  about the SQL. **Run `npm run db:test:rls:local` before applying any
  migration anywhere real.**
- *An AFTER DELETE trigger is too late to record what the delete destroyed.*
  The assignments hanging off a section are cascaded away with it, so undoing a
  deletion logged after the fact would bring the section back empty and call
  that success. `sections` now has two log triggers: `AFTER INSERT OR UPDATE`,
  and `BEFORE DELETE`.
- *Let the reversal go through the ordinary tables.* `undo_change` does not
  patch rows behind the triggers' backs, so the reversal lands in the log like
  any other change — and **redo cost nothing to build**, because the entry a
  reversal writes is itself undoable.
- *One convention made all three section actions reversible from one field.*
  `detail.section` is the row as it stood *before* the change, except for a
  creation, where there was no before and the new row identifies what to
  remove. `to_jsonb(coalesce(old, new))` expresses that in one line — but not
  in plpgsql, where evaluating `old` in an INSERT trigger is not safe. An
  explicit `v_before` variable, set per `tg_op`, is the version that works.
- *Undo is not symmetric in how much it may destroy.* Undoing a burst of two
  hundred assignments costs a tap to put back. Undoing two hundred section
  *creations* destroys everything built on them, and already has a name:
  deleting the scenario. So a group Undo is offered only when the whole burst is
  assignments, and the rest keep per-entry buttons in the expanded list. For the
  same reason, undoing the creation of a section that has since been staffed
  refuses and says to unassign first, rather than cascading that work away.
- *⌘Z should mean "my last change", not "the last change".* Reverting a
  colleague's later edit by reflex is a different act from doing it
  deliberately; their entries keep their own Undo button.

**Deliberately not done.** Drag and drop. The UW time-schedule import.
Code-splitting the bundle.

**Next run should pick up — in this order.**

1. **Toasts and optimistic feedback on the report and compare pages**, to match
   the board's. Small, and the last place the app still feels inert.
2. **Accessibility pass.** Focus management when the sheets open and close,
   focus trapping inside them, `aria-live` on the conflict count, a contrast
   audit of the tier colours. The board's `role="status"` message region is
   where undo's confirmations land, so it is already the right place for the
   conflict count to announce through too.
3. **Code-split the report, compare and student-check routes** off the main
   chunk. The bundle is 575 kB (159 kB gzipped) and Vite has warned for three
   runs now.
4. **Drag and drop**, as an addition to tapping and never a replacement.
   `@dnd-kit` is already a dependency.
5. Then dark mode and the installable PWA.

**Watch out for.**

- `scripts/local_db.sh` needs the postgres server binaries. It finds them on
  Debian/Ubuntu (`/usr/lib/postgresql/*/bin`) and Homebrew, runs the server as
  the `postgres` account when invoked as root, and puts its cluster under
  `/var/lib/postgresql/css-local` in that case because a data directory under
  `/tmp` is usually not traversable by another user. `scripts/local_db.sh stop`
  when finished.
- The security advisor now reports **six** SECURITY DEFINER functions callable
  by `authenticated`, not four. The two new ones are `undo_change` and
  `undo_changes`, which the board calls over RPC, so the grant is what makes
  undo work; both check `is_coordinator()` as their first statement, before
  reading anything. Recorded in `docs/DESIGN.md` as accepted. The advisor
  otherwise reports exactly what it did before.
- Entries logged before this migration have an empty `detail` and show no Undo
  button. That is correct, not a bug — there is nothing to reverse them with.

---

## 2026-09-26 (later) — iterations 4 and 5

**Built.**

- **Seeding a scenario from a past year.** `src/lib/seedPlan.ts`. Creating a
  scenario can copy an imported year: 199 sections and 198 assignments, mapped
  onto the new year's quarters. Reports what it cannot carry across instead of
  dropping it. Rooms were seeded too — the table was empty, so
  `room_double_booked` could never fire however the board was filled in. The
  rule was dead code; it is not now.
- **Reporting.** `src/lib/report.ts` and `/report`: how well preferences were
  met, per instructor and overall, worst-served first. CSV export of the
  schedule and of the report, and a print stylesheet.
- **Comparison.** `/compare`, two drafts side by side, marking the better of
  each pair of numbers and naming who teaches in one but not the other.
- **Change log.** `scenario_changes`, written by database triggers, append-only
  to everyone. Shown on the board, grouped so a 199-row seed reads as one line.
- **Suggestions.** `src/lib/suggest.ts` and the board's "Fill N gaps": proposes
  instructors for unstaffed sections, hardest section first, accounting for its
  own proposals as it goes. Refuses rather than warns on anything that would be
  an error.
- **Student checks.** `/student-check`, open to everyone signed in, since RLS
  already limits non-coordinators to the official scenario.

**Verified.** 148 unit tests, typecheck and build green. All five new or
changed pages rendered at 375px in headless Chromium — board with the
suggestion sheet open, report, compare, student check, scenarios with the
create dialog open: no horizontal page scroll, nothing under 44px, no console
errors. 49 of 49 RLS checks pass against the hosted project, no residue, the
three real accounts untouched.

**Learned.**

- *The narrower test was the one that lied.* A standalone check of the change
  log deleted sections before the scenario and passed. The committed suite
  deletes an academic year and cascades three levels at once — and found that
  **deleting a scenario failed outright**, because the cascade removes the
  scenario before the sections and the log trigger then referenced a row that
  was already gone. The Scenarios page has a Delete button; this would have
  been hit the first time anyone pressed it. Fixed in
  `20260926000200_log_survives_cascade.sql`.
- *A greedy fill has to re-rank as it goes.* Ranking every unstaffed section
  against the original snapshot proposes the same person twice at the same
  hour. Placing the most constrained section first matters just as much: the
  other order lets a common section take the only person a rare one had. Both
  are asserted in the tests, along with the property that an accepted set of
  suggestions never introduces an engine error.
- *Refuse, do not warn, on hard constraints.* A suggestion that breaks a rule
  is not a suggestion. Soft objections — a new preparation, a day they would
  rather keep free — are shown next to the name and left to the coordinator.
- *"No data" and "nobody got what they wanted" must not look alike.* The
  preferences-met figure is null, not zero, when nothing was rated, and unrated
  assignments are counted neither way.

**Deliberately not done.** Importing a quarter from a pasted UW time schedule.
Seeding from an already-imported year covers most of what it was for, and a
parser for pasted text is a large surface for a case that may not come up.
Drag and drop, and undo, are still open.

**Next run should pick up — in this order.**

1. **Undo on the board.** The highest-value remaining polish by some way. The
   change log already records every mutation with enough detail to reverse an
   assignment or an unassignment; a section edit would need the previous values
   kept as well, which is a small migration.
2. **Toast notifications and optimistic feedback on the report page**, to match
   the board's.
3. **Accessibility pass**: focus management when the sheets open and close,
   focus trapping inside them, `aria-live` on the conflict count, and a
   contrast audit of the tier colours.
4. **Drag and drop** as an addition to tapping, never a replacement. `@dnd-kit`
   is already a dependency.
5. Then dark mode and the installable PWA.

**One thing closed on the way past.** Supabase's security advisor, run after
the migrations, showed `log_access()` callable by `anon` over
`/rest/v1/rpc/log_access`. The harden migration revokes EXECUTE on every
function that existed when it ran; `log_access()` arrived two migrations later
and was missed. Nothing was exposed — a trigger function called outside a
trigger fails immediately — but it is revoked now, and the advisor is back to
exactly the findings `docs/DESIGN.md` records as deliberately accepted. Worth
running `get_advisors` after any migration; it is cheap and it caught this.

**Watch out for.** The bundle is 572 kB (158 kB gzipped) and Vite warns about
it. Code-splitting the report, compare and student-check routes off the main
chunk is the obvious fix and is now worth doing.

---

## 2026-09-26 — the assignment board

**Built.** Iteration 3's core, end to end.

- `src/lib/snapshot.ts` — pure builder from database rows to the conflict
  engine's `ScheduleSnapshot`, plus `loadTallies`. This is where the fiddly
  reconciliation lives: three ways of expressing a meeting time collapsing into
  one, `numeric` and `time` values arriving in shapes the engine would compare
  wrongly, preferences spread across three tables.
- `src/lib/suitability.ts` — ranks every instructor for the section being
  filled, with the reason next to the name. Pure, so it is tested directly.
- `src/hooks/scheduling.ts` — scenarios, sections, assignments. Assign and
  unassign update the cached board optimistically so the conflict panel reacts
  on the same tap.
- `src/pages/Scenarios.tsx` — create, rename, archive, delete, mark official.
- `src/pages/Board.tsx` plus `src/components/board/` — quarter tabs, section
  cards, the assign sheet, section editor, conflict panel, load panel.
- `src/components/Layout.tsx` — the nav is now a drawer below `md`.

**Verified.** 69 unit tests (24 engine, 23 snapshot, 22 ranking), typecheck and
build all green. The board, the assign sheet and the section editor were
rendered at 375px in a headless Chromium against a fixture: no horizontal page
scroll, no element wider than the viewport, no control under 44px, no console
errors. The RLS suite ran against the hosted project through the Supabase MCP
tools: 40 of 40 pass, no residue, the three real accounts untouched.

**Learned.**

- *A view that cross joins `academic_years` makes adding a year a breaking
  change.* Extending the RLS test with its own throwaway academic year broke an
  unrelated assertion that compared `instructor_load_targets` to a positional
  list of exactly two values. Rewritten as "every row agrees", which is what it
  always meant. Worth remembering before adding a year for any reason.
- *The one-official-scenario-per-year index makes the obvious test fragile.*
  Hanging a test's official scenario off a real academic year would fail the
  day the coordinator publishes one. It gets its own year instead.
- *Drafts must not feed the engine.* A preference draft nobody has finished
  says "unavailable" about every quarter whose box is untouched. `buildSnapshot`
  honours submitted preferences only; the reasoning is in `docs/DESIGN.md`.
- *Ranking beats filtering at the assign step.* Hiding someone who said they
  cannot teach a course is wrong — the coordinator sometimes has to ask anyway.
  They appear last with the reason spelled out.

**Deliberately not done.** Drag and drop (tap-to-assign is the primary path and
works everywhere; dnd-kit is already a dependency for when it is added). Rooms
are omitted from the section editor because the `rooms` table is empty — the
field appears as soon as rows exist, and `room_double_booked` already works.
No migration this run: the schema from iteration 1 covered everything.

**Next run should pick up — in this order.**

1. **Seed a scenario from history.** The board is correct but starts empty, and
   typing ~80 sections in by hand is a poor first experience. `teaching_history`
   already holds 199 resolved section rows for 2025-26. A "start from last
   year's actual schedule" action on the Scenarios page would make the board
   immediately worth opening, and it is most of the machinery iteration 5's
   time-schedule import needs anyway.
2. **Iteration 4's preference-met report.** The snapshot already carries
   everything it needs: tier per assignment, new preparations, target versus
   actual. Mostly a new pure function plus a page.
3. **CSV and print export**, which the same report data feeds.
4. Then the polish list: undo/redo on the board, toasts, drag and drop, dark
   mode, PWA.

**Deployed and verified.** The board is live at
https://uwb-css-scheduler.netlify.app.

Two things changed after the first attempt failed, both on the account rather
than in the repo, and both are now the standing setup:

- **Netlify builds from GitHub.** The site is connected to `pisanuw/css-scheduler`,
  so a push to `main` deploys by itself. It used to deploy by upload
  (`commit_ref: null`, `title: "Deploy triggered by upload"`), which meant a
  push shipped nothing and every release depended on the sandbox reaching
  Netlify. It no longer does. Because Netlify runs the build, `VITE_SUPABASE_URL`
  and `VITE_SUPABASE_ANON_KEY` must stay set as build environment variables on
  the Netlify project.
- **The cloud environment allows `*.netlify.app`.** Runs can fetch the served
  site and check what actually shipped. `abvnaelzfriusckqqrfc.supabase.co` is
  reachable now too. Both were blocked before, which is why the first attempt
  failed with `403` on CONNECT — the egress proxy, not Netlify.

Deploy `6ab7195dc11a338e9f096e00` built commit `b1fb068` from `main` and
published in 20s.

### Verifying a deploy — read this before calling one broken

**A clean local build will NOT match the served hash, and that is not a
failure.** Vite inlines `import.meta.env.VITE_*` at build time, so a build
without `.env.local` bakes in `undefined` where the deployed bundle has the
real Supabase URL and key. Different bytes, different hash. The CSS matches
either way, because no CSS depends on those values. This cost a detour once;
do not read it as a bad deploy.

To compare properly, build with the same values Netlify used. The key is
publishable — the README explains why that is safe — and the deployed bundle
contains it, so it can be recovered from the bundle itself rather than stored:

```bash
curl -sS -o /tmp/served.js "https://uwb-css-scheduler.netlify.app$(
  curl -sS https://uwb-css-scheduler.netlify.app/ | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js')"
KEY=$(grep -oE 'sb_publishable_[A-Za-z0-9_-]+' /tmp/served.js | head -1)
printf 'VITE_SUPABASE_URL=https://abvnaelzfriusckqqrfc.supabase.co\nVITE_SUPABASE_ANON_KEY=%s\n' "$KEY" > .env.local
npm run build && cmp dist/assets/index-*.js /tmp/served.js && echo IDENTICAL
rm -f .env.local    # gitignored, but do not leave it lying around
```

That was run for this commit and reported `IDENTICAL` — byte for byte, not
merely a matching hash. A quicker smoke check, when an exact match is not
needed, is to grep the served bundle for a string only the new code contains,
such as `Best fit first, from submitted preferences`.

**Watch out for.** `npm run db:test:rls` and `npm run test:e2e` read a token
from a macOS keychain, which does not exist in the cloud sandbox, so they still
fail there whatever the network allows — run the SQL through the Supabase MCP
tools instead, as this run did. The bundle is now 532 kB (148 kB gzipped) and
Vite warns about it; not a problem yet, but code-splitting the board off the
main chunk is the obvious fix when it becomes one.
