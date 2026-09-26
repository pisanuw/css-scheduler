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
