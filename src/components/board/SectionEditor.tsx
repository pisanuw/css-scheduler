import { useMemo, useState } from 'react'
import type { Modality } from '../../lib/conflicts'
import Dialog from '../Dialog'
import type { SectionRow, TimeSlotRow } from '../../lib/snapshot'
import { MODALITY_LABEL, QUARTER_LABEL, WEEKDAYS } from '../../lib/types'
import { formatTimeRange } from '../../lib/format'
import type { Quarter } from '../../lib/types'

export type TimingMode = 'grid' | 'custom' | 'arranged'

export interface SectionFormValue {
  id?: string
  term_id: string
  course_id: string
  section_letter: string
  timing: TimingMode
  time_slot_id: string | null
  custom_days: number[]
  custom_start: string
  custom_end: string
  modality: Modality
  room_id: string | null
  enrollment_cap: string
  notes: string
}

/** Which of the three timing shapes a stored row is using. */
export function timingOf(s: SectionRow): TimingMode {
  if (s.is_arranged) return 'arranged'
  return s.time_slot_id ? 'grid' : 'custom'
}

export function toFormValue(s: SectionRow): SectionFormValue {
  return {
    id: s.id,
    term_id: s.term_id,
    course_id: s.course_id,
    section_letter: s.section_letter,
    timing: timingOf(s),
    time_slot_id: s.time_slot_id,
    custom_days: s.custom_days ?? [],
    custom_start: s.custom_start?.slice(0, 5) ?? '',
    custom_end: s.custom_end?.slice(0, 5) ?? '',
    modality: s.modality,
    room_id: s.room_id,
    enrollment_cap: s.enrollment_cap == null ? '' : String(s.enrollment_cap),
    notes: s.notes ?? '',
  }
}

/**
 * Turns the form into a row, with the timing columns set so exactly one of the
 * three shapes is populated — the table's check constraint rejects anything
 * else, and a stale custom_start left behind by switching mode would trip it.
 */
export function toRow(v: SectionFormValue, scenarioId: string): Omit<SectionRow, 'id'> & { id?: string } {
  const base = {
    ...(v.id ? { id: v.id } : {}),
    scenario_id: scenarioId,
    term_id: v.term_id,
    course_id: v.course_id,
    section_letter: v.section_letter.trim().toUpperCase(),
    modality: v.modality,
    room_id: v.room_id,
    enrollment_cap: v.enrollment_cap === '' ? null : Number(v.enrollment_cap),
    status: 'planned' as const,
    notes: v.notes.trim() || null,
  }
  if (v.timing === 'arranged') {
    return { ...base, is_arranged: true, time_slot_id: null, custom_days: null, custom_start: null, custom_end: null }
  }
  if (v.timing === 'grid') {
    return {
      ...base,
      is_arranged: false,
      time_slot_id: v.time_slot_id,
      custom_days: null,
      custom_start: null,
      custom_end: null,
    }
  }
  return {
    ...base,
    is_arranged: false,
    time_slot_id: null,
    custom_days: v.custom_days,
    custom_start: v.custom_start,
    custom_end: v.custom_end,
  }
}

export function validate(v: SectionFormValue): string | null {
  if (!v.course_id) return 'Pick a course.'
  if (!v.term_id) return 'Pick a quarter.'
  if (!v.section_letter.trim()) return 'Give the section a letter, like A.'
  if (v.timing === 'grid' && !v.time_slot_id) return 'Pick a meeting time from the grid.'
  if (v.timing === 'custom') {
    if (v.custom_days.length === 0) return 'Pick at least one day.'
    if (!v.custom_start || !v.custom_end) return 'Set a start and end time.'
    if (v.custom_end <= v.custom_start) return 'The end time has to be after the start.'
  }
  return null
}

export default function SectionEditor({
  value,
  courses,
  terms,
  timeSlots,
  rooms,
  saving,
  deleting,
  onChange,
  onSave,
  onDelete,
  onClose,
  error,
}: {
  value: SectionFormValue
  courses: { id: string; code: string; title: string }[]
  terms: { id: string; quarter: Quarter }[]
  timeSlots: TimeSlotRow[]
  rooms: { id: string; label: string }[]
  saving: boolean
  deleting: boolean
  onChange: (v: SectionFormValue) => void
  onSave: () => void
  onDelete: () => void
  onClose: () => void
  error: string | null
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const set = <K extends keyof SectionFormValue>(k: K, v: SectionFormValue[K]) =>
    onChange({ ...value, [k]: v })

  const grid = useMemo(
    () => [...timeSlots].sort((a, b) => a.day_pattern.localeCompare(b.day_pattern) || a.sort_order - b.sort_order),
    [timeSlots],
  )

  const field = 'mt-1 block min-h-11 w-full rounded-md border border-slate-300 px-2'
  const label = 'block text-sm font-medium text-slate-700'

  return (
    <Dialog
      label={value.id ? 'Edit section' : 'New section'}
      onClose={onClose}
      className="flex max-h-[90vh] max-w-lg flex-col rounded-t-xl sm:max-h-[85vh] sm:rounded-xl"
    >
      <>
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 p-4">
          <h2 className="flex-1 text-lg font-semibold text-slate-900">
            {value.id ? 'Edit section' : 'New section'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <label className={label}>
            Course
            <select value={value.course_id} onChange={(e) => set('course_id', e.target.value)} className={field}>
              <option value="">Choose…</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.title}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              Quarter
              <select value={value.term_id} onChange={(e) => set('term_id', e.target.value)} className={field}>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {QUARTER_LABEL[t.quarter]}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Section
              <input
                value={value.section_letter}
                onChange={(e) => set('section_letter', e.target.value)}
                maxLength={3}
                className={field}
              />
            </label>
          </div>

          <fieldset>
            <legend className={label}>Meeting time</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {(
                [
                  ['grid', 'Standard grid'],
                  ['custom', 'Custom time'],
                  ['arranged', 'To be arranged'],
                ] as [TimingMode, string][]
              ).map(([mode, text]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => set('timing', mode)}
                  style={value.timing === mode ? { background: 'var(--uw-purple)' } : undefined}
                  className={`flex min-h-11 items-center rounded-full border px-4 text-sm ${
                    value.timing === mode
                      ? 'border-transparent text-white'
                      : 'border-slate-300 bg-surface text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {text}
                </button>
              ))}
            </div>

            {value.timing === 'grid' && (
              <select
                value={value.time_slot_id ?? ''}
                onChange={(e) => set('time_slot_id', e.target.value || null)}
                aria-label="Meeting time from the standard grid"
                className={field}
              >
                <option value="">Choose a slot…</option>
                {grid.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.day_pattern} {formatTimeRange(s.start_time, s.end_time)}
                  </option>
                ))}
              </select>
            )}

            {value.timing === 'custom' && (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((d) => {
                    const on = value.custom_days.includes(d.value)
                    return (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() =>
                          set(
                            'custom_days',
                            on
                              ? value.custom_days.filter((x) => x !== d.value)
                              : [...value.custom_days, d.value].sort((a, b) => a - b),
                          )
                        }
                        style={on ? { background: 'var(--uw-purple)' } : undefined}
                        className={`flex h-11 w-11 items-center justify-center rounded-full border text-sm ${
                          on ? 'border-transparent text-white' : 'border-slate-300 bg-surface text-slate-700'
                        }`}
                      >
                        {d.label.slice(0, 2)}
                      </button>
                    )
                  })}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm text-slate-600">
                    Starts
                    <input
                      type="time"
                      value={value.custom_start}
                      onChange={(e) => set('custom_start', e.target.value)}
                      className={field}
                    />
                  </label>
                  <label className="text-sm text-slate-600">
                    Ends
                    <input
                      type="time"
                      value={value.custom_end}
                      onChange={(e) => set('custom_end', e.target.value)}
                      className={field}
                    />
                  </label>
                </div>
              </div>
            )}

            {value.timing === 'arranged' && (
              <p className="mt-2 text-sm text-slate-500">
                No fixed meeting time, as for independent study and internships. These can never
                clash on time.
              </p>
            )}
          </fieldset>

          <label className={label}>
            Format
            <select
              value={value.modality}
              onChange={(e) => set('modality', e.target.value as Modality)}
              className={field}
            >
              {(Object.keys(MODALITY_LABEL) as Modality[]).map((m) => (
                <option key={m} value={m}>
                  {MODALITY_LABEL[m]}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            {rooms.length > 0 && (
              <label className={label}>
                Room
                <select
                  value={value.room_id ?? ''}
                  onChange={(e) => set('room_id', e.target.value || null)}
                  className={field}
                >
                  <option value="">Not set</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className={label}>
              Enrolment cap
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={value.enrollment_cap}
                onChange={(e) => set('enrollment_cap', e.target.value)}
                className={field}
              />
            </label>
          </div>

          <label className={label}>
            Notes
            <textarea
              rows={2}
              value={value.notes}
              onChange={(e) => set('notes', e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-2"
            />
          </label>

          {/* role="alert" rather than a silent red paragraph: a validation
              message that only exists visually is no message to a screen
              reader, and this one appears after the Save that caused it. */}
          {error && (
            <p role="alert" className="text-sm font-medium text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-200 p-4">
          {value.id &&
            (confirmDelete ? (
              <>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={deleting}
                  className="flex min-h-11 items-center rounded-md bg-danger px-3 text-sm font-medium text-white hover:bg-danger-strong disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Delete section'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="flex min-h-11 items-center rounded-md border border-slate-300 px-3 text-sm text-slate-700"
                >
                  Keep
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex min-h-11 items-center rounded-md border border-slate-300 px-3 text-sm text-red-700 hover:bg-red-50"
              >
                Delete
              </button>
            ))}
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            style={{ background: 'var(--uw-purple)' }}
            className="ml-auto flex min-h-11 items-center rounded-md px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save section'}
          </button>
        </div>
      </>
    </Dialog>
  )
}
