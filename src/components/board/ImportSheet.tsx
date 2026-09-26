import { useMemo, useRef, useState } from 'react'
import Dialog from '../Dialog'
import { describePlan, planFromHistory, type SeedPlan } from '../../lib/seedPlan'
import { parseTimeSchedule, resolveImport, type RosterEntry } from '../../lib/timeSchedule'
import type { Quarter } from '../../lib/conflicts'

/**
 * Paste a quarter of the published UW time schedule; get a draft of it.
 *
 * The coordinator already has the schedule — it is on a web page, and typing
 * eighty sections back in by hand is the thing this app exists to stop. So this
 * takes the text as it comes out of a copy, shows what it read, names what it
 * could not, and writes nothing until they say so.
 *
 * Everything below the textarea recomputes as they type. That is the point: a
 * paste that went wrong — the wrong quarter, half a page, a column that came
 * out as one long line — is obvious before anything is written, not afterwards.
 */
export default function ImportSheet({
  termLabel,
  quarter,
  courses,
  roster,
  timeSlots,
  rooms,
  termId,
  existingKeys,
  academicYear,
  applying,
  onApply,
  onClose,
}: {
  termLabel: string
  quarter: Quarter
  courses: { id: string; code: string; number: number }[]
  roster: RosterEntry[]
  timeSlots: { id: string; days: number[]; start_time: string; end_time: string }[]
  rooms: { id: string; label: string }[]
  termId: string
  /** `termId|courseId|letter` for what the scenario already holds. */
  existingKeys: Set<string>
  academicYear: string
  applying: boolean
  onApply: (plan: SeedPlan) => void
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)

  const read = useMemo(() => {
    if (!text.trim()) return null
    const parse = parseTimeSchedule(text)
    const resolved = resolveImport({ parsed: parse.sections, courses, roster, quarter, academicYear })
    const plan = planFromHistory({
      history: resolved.history,
      terms: [{ id: termId, quarter }],
      timeSlots,
      rooms,
      activeInstructorIds: new Set(roster.filter((r) => r.is_active).map((r) => r.id)),
      existingKeys,
    })
    return { parse, resolved, plan }
  }, [text, courses, roster, quarter, academicYear, termId, timeSlots, rooms, existingKeys])

  const count = read?.plan.sections.length ?? 0
  /** Everything the import could not carry, in one list rather than three. */
  const notCarried = read
    ? [
        ...read.resolved.dropped.map((d) => `${d.detail} — ${d.reason}`),
        ...read.plan.skipped.map((s) => `${s.detail} — ${s.reason}`),
        ...read.parse.ignored.map((i) => `${i.reason}: ${i.line.slice(0, 60)}`),
      ]
    : []

  return (
    <Dialog
      label={`Import ${termLabel} from a time schedule`}
      onClose={onClose}
      initialFocus={field}
      className="flex max-h-[90vh] max-w-2xl flex-col rounded-t-xl sm:rounded-xl"
    >
      <>
        <div className="shrink-0 border-b border-slate-200 p-4">
          <h2 className="font-semibold text-slate-900">Import {termLabel}</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Copy the CSS listing from the published time schedule and paste it here. Nothing is
            written until you tap Import.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <label className="block text-sm font-medium text-slate-700" htmlFor="ts-paste">
            The time schedule, pasted
          </label>
          <textarea
            id="ts-paste"
            ref={field}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            placeholder={'CSS 142 COMPUTER PROGRAMMING I\n12888 A 5 MW 1100-100 UW2 031 Stride,Jeff Open 28/ 48'}
            className="mt-1 block w-full rounded-md border border-slate-300 bg-surface p-2 font-mono text-sm text-slate-900 placeholder:text-slate-400"
          />

          {!read ? (
            <p className="mt-3 text-sm text-slate-500">
              Course headings and section lines both work, in either order, and the columns do not
              have to line up.
            </p>
          ) : (
            <div className="mt-4 space-y-3" aria-live="polite">
              {count === 0 ? (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Nothing in that paste became a section. Check that it is the CSS listing, and that
                  it is the {termLabel} one.
                </p>
              ) : (
                <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  Read <strong>{describePlan(read.plan)}</strong>, all into {termLabel}.
                </p>
              )}

              {read.resolved.unknownInstructors.length > 0 && (
                <details className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <summary className="min-h-11 cursor-pointer py-2 font-medium">
                    {read.resolved.unknownInstructors.length} name
                    {read.resolved.unknownInstructors.length === 1 ? '' : 's'} not on the roster
                  </summary>
                  <p className="mt-1 text-slate-600">
                    These sections come in unstaffed. Add the person on the Instructors page, then
                    assign them on the board.
                  </p>
                  <ul className="mt-1 list-inside list-disc">
                    {read.resolved.unknownInstructors.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </details>
              )}

              {notCarried.length > 0 && (
                <details className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <summary className="min-h-11 cursor-pointer py-2 font-medium">
                    {notCarried.length} line{notCarried.length === 1 ? '' : 's'} not imported
                  </summary>
                  <ul className="mt-1 list-inside list-disc break-words">
                    {notCarried.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </details>
              )}

              {read.plan.sections.length > 0 && (
                <details className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <summary className="min-h-11 cursor-pointer py-2 font-medium">
                    What will be created
                  </summary>
                  <ul className="mt-1 space-y-1">
                    {read.resolved.history
                      .filter((h) =>
                        read.plan.sections.some(
                          (s) =>
                            s.course_id === h.course_id &&
                            s.section_letter === (h.section_letter ?? 'A').toUpperCase(),
                        ),
                      )
                      .map((h) => (
                        <li key={h.id} className="flex flex-wrap gap-x-2">
                          <span className="font-medium text-slate-900">
                            {h.course_code_raw} {h.section_letter}
                          </span>
                          <span className="text-slate-600">
                            {h.instructor_id
                              ? (roster.find((r) => r.id === h.instructor_id)?.full_name ?? '')
                              : h.instructor_name_raw
                                ? `${h.instructor_name_raw} — unstaffed`
                                : 'unstaffed'}
                          </span>
                        </li>
                      ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-200 p-4">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-4 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={count === 0 || applying}
              onClick={() => read && onApply(read.plan)}
              style={{ background: 'var(--uw-purple)' }}
              className="flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {applying
                ? 'Importing…'
                : `Import ${count} section${count === 1 ? '' : 's'} into ${termLabel}`}
            </button>
          </div>
        </div>
      </>
    </Dialog>
  )
}
