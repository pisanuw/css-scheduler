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
| 4 — Reporting | done |
| 5 — Solver, import, student checks | suggestions and student checks done; time-schedule import not started |

## Next up

See the newest entry below for the specific handoff.

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
