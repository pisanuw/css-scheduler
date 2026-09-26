import { useMemo, useState } from 'react'
import DataTable, { type Column } from '../components/DataTable'
import Toolbar, { FIELD, Toggle } from '../components/Toolbar'
import Dialog from '../components/Dialog'
import { useToast } from '../components/Toast'
import { useAuth } from '../lib/auth'
import {
  useAddRelease,
  useDeleteRelease,
  useInstructors,
  useLoadTargets,
  useReleases,
  type InstructorRow,
} from '../hooks/queries'
import { useAcademicYears } from '../hooks/preferences'
import type { LoadTarget } from '../hooks/queries'

const CATEGORY_LABEL: Record<string, string> = {
  full_time: 'Full-time',
  affiliate: 'Affiliate',
  part_time: 'Part-time',
  emeritus: 'Emeritus',
  other: 'From schedule',
}

/** Coordinator panel for one instructor's releases in the selected year. */
function ReleaseDialog({
  instructor,
  academicYearId,
  academicYearName,
  onClose,
}: {
  instructor: InstructorRow
  academicYearId: string
  academicYearName: string
  onClose: () => void
}) {
  const releases = useReleases(instructor.id)
  const add = useAddRelease()
  const del = useDeleteRelease()
  const toast = useToast()
  const [courses, setCourses] = useState('1')
  const [reason, setReason] = useState('')
  const [standing, setStanding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const relevant = (releases.data ?? []).filter(
    (r) => r.academic_year_id === academicYearId || r.academic_year_id === null,
  )
  const released = relevant.reduce((a, r) => a + Number(r.courses), 0)
  const base = instructor.base_annual_courses
  const effective = base == null ? null : Math.max(base - released, 0)

  const submit = () => {
    const n = Number(courses)
    if (!reason.trim()) return setError('Give a reason — it is what makes the number defensible later.')
    if (!(n > 0)) return setError('Courses released must be greater than zero.')
    setError(null)
    add.mutate(
      {
        instructor_id: instructor.id,
        academic_year_id: standing ? null : academicYearId,
        courses: n,
        reason: reason.trim(),
      },
      {
        onSuccess: () => {
          setReason('')
          setCourses('1')
          toast.ok(`Release recorded for ${instructor.full_name}.`)
        },
        onError: (e) => {
          setError((e as Error).message)
          toast.failed('Could not record the release', e)
        },
      },
    )
  }

  return (
    <Dialog
      label={`Teaching releases for ${instructor.full_name}`}
      onClose={onClose}
      className="max-h-[90vh] max-w-xl overflow-y-auto rounded-t-xl p-5 sm:rounded-xl sm:p-6"
    >
      <>
        <h2 className="text-lg font-semibold text-slate-900">{instructor.full_name}</h2>
        <p className="mt-1 text-sm text-slate-600">
          {instructor.rank} · teaching releases for {academicYearName}
        </p>

        {base == null ? (
          <p className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
            This person has no annual baseline — they are hired per course, so releases do not
            apply.
          </p>
        ) : (
          <div className="mt-4 flex items-center gap-6 rounded-md bg-slate-50 p-3 text-sm">
            <span>
              Baseline <strong className="text-slate-900">{base}</strong>
            </span>
            <span>
              Released <strong className="text-slate-900">{released}</strong>
            </span>
            <span>
              Target{' '}
              <strong style={{ color: 'var(--uw-purple)' }} className="text-base">
                {effective}
              </strong>
            </span>
          </div>
        )}

        <div className="mt-4">
          {relevant.length === 0 ? (
            <p className="text-sm text-slate-500">No releases recorded for this year.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {relevant.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="font-medium text-slate-800">{r.courses}</span>
                  <span className="min-w-0 flex-1 text-slate-600">{r.reason}</span>
                  {r.academic_year_id === null && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                      standing
                    </span>
                  )}
                  <button
                    onClick={() =>
                      del.mutate(r.id, {
                        onSuccess: () => toast.ok('Release removed.'),
                        onError: (e) => toast.failed('Could not remove the release', e),
                      })
                    }
                    aria-label={`Remove the release of ${r.courses} for ${r.reason}`}
                    className="flex min-h-11 shrink-0 items-center rounded border border-slate-300 px-3 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {base != null && (
          <div className="mt-4 rounded-md border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-700">Add a release</p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="text-sm text-slate-600">
                Courses
                <input
                  type="number" min="0.5" step="0.5" value={courses}
                  onChange={(e) => setCourses(e.target.value)}
                  className="mt-1 block w-24 rounded-md border border-slate-300 px-2 py-1"
                />
              </label>
              <label className="min-w-0 flex-1 text-sm text-slate-600">
                Reason
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Chair service, grant buyout, course development…"
                  className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1"
                />
              </label>
              <button
                onClick={submit}
                disabled={add.isPending}
                style={{ background: 'var(--uw-purple)' }}
                className="flex min-h-11 items-center rounded-md px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {add.isPending ? 'Adding…' : 'Add'}
              </button>
            </div>
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={standing} onChange={(e) => setStanding(e.target.checked)} />
              Standing release — applies every year until removed
            </label>
            {error && (
              <p role="alert" className="mt-2 text-sm font-medium text-red-700">
                {error}
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="flex min-h-11 items-center rounded-md border border-slate-300 px-4 text-sm text-slate-700 hover:bg-slate-50"
          >
            Done
          </button>
        </div>
      </>
    </Dialog>
  )
}

/**
 * The instructor table's columns.
 *
 * A function rather than a constant because two of them need the year's load
 * figures and the last one only exists for a coordinator. Exported so the
 * mobile check can put the real columns on a real phone.
 */
export function instructorColumns({
  loadBy,
  onReleases,
}: {
  loadBy: Map<string, LoadTarget>
  /** Null for anyone who may not edit releases: the column disappears. */
  onReleases: ((instructor: InstructorRow) => void) | null
}): Column<InstructorRow>[] {
  return [
    {
      key: 'name',
      header: 'Name',
      className: 'font-medium whitespace-nowrap',
      card: 'title',
      render: (i) => i.full_name,
    },
    { key: 'rank', header: 'Rank', className: 'text-slate-600', card: 'subtitle', render: (i) => i.rank ?? '—' },
    {
      key: 'category',
      header: 'Category',
      card: 'badge',
      render: (i) => (
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
          {CATEGORY_LABEL[i.category] ?? i.category}
        </span>
      ),
    },
    {
      key: 'base',
      header: 'Baseline',
      className: 'text-center text-slate-600',
      render: (i) => i.base_annual_courses ?? '—',
    },
    {
      key: 'released',
      header: 'Released',
      className: 'text-center',
      render: (i) => {
        const r = loadBy.get(i.id)?.released_courses ?? 0
        return r > 0 ? <span className="text-amber-700">−{r}</span> : <span className="text-slate-500">—</span>
      },
    },
    {
      key: 'target',
      header: 'Target',
      className: 'text-center font-semibold',
      render: (i) => {
        const t = loadBy.get(i.id)?.effective_target
        return t == null ? <span className="font-normal text-slate-500">—</span> : t
      },
    },
    ...(onReleases
      ? [
          {
            key: 'actions',
            header: '',
            className: 'text-right',
            card: 'action' as const,
            render: (i: InstructorRow) => (
              <button
                onClick={() => onReleases(i)}
                aria-label={`Teaching releases for ${i.full_name}`}
                className="ml-auto flex min-h-11 items-center rounded border border-slate-300 px-3 text-xs text-slate-700 hover:bg-slate-50"
              >
                Releases
              </button>
            ),
          },
        ]
      : []),
  ]
}

export default function Instructors() {
  const { isCoordinator } = useAuth()
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<InstructorRow | null>(null)
  const years = useAcademicYears()
  const [yearId, setYearId] = useState<string>('')
  const effectiveYear = yearId || years.data?.find((y) => y.is_current)?.id || years.data?.[0]?.id || ''
  const yearName = years.data?.find((y) => y.id === effectiveYear)?.name ?? ''

  const { data = [], isLoading, error } = useInstructors()
  const loads = useLoadTargets(effectiveYear || undefined)

  const loadBy = useMemo(
    () => new Map((loads.data ?? []).map((l) => [l.instructor_id, l])),
    [loads.data],
  )
  const rows = data.filter((i) => showInactive || i.is_active)

  // Memoised so the card grouping inside DataTable is not redone on every
  // keystroke elsewhere on the page.
  const columns = useMemo(
    () => instructorColumns({ loadBy, onReleases: isCoordinator ? setEditing : null }),
    [loadBy, isCoordinator],
  )

  if (error) return <p className="text-red-600">{(error as Error).message}</p>

  return (
    <section>
      <Toolbar title="Instructors" count={isLoading ? 'loading…' : `${rows.length} shown`}>
        <select
          value={effectiveYear}
          onChange={(e) => setYearId(e.target.value)}
          aria-label="Academic year"
          className={FIELD}
        >
          {(years.data ?? []).map((y) => (
            <option key={y.id} value={y.id}>{y.name}</option>
          ))}
        </select>
        <Toggle pressed={showInactive} onChange={setShowInactive}>
          Include inactive
        </Toggle>
      </Toolbar>

      <p className="mb-3 text-sm text-slate-600">
        Baseline is 8 courses a year on the teaching track and 5 on the tenure track. The target
        someone is held to is that baseline minus any releases recorded for {yearName || 'the year'}.
      </p>

      <DataTable<InstructorRow>
        rows={rows}
        rowKey={(i) => i.id}
        columns={columns}
      />

      {editing && effectiveYear && (
        <ReleaseDialog
          instructor={editing}
          academicYearId={effectiveYear}
          academicYearName={yearName}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  )
}
