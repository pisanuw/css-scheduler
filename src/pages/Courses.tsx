import { useState } from 'react'
import DataTable from '../components/DataTable'
import { useCourses, type CourseRow } from '../hooks/queries'

export default function Courses() {
  const [q, setQ] = useState('')
  const { data = [], isLoading, error } = useCourses('undergraduate')

  const rows = data.filter((c) =>
    `${c.code} ${c.title}`.toLowerCase().includes(q.toLowerCase()),
  )

  if (error) return <p className="text-red-600">{(error as Error).message}</p>

  return (
    <section>
      <div className="mb-4 flex items-baseline gap-4">
        <h1 className="text-xl font-semibold text-slate-900">Course catalog</h1>
        <span className="text-sm text-slate-500">
          {isLoading ? 'loading…' : `${rows.length} undergraduate courses`}
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by code or title…"
          className="ml-auto w-64 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>
      <DataTable<CourseRow>
        rows={rows}
        rowKey={(c) => c.id}
        empty="No courses match that filter."
        columns={[
          { key: 'code', header: 'Code', className: 'font-medium whitespace-nowrap', render: (c) => c.code },
          { key: 'title', header: 'Title', render: (c) => c.title },
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
        ]}
      />
    </section>
  )
}
