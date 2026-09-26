import { useState } from 'react'
import DataTable, { type Column } from '../components/DataTable'
import Toolbar, { SEARCH_FIELD } from '../components/Toolbar'
import { useCourses, type CourseRow } from '../hooks/queries'

/** Exported so the mobile check can put the real columns on a real phone. */
export const courseColumns: Column<CourseRow>[] = [
  {
    key: 'code',
    header: 'Code',
    className: 'font-medium whitespace-nowrap',
    card: 'title',
    render: (c) => c.code,
  },
  { key: 'title', header: 'Title', card: 'subtitle', render: (c) => c.title },
  {
    key: 'credits',
    header: 'Credits',
    className: 'whitespace-nowrap',
    render: (c) => (c.credits_min === c.credits_max ? c.credits_min : `${c.credits_min}–${c.credits_max}`),
  },
  {
    key: 'prereq',
    header: 'Prerequisites',
    className: 'text-slate-500 text-xs',
    render: (c) => c.prereq_text ?? '—',
  },
]

export default function Courses() {
  const [q, setQ] = useState('')
  const { data = [], isLoading, error } = useCourses('undergraduate')

  const rows = data.filter((c) =>
    `${c.code} ${c.title}`.toLowerCase().includes(q.toLowerCase()),
  )

  if (error) return <p className="text-red-700">{(error as Error).message}</p>

  return (
    <section>
      <Toolbar
        title="Course catalog"
        count={isLoading ? 'loading…' : `${rows.length} undergraduate courses`}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Filter courses by code or title"
          placeholder="Filter by code or title…"
          className={SEARCH_FIELD}
        />
      </Toolbar>
      <DataTable<CourseRow>
        rows={rows}
        rowKey={(c) => c.id}
        empty="No courses match that filter."
        columns={courseColumns}
      />
    </section>
  )
}
