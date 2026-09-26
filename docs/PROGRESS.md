# Progress log

The running record of what is built, what was learned, and what the next
session should pick up. Newest entry first. `docs/DESIGN.md` is the design;
this file is the state of play.

## Where things stand

| Iteration | State |
| --- | --- |
| 1 — Foundation | done |
| 2 — Preference collection | done |
| 3 — Assignment board | core done; drag-and-drop, undo and scenario seeding outstanding |
| 4 — Reporting | not started |
| 5 — Solver, import, student checks | not started |

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

**Not deployed — the sandbox cannot reach Netlify.** The code is committed and
pushed to `main`, but the live site is unchanged and still predates the board.
This run could not fix that, and it is not a code problem:

```
api.netlify.com            BLOCKED by egress policy
netlify-mcp.netlify.app    BLOCKED by egress policy
uwb-css-scheduler.netlify.app  BLOCKED by egress policy
github.com                 reachable
```

The `npx @netlify/mcp … --proxy-path …` deploy reports `403 Forbidden`, which
is the egress proxy refusing CONNECT rather than Netlify refusing the upload;
two attempts with freshly minted tokens failed identically. The Netlify MCP
*read* tools still work, because they travel through the MCP server rather than
this sandbox's network, which is also how every database operation in this run
reached Supabase — `abvnaelzfriusckqqrfc.supabase.co` is blocked to direct HTTP
too.

Consequently the post-deploy check the project insists on — fetch the served
HTML, compare its `/assets/index-*.js` hash against `dist/` — could not be run
either. **Nothing here should be read as "the deploy worked".**

To ship it, run from a machine that can reach Netlify:

```bash
npm ci && npm run build
npx netlify-cli deploy --prod --dir=dist --site 70a62744-9ef1-471e-baec-937c28de8503
curl -s https://uwb-css-scheduler.netlify.app/ | grep -o 'assets/index-[^"]*'
```

The last line must print the same hash as `ls dist/assets/`. As of this commit
a clean build produces `index-BEMl9wqC.js`. Note the site deploys by upload,
not from GitHub: the live deploy has `commit_ref: null` and
`title: "Deploy triggered by upload"`, so pushing to `main` does not ship
anything by itself. Connecting the repo to Netlify would remove this whole
class of problem and is worth doing.

**Watch out for.** `npm run db:test:rls` and `npm run test:e2e` read a token
from a macOS keychain and cannot run in the cloud sandbox — run the SQL through
the Supabase MCP tools instead, as this run did. The bundle is now 532 kB
(148 kB gzipped) and Vite warns about it; not a problem yet, but code-splitting
the board off the main chunk is the obvious fix when it becomes one.
