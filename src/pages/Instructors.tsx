import { useState } from 'react'
import DataTable from '../components/DataTable'
import { useInstructors, type InstructorRow } from '../hooks/queries'

const CATEGORY_LABEL: Record<string, string> = {
  full_time: 'Full-time',
  affiliate: 'Affiliate',
  part_time: 'Part-time',
  emeritus: 'Emeritus',
  other: 'From schedule',
}

export default function Instructors() {
  const [showInactive, setShowInactive] = useState(false)
  const { data = [], isLoading, error } = useInstructors()

  const rows = data.filter((i) => showInactive || i.is_active)
  if (error) return <p className="text-red-600">{(error as Error).message}</p>

  return (
    <section>
      <div className="mb-4 flex items-baseline gap-4">
        <h1 className="text-xl font-semibold text-slate-900">Instructors</h1>
        <span className="text-sm text-slate-500">
          {isLoading ? 'loading…' : `${rows.length} shown`}
        </span>
        <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Include inactive
        </label>
      </div>
      <DataTable<InstructorRow>
        rows={rows}
        rowKey={(i) => i.id}
        columns={[
          { key: 'name', header: 'Name', className: 'font-medium whitespace-nowrap', render: (i) => i.full_name },
          { key: 'rank', header: 'Rank', className: 'text-slate-600', render: (i) => i.rank ?? '—' },
          {
            key: 'category',
            header: 'Category',
            render: (i) => (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                {CATEGORY_LABEL[i.category] ?? i.category}
              </span>
            ),
          },
          { key: 'email', header: 'Email', className: 'text-slate-500 text-xs', render: (i) => i.email ?? '—' },
          {
            key: 'target',
            header: 'Annual target',
            className: 'text-center',
            render: (i) => i.annual_target_courses ?? '—',
          },
        ]}
      />
    </section>
  )
}
