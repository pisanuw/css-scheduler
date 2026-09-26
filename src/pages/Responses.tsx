import { useMemo, useState } from 'react'
import { useCycles, useResponses, type ResponseRow } from '../hooks/preferences'
import DataTable from '../components/DataTable'

const STATUS_STYLE: Record<ResponseRow['status'], string> = {
  submitted: 'bg-emerald-100 text-emerald-800',
  draft: 'bg-amber-100 text-amber-800',
  not_started: 'bg-slate-100 text-slate-600',
}

const STATUS_LABEL: Record<ResponseRow['status'], string> = {
  submitted: 'Submitted',
  draft: 'In progress',
  not_started: 'Not started',
}

export default function Responses() {
  const cycles = useCycles()
  const [cycleId, setCycleId] = useState<string>('')
  const effectiveCycle =
    cycleId || cycles.data?.find((c) => c.status === 'open')?.id || cycles.data?.[0]?.id || ''
  const responses = useResponses(effectiveCycle || undefined)
  const [filter, setFilter] = useState<'all' | ResponseRow['status']>('all')

  const rows = useMemo(
    () => (responses.data ?? []).filter((r) => filter === 'all' || r.status === filter),
    [responses.data, filter],
  )

  const tally = useMemo(() => {
    const t = { submitted: 0, draft: 0, not_started: 0 }
    for (const r of responses.data ?? []) t[r.status]++
    return t
  }, [responses.data])

  const total = (responses.data ?? []).length
  const pct = total ? Math.round((tally.submitted / total) * 100) : 0

  const chaseList = (responses.data ?? [])
    .filter((r) => r.status !== 'submitted' && r.email)
    .map((r) => r.email)
    .join(', ')

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Responses</h1>
        <select
          value={effectiveCycle}
          onChange={(e) => setCycleId(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          {(cycles.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.status})
            </option>
          ))}
        </select>
      </div>

      {total > 0 && (
        <div className="mb-4 rounded-lg bg-white p-5 ring-1 ring-slate-200">
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-semibold" style={{ color: 'var(--uw-purple)' }}>
              {tally.submitted}/{total}
            </span>
            <span className="text-sm text-slate-600">submitted ({pct}%)</span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(['all', 'submitted', 'draft', 'not_started'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`flex min-h-11 items-center rounded-full border px-4 text-sm ${
                  filter === f
                    ? 'border-slate-800 bg-slate-800 text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {f === 'all' ? `All (${total})` : `${STATUS_LABEL[f]} (${tally[f]})`}
              </button>
            ))}
          </div>
          {chaseList && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-slate-600">
                Email addresses of everyone still outstanding ({tally.draft + tally.not_started})
              </summary>
              <textarea
                readOnly
                value={chaseList}
                rows={3}
                onFocus={(e) => e.currentTarget.select()}
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-700"
              />
            </details>
          )}
        </div>
      )}

      <DataTable<ResponseRow>
        rows={rows}
        rowKey={(r) => r.instructor_id}
        empty={responses.isLoading ? 'Loading…' : 'Nobody matches that filter.'}
        columns={[
          {
            key: 'name',
            header: 'Instructor',
            className: 'font-medium whitespace-nowrap',
            render: (r) => r.full_name,
          },
          {
            key: 'status',
            header: 'Status',
            render: (r) => (
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                {STATUS_LABEL[r.status]}
              </span>
            ),
          },
          {
            key: 'courses',
            header: 'Courses rated',
            className: 'text-center',
            render: (r) => (r.course_count ? r.course_count : '—'),
          },
          {
            key: 'when',
            header: 'Submitted',
            className: 'whitespace-nowrap text-slate-600',
            render: (r) => (r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : '—'),
          },
          {
            key: 'email',
            header: 'Email',
            className: 'text-xs text-slate-500',
            render: (r) => r.email ?? '—',
          },
        ]}
      />
    </section>
  )
}
