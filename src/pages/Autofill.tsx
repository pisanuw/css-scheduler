import { useRef, useState } from 'react'
import Toolbar, { Toggle } from '../components/Toolbar'
import AutofillResults from '../components/autofill/AutofillResults'
import { useToast } from '../components/Toast'
import { XlsxBook } from '../lib/autofill/xlsx'
import { readGlance } from '../lib/autofill/glance'
import { FT_SHEET, detectPrefsKind, readPrefs, type FacultyKind } from '../lib/autofill/prefs'
import { RULES_SHEET } from '../lib/autofill/rules'
import { runAutofill, type AutofillRun } from '../lib/autofill/run'
import { XLSX_MIME, downloadBytes } from '../lib/download'

/**
 * Excel in, Excel out: the year-at-a-glance workbook and the preference
 * survey exports, filled in with full-time faculty and handed back.
 *
 * This page never touches the database. The coordinator's workbook is the
 * record she works from, and the survey is a Google Form — so the useful thing
 * is to meet both where they are rather than ask for them to be retyped into
 * a scenario first. The files are read and written in this browser; nothing is
 * uploaded, which matters because the survey answers are about people's
 * leave, health and families.
 */

interface Picked {
  name: string
  bytes: Uint8Array
  /** What was recognised, in a phrase: "274 sections to staff in Autumn 2026, Winter 2027, Spring 2027". */
  note: string
  /** Why it cannot be used, when it cannot. */
  problem: string | null
  /** For the schedule: whether it carries a corrected preferences sheet from an earlier run. */
  hasPrefsSheet?: boolean
}

type Slot = 'schedule' | 'fullTime' | 'partTime'

function inspect(slot: Slot, name: string, bytes: Uint8Array): Picked {
  try {
    const book = XlsxBook.read(bytes)
    if (slot === 'schedule') {
      const g = readGlance(book)
      const toStaff = g.sections.filter((s) => !s.fixed && !s.external).length
      const hasPrefsSheet = book.hasSheet(FT_SHEET)
      const carried = [hasPrefsSheet && 'the corrected preferences', book.hasSheet(RULES_SHEET) && 'the department rules'].filter(Boolean)
      return {
        name,
        bytes,
        hasPrefsSheet,
        problem: null,
        note: `${toStaff} sections to staff in ${g.blocks.map((b) => b.label).join(', ')}${carried.length ? ` — and ${carried.join(' and ')} from an earlier run` : ''}.`,
      }
    }
    const want: FacultyKind = slot === 'fullTime' ? 'full-time' : 'part-time'
    const prefs = readPrefs(book, want)
    if (!prefs) {
      const kind = detectPrefsKind(book)
      const problem =
        kind && kind !== want
          ? `This is the ${kind} survey — it belongs in step ${kind === 'full-time' ? 2 : 3}.`
          : `This does not look like the ${want} preference survey export.`
      return { name, bytes, note: '', problem }
    }
    return {
      name,
      bytes,
      problem: null,
      note: `${prefs.faculty.length} ${want} ${prefs.source === 'survey' ? 'responses' : 'people from the corrected preferences sheet'}.`,
    }
  } catch (e) {
    return { name, bytes, note: '', problem: e instanceof Error ? e.message : String(e) }
  }
}

function FilePick({
  step,
  title,
  hint,
  picked,
  onPick,
  onClear,
}: {
  step: number
  title: string
  hint: string
  picked: Picked | undefined
  onPick: (file: File) => void
  onClear: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <li className="rounded-lg bg-surface p-4 ring-1 ring-slate-200">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold" style={{ color: 'var(--uw-purple-ink)' }}>
          {step}
        </span>
        <h2 className="font-medium text-slate-900">{title}</h2>
      </div>
      <p className="mt-1 text-sm text-slate-600">{hint}</p>
      {/* Hidden, and opened by the button: a styled 44px control beats the browser's own. */}
      <input
        ref={input}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        aria-label={title}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onPick(file)
          e.target.value = ''
        }}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex min-h-11 items-center rounded-md border border-slate-300 px-4 text-sm text-slate-700 hover:bg-slate-50"
        >
          {picked ? 'Choose another file' : 'Choose a file'}
        </button>
        {picked && (
          <button type="button" onClick={onClear} className="flex min-h-11 items-center rounded-md px-3 text-sm text-slate-700 hover:bg-slate-50">
            Remove
          </button>
        )}
      </div>
      {picked && (
        <p className="mt-2 text-sm text-slate-700">
          <span className="break-all font-medium">{picked.name}</span>
          {picked.note && ` — ${picked.note}`}
        </p>
      )}
      {picked?.problem && <p className="mt-1 text-sm text-red-700">{picked.problem}</p>}
    </li>
  )
}

export default function Autofill() {
  const toast = useToast()
  const [files, setFiles] = useState<Partial<Record<Slot, Picked>>>({})
  const [placePartTime, setPlacePartTime] = useState(false)
  const [run, setRun] = useState<AutofillRun | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  const pick = (slot: Slot) => async (file: File) => {
    let picked: Picked
    try {
      picked = inspect(slot, file.name, new Uint8Array(await file.arrayBuffer()))
    } catch (e) {
      picked = { name: file.name, bytes: new Uint8Array(), note: '', problem: `Could not read the file: ${e instanceof Error ? e.message : String(e)}` }
    }
    setFiles((f) => ({ ...f, [slot]: picked }))
    setRun(null)
    setError(null)
  }
  const clear = (slot: Slot) => () => {
    setFiles((f) => ({ ...f, [slot]: undefined }))
    setRun(null)
  }

  const { schedule, fullTime, partTime } = files
  const scheduleOk = !!schedule && !schedule.problem
  const fullTimeOk = (!!fullTime && !fullTime.problem) || (!fullTime && !!schedule?.hasPrefsSheet)
  const ready = scheduleOk && fullTimeOk && !partTime?.problem

  const fill = () => {
    if (!schedule || !ready) return
    setWorking(true)
    setError(null)
    // Let the button say "Filling…" before the work starts: it takes a second or two on a phone.
    setTimeout(() => {
      try {
        setRun(
          runAutofill({
            schedule,
            fullTime: fullTime && !fullTime.problem ? fullTime : null,
            partTime: partTime && !partTime.problem ? partTime : null,
            placePartTime,
            now: new Date(),
          }),
        )
      } catch (e) {
        setRun(null)
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setWorking(false)
      }
    }, 30)
  }

  const download = () => {
    if (!run) return
    try {
      downloadBytes(run.outputName, XLSX_MIME, run.output)
      toast.ok(`Saved ${run.outputName} to your downloads.`)
    } catch (e) {
      toast.failed(`Could not save ${run.outputName}`, e)
    }
  }

  return (
    <section>
      <Toolbar title="Excel auto-fill" count="full-time faculty from the preference survey" />
      <p className="max-w-2xl text-sm text-slate-600">
        Give it the year-at-a-glance workbook and the survey responses; it gives the workbook back with full-time
        faculty proposed for the empty instructor cells, following their preferences and their load. Everything
        happens in this browser — the files are not uploaded anywhere.
      </p>

      <ol className="mt-4 space-y-3">
        <FilePick
          step={1}
          title="Year at a glance"
          hint="The schedule workbook, with a block of columns per quarter. A workbook this page produced works too — accepted names are kept and the purple ones worked out again."
          picked={schedule}
          onPick={(file) => void pick('schedule')(file)}
          onClear={clear('schedule')}
        />
        <FilePick
          step={2}
          title="Full-time preferences"
          hint={
            schedule?.hasPrefsSheet
              ? 'Optional this time: the schedule you chose already has the corrected preferences sheet.'
              : 'The full-time survey responses, downloaded as .xlsx.'
          }
          picked={fullTime}
          onPick={(file) => void pick('fullTime')(file)}
          onClear={clear('fullTime')}
        />
        <FilePick
          step={3}
          title="Part-time preferences (optional)"
          hint="The part-time survey responses. Used to say who could take each open section — and to place them, if you ask below."
          picked={partTime}
          onPick={(file) => void pick('partTime')(file)}
          onClear={clear('partTime')}
        />
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Toggle
          pressed={placePartTime}
          onChange={(v) => {
            setPlacePartTime(v)
            setRun(null)
          }}
        >
          Also place part-time instructors
        </Toggle>
        <button
          type="button"
          onClick={fill}
          disabled={!ready || working}
          style={{ background: 'var(--uw-purple)' }}
          className="flex min-h-11 items-center rounded-md px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {working ? 'Filling…' : 'Fill the schedule'}
        </button>
      </div>
      {placePartTime && (
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Part-time instructors are placed within the number of courses they asked for each quarter, and any
          two-quarter or year caps you enter on the PT preferences sheet. Treat it as a draft: the title-based load
          policies are not modelled.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
          {error}
        </p>
      )}

      {run && <AutofillResults run={run} onDownload={download} />}

      <details className="mt-8 rounded-lg bg-surface ring-1 ring-slate-200">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 font-medium text-slate-900">How it decides</summary>
        <ul className="list-disc space-y-1 border-t border-slate-200 py-3 pl-8 pr-3 text-sm text-slate-700">
          <li>Nobody goes over their load, teaches two classes at once, or teaches in a quarter they are away or have maxed out.</li>
          <li>Nothing breaks a department rule — full-time faculty do not teach T/Th 1:15 PM — or what someone ruled out: “cannot teach 8–10 pm”, “no graduate classes”, “the latest I can teach is 1:15”. The department rules are a sheet in the workbook you can change.</li>
          <li>Within that: courses you pinned in the load column first, then a section of each G&amp;O or chair request, then their higher-ranked courses, in the quarter and at the time they named, with fewer preparations.</li>
          <li>Back-to-back classes for those who asked for them, and not for those who asked not to. A new faculty member’s wishes count half as much again as a colleague’s when both want the same section.</li>
          <li>When there is not enough to go round, the shortfall is shared rather than left with one person, and reserved sections are used last.</li>
          <li>Loads come from your “# of courses” column. A possible ISS release, sabbatical or buy-out is noted, not applied — change the load on the FT preferences sheet and run again once it is decided.</li>
          <li>The survey does not ask who is new, what a G&amp;O plan or the chair asks for, or about back-to-back classes, so the FT preferences sheet has a column for each: fill them in and run again with that workbook. A “new hire” load note is read as new faculty.</li>
        </ul>
      </details>
    </section>
  )
}
