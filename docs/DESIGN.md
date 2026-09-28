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

**And the cold start off that data is measured, not hoped for.** A coordinator's
first real move is *New scenario → start from the year as it was taught*, and
what one tap produces is the board they live in for the year.
`seedPlan.real.test.ts` runs all 240 rows through `planFromHistory` against the
real 42-slot grid and the real room list: 240 sections, nothing skipped, no
off-grid times, every room resolved, the 41 arranged rows kept as arranged, and
`describePlan` — the only sentence the coordinator sees before committing —
checked against those numbers. The live `teaching_history` holds 199 rows rather
than 240 because the seed SQL excludes the arranged ones.

One trap is pinned there because it was walked into while measuring. The `rooms`
table does **not** hold `'UW1 050'` anywhere: `useRooms` joins `buildings` and
composes the label from `code` and `room_number`, and the seed derives the rooms
from those same labels by splitting on the space. A room list built from
`room_number` alone matches *nothing*, on every row, silently — the whole year
would land with no rooms at all and the room-clash check would have nothing to
work with. A test feeds bare numbers in and asserts exactly that failure.

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

### Two coordinators at once

There are two coordinators, and nothing stops them opening the same scenario.
What happens then was worked out rather than assumed, because the obvious
descriptions of the problem are both wrong.

**It is not an undo problem.** Undo is `undo_change` in the database, and
`myLastUndoableIds` already scopes ⌘Z to the caller's own entries — see *Undo*
below. Somebody else's later edit is theirs to take back.

**It is not a lost update either.** Two coordinators assigning two different
people write two different rows. `section_instructors` is unique only on
`(section_id, instructor_id)`, verified against the live database, and there is
no constraint and no trigger anywhere that refuses a double-booking: **both
writes succeed.** Every time conflict in this app is a client-side reading of
`src/lib/conflicts.ts`, and that is deliberate — the coordinator is sometimes
right to create one knowingly, so the engine reports rather than forbids.

Which is precisely what makes staleness serious here. `main.tsx` sets
`refetchOnWindowFocus: false`, the board's queries carry a `staleTime`, there is
no polling, and realtime is aliased out of the bundle by
`vite-plugins/supabaseTrim.ts`. So the board refetched only in response to its
*own* mutations — and the conflict panel is computed from that snapshot. A
coordinator could be told a slot was clear that somebody had filled ten minutes
earlier. Not a stale screen: a wrong answer from the one part of the app whose
whole job is to be right.

**And the board is not the only page that reads a scenario.** `Report`,
`Compare` and `StudentCheck` all build the same snapshot through
`useScenarioSnapshot`, so all four go stale the same way — and on the report it
is arguably worse, because the report is the page that gets *exported*. A CSV of
last hour's answer leaves the building looking authoritative. All four watch.

**The fix watches the change log rather than the board.** `scenario_changes` is
already an append-only feed of every board write, written by trigger, carrying a
`bigserial` id, the actor's address and a readable summary. `useLiveScenario`
polls its newest six rows — three columns, a few hundred bytes — and invalidates
the board only when the feed has moved past the watermark it holds. The rules
are pure, in `src/lib/liveSync.ts`, and tested there.

Three alternatives were weighed and rejected:

- **Turning realtime back on.** The trim is worth about 40 kB on a phone and is
  argued for under *The Supabase clients that are not in it*. Undoing that to
  solve a problem a 300-byte poll solves would be a poor trade.
- **Refetching the whole board on a timer.** Blind, and much larger: the board
  is every section and every assignment in the year. The feed says *when* to
  refetch, so the expensive request happens only when something changed.
- **A version column on the scenario that a write checks.** It would reject the
  harmless concurrent edit — two coordinators working on two different quarters,
  which is the likely case — as readily as the harmful one, and add a failure
  path to every write. The app's model is to report a conflict, not to refuse the
  keystroke; freshness serves that model and optimistic concurrency fights it.

Six details are worth recording because each was a decision:

- **The first look is silent.** Opening a board adopts the newest id as the
  watermark without saying anything. A scenario with no history adopts `0` —
  not null, which means "not looked yet" — so the first change anybody makes
  afterwards is still news.
- **The watcher pauses while a write of its own is outstanding.** Assign,
  unassign and move update the cached board optimistically. A refetch landing
  between the optimistic insert and its settle would return rows without the
  pending assignment, so the pill the coordinator had just placed would vanish
  and reappear. The write's own `onSettled` invalidation brings the board up to
  date anyway.
- **The count is counted, never inferred from the ids.** `scenario_changes.id`
  is one sequence across every scenario, so a gap of forty between two entries
  on this board means thirty-nine changes on somebody else's. When the window is
  full the notice says "at least", because it genuinely does not know.
- **The notice names the person, and never the caller.** `actor_email` is
  `citext`, so addresses are compared case-insensitively; a caller with no
  address owns nothing, so a trigger-written entry with no actor reads as
  somebody else's rather than as your own tap. That comparison is the one place
  a bug hid — folding "no address" into the equality test suppressed exactly the
  notice that most needed showing — and it has a test of its own.
- **The sentence names the page, and the page has to say which it is.** The
  notice is one sentence: what changed, then what has been brought up to date.
  That second half is a lie on three of the four surfaces — a coordinator told
  "the board has been brought up to date" while reading a report goes looking
  for a board that is not on screen — so `SURFACE_TAIL` carries one clause per
  page and `Viewer.surface` is a required field rather than a default. A page
  that forgot to say what it was would otherwise claim to be the board. On
  `Compare`, which shows two drafts at once, the notice also names *which*
  draft moved: both sides are watched, because either one going stale makes the
  difference wrong, and the second watcher stands down when both selects point
  at the same scenario so one change is not announced twice in identical words.
- **The student check tells a student *that* it changed, not *who* changed it.**
  `/student-check` is the one page any authenticated user can open, and
  `scenario_changes` is readable there — but only for the *official* scenario,
  and only because a published schedule's history is not secret. That is not a
  reason to push a colleague's address at a student in a toast, so `Viewer.named`
  follows the role: coordinators get "mashhadi@uw.edu assigned Rob Nash — CSS
  342 A", everybody else gets "1 change to the schedule". Required rather than
  defaulted to true, because the safe answer is the one that should have to be
  asked for. No policy change was needed for this and none was made; it is a
  decision about what to *display*, which is not the same question as what may
  be read.

What this does **not** do is stop the double-booking happening. It makes it
visible within twenty seconds, on every page that could report it wrongly, with
the conflict panel computed from data that is that fresh. Given that the app reports conflicts
rather than forbidding them, that is the whole of the fix; a constraint that
refused the second write would be a different design, and a worse one.

## Mobile

The coordinator does this work on a phone, so 375px is the width the layout is
designed at, not one it degrades to. Three rules hold everywhere:

- **Tap to assign.** Tap a section, tap an instructor. Dragging exists now,
  and it is an addition to this path rather than a replacement for it: every
  assignment, move and removal a drag performs is also two taps away, which is
  what a phone uses when a hand is full and what a keyboard uses always.
- **No horizontal page scroll, at any width.** The quarter tab strip is the one
  element allowed to scroll sideways, and only within itself.
- **Every control at least 44px tall.** Including the small ones — the chip
  that unassigns somebody, the severity filters on the conflict panel, the Undo
  beside a line of the history.

### Empty states

The cold start is nothing *but* empty states: the live database has no scenario
in it, so a first visit is this card on five pages in a row. They are one
component, `EmptyState`, for three reasons that had all gone wrong separately —
the styling had drifted (`text-slate-500` against `text-slate-600`), the report's
dropped the page heading so there was a floating sentence and no title, and the
way out was sometimes a real button and sometimes an underlined link inside the
prose, about twenty pixels tall, on a phone.

So the component takes its action as **data**, not as children: you cannot hand
it an inline link, and it renders a 44px control or nothing. Nothing is a real
answer — a student looking at an unpublished schedule has nowhere to be sent, so
they are told what will appear here instead of being given a dead end. The
`empty-states` scene puts all four shapes on one 375px screen, which is how they
are checked rather than asserted.

**Tables become cards below `sm`.** The load panel has always done this.
`DataTable` — which backs Courses, Instructors, History, Responses and Access —
now does too, so the rule finally holds everywhere rather than in one panel.
Above `sm` it is the same table it always was.

A card is not a table row with its borders removed, so each column says where
it goes: `title`, `subtitle`, `badge`, `meta` (a labelled pair, the default),
`action` (a button, at the foot) or `hidden`. Unannotated columns still work —
the first is the heading and the rest are pairs — because a column added
without a thought for the phone should land somewhere sensible rather than
vanish. Two further decisions are taken from the content rather than declared:
a value long enough to wrap twice takes the whole width of the card instead of
half, and a cell holding only a placeholder (`—`, styled or bare) is left off
altogether, because a table needs a dash to keep its columns lined up and a
card has no columns to line up. `src/lib/cards.ts` holds all of that as pure
functions, tested without a browser; `src/components/DataTable.tsx` renders it.

### Dragging

A name can be dragged from the load panel onto a section card, and a name on a
card can be dragged to another card, which moves it rather than copying it.
Three decisions hold this together.

**The tap has right of way.** A mouse must travel 6px before a press counts as
a drag, and a finger must rest 250ms within 8px before a hold does. Without
the first, the × that unassigns somebody would stop working for anyone whose
hand moves a pixel between press and release; without the second, a flick down
a list of sections would pick up whatever the finger happened to land on
instead of scrolling. Both numbers live in
`src/components/board/dragSetup.ts`, which the board and the check that drives
a real pointer both use, so the thing tested is the thing that ships.

**What a drop means is pure.** `src/lib/dnd.ts` decides, over a snapshot,
whether a drop is an assignment, a move, or nothing at all, and what to say
about it afterwards; `dropHints` colours every card for the person in the air.
A move is judged against the snapshot with the old assignment already removed
— otherwise dragging someone from one 8:45 Monday section to another would
report a clash with the section they are in the act of leaving, and every move
would look forbidden.

**Red is a warning, not a veto.** A card the engine dislikes takes a red ring
and still accepts the drop, and the confirmation carries the reason — "Assigned
Bo Li to CSS 342 A — clashes with another section". This is the same judgement
the assign sheet makes when it ranks an unwilling instructor last rather than
hiding them: the coordinator sometimes has to ask.

Dragging adds no keyboard path, deliberately. dnd-kit offers one, but it would
mean a tab stop on every name in the load panel and a `role="button"` wrapped
around the real button inside each chip, to reach a destination the card's own
Assign button already reaches in two keystrokes. The chips take the library's
pointer listeners and not its ARIA attributes. Screen readers are told what is
happening by `dragAnnouncement`, because dnd-kit's default announcement reads
out the drag id, and this board's ids are `assignment:<uuid>:<uuid>`.

A move writes two entries in the change log — the unassign and the assign —
because an assignment is a row and there is no such thing as moving one.
`myLastUndoableIds` recognises that pair, so ⌘Z after a drag puts the person
back where they were instead of leaving them on neither section.

Which shape appears is decided by `matchMedia`, not by rendering both and
hiding one: the teaching history is over a thousand rows and six columns, and
building both shapes of it would put twelve thousand cells in the document to
show six thousand.

The five list pages share `Toolbar` for their heading and filters. Each had
grown its own, and each was a single non-wrapping row with a 256px search box
pushed right — which at 375px is a page that scrolls sideways — holding
controls about 34px tall against a 44px floor.

The navigation is a drawer below `md`, because fourteen destinations do not fit
across a phone and a sideways-scrolling nav bar was worse than a menu. A skip
link sits before it so a keyboard user does not have to Tab past every
destination to reach the page.

### Checking it, rather than believing it

`npm run check:mobile` builds `harness/`, a second Vite entry that renders each
over-the-page component — and each list page's table — with fixture data and no
Supabase at all, then drives every scene in a 375px headless Chromium and
asserts:

- the document does not scroll sideways, and nothing sticks out past the
  viewport;
- every control is at least 44px in the direction a finger aims at;
- every piece of text clears WCAG AA against the colour actually painted behind
  it — measured by painting each `oklch()` into a canvas and reading the pixel
  back, rather than trusting the palette name — **in both themes**, the whole
  scene being measured again in the dark;
- the printed page is identical whichever theme it was printed from;
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

The table scenes import their columns from the pages themselves rather than
copying them, so a column added without a thought for the phone fails the check
rather than slipping past it. That is why `harness/vite.config.ts` defines a
throwaway `VITE_SUPABASE_URL` — importing a page reaches `src/lib/supabase.ts`,
which refuses to load without one. A client is constructed and never used; no
request is ever made.

## Loading the app

Every page is its own chunk, fetched when it is asked for.

Until this was done the whole app was one 585 kB file. An instructor who only
ever opens My preferences downloaded the assignment board, the report, the
scenario comparison and the access log to get there; a coordinator on campus
wifi re-downloaded React, Supabase and React Query after every deploy,
including the ones that changed a label. On a phone on a slow connection that
is the difference between a page and a wait.

What ships now:

| Chunk | Size | Changes when |
| --- | --- | --- |
| `index` | 21 kB | the shell, the router or sign-in does |
| `react` | 165 kB | React, the router or the scheduler is upgraded |
| `supabase` | 136 kB | `@supabase/*` is upgraded |
| `query` | 41 kB | React Query is upgraded |
| a page | 1–40 kB | that page does |

The three vendor chunks are grouped rather than split per package, because
React, the router and the scheduler refer to one another and cutting between
them produces circular chunks that cost a request each and buy nothing. The
build's chunk-size warning is set to 250 kB now that no chunk should be near
it: a page that crosses it has pulled in something unexpected.

A signed-out visitor loads four chunks and sees the sign-in button. `Login` is
the one page that is *not* split — making the first paint wait on a second
request to show a single button is a poor trade. That first load is 401 kB,
117 kB over the wire.

### The Supabase clients that are not in it

`supabase` was the largest chunk, at 227 kB, and most of it was code this app
never runs. `@supabase/supabase-js` is five clients in one package — PostgREST,
auth, realtime, storage and edge functions — and its constructor builds a
`RealtimeClient` and a `StorageClient` whether anything asks for them or not,
so no bundler can prove them dead. A WebSocket client, a Phoenix channel
implementation, a presence layer, an uploader and a function caller were
downloaded by every instructor who opened the sign-in page.

`vite-plugins/supabaseTrim.ts` aliases those three package names onto
stand-ins in `src/lib/supabase-trim/`, which takes the chunk to 136 kB — 90 kB
off the first load, 24 kB of it over the wire. The app uses none of the three:
it reads through PostgREST, refreshes through React Query rather than a socket
(a schedule is edited by one coordinator at a time), generates every export in
the browser, and keeps the decisions that must not be the client's in
row-level security rather than in an edge function.

Each stand-in constructs silently, because `SupabaseClient` constructs it
unasked, and throws the moment anything *uses* it, naming the file to edit. The
silent alternative would turn "this build has no realtime" into a subscription
that never fires, which looks like a database problem and cannot be found from
the console. Which members have to exist is a fact about a dependency, not
about this code, so a test reads the installed `supabase-js` and asserts the
stubs cover every `this.realtime.*` and `this.storage.*` call in it — an
upgrade that adds one fails there rather than on somebody's sign-in.

### One list of destinations

`src/lib/routes.ts` is the whole nav and the whole router. There used to be
two lists — a `<Route>` each in `App.tsx` and a `{ to, label, show }` each in
`Layout.tsx` — with nothing holding them together, so a coordinator-only page
reachable by typing its path, or a nav link to a route that no longer existed,
was a copy-paste away. It is also what makes the split safe to do well: a page
arrives over the network now, so something has to decide when to fetch it, and
the loader belongs beside the label the finger is about to touch.

The table is data and imports no page, so a unit test can read it in Node
without constructing a Supabase client. One of those tests lists `src/pages`
on disk and fails if a page is not routed.

**The route gating is convenience, not security.** `routesFor(false)` keeps
coordinator pages out of an instructor's nav and out of their router, and the
chunks are never fetched — but the page is still on the CDN, and anyone can
ask for it. What actually protects the data is row level security; see
**Security** below. The gating exists so that an instructor is not offered a
page that would show them nothing but errors.

### When the chunk does not arrive

Splitting moves a failure that used to be impossible into the middle of a
navigation. There are two causes and they want opposite handling, so
`src/lib/chunkError.ts` holds both as pure functions.

A **stale deploy**: every asset is named by its hash, so a deploy replaces
`Board-DkQ2.js` with `Board-9fLp.js`, and a coordinator with the tab open from
before it is holding an entry chunk that asks for the old name.

How often that actually breaks was measured rather than assumed, and the
answer was reassuring: Netlify keeps previous deploys' assets addressable, and
the single bundle from the deploy before this one still answered 200 after the
split shipped. So on this host, on an ordinary deploy, the old chunk usually
still resolves. It stops resolving when a deploy is deleted, rolled back or
purged, and on any host that does not keep them — and the failure is total
when it happens, because the page the coordinator asked for simply never
appears. Reloading picks up the new `index.html` and everything follows, so
the app does it once, by itself.

A **dead connection** looks identical from here — both surface as a module
fetch rejection — and on this host it is the likelier of the two. Reloading a
phone with no signal replaces a working app with a browser error page. So the
automatic reload fires at most once per document, recorded in `sessionStorage`;
come back still broken and the cause was not the deploy, and the coordinator
gets a button instead of a loop.

`RouteErrorBoundary` catches and obeys those rules; `RouteErrorNotice` is the
markup. They are separate because catching means logging a stack, which the
mobile check reads as a failure — this way the check renders the notice
directly and measures what ships.

### Not waiting when there is nothing to wait for

Two things keep the split from being felt.

The dashboard's chunk starts downloading as soon as a session exists, in
parallel with the profile request it would otherwise queue behind. Both come
from the same CDN as the page; overlapping them is why the page everyone lands
on costs nothing extra. It is gated on the session because signing in leaves
the document — Google, then back — so a chunk fetched for a visitor who has
not signed in yet is spent on a page about to be thrown away.

Every other page is fetched at the first sign someone means to go there: a
pointer settling on a nav link, a focus ring landing on it, or a finger
touching down. On a phone, `touchstart` to `click` is the ~100 ms it takes to
lift a finger, which is most of a chunk fetch off a warm CDN. A prefetch is a
guess, so it is memoised, its failures are swallowed rather than logged, and a
*failed* one is forgotten — otherwise one flaky fetch in a tunnel would poison
that route for the rest of the session and `React.lazy` would inherit the
rejection.

While a chunk is genuinely in flight, `RouteFallback` shows a skeleton that
fades in over the first second rather than appearing at once. A chunk off a
warm cache arrives in single-digit milliseconds, and a spinner that flashes for
one frame on every navigation reads as a fault rather than as progress.

### Checking the routing, rather than believing it

`npm run check:routes` builds the app and drives the real bundle in a headless
Chromium with Supabase replaced by canned answers and a fabricated session
written into the storage key supabase-js reads. No credentials, and no request
reaches the live project. It asserts that a signed-out visitor does not
download the board, that every destination renders after its chunk arrives,
that a deep link is still where it was typed, that one tap fetches one page,
that hovering a link prefetches it, that an instructor can reach no
coordinator page by nav or by URL, that the theme is already correct with the
app's JavaScript blocked and that a stored choice outranks the device, that no
page paints a daylight surface in the dark, and that the console stays clean.

It found a real bug on its first run, and not the one it was written for.
`AuthProvider` kept `loading` as its own flag, and between the render that
received the session and the effect that set the flag back to true there was
one commit with a session, no profile, and `loading` false — long enough for
the router to conclude the reader was not a coordinator and send them home. A
coordinator opening a bookmarked `/board/:scenarioId` landed on the dashboard.
It had been there since the board shipped and no check could see it, because
until the pages were separate chunks there was no observable difference
between rendering the board and redirecting away from it. `loading` is now
derived from which user the profile in hand belongs to, so the window does not
exist rather than being narrow.

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

### State the app derives, rather than synchronises

Three places used to keep a copy of something and push the copy around with an
effect. All three had the same failure: between the render that received the
truth and the effect that copied it, there was a commit showing the old answer
— or, worse, the copy won.

- **The preferences form.** It was hydrated from the saved submission by an
  effect that ran whenever the query's data changed. Saving a draft invalidates
  that query, so the refetch that follows a save put the saved answers back
  over anything the instructor had typed since they tapped Save;
  `refetchOnReconnect` does the same to a phone that finds signal again. The
  form is a child component now, seeded once at mount by
  `initialFormState()` and remounted by `formKey()` — cycle plus submission id
  — so a refetch of the *same* submission cannot reach the fields at all.
  `scripts/route_check.mjs` drives the real bundle through a save and fails
  against the old page.
- **The profile.** A profile is a round trip to `profiles` and genuinely cannot
  be computed during render, but *whose* profile it is can be recorded next to
  it. `resolveProfile()` compares that owner against the current session, which
  means nothing has to be cleared on sign-out and a profile fetched for the
  previous account is never shown to the next one.
- **The nav drawer.** Closing it in an effect commits the new page with the
  drawer still over it and closes it a frame later. It is adjusted during
  render instead. Deriving it from "the path it was opened on" would have been
  tidier still and is wrong: going Back to that path re-opens it.

`react-hooks/set-state-in-effect` is an error as of that work, with nothing
grandfathered; `eslint.config.js` carries the list of what it found.

## Colour, and dark mode

The coordinator schedules at night. Dark mode is a setting with three states,
not a switch with two: **follow the device**, **light**, **dark**. Following
the device is the state everyone starts in, and it has to keep following —
a phone that turns dark at sunset should take the app with it, including while
the sign-in page is open. That is why `useTheme` lives in `App`, above every
early return, rather than inside the button that changes it.

One attribute, `data-theme` on `<html>`, is the whole mechanism. It is written
twice: by an inline script in `index.html` before the first paint, and by React
thereafter. Both read the same `localStorage` key, `css-scheduler:theme`, which
holds `light` or `dark` and is *absent* when the choice is to follow the
device — an absent key is what "no choice" means, so a stored value never
quietly outlives it. `src/lib/theme.ts` holds the rules as pure functions;
storage is wrapped in `try`/`catch` throughout, because a browser that refuses
to remember a colour scheme must still show one.

**The palette moves, not the markup.** Tailwind 4 compiles every colour utility
to `var(--color-…)`, so re-pointing those variables under
`:root[data-theme="dark"]` moves the entire app — including code written before
dark mode existed, and code written after it without a thought for it. The
alternative, a `dark:` variant on every one of two thousand class names, is a
migration that is never finished and that every new page has to remember.

Three details make that work rather than nearly work:

- **The neutral ramp inverts; the accent ramps do not.** `slate-50` becomes the
  darkest panel and `slate-900` the brightest heading, so every light-on-dark
  pairing in the app stays a pairing without being touched. Red, amber, emerald
  and sky are not ramps in practice but three jobs sharing a scale: 50–300 are
  tinted backgrounds and borders, 400–600 are dots, bars and filled buttons
  that keep white text, 700–900 are the text that sits on the tinted
  backgrounds. Each shade gets the value its job needs in the dark, which is
  why those numbers are not monotonic.
- **Four colours are roles, not shades.** `surface` (a card, a sheet, a field),
  `canvas` (the page behind them), and `ink`/`onink` (a filled, selected chip).
  `bg-white` could not become the dark surface, because white also has to stay
  white where it sits on the purple header and on a delete button. `danger` and
  `danger-strong` name the delete button for the same reason: `red-700` is the
  colour of error *text* in the dark, and a delete button that turned pale pink
  under a finger would have been the price of reusing it. The brand purple
  splits too — `--uw-purple` fills the header and the primary buttons in both
  themes, `--uw-purple-ink` is the same brand as *text*, and it goes light.
- **Paper has no dark mode.** The whole dark block sits inside `@media screen`.
  A printed schedule is read in a meeting and handed round, and
  `print-color-adjust: exact` — which the print stylesheet needs, or badges
  come out as empty outlines — would otherwise flood a page with near-black
  ink. Leaving the dark palette out of the print media means the printed page
  falls back to the stock light one with nothing extra to maintain.

The `dark:` variant exists for exceptions and currently has none. The one place
that looked like an exception, the gold coordinator badge (gold in both themes,
so its text must be dark in both), printed differently depending on which theme
it was printed from. It uses a pinned `--color-slate-950` instead.

### Checking it, rather than believing it

Dark mode is the change most able to break quietly: a pairing that reads
perfectly in daylight can land anywhere once both ends of it move, and nobody
finds that by looking at the light theme. So

- **every mobile-check scene is measured twice**, once in each theme, for
  contrast and for overflow. The first run of that pass found three real
  failures;
- **the printed page is asserted to be the same page from either theme** —
  every element's background, text and border colour compared under
  `media: print` with the theme flipped between. Not "the printout is light":
  the brand purple on a button is legitimately dark, and dark in both;
- **the routing check blocks the app's JavaScript** and asserts the attribute
  is already right, which is the only honest way to ask what the first paint
  looked like. Module scripts are deferred, so `DOMContentLoaded` has already
  waited for React and would pass with the inline script deleted;
- **and it sweeps all fourteen real pages in the dark** for the three light
  surfaces the stock palette paints, which is what a hardcoded `#fff` or a
  `bg-white` written after this landed would look like.

Each of those was made to fail on purpose before being believed: a deliberately
too-dark `slate-500`, the inline script deleted, and a stray `bg-white` added to
the dashboard.

One trap for whoever extends this. The theme flip animates, because half these
surfaces carry `transition-colors` — so a check that measures immediately after
flipping reads a blend of the two themes and reports a navy card as still being
daylight-white. The dark pass waits 300ms first.

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

### Keyboard shortcuts

⌘Z was the first and for a while the only one, and it had both of the problems a
shortcut can have. It was a `useEffect` in `Board.tsx` with a fourteen-entry
dependency array, so a `keydown` listener was torn down and rebuilt on every
assignment, every conflict recount and every keystroke in the import sheet. And
nothing anywhere told anybody it existed, which makes an accelerator a feature
for whoever already knew.

The table now lives in `src/lib/shortcuts.ts`, and **the help sheet is rendered
from that same table**. That is the one design decision here worth the name: a
shortcut cannot be added without appearing in the help, and the help cannot claim
a key that does nothing. A hand-kept list would have drifted by the second
shortcut.

`activeShortcuts(state)` is a pure function rather than a static table because
which keys should work depends on what is on screen — a locked scenario has no
Add section, a quarter with nothing unstaffed has no Fill — and because the help
sheet needs the same answer to decide what to show as unavailable. While a sheet
is open it returns nothing at all: the coordinator is in a modal, and `n` quietly
opening the section editor behind an import they were reading would be
inexplicable. The help sheet is the one exception, and only for its own key.

Single letters, not chords. A chord (`g` then `b`) buys a namespace bigger than
nine actions need and costs a mode: press `g`, go and answer the door, come back
to a board that is waiting for a second key and will not respond to the first
thing you try.

Three rules that are not obvious, all of them tested:

- **Shift is allowed on an unmodified shortcut; Alt is not.** `?` is Shift and
  `/` on most layouts, so "no modifiers" would make the help key unpressable.
  Alt is excluded because on several layouts it composes a different character,
  and that character is what was meant.
- **Shift is forbidden on a `mod` shortcut.** ⇧⌘Z is redo almost everywhere. It
  must not reach undo, which is exactly what it would do if `mod` only tested
  for ⌘.
- **`preventDefault` only once a shortcut has matched.** Calling it on every key
  press swallows the browser's own bindings, ⌘R among them, which is how anybody
  gets out of a page that has gone wrong.

Unavailable rows in the help sheet are **not** dimmed. That was the first
attempt and `npm run check:mobile` rejected it: `text-slate-400` on the sheet is
2.6:1 in daylight and 3.5:1 in the dark, against the 4.5 every string in this app
is held to. Which was the right answer for a better reason than contrast — colour
alone is a poor way to say "this does nothing", and the rows that do nothing are
the ones most in need of reading. So the label stays legible, the key cap takes a
dashed border, and the row carries `aria-disabled` and a sentence saying why.

The same harness scene caught a real bug on its first run: `Board` was passing
its own live state to the help sheet, and that state says a sheet is open — this
one — so `activeShortcuts` correctly reported that nothing else was bound and the
sheet greyed out every row. What the sheet wants is what the keys do *once it is
closed*, which is what it is now given.

Checked in a browser by `npm run check:keys`, which is the third input device
after `check:drag`'s mouse and finger. The pure table is unit-tested; what only a
real page can answer is whether the listener is on the window at all, whether a
keystroke aimed at a field is left entirely alone (the import sheet's textarea
takes a paste of a whole quarter), whether an unmatched key keeps its default,
and whether a modal really takes the keyboard away. One of those assertions
passed for the wrong reason until an unrelated line was removed: focus was still
in the textarea from the step before, so the key was being suppressed by the
typing guard rather than prevented by a match. The fix is a line that moves focus
on purpose, with a comment saying why it is there.

The `?` button in the board toolbar is hidden below `sm`. Shortcuts are no use to
a phone, and a 44px target listing keys nobody has is worse than nothing; an iPad
with a keyboard is `sm` and up, and gets it.

### Dependency advisories

`npm audit` reports nothing, and the way it got there is worth recording because
the previous record was wrong. Three progress entries described the seven
findings as "all in dev tooling", and that description is the reason nobody
looked again: `react-router-dom` is a runtime dependency and two of the seven
were against it.

What matters about a finding here is whether it is reachable from this app, not
its severity label. The four clusters, as they actually stood:

- **`react-router-dom` — the only one that shipped to the coordinator.** The SSR
  hydration finding needs `deserializeErrors()`, and there is no server
  renderer. The open redirect needs a navigation target beginning with a
  backslash; every target in this app is a template literal with a fixed
  `/board/` or `/report/` prefix and a UUID after it, so an injected backslash
  lands mid-path where the browser reads it as a separator. Not reachable — and
  upgraded anyway, because that is a property of the call sites rather than of
  the library. The first `?next=` parameter anybody adds to the sign-in flow
  makes the target user-controlled, and nothing would connect that change to
  this advisory. 6.x has no patched release, so 7.18 was the only fix.
- **`vitest` — the critical one, and unreachable.** It needs the Vitest UI
  server listening. `@vitest/ui` is not installed and the scripts are
  `vitest run` and `vitest`. Upgraded regardless: a critical sitting in the
  report is a critical nobody reads past.
- **`vite` and `esbuild` — the dev server.** Both are about what a page can ask
  a *running dev server* for. Nothing in production, and nothing in CI, which
  runs `vite build`.
- Everything else was transitive on those.

Node is pinned to 22 in `.nvmrc`. Vite 8's floor is `^20.19.0 || >=22.12.0`, so
the pin is partly that — but mostly it is the lockfile argument again: comparing
a local build byte for byte against what Netlify serves only means something if
both ran the same toolchain, and Netlify's default Node version is not this
project's to hold still.

The upgrades were `react-router-dom` 6.30 → 7.18, `vite` 5.4 → 8.3,
`vitest` 2.1 → 5.0, `esbuild` 0.21 → 0.28 and `@vitejs/plugin-react` 4 → 6.
Two things were measured rather than assumed:

- **No runtime dependency moved.** Regenerating the lockfile re-resolves every
  `^` range, which is exactly the hazard committing it was meant to prevent, so
  the eight runtime packages were compared before and after by version. All
  eight are identical — `@supabase/supabase-js` included.
- **The first load got smaller.** React Router 7 costs +15,974 bytes raw and
  +5,580 gzipped over 6.30. Rolldown, which Vite 8 builds with, more than paid
  for it: the signed-out first load is 401,468 raw / 116,539 gzipped against
  403,136 / 116,704 deployed — 165 bytes *less* on the wire, in one more request
  (a 368-byte rolldown runtime chunk).

### The build that succeeded with no app in it

Vite 8 builds with Rolldown, and Rolldown eliminates dead code across modules in
a way Rollup did not. `src/lib/supabase.ts` throws at module scope when
`VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing — deliberately, so a
misconfigured deploy says so on the first paint rather than on the first query.
Vite inlines both at build time, so in a build with neither set that condition
folds to a constant and the module provably throws on import. Rolldown then
proves everything the entry reaches afterwards is unreachable and drops all of
it: a 2.5 kB entry holding a module-preload polyfill, every page chunk still
present because those are dynamic imports, and a build that prints its usual
table and reports success.

`npm run build` is one of this project's four verification gates (`npm test`,
`npm run typecheck`, `npm run lint`, `npm run build`). Under Vite 5
an env-less build produced a working bundle that failed loudly in the browser,
which is why `scripts/route_check.mjs` has a message about it. Under Vite 8 the
same command passes on a bundle with no application in it — the same class of
failure as the Netlify deploy that printed success and shipped nothing, and the
reason `npm run check:deployed` exists.

So `vite-plugins/envGuard.ts` refuses the build. It checks the cause, in
`configResolved`, rather than inspecting the bundle for the symptom: the obvious
alternative — assert `src/App.tsx` is in the output — does not work, because
`chunk.moduleIds` still lists a module whose code has been eliminated. It was
written that way first and it passed. A size threshold would need revising
whenever the shell grew and would not say what was wrong. `npm run build:check`
supplies placeholders for when the gate is all that is wanted.

### Tailwind scans prose

Tailwind 4 detects its sources by scanning the project, and two directories here
are full of things that look like class names and render nothing. `scripts/`
holds Playwright selectors: `[data-drag-id="instructor:i4"]:visible` in the drag
check was read as the candidate `instructor:i4"]:visible` and emitted into the
*shipped* stylesheet as `.instructor\:i4\"\]\:visible:is()`, a rule matching
nothing. Vite 5's CSS minifier warned about it on every build; Vite 8's does not,
which is the worse of the two states — the noise went and the rule stayed.
`docs/` is English prose, and `blur`, `italic`, `resize` and `grow` are all
utility names.

`@source not "../scripts/**"` was the first attempt and is the wrong tool:
adding any directive changes what automatic detection considers, so excluding
`scripts/` removed one junk rule and introduced three from the docs. The fix is
to declare sources instead of subtracting from them — `@import "tailwindcss"
source(none)` plus `@source "../src"` and `@source "../index.html"`, with
`harness/` added by `harness/harness.css` for its own scenes. That removed
thirteen rules and 1,159 bytes, all of it junk: the bare `.bg-white`,
`.transition`, `.grow` and `.text-slate-400` that went are not used anywhere in
`src/` — what is used there is `hover:bg-white/10`, `transition-colors` and
`placeholder:text-slate-400`, which are different rules and are still generated.
The 30 rendered scenes in `npm run check:mobile` are what would notice a utility
this list had wrongly excluded.

## Excel auto-fill

The coordinator plans the year in a workbook — "26-27 at a glance", one block
of columns per quarter, every section with its load, time, days, cap and an
empty instructor cell — and collects preferences through two Google Forms, one
for full-time and one for part-time faculty. She asked whether the full-time
names could be filled in from the survey and the loads, with part-time left for
later, and whether this app could take Excel as it is. `/autofill` does both,
and so does `npm run autofill` from a terminal: the same code, `src/lib/autofill/`.

**Excel in, Excel out, and no database.** The page takes the three workbooks,
fills the schedule in the browser, and hands the workbook back. It writes no
scenario and reads no table, for two reasons. The workbook is the record she
works from, with notes, shading and conventions this app's schema has no room
for; making her retype it into a scenario first would be the work the app
exists to remove. And the survey answers are about people's leave, health and
families — they stay on her disk. The route is coordinator-only for the same
reason every scheduling page is, not because anything behind it needs row
level security.

**The workbook is edited where it lies.** A spreadsheet library would load her
file into its own model and write a new one from it: 109 merged ranges, a
frozen pane, a print area, per-cell fonts and whatever it did not understand
would come back as its idea of the workbook. `xlsx.ts` unzips the file
(`fflate`, 8 kB, no dependencies), rewrites only the rows it writes into —
keeping each cell's own style and changing only the fill and the italics — adds
its sheets, and zips the rest back byte for byte. Its tests assert that nothing
outside the three instructor columns changed.

**Purple means "not decided yet" because her legend already says so.** The
sheet's own key: *purple shading are assignments that still need to be made or
confirmed; italicized instructors are part-time faculty.* So every name the
tool writes is purple, and a part-time name is italic. That convention is also
the whole protocol for running again: a name still in the tool's purple is a
proposal and is worked out afresh; a name without it — one she accepted by
clearing the shading, or typed herself — is kept and counts toward that
person's load. A re-run on an unchanged workbook changes nothing: the search
starts from the previous proposals (`solve` in `engine.ts`) rather than from
scratch, and `run.test.ts` holds that.

**The layout is found, not assumed.** `glance.ts` looks for the row that heads
columns `course` and `instructor`, splits it into blocks at each `course`, and
reads the quarter's name from the merged cell above. The meridiem the sheet
leaves off is read the way the campus writes it — 1:15 is afternoon, 8:00 is
the 8–10 PM block, 8:45 is morning — using the same rule as the time-schedule
import. Summer is ignored: it is staffed before the year is planned and the
survey does not ask about it. Rows under the sections (notes, the summary
block, a stray remark typed into a course column) are not sections, because a
section's label has to parse *as a whole cell* and carry a load.

**Reading the survey, and admitting what it could not read.** A Google Form
answer is a paragraph: "343, 342, 385, 422. Ideally: Autumn 2 x 342
(back-to-back if possible), 1 x 343; Winter 2 x 343, 1 x 342". `text.ts`
recognises the shapes these answers actually take — course numbers in their
dozen spellings, quarter names with or without years (last year's are
ignored), day patterns, clock times with half a meridiem, and a short list of
words that turn a time into a constraint ("cannot", "very difficult", "prefer
not", "the latest I can teach is") — and `prefs.ts` assembles each response
into a load, ranked courses with the quarter/count/time said about each, a
prefer-not list and time rules. Every function is tested against the real
phrasings.

What it is unsure of becomes a review note rather than a guess applied quietly.
The load comes from the coordinator's own "# of courses" column: "8 for now
(possibly 1 ISS & possibly leave all quarters)" plans for 8 and says why it
might change; a possible ISS release, sabbatical or buy-out is noted, never
subtracted. A definite answer is applied: a service release "in Aut'26" lowers
that quarter's maximum, "keep my winter quarter free" empties it, "no graduate
classes" rules out the 500s.

**The parser only has to be right most of the time.** The output carries an
`FT preferences` sheet (and `PT preferences`) with every reading in plain
columns — load, three quarter maximums, pinned courses, ranked courses, "also
OK", prefer-not, quarter and time wishes in a small notation, time rules in
words ("no 8:00 PM-midnight; prefer not starting before 1:15 PM"). Correct a
cell, upload the workbook again, and the sheet is read instead of the survey.
Being wrong costs one edit rather than a re-run that makes the same mistake
again. The notation reads back exactly what it wrote; `prefs.test.ts` asserts
that round trip, and caught the one place it did not (a single weekday written
as a bare "W").

**What it optimises, in order.** Load, then preferences, then tidiness:

1. Nobody over their load, nobody in two places at once, nobody in a quarter
   they are away or have filled, nothing against a hard constraint. These are
   refusals, not costs.
2. As close to everyone's load as the schedule allows, with a shortfall
   *shared* — the deficit is penalised by its square, so two people one course
   short beats one person two short.
3. The coordinator's pinned courses ("3: 502, 584, 343" in the load column)
   first, then each person's higher-ranked courses, in the quarter and at the
   time they named. Naming quarters for a course ("497 (Autumn, Winter and
   Spring)") means one section in each, not as many as will fit.
4. Fewer preparations, days kept together for those who asked, reserved
   sections ("reserved, assign if needed") used last because they may not run.

**How it searches.** A regret-ordered greedy start — whoever would lose most by
waiting chooses first — then moves a person would make with the sheet open:
take something free, trade one section for a better free one or for two
smaller ones, take a section a colleague holds while the colleague takes
something free instead, swap one each. Single moves could not get one faculty
member from "112, 142, 143 in Autumn" to the timetable they had written out
("112, 142 and the SKL123 lab, with 143 moved to Winter"): that is two out and
three in. So each person's whole set is also re-chosen by a bounded branch and
bound over their own options with everyone else held still (`repack`). On the
real year the whole run takes under a second.

A course's own lab ("427 Lab") is placed with its lecture as one piece, and a
skills lab that meets *with* its lecture (Winter's 123A at 1:15 M/W and SKL123A
at 1:15 W) is one class, not a clash. Skills labs that meet on their own
(CSSSKL 142 on Fridays) are their own assignments: one full-time response laid
out an exact load of eight without the lab of the 142 it asked for.

**Every name has a reason, and every gap has an explanation.** The
`Assignments` sheet gives each proposal's reasons ("#1 of their most-wanted;
asked for it in Win; at 11:00 AM, as asked"), its caveats ("reserved section:
may not run"), and who else asked for it — the contested calls are the ones a
coordinator wants to see, and "also wanted by F8 (#1)" beside a section given
to someone's second choice is the whole argument for looking. `Open sections`
lists, for every section left, which full-time faculty asked for it and why
they did not get it, and which part-time instructors asked for it and are free
at that hour. `Faculty load` and `By faculty` are the per-person views.

**Part-time is a draft, by request.** The coordinator said part-time could wait:
their caps depend on title, per quarter, per six-month window and per year, and
the survey does not carry them. So by default the part-time survey is only
*read* — to say who could take each open section — and "Also place part-time
instructors" fills what is left within the number of courses each asked for per
quarter, plus a two-quarter cap and a year cap that the `PT preferences` sheet
has columns for, for her to fill in from their titles.

**What it will not do.** It does not invent a load, apply a release that is not
decided, move a name that is not purple, place anyone in a course they did not
list, or put a skills lab with a lecture it does not meet with. It does not
write to the database: turning the result into a scenario on the board is the
import this app already has.

**Checked.** Unit tests for every module, including a property test that runs
the engine over 25 random years and asserts no overload, no double booking and
no broken hard rule. `run.real.test.ts` runs against the actual AY 2026-27
workbooks when `AUTOFILL_REAL_DIR` points at them — they are not in the
repository and must not be — and pins what the first run was checked for by
hand, person by person: every rule held, 143 of 144 full-time load placed, the
one shortfall (a Winter service release where most of that person's courses
are), and the three most specific requests getting exactly what they wrote.
The page and its results are two scenes in `npm run check:mobile`, and the
route is in `npm run check:routes`.

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
one official per year, delete), seeding a scenario from a past year's schedule
or importing a quarter from a pasted time schedule,
section CRUD against all three timing shapes, ranked tap-to-assign, dragging
as an accelerator over the top of it, the live conflict panel and
per-instructor load tallies. Undo — of an assignment, a move, a burst of them,
or a section added, edited or removed — arrived with the change log; see
above.

**4 — Reporting (done).** How well preferences were met, CSV export of the
schedule, the report and the comparison, a print stylesheet, side-by-side
scenario comparison, and a change log written by database triggers. The report
and the comparison share one `ExportBar`, so the file lands with the same
naming and the same confirmation from either page, and each carries a
print-only date stamp — a printout with no date on it cannot be told from last
week's.

**5 — Done.** Solver-assisted suggestions for unfilled sections,
student-facing conflict checks, and importing a quarter from a pasted UW time
schedule — see **Importing a quarter** below.

**6 — Excel in, Excel out (done).** The year-at-a-glance workbook and the
two preference surveys go in, the workbook comes back with full-time faculty
proposed — see **Excel auto-fill** above.

**Polish.** Undo, one voice for feedback, focus management, tables as cards,
code splitting, dragging, print output, dark mode and an installable,
offline-capable app are done — see **Installing it** below.

## Installing it

The coordinator does this work on a phone, often in a room where the wifi is
somebody else's. So the app is installable — a manifest, a set of icons, and a
service worker — and the decisions below are all about the one property that
makes a service worker different from every other file here: it keeps running
after it is wrong, and it can keep serving itself.

**The rules live in `src/lib/swStrategy.ts`, not in the worker.** Pure
functions, tested without a browser, for what a request is worth doing about.
`src/sw.ts` is the wiring only. A service worker bug cannot be reproduced by
reloading, so anything expressed as behaviour rather than as a rule would be
untestable in practice.

**Nothing that leaves this origin is cached, ever.** Every request to Supabase
— sessions, preferences, the board — passes straight through. There is no
version of "a bit of caching" for data whose visibility is decided per caller
by row-level security: a cache key is a URL, and a URL cannot express "the rows
this person is allowed to see". The check asserts the cache holds nothing from
another origin, and that a request to the database *fails* when the network is
gone rather than being answered from somewhere.

**One cache per build, named by the build.** The precache list is worked out
from the bundle itself, and every filename in it contains the hash of its own
contents, so the list changes exactly when the shell does. Naming the cache
after the hash of that list makes a mixed cache impossible: a version's shell
and its chunks arrive together and are deleted together. The alternative — one
long-lived cache updated in place — has to reason about an `index.html` from
today asking for a chunk from last Tuesday.

**The shell, the dashboard and the board are precached; every other page is
cached when it is first opened.** Precaching all fourteen pages would download
the whole app to everyone on every deploy, which is the cost the chunk split
was made to avoid. Precaching only the shell would leave the board — the page
this app exists for, and the one most likely to be opened on bad wifi — a
network request away. A page that has been opened once works offline from then
on; one that never has shows the chunk-failure notice, which already says the
right thing about a dropped connection.

**A navigation asks the network first.** A deploy has to be able to reach
somebody who has the app open. The cached document is what a dead connection
gets instead of the browser's error page, not the first thing tried.

**A new version waits, and is offered.** `skipWaiting()` on install swaps the
worker under an open tab, so the next chunk that tab asks for is a filename the
new build never had — in the middle of assigning an instructor. So the new
worker installs and waits; the app offers a reload through the same toast
system as everything else, with the one action button in the app; and the
reload is driven by `controllerchange` rather than by the tap, because
reloading before the swap completes lands on the old version and looks exactly
like an update that does not work. A tab left open also asks every half hour
whether a new version has shipped, since all of this app's navigations are
client-side and the browser would otherwise never check.

**The failure mode that is never acceptable is the silent one.** An app that
installs, goes offline and cannot update itself is worse than one that was
never installable, because every future fix is invisible to the person using
it. `npm run check:pwa` drives that whole path — a second version appearing on
the server, the offer, the wait, the swap, the old cache going — and the
offline assertions had to be rewritten once when it turned out that
Playwright's offline mode does not apply to a service worker's own fetches, so
they were passing against a worker that had cached nothing at all.

### Saying that the connection is gone

Being installable and offline-capable created a failure the app did not have
before it, and it is the worst kind: a change that looks saved and is not.

The mechanism is React Query's default `networkMode: 'online'`. A mutation
started while the browser reports itself offline is **paused**, not failed.
`onMutate` runs, so the board's optimistic pill appears; `mutationFn` does not,
so nothing reaches Supabase; the mutation sits in the cache marked `isPaused`
until the connection returns, and then goes through. That behaviour is right —
nothing is lost, and the coordinator does not have to redo the work — but it is
completely invisible. A coordinator in a building with no signal could assign
six instructors, see six pills, and put the phone away. The
`src/lib/online.test.ts` case named "pauses a mutation with its optimistic
update applied, and runs nothing" pins that behaviour, because the banner's
promise is a lie if it ever changes.

So:

- **A banner, not a toast.** Toasts in this app are events and they expire.
  Being offline is a condition that lasts as long as it lasts, and somebody who
  arrives at the board thirty seconds after the signal dropped still needs to be
  told. The banner (`src/components/OfflineBanner.tsx`) is rendered from state
  and is on screen for exactly as long as the state holds. In the flow, below
  the nav and above the page, rather than fixed: on a 375px screen a fixed
  banner covers either the nav or the first row of the board.
- **It counts what is waiting.** "Offline — 2 changes waiting to save. Nothing
  is lost; they go through when the connection comes back." The count comes from
  the mutation cache (`useMutationState`, filtered on `isPaused`) rather than
  from a counter of the app's own, which would drift the moment React Query
  resumed one. With nothing queued the wording promises less, because nothing
  has been risked yet.
- **Coming back is worth four seconds and then silence.** `nextConnection` is a
  three-state machine — `online`, `offline`, `restored` — and the third exists
  only so that recovery can be acknowledged and then stop being mentioned. An
  `online` event that follows no outage is ignored: browsers fire it on waking
  from sleep and on changing access point, and a green banner on a connection
  that never dropped teaches people to ignore the amber one.
- **It is driven by React Query's `onlineManager`, not by `window`.** The
  manager is what actually decides whether a mutation runs or pauses. A banner
  driven off `window`'s events directly could say the connection was back while
  React Query still held every write.
- **The other half has no event at all.** A hotel portal or a half-associated
  access point leaves `navigator.onLine` true, the request is attempted, and it
  dies. There the app has an exception rather than a state, and what it must not
  do is show the coordinator the browser's words for it. `isOfflineError`
  recognises each browser's wording — matched on the message, because by the
  time one of these reaches the app postgrest-js has flattened it to a plain
  object and this app has rethrown it as `new Error(error.message)` — and
  `failureText` translates it. Anything uncertain is treated as a real failure:
  dressing a genuine RLS refusal up as a connection problem would send somebody
  to check their signal over a broken policy.
- **No dismiss button.** The state is not the coordinator's to dismiss, and a
  banner they had already closed would have to reappear unbidden the next time a
  write queued up.
- **The live region is always in the document, empty.** A region that appears at
  the same moment as its text is, in several screen readers, a region that is
  never announced — nothing about it changed. This is why `[role="status"]`
  matches more than one element on every page, which `scripts/pwa_check.mjs` had
  to be taught.

Checked in a real browser rather than believed: `npm run check:routes` drops the
connection with `context.setOffline(true)` and asserts the banner arrives on both
sides of the sign-in, sits between the header and the page, is not fixed, does
not overflow 375px, and goes away on its own when the signal returns. That is
the only assertion in the repository that covers the wiring between
`src/lib/online.ts` and the browser; everything above it is pure and tested in
`src/lib/online.test.ts`.

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

## Importing a quarter

The coordinator already has the schedule. It is on a web page, published by the
registrar, and typing eighty sections of it back into this app by hand is the
work the app exists to remove. So the board takes a paste: copy the CSS listing
out of the time schedule, drop it into the import sheet, and the quarter arrives
as a draft to edit.

**The parser does not count characters.** The published schedule is fixed-width
text inside a `<pre>`, and every instinct says to read it by column. A paste
does not preserve columns — a phone paste especially, and a copy out of a PDF
collapses runs of spaces on its own. `src/lib/timeSchedule.ts` recognises each
field by its own shape instead, and claims them in the order UW writes them: the
five-digit SLN, then the letter, then the type, credits, days, time, room,
instructor, status, enrolment. A line whose columns have collapsed to single
spaces parses identically to one that has not.

**One field is taken by position on purpose.** `F` is both a valid section
letter and Friday, and nothing but its place after the SLN tells the two apart.
Everything else is recognised by shape, and the exception is commented where it
happens.

**The meridiem is institutional knowledge, not string parsing.** UW writes
`1100-100` for an eleven o'clock class that ends at one. The two halves of one
range get different meridiems, which no general time parser would do. The rule —
a trailing `P` carries the whole range, otherwise hours 8 to 11 are morning and
everything else is afternoon — is ported from `scripts/generate_seed.py`, which
is what read the three real schedules in the first place. It is the one part of
the parser that cannot be derived from the text, and it is tested against all
six blocks of the real grid.

**An import resolves into `HistoryRow`, then goes through the seed planner.**
This is the reason the two features share a shape. `planFromHistory` already
knows how to match a meeting against the standard grid, keep an off-grid time as
a custom one, merge a co-taught section rather than inserting it twice, resolve
a room label, and respect the unique key on `(term, course, letter)`. Writing
any of that a second time for the import would be writing a second chance to get
it wrong. The import adds one thing the planner needed: `existingKeys`, so that
importing into a quarter that already holds sections reports the collisions as
skipped instead of failing the whole insert on the first one.

**A name that could mean two people matches neither.** `matchInstructor` tries
the full surname and given name, then a shortened given name (`Steve` for
`Stephen`), then a surname on its own — and at each step a tie is not a match.
Silently picking one of two Wangs would put a section on the wrong person's load
and look exactly like a correct import. An unmatched name is reported by name,
and the section still lands, unstaffed, for the coordinator to assign.

**Nothing is written until the sheet is confirmed.** The summary, the unmatched
names and the lines that could not be imported all recompute as the text
changes, so a paste of the wrong quarter, or of half a page, is visible before
anything reaches the database rather than afterwards.

**What it will not do.** It does not invent instructors: a name the roster does
not hold stays unstaffed rather than creating a row nobody reviewed. It does not
invent courses: `CSS 999` is reported and left out. Quiz and lab rows are named
and skipped, because this app schedules the lecture sections that carry the
teaching load. A section that meets twice keeps its first meeting and says so —
the schema holds one meeting per section, and halving one quietly would be the
worst of the three options.

**Checked against the real thing, twice, and the second one matters more.**
`src/lib/timeSchedule.real.test.ts` writes all 240 rows of
`scripts/data/history_sections.csv` back out in published layout and requires
the parser to recover every field of every one. It is a round trip, so it cannot
prove the layout is faithful — it can only prove the parser reads back what this
repo already extracted.

`src/lib/timeSchedule.aut2026.test.ts` is the other half: the **Autumn 2026 CSS
listing as published**, supplied by the coordinator (the schedule is behind a
NetID now, so nobody else could), and supplied *twice* — as
`past-course-schedules/aut2026.pdf` and as the web page itself,
`past-course-schedules/aut2026.html`, rendered to
`scripts/data/aut2026_timeschedule.txt` and
`scripts/data/aut2026_timeschedule_web.txt`.

Two renderings of one quarter is not redundancy. The page is HTML 4 with
unclosed `<pre>` tags and `&nbsp;` inside its headings, and its course notes
wrap in different places — which is precisely where the bugs were. Both must
parse to the same 75 sections, field for field, and that equality is the
strongest assertion in the file: a parser that depends on how the page was
copied is one that will fail on somebody's phone. 75 sections, nothing ignored,
74 rows ready to import — and between them they found three bugs the round trip
could not, because it synthesises tidy headings and never writes a note at all:

- **A wrapped sentence read as a course heading.** Course notes are prose. One
  wrapped so a line began `OF CSS 112,`, the subject pattern accepted any two
  short words, and the two CSS 142 sections printed under that note were filed
  against a course called "OF CSS 112" — which no catalogue holds, so the import
  dropped them. A subject is now one code word, or a campus letter and a code
  word, which is all UW uses.
- **The same note, copied from the web page, broke it a second way.** The page
  wraps elsewhere than the PDF and leaves a line that is nothing but `OR 142` —
  two capitals and three digits, directly above CSS 142's sections, so all four
  of them and two of CSS 143's went to a subject called "OR". The rule that
  covers both is the one the format follows: **a heading names its course.**
  Every published heading carries a title, because the title is a link to the
  catalogue. A code and a number with nothing after them is prose that wrapped,
  and the sections below it are now reported as having no heading rather than
  filed under a conjunction. What this still would not catch is a note wrapping
  to `OR 142 REQUIRED`; nothing in either listing does, and `resolveImport` is a
  second net, since a phantom course is not in the catalogue and its sections
  are named and dropped where the coordinator can see them.
- **A person called "to be arranged".** The phrase sits in the meeting-times
  column of every independent study. The parser noticed it — it already refused
  to read a day pattern from it — but never consumed the words, so they fell
  through the room reader and into the instructor reader, which takes everything
  up to the status column. Six sections came back taught by "to be arranged",
  and one by "to be arranged * *".

*A round trip over data you extracted yourself cannot find the thing your
extraction removed.* Both bugs were in code with tests over real rows, and both
needed one real page that nobody in this project had ever parsed.
