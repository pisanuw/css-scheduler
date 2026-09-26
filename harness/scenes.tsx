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
import { useState } from "react";
import type {
  Conflict,
  Instructor,
  Preferences,
  ScheduleSnapshot,
  Section,
} from "../src/lib/conflicts";
import { countBySeverity, detectConflicts } from "../src/lib/conflicts";
import AssignSheet from "../src/components/board/AssignSheet";
import SectionEditor, {
  type SectionFormValue,
} from "../src/components/board/SectionEditor";
import SuggestSheet from "../src/components/board/SuggestSheet";
import ConflictPanel from "../src/components/board/ConflictPanel";
import Dialog from "../src/components/Dialog";
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
        className="flex min-h-11 items-center rounded-md border border-slate-300 bg-white px-4 text-sm"
      >
        Show three messages
      </button>
      {inset && (
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3">
            <button className="ml-auto flex min-h-11 items-center rounded-md border border-slate-300 px-4 text-sm">
              Save draft
            </button>
            <button className="flex min-h-11 items-center rounded-md bg-slate-800 px-4 text-sm text-white">
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
        className="flex min-h-11 items-center rounded-md border border-slate-300 bg-white px-4 text-sm"
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
              <button className="flex min-h-11 items-center rounded-md bg-slate-800 px-4 text-sm text-white">
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

export const SCENES: Record<string, () => JSX.Element> = {
  toasts: () => <ToastScene inset={false} />,
  "toasts-inset": () => <ToastScene inset />,
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
};

/** Exported so the check script does not have to keep its own list in step. */
export const SCENE_NAMES = Object.keys(SCENES);
