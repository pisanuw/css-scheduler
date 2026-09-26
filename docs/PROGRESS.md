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
| 5 — Solver, import, student checks | suggestions and student checks done; time-schedule import not started |
| Polish | undo, toasts, focus management, tables-as-cards, code splitting, drag and drop and print output done; dark mode, PWA open |

## Next up

See the newest entry below for the specific handoff.

---

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
