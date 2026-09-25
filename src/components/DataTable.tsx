import type { ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  className?: string
}

export default function DataTable<T>({
  rows,
  columns,
  empty = 'Nothing to show.',
  rowKey,
}: {
  rows: T[]
  columns: Column<T>[]
  empty?: string
  rowKey: (row: T) => string
}) {
  if (rows.length === 0) {
    return <p className="rounded-lg bg-white p-6 text-sm text-slate-500 ring-1 ring-slate-200">{empty}</p>
  }
  return (
    <div className="overflow-x-auto rounded-lg bg-white ring-1 ring-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`px-4 py-2.5 text-left font-semibold text-slate-700 ${c.className ?? ''}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="hover:bg-slate-50">
              {columns.map((c) => (
                <td key={c.key} className={`px-4 py-2 text-slate-700 ${c.className ?? ''}`}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
