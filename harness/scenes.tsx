/**
 * Scenes for the mobile check: every component this app renders over the page,
 * with fixture data and no network at all.
 *
 * The point is that `scripts/mobile_check.mjs` can put each one on a 375px
 * screen and assert the things the coordinator would notice — nothing scrolling
 * sideways, nothing too small to tap, nothing shouting in the console. Three
 * runs in a row rebuilt this scaffolding from scratch in a temporary directory
 * and threw it away; it belongs in the repository.
 *
 * It is not shipped: `harness/` has its own Vite entry and is never imported by
 * `src/main.tsx`.
 */
import { useEffect, useState } from "react";
import type {
  Conflict,
  Instructor,
  Preferences,
  ScheduleSnapshot,
  Section,
} from "../src/lib/conflicts";
import { countBySeverity, detectConflicts } from "../src/lib/conflicts";
import AssignSheet from "../src/components/board/AssignSheet";
import SectionCard from "../src/components/board/SectionCard";
import LoadPanel from "../src/components/board/LoadPanel";
import DragPill from "../src/components/board/DragPill";
import {
  describeDrop,
  dragAnnouncement,
  dropHints,
  parseDragId,
  parseDropId,
  planDrop,
  type DragSource,
} from "../src/lib/dnd";
import {
  boardCollisionDetection,
  useBoardSensors,
} from "../src/components/board/dragSetup";
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { loadTallies } from "../src/lib/snapshot";
import SectionEditor, {
  type SectionFormValue,
} from "../src/components/board/SectionEditor";
import SuggestSheet from "../src/components/board/SuggestSheet";
import ImportSheet from "../src/components/board/ImportSheet";
import ConflictPanel from "../src/components/board/ConflictPanel";
import ExportBar from "../src/components/ExportBar";
import PrintStamp from "../src/components/PrintStamp";
import { Side as ComparisonSide } from "../src/pages/Compare";
import { compareScenarios } from "../src/lib/report";
import RouteFallback from "../src/components/RouteFallback";
import RouteErrorNotice from "../src/components/RouteErrorNotice";
import Dialog from "../src/components/Dialog";
import ThemeToggle from "../src/components/ThemeToggle";
import { useTheme } from "../src/hooks/useTheme";
import { ChipGroup, Section as Card, TriState } from "../src/components/Chips";
import { useToast, useToastInset } from "../src/components/Toast";
import type { SuggestionResult } from "../src/lib/suggest";
import type { TimeSlotRow } from "../src/lib/snapshot";
import DataTable from "../src/components/DataTable";
import Toolbar, { FIELD, SEARCH_FIELD, Toggle } from "../src/components/Toolbar";
import { courseColumns } from "../src/pages/Courses";
import { historyColumns } from "../src/pages/History";
import { instructorColumns } from "../src/pages/Instructors";
import { responseColumns } from "../src/pages/Responses";
import {
  accessEventColumns,
  accessSummaryColumns,
} from "../src/pages/AccessLog";
import type {
  AccessLogRow,
  AccessSummaryRow,
  CourseRow,
  HistoryRow,
  InstructorRow,
  LoadTarget,
} from "../src/hooks/queries";
import type { ResponseRow } from "../src/hooks/preferences";

const MW = { days: [1, 3], start: "08:45", end: "10:45" };
const TTH = { days: [2, 4], start: "13:15", end: "15:15" };

const sec = (over: Partial<Section> = {}): Section => ({
  id: "s1",
  termId: "au",
  courseId: "c143",
  courseCode: "CSS 143",
  sectionLetter: "A",
  meeting: MW,
  modality: "in_person",
  roomId: null,
  instructorIds: [],
  ...over,
});

const inst = (
  id: string,
  name: string,
  over: Partial<Instructor> = {},
): Instructor => ({
  id,
  name,
  annualTarget: 6,
  maxPerQuarter: 3,
  ...over,
});

const prefs = (
  instructorId: string,
  over: Partial<Preferences> = {},
): Preferences => ({
  instructorId,
  unavailableTermIds: [],
  desiredCountByTerm: {},
  courseTier: {},
  blockedDays: [],
  modalityPrefs: [],
  maxNewPreps: null,
  ...over,
});

/** Long names and a full roster, because that is what overflows. */
const SNAPSHOT: ScheduleSnapshot = {
  terms: [
    { id: "au", quarter: "autumn", label: "Autumn 2026" },
    { id: "wi", quarter: "winter", label: "Winter 2027" },
  ],
  sections: [
    sec({ id: "s1", instructorIds: ["i1"] }),
    sec({
      id: "s2",
      sectionLetter: "B",
      meeting: TTH,
      instructorIds: ["i1", "i2"],
    }),
    sec({
      id: "s3",
      courseId: "c342",
      courseCode: "CSS 342",
      meeting: MW,
      instructorIds: ["i1"],
    }),
    sec({
      id: "s4",
      courseId: "c430",
      courseCode: "CSS 430",
      meeting: null,
      instructorIds: [],
    }),
    sec({
      id: "s5",
      courseId: "c449",
      courseCode: "CSS 449",
      termId: "wi",
      instructorIds: [],
    }),
  ],
  instructors: [
    inst("i1", "Wolfgang Amadeus Featherstonehaugh"),
    inst("i2", "Bo Li"),
    inst("i3", "Mina Abdelrahman-Tsai", {
      annualTarget: null,
      maxPerQuarter: null,
    }),
    inst("i4", "Jae Park"),
  ],
  preferences: {
    i1: prefs("i1", {
      courseTier: { c143: "eager", c342: "reluctant" },
      blockedDays: [3],
    }),
    i2: prefs("i2", {
      courseTier: { c143: "unqualified" },
      unavailableTermIds: ["wi"],
    }),
    i4: prefs("i4", { courseTier: { c430: "willing" }, maxNewPreps: 1 }),
  },
  taughtBefore: { i1: new Set(["c143"]), i2: new Set(["c342"]) },
};

const CONFLICTS: Conflict[] = detectConflicts(SNAPSHOT);

/*
 * Two drafts of the same year, with the longest plausible names on them: the
 * comparison page puts these side by side on a wide screen and stacks them on
 * a phone, and the name is the part that overflows.
 */
const COMPARISON = compareScenarios(
  {
    label: "First pass, before the releases came in",
    snapshot: SNAPSHOT,
    errors: 1,
    warnings: 3,
  },
  {
    label: "Alternative with Featherstonehaugh on leave",
    snapshot: {
      ...SNAPSHOT,
      sections: SNAPSHOT.sections.map((x) => ({
        ...x,
        instructorIds: x.instructorIds.filter((i) => i !== "i1"),
      })),
    },
    errors: 0,
    warnings: 5,
  },
);

const TIME_SLOTS: TimeSlotRow[] = [
  {
    id: "t1",
    label: "MW 8:45–10:45",
    day_pattern: "MW",
    days: [1, 3],
    start_time: "08:45:00",
    end_time: "10:45:00",
    is_standard: true,
    sort_order: 1,
    is_active: true,
  },
  {
    id: "t2",
    label: "TTh 1:15–3:15",
    day_pattern: "TTh",
    days: [2, 4],
    start_time: "13:15:00",
    end_time: "15:15:00",
    is_standard: true,
    sort_order: 2,
    is_active: true,
  },
];

const EDITOR_VALUE: SectionFormValue = {
  id: "s1",
  term_id: "au",
  course_id: "c143",
  section_letter: "A",
  timing: "grid",
  time_slot_id: "t1",
  custom_days: [],
  custom_start: "",
  custom_end: "",
  modality: "in_person",
  room_id: null,
  enrollment_cap: "60",
  notes: "",
};

const SUGGESTIONS: SuggestionResult = {
  suggestions: [
    {
      sectionId: "s4",
      sectionLabel: "CSS 430 A",
      termId: "au",
      instructorId: "i4",
      instructorName: "Jae Park",
      warnings: ["a new preparation for them"],
    },
    {
      sectionId: "s5",
      sectionLabel: "CSS 449 A",
      termId: "wi",
      instructorId: "i3",
      instructorName: "Mina Abdelrahman-Tsai",
      warnings: [],
    },
  ],
  unfillable: [
    {
      sectionId: "s6",
      sectionLabel: "CSS 587 A",
      reason: "nobody available is qualified to teach it",
    },
  ],
};

function ToastScene({ inset }: { inset: boolean }) {
  const toast = useToast();
  useToastInset(inset ? 76 : 0);
  return (
    <div className="space-y-3 p-4">
      <h1 className="text-xl font-semibold text-slate-900">Toasts</h1>
      <button
        data-seed
        type="button"
        onClick={() => {
          toast.say(
            "Opening your print dialog — the controls are left off the page.",
          );
          toast.ok("Saved first-pass-schedule.csv to your downloads.");
          toast.fail(
            'Could not assign: new row violates row-level security policy for table "assignments".',
          );
        }}
        className="flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 text-sm"
      >
        Show three messages
      </button>
      {inset && (
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-surface/95 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3">
            <button className="ml-auto flex min-h-11 items-center rounded-md border border-slate-300 px-4 text-sm">
              Save draft
            </button>
            <button style={{ background: "var(--uw-purple)" }}
              className="flex min-h-11 items-center rounded-md px-4 text-sm text-white">
              Submit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DialogScene() {
  const [open, setOpen] = useState(true);
  return (
    <div className="p-4">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 text-sm"
      >
        Open
      </button>
      {open && (
        <Dialog
          label="A dialog with several controls"
          onClose={() => setOpen(false)}
          className="max-h-[90vh] max-w-lg overflow-y-auto rounded-t-xl p-5 sm:rounded-xl sm:p-6"
        >
          <>
            <h2 className="text-lg font-semibold text-slate-900">
              Focus goes in here
            </h2>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              First field
              <input className="mt-1 block min-h-11 w-full rounded-md border border-slate-300 px-2" />
            </label>
            <label className="mt-3 block text-sm font-medium text-slate-700">
              Second field
              <select className="mt-1 block min-h-11 w-full rounded-md border border-slate-300 px-2">
                <option>One</option>
              </select>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center rounded-md border border-slate-300 px-4 text-sm"
              >
                Cancel
              </button>
              <button style={{ background: "var(--uw-purple)" }}
              className="flex min-h-11 items-center rounded-md px-4 text-sm text-white">
                Save
              </button>
            </div>
          </>
        </Dialog>
      )}
    </div>
  );
}

function ChipScene() {
  const [days, setDays] = useState<number[]>([1, 3]);
  const [tri, setTri] = useState<boolean | null>(null);
  return (
    <div className="space-y-4 p-4">
      <Card title="Days you would rather teach" hint="Tap to add or remove.">
        <ChipGroup
          options={[
            { value: 1, label: "Monday" },
            { value: 2, label: "Tuesday" },
            { value: 3, label: "Wednesday" },
            { value: 4, label: "Thursday" },
            { value: 5, label: "Friday" },
          ]}
          selected={days}
          onChange={setDays}
        />
      </Card>
      <Card title="Would you rather repeat a preparation?">
        <TriState value={tri} onChange={setTri} />
      </Card>
    </div>
  );
}

/**
 * Wraps a sheet so closing it really unmounts it. Without this the check's
 * Escape assertion is meaningless — a sheet handed an onClose that does
 * nothing looks exactly like a sheet that ignores Escape.
 */
/**
 * A paste, typed in for real.
 *
 * `ImportSheet` keeps the pasted text in its own state, which is right for the
 * app and awkward for a scene: the interesting layout is the *filled* sheet —
 * the summary, the three disclosure lists, the long unimportable lines that are
 * the most likely thing to push the page sideways. So the harness pastes the
 * way a person does, through the field, using React's own change path: the
 * native value setter plus an `input` event is what a real paste dispatches.
 *
 * Harness-only. Nothing in `src/` knows this exists.
 */
function Pasted({ text, children }: { text: string; children: JSX.Element }) {
  useEffect(() => {
    const field = document.querySelector("textarea");
    if (!field) return;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }, [text]);
  return children;
}

function Closeable({ render }: { render: (close: () => void) => JSX.Element }) {
  const [open, setOpen] = useState(true);
  if (!open)
    return (
      <p className="p-4 text-sm text-slate-600" data-closed>
        Closed.
      </p>
    );
  return render(() => setOpen(false));
}

/* ---------------------------------------------------------------------- *
 * The five list pages.
 *
 * These scenes import the real column definitions from the pages, not copies
 * of them, so a column added to a page without a thought for the phone shows
 * up here as a failure. The rows are fixtures chosen to be awkward: the
 * longest course title in the catalog, a name that will not break, an absent
 * room, a prerequisite paragraph.
 * ---------------------------------------------------------------------- */

const COURSES: CourseRow[] = [
  {
    id: "c143",
    code: "CSS 143",
    number: 143,
    title: "Computer Programming II",
    credits_min: 5,
    credits_max: 5,
    level: "undergraduate",
    prereq_text:
      "Minimum grade of 2.0 in CSS 142; may not be repeated. Offered jointly with CSE 143.",
    is_active: true,
  },
  {
    id: "c497",
    code: "CSS 497",
    number: 497,
    title:
      "Computing and Software Systems Undergraduate Capstone Project Preparation Seminar",
    credits_min: 1,
    credits_max: 5,
    level: "undergraduate",
    prereq_text: null,
    is_active: true,
  },
];

const HISTORY: HistoryRow[] = [
  {
    id: "h1",
    instructor_name_raw: "Wolfgang Amadeus Featherstonehaugh",
    course_code_raw: "CSS 342",
    academic_year: "2025-26",
    quarter: "autumn",
    section_letter: "A",
    days: [1, 3],
    start_time: "08:45:00",
    end_time: "10:45:00",
    room_label: "DISC 061",
    enrollment: 58,
    enrollment_cap: 60,
  },
  {
    id: "h2",
    instructor_name_raw: "Bo Li",
    course_code_raw: "CSS 497",
    academic_year: "2025-26",
    quarter: "spring",
    section_letter: null,
    days: null,
    start_time: null,
    end_time: null,
    room_label: null,
    enrollment: null,
    enrollment_cap: null,
  },
];

const INSTRUCTOR_ROWS: InstructorRow[] = [
  {
    id: "i1",
    full_name: "Wolfgang Amadeus Featherstonehaugh",
    email: "wolfgang@uw.edu",
    rank: "Associate Teaching Professor",
    category: "full_time",
    is_active: true,
    base_annual_courses: 8,
    max_courses_per_quarter: 3,
  },
  {
    id: "i3",
    full_name: "Mina Abdelrahman-Tsai",
    email: null,
    rank: null,
    category: "affiliate",
    is_active: true,
    base_annual_courses: null,
    max_courses_per_quarter: null,
  },
];

const LOAD_BY = new Map<string, LoadTarget>([
  [
    "i1",
    {
      instructor_id: "i1",
      full_name: "Wolfgang Amadeus Featherstonehaugh",
      category: "full_time",
      academic_year_id: "y1",
      academic_year: "2026-27",
      base_annual_courses: 8,
      released_courses: 2,
      effective_target: 6,
    },
  ],
]);

const RESPONSES: ResponseRow[] = [
  {
    instructor_id: "i1",
    full_name: "Wolfgang Amadeus Featherstonehaugh",
    email: "wolfgang@uw.edu",
    category: "full_time",
    status: "submitted",
    submitted_at: "2026-04-02T18:20:00Z",
    course_count: 14,
  },
  {
    instructor_id: "i3",
    full_name: "Mina Abdelrahman-Tsai",
    email: null,
    category: "affiliate",
    status: "not_started",
    submitted_at: null,
    course_count: 0,
  },
];

const ACCESS_SUMMARY: AccessSummaryRow[] = [
  {
    email: "wolfgang.featherstonehaugh@uw.edu",
    full_name: "Wolfgang Amadeus Featherstonehaugh",
    role: "coordinator",
    first_seen: "2026-02-11T16:04:00Z",
    last_seen: new Date(Date.now() - 42 * 60000).toISOString(),
    visits: 37,
  },
  {
    email: "bo@uw.edu",
    full_name: null,
    role: null,
    first_seen: "2026-03-01T09:00:00Z",
    last_seen: "2026-03-01T09:00:00Z",
    visits: 1,
  },
];

const ACCESS_EVENTS: AccessLogRow[] = [
  {
    id: 91,
    email: "wolfgang.featherstonehaugh@uw.edu",
    event: "sign_in",
    provider: "azure",
    occurred_at: "2026-09-26T08:02:00Z",
    user_id: "u1",
  },
  {
    id: 90,
    email: "someone.who.left@uw.edu",
    event: "sign_up",
    provider: null,
    occurred_at: "2026-09-01T12:00:00Z",
    user_id: null,
  },
];

/** The toolbar with every kind of control the five pages put in one. */
function ToolbarScene() {
  const [on, setOn] = useState(false);
  const [q, setQ] = useState("");
  return (
    <div className="p-4">
      <Toolbar title="Teaching history" count="1,284 sections">
        <select aria-label="Quarter" className={FIELD}>
          <option>All quarters</option>
          <option>Autumn</option>
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Filter history by course or instructor"
          placeholder="Filter by course or instructor…"
          className={SEARCH_FIELD}
        />
        <Toggle pressed={on} onChange={setOn}>
          Include inactive
        </Toggle>
      </Toolbar>
      <p className="text-sm text-slate-600">
        The table goes here.
      </p>
    </div>
  );
}

/**
 * A working board in miniature: the real sensors, the real collision
 * detection, the real drop rules, wired the way `src/pages/Board.tsx` wires
 * them and with the mutations replaced by a list of what would have happened.
 *
 * This is the scene `scripts/drag_check.mjs` drives with an actual mouse and
 * an actual finger. Everything about a drop is pure and unit-tested; whether a
 * gesture *becomes* a drop is not, and cannot be, without a pointer. It is
 * also where the promise that matters is kept or broken: that a tap still taps
 * and a scroll still scrolls.
 */
function DragSandbox() {
  const sensors = useBoardSensors();
  const [dragging, setDragging] = useState<DragSource | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [sections, setSections] = useState(SNAPSHOT.sections);
  const snap = { ...SNAPSHOT, sections };

  const record = (line: string) => setLog((l) => [...l, line]);

  const onDragStart = (e: DragStartEvent) => {
    setDragging(parseDragId(e.active.id));
    setOverId(null);
    record(dragAnnouncement(snap, "start", e.active.id, null) ?? "start?");
  };
  const onDragOver = (e: DragOverEvent) =>
    setOverId(parseDropId(e.over?.id ?? null));
  const onDragEnd = (e: DragEndEvent) => {
    const source = parseDragId(e.active.id);
    const target = parseDropId(e.over?.id ?? null);
    const hint = target ? (hintsFor(snap, dragging)?.get(target) ?? null) : null;
    setDragging(null);
    setOverId(null);
    if (!source) return;
    const plan = planDrop(snap, source, target);
    record(`${plan.type}: ${describeDrop(snap, plan, hint) ?? "(nothing)"}`);
    if (plan.type === "assign" || plan.type === "move") {
      const from = plan.type === "move" ? plan.from : null;
      setSections((prev) =>
        prev.map((s) => {
          if (s.id === from)
            return {
              ...s,
              instructorIds: s.instructorIds.filter(
                (i) => i !== plan.instructorId,
              ),
            };
          const to = plan.type === "assign" ? plan.sectionId : plan.to;
          if (s.id === to)
            return { ...s, instructorIds: [...s.instructorIds, plan.instructorId] };
          return s;
        }),
      );
    }
  };

  const hints = hintsFor(snap, dragging);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={boardCollisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDragging(null);
        setOverId(null);
        record("cancelled");
      }}
    >
      <div className="bg-slate-50 p-4">
        {/* Tall enough that a flick has somewhere to scroll to. */}
        <ul className="space-y-3">
          {sections.map((s) => (
            <SectionCard
              key={s.id}
              section={s}
              instructorNames={s.instructorIds.map((id) => ({
                id,
                name: SNAPSHOT.instructors.find((i) => i.id === id)?.name ?? id,
              }))}
              worst={null}
              conflictCount={0}
              highlighted={false}
              dragEnabled
              hint={hints?.get(s.id) ?? null}
              onAssign={() => record(`assign-tapped: ${s.id}`)}
              onUnassign={(id) => {
                record(`unassign-tapped: ${s.id} ${id}`);
                setSections((prev) =>
                  prev.map((x) =>
                    x.id === s.id
                      ? { ...x, instructorIds: x.instructorIds.filter((i) => i !== id) }
                      : x,
                  ),
                );
              }}
              onEdit={() => record(`edit-tapped: ${s.id}`)}
            />
          ))}
        </ul>
        <div className="mt-4">
          <LoadPanel tallies={loadTallies(snap)} terms={snap.terms} draggable />
        </div>
        {/* Read by the check script rather than by anyone's eyes. */}
        <ol id="drag-log" className="mt-4 text-xs text-slate-600">
          {log.map((line, i) => (
            <li key={i} data-drop={line}>
              {line}
            </li>
          ))}
        </ol>
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <DragPill
            name={
              SNAPSHOT.instructors.find((i) => i.id === dragging.instructorId)
                ?.name ?? "Instructor"
            }
            hint={overId ? (hints?.get(overId) ?? null) : null}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}

const hintsFor = (snap: ScheduleSnapshot, source: DragSource | null) =>
  source ? dropHints(snap, source, snap.sections) : null;

/**
 * The two pieces of the header whose colours do not come from the palette: the
 * theme button, which sits on the purple bar in both themes, and the
 * coordinator badge, which stays gold — and therefore light — in the dark, so
 * its text is the one neutral in the app that must not flip.
 *
 * The bar is reproduced rather than mounting `Layout`, which wants a router and
 * a session; if the header's classes change, change them here too.
 */
function HeaderBits() {
  const theme = useTheme();
  return (
    <div
      style={{ background: "var(--uw-purple)" }}
      className="flex items-center gap-2 px-4 py-2 text-white"
    >
      <span className="text-base font-semibold tracking-tight">CSS Scheduler</span>
      <span
        style={{ background: "var(--uw-gold)" }}
        className="rounded px-1.5 py-0.5 text-xs font-semibold text-slate-950"
      >
        coordinator
      </span>
      <ThemeToggle {...theme} className="ml-auto" />
    </div>
  );
}

/**
 * The one message with something to tap: a new version waiting to be applied.
 * Its own scene because the action button is a touch target and a colour
 * pairing that nothing else in the app has, and both have to survive a 375px
 * screen in either theme.
 */
function UpdateOfferScene() {
  const toast = useToast();
  return (
    <div className="space-y-3 p-4">
      <h1 className="text-xl font-semibold text-slate-900">A waiting update</h1>
      <button
        data-seed
        type="button"
        onClick={() =>
          toast.offer(
            "A new version of the scheduler is ready.",
            "Reload",
            () => {},
          )
        }
        className="flex min-h-11 items-center rounded-md border border-slate-300 bg-surface px-4 text-sm"
      >
        Offer the update
      </button>
    </div>
  );
}

export const SCENES: Record<string, () => JSX.Element> = {
  toasts: () => <ToastScene inset={false} />,
  "toasts-inset": () => <ToastScene inset />,
  "toast-offer": () => <UpdateOfferScene />,
  dialog: () => <DialogScene />,
  chips: () => <ChipScene />,
  "assign-sheet": () => (
    <Closeable
      render={(close) => (
        <AssignSheet
          section={SNAPSHOT.sections[1]!}
          snapshot={SNAPSHOT}
          termLabel="Autumn 2026"
          onPick={() => {}}
          onClose={close}
        />
      )}
    />
  ),
  "section-editor": () => (
    <Closeable
      render={(close) => (
        <SectionEditor
          value={EDITOR_VALUE}
          courses={[
            { id: "c143", code: "CSS 143", title: "Computer Programming II" },
            { id: "c342", code: "CSS 342", title: "Data Structures" },
          ]}
          terms={[
            { id: "au", quarter: "autumn" },
            { id: "wi", quarter: "winter" },
          ]}
          timeSlots={TIME_SLOTS}
          rooms={[{ id: "r1", label: "DISC 061" }]}
          saving={false}
          deleting={false}
          error="That course already has a section A in Autumn 2026. Section B is free."
          onChange={() => {}}
          onSave={() => {}}
          onDelete={() => {}}
          onClose={close}
        />
      )}
    />
  ),
  "suggest-sheet": () => (
    <Closeable
      render={(close) => (
        <SuggestSheet
          result={SUGGESTIONS}
          termLabel={(id) =>
            SNAPSHOT.terms.find((t) => t.id === id)?.label ?? "Quarter"
          }
          applying={false}
          onApply={() => {}}
          onClose={close}
        />
      )}
    />
  ),
  /**
   * The import sheet with a paste in it: a section that resolves, one whose
   * instructor is not on the roster, a course the catalogue does not hold, and
   * a quiz line — so all three disclosure lists are open to measure.
   */
  "import-sheet": () => (
    <Closeable
      render={(close) => (
        <Pasted
          text={[
            "CSS 143 COMPUTER PROGRAMMING II",
            "12890 A 5 MW 115-315 UW1 050 Stride,Jeff Open 30/ 48",
            "12891 B 5 TTh 545-745P UW1 030 Rajanna,Madhu Open 11/ 48",
            "CSS 999 A COURSE THAT IS NOT IN THE CATALOGUE",
            "13100 A 5 MW 845-1045 UW2 131 Nixon,David Open 1/ 20",
            "CSS 342 DATA STRUCTURES",
            "12901 AA QZ F 1030-1120A UW1 041",
          ].join("\n")}
        >
          <ImportSheet
            termLabel="Autumn 2026"
            quarter="autumn"
            courses={[
              { id: "c143", code: "CSS 143", number: 143 },
              { id: "c342", code: "CSS 342", number: 342 },
            ]}
            roster={[
              { id: "i-stride", full_name: "Jeff Stride", is_active: true },
              { id: "i-nixon", full_name: "David Nixon", is_active: true },
            ]}
            timeSlots={TIME_SLOTS.map((t) => ({
              id: t.id,
              days: t.days,
              start_time: t.start_time,
              end_time: t.end_time,
            }))}
            rooms={[{ id: "r050", label: "UW1 050" }]}
            termId="au"
            existingKeys={new Set(["au|c143|A"])}
            academicYear="2026-27"
            applying={false}
            onApply={() => {}}
            onClose={close}
          />
        </Pasted>
      )}
    />
  ),
  toolbar: () => <ToolbarScene />,
  "table-courses": () => (
    <div className="p-4">
      <DataTable<CourseRow>
        rows={COURSES}
        rowKey={(c) => c.id}
        columns={courseColumns}
      />
    </div>
  ),
  "table-history": () => (
    <div className="p-4">
      <DataTable<HistoryRow>
        rows={HISTORY}
        rowKey={(r) => r.id}
        columns={historyColumns}
      />
    </div>
  ),
  "table-instructors": () => (
    <div className="p-4">
      <DataTable<InstructorRow>
        rows={INSTRUCTOR_ROWS}
        rowKey={(i) => i.id}
        columns={instructorColumns({ loadBy: LOAD_BY, onReleases: () => {} })}
      />
    </div>
  ),
  "table-responses": () => (
    <div className="p-4">
      <DataTable<ResponseRow>
        rows={RESPONSES}
        rowKey={(r) => r.instructor_id}
        columns={responseColumns}
      />
    </div>
  ),
  "table-access-people": () => (
    <div className="p-4">
      <DataTable<AccessSummaryRow>
        rows={ACCESS_SUMMARY}
        rowKey={(r) => r.email}
        columns={accessSummaryColumns}
      />
    </div>
  ),
  "table-access-events": () => (
    <div className="p-4">
      <DataTable<AccessLogRow>
        rows={ACCESS_EVENTS}
        rowKey={(r) => String(r.id)}
        columns={accessEventColumns}
      />
    </div>
  ),
  "table-empty": () => (
    <div className="p-4">
      <DataTable<CourseRow>
        rows={[]}
        rowKey={(c) => c.id}
        empty="No courses match that filter."
        columns={courseColumns}
      />
    </div>
  ),
  "conflict-panel": () => (
    <div className="p-4">
      <ConflictPanel
        conflicts={CONFLICTS}
        counts={countBySeverity(CONFLICTS)}
        onPick={() => {}}
      />
    </div>
  ),

  /*
   * The cards themselves, with the longest name on the roster on them: the
   * chip, its × and the two buttons all have to stay inside 375px and stay
   * tappable. Rendered outside a DndContext on purpose — dragging is inert
   * without one, which is exactly what a scene wants, and it proves the card
   * is not broken by the absence of a provider.
   */
  "section-cards": () => (
    <div className="bg-slate-50 p-4">
      <ul className="space-y-3">
        {SNAPSHOT.sections.slice(0, 4).map((s) => (
          <SectionCard
            key={s.id}
            section={s}
            instructorNames={s.instructorIds.map((id) => ({
              id,
              name: SNAPSHOT.instructors.find((i) => i.id === id)?.name ?? id,
            }))}
            worst={s.instructorIds.length === 0 ? "warning" : null}
            conflictCount={s.instructorIds.length === 0 ? 1 : 0}
            highlighted={s.id === "s3"}
            dragEnabled
            onAssign={() => {}}
            onUnassign={() => {}}
            onEdit={() => {}}
          />
        ))}
      </ul>
    </div>
  ),

  /*
   * The same cards mid-drag, one of each verdict: where the name came from,
   * where they already are, where they would fit, where it would cost
   * something and where it would clash. The colours have to clear contrast
   * against the tinted backgrounds, which is the thing that is easy to get
   * wrong and impossible to notice by eye.
   */
  "section-cards-dragging": () => {
    const source: DragSource = {
      kind: "assignment",
      instructorId: "i1",
      sectionId: "s1",
    };
    const hints = dropHints(SNAPSHOT, source, SNAPSHOT.sections);
    return (
      <div className="bg-slate-50 p-4">
        <ul className="space-y-3">
          {SNAPSHOT.sections.map((s) => (
            <SectionCard
              key={s.id}
              section={s}
              instructorNames={s.instructorIds.map((id) => ({
                id,
                name: SNAPSHOT.instructors.find((i) => i.id === id)?.name ?? id,
              }))}
              worst={null}
              conflictCount={0}
              highlighted={false}
              dragEnabled
              hint={hints.get(s.id) ?? null}
              onAssign={() => {}}
              onUnassign={() => {}}
              onEdit={() => {}}
            />
          ))}
        </ul>
      </div>
    );
  },

  /* The roster and the load numbers, which double as the drag source. */
  "load-panel": () => (
    <div className="bg-slate-50 p-4">
      <LoadPanel tallies={loadTallies(SNAPSHOT)} terms={SNAPSHOT.terms} draggable />
    </div>
  ),

  /* The two halves of the comparison, stacked as a phone stacks them. */
  "compare-sides": () => (
    <div className="space-y-4 bg-slate-50 p-4">
      <ComparisonSide c={COMPARISON[0]} other={COMPARISON[1]} />
      <ComparisonSide c={COMPARISON[1]} other={COMPARISON[0]} />
    </div>
  ),

  /*
   * The row of ways off the page. Three buttons is what the report has, and
   * three buttons is what wraps at 375px — each one has to stay tappable once
   * it is on a line of its own.
   */
  "export-bar": () => (
    <div className="bg-slate-50 p-4">
      <PrintStamp subject="First pass against Alternative" />
      <ExportBar
        csvs={[
          {
            label: "Download the schedule (CSV)",
            filename: "first-pass-schedule.csv",
            build: () => "",
          },
          {
            label: "Download this report (CSV)",
            filename: "first-pass-preferences.csv",
            build: () => "",
          },
        ]}
      />
    </div>
  ),

  "header-bits": () => <HeaderBits />,

  "drag-sandbox": () => <DragSandbox />,

  /* What follows the finger, in each verdict it can carry. */
  "drag-pill": () => (
    <div className="flex flex-col items-start gap-3 bg-slate-50 p-4">
      <DragPill name="Wolfgang Amadeus Featherstonehaugh" hint={null} />
      <DragPill name="Bo Li" hint={{ tone: "ok", note: "wants this course" }} />
      <DragPill name="Bo Li" hint={{ tone: "caution", note: "new preparation" }} />
      <DragPill
        name="Bo Li"
        hint={{ tone: "blocked", note: "clashes with another section" }}
      />
      <DragPill name="Bo Li" hint={{ tone: "present", note: "Already here" }} />
    </div>
  ),

  /*
   * What a page looks like while its chunk is arriving. The skeleton must sit
   * inside the viewport at 375px like any other page — a fixed-width block
   * here would scroll the whole app sideways for the duration of every
   * navigation, on the slow connections where it is the only thing showing.
   */
  "route-fallback": () => (
    <div className="p-4">
      <RouteFallback />
    </div>
  ),

  /*
   * What a coordinator sees when a page will not load — the two variants,
   * because their text differs in length and the longer one is the layout
   * that can break. The notice is rendered directly rather than thrown into
   * the boundary: catching logs a stack, and this check reads an error in the
   * console as a failure.
   */
  "route-error-chunk": () => (
    <div className="p-4">
      <RouteErrorNotice
        error={
          new TypeError(
            "Failed to fetch dynamically imported module: /assets/Board-DkQ2.js",
          )
        }
      />
    </div>
  ),
  "route-error-bug": () => (
    <div className="p-4">
      <RouteErrorNotice
        error={new TypeError("Cannot read properties of null (reading 'sections')")}
      />
    </div>
  ),
};

/** Exported so the check script does not have to keep its own list in step. */
export const SCENE_NAMES = Object.keys(SCENES);
