import { useMemo, useState } from 'react'
import DataTable from '../components/DataTable'
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
        },
        onError: (e) => setError((e as Error).message),
      },
    )
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl">
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
                    onClick={() => del.mutate(r.id)}
                    className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
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
                className="rounded-md px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Add
              </button>
            </div>
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={standing} onChange={(e) => setStanding(e.target.checked)} />
              Standing release — applies every year until removed
            </label>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
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

  if (error) return <p className="text-red-600">{(error as Error).message}</p>

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Instructors</h1>
        <span className="text-sm text-slate-500">{isLoading ? 'loading…' : `${rows.length} shown`}</span>
        <select
          value={effectiveYear}
          onChange={(e) => setYearId(e.target.value)}
          className="ml-auto rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          {(years.data ?? []).map((y) => (
            <option key={y.id} value={y.id}>{y.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Include inactive
        </label>
      </div>

      <p className="mb-3 text-sm text-slate-600">
        Baseline is 8 courses a year on the teaching track and 5 on the tenure track. The target
        someone is held to is that baseline minus any releases recorded for {yearName || 'the year'}.
      </p>

      <DataTable<InstructorRow>
        rows={rows}
        rowKey={(i) => i.id}
        columns={[
          { key: 'name', header: 'Name', className: 'font-medium whitespace-nowrap', render: (i) => i.full_name },
          { key: 'rank', header: 'Rank', className: 'text-slate-600', render: (i) => i.rank ?? '—' },
          {
            key: 'category', header: 'Category',
            render: (i) => (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                {CATEGORY_LABEL[i.category] ?? i.category}
              </span>
            ),
          },
          {
            key: 'base', header: 'Baseline', className: 'text-center text-slate-600',
            render: (i) => i.base_annual_courses ?? '—',
          },
          {
            key: 'released', header: 'Released', className: 'text-center',
            render: (i) => {
              const r = loadBy.get(i.id)?.released_courses ?? 0
              return r > 0 ? <span className="text-amber-700">−{r}</span> : <span className="text-slate-400">—</span>
            },
          },
          {
            key: 'target', header: 'Target', className: 'text-center font-semibold',
            render: (i) => {
              const t = loadBy.get(i.id)?.effective_target
              return t == null ? <span className="font-normal text-slate-400">—</span> : t
            },
          },
          ...(isCoordinator
            ? [{
                key: 'actions', header: '', className: 'text-right',
                render: (i: InstructorRow) => (
                  <button
                    onClick={() => setEditing(i)}
                    className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    Releases
                  </button>
                ),
              }]
            : []),
        ]}
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
