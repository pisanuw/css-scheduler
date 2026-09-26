import { useMemo, useState } from 'react'
import DataTable, { type Column } from '../components/DataTable'
import Toolbar, { FIELD, SEARCH_FIELD } from '../components/Toolbar'
import { useTeachingHistory, type HistoryRow } from '../hooks/queries'
import { formatDays, formatTimeRange, titleCase } from '../lib/format'

/** Exported so the mobile check can put the real columns on a real phone. */
export const historyColumns: Column<HistoryRow>[] = [
  {
    key: 'term',
    header: 'Quarter',
    className: 'whitespace-nowrap text-slate-600',
    render: (r) => `${titleCase(r.quarter)} ${r.academic_year}`,
  },
  {
    key: 'course',
    header: 'Course',
    className: 'font-medium whitespace-nowrap',
    card: 'title',
    render: (r) => `${r.course_code_raw} ${r.section_letter ?? ''}`.trim(),
  },
  {
    key: 'instructor',
    header: 'Instructor',
    card: 'subtitle',
    render: (r) => r.instructor_name_raw,
  },
  {
    key: 'when',
    header: 'Meets',
    className: 'whitespace-nowrap text-slate-600',
    render: (r) =>
      r.start_time
        ? `${formatDays(r.days)} ${formatTimeRange(r.start_time, r.end_time)}`
        : 'to be arranged',
  },
  { key: 'room', header: 'Room', className: 'text-slate-500', render: (r) => r.room_label ?? '—' },
  {
    key: 'enrl',
    header: 'Enrolled',
    className: 'whitespace-nowrap text-center text-slate-600',
    render: (r) => (r.enrollment == null ? '—' : `${r.enrollment}/${r.enrollment_cap ?? '?'}`),
  },
]

export default function History() {
  const [q, setQ] = useState('')
  const [quarter, setQuarter] = useState('all')
  const { data = [], isLoading, error } = useTeachingHistory()

  const quarters = useMemo(
    () => Array.from(new Set(data.map((r) => r.quarter))),
    [data],
  )

  const rows = data.filter(
    (r) =>
      (quarter === 'all' || r.quarter === quarter) &&
      `${r.course_code_raw} ${r.instructor_name_raw}`.toLowerCase().includes(q.toLowerCase()),
  )

  if (error) return <p className="text-red-600">{(error as Error).message}</p>

  return (
    <section>
      <Toolbar
        title="Teaching history"
        count={isLoading ? 'loading…' : `${rows.length} sections`}
      >
        <select
          value={quarter}
          onChange={(e) => setQuarter(e.target.value)}
          aria-label="Quarter"
          className={FIELD}
        >
          <option value="all">All quarters</option>
          {quarters.map((qq) => (
            <option key={qq} value={qq}>
              {titleCase(qq)}
            </option>
          ))}
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Filter history by course or instructor"
          placeholder="Filter by course or instructor…"
          className={SEARCH_FIELD}
        />
      </Toolbar>
      <DataTable<HistoryRow>
        rows={rows}
        rowKey={(r) => r.id}
        empty="No sections match that filter."
        columns={historyColumns}
      />
    </section>
  )
}
