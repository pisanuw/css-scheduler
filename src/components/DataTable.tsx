import { Fragment, useMemo } from 'react'
import { groupForCard, isBlankCell, isWideCell, type CardGroups, type Column } from '../lib/cards'
import { useIsNarrow } from '../hooks/useMediaQuery'

export type { CardSlot, Column } from '../lib/cards'

/**
 * A table on a laptop, a list of cards on a phone.
 *
 * The design doc claimed for three runs that "tables become cards rather than
 * scrolling boxes". It was true of the board's load panel and false here, of
 * the component behind Courses, Instructors, History, Responses and Access.
 * This is the claim made good.
 */
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
  const narrow = useIsNarrow()
  const groups = useMemo(() => groupForCard(columns), [columns])

  if (rows.length === 0) {
    return <p className="rounded-lg bg-white p-6 text-sm text-slate-500 ring-1 ring-slate-200">{empty}</p>
  }

  if (narrow) {
    return (
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={rowKey(row)} className="rounded-lg bg-white p-4 ring-1 ring-slate-200">
            <RowCard row={row} groups={groups} />
          </li>
        ))}
      </ul>
    )
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

/** A column's card face, which is its table face unless it asked for another. */
const cell = <T,>(column: Column<T>, row: T) => (column.renderCard ?? column.render)(row)

function RowCard<T>({ row, groups }: { row: T; groups: CardGroups<T> }) {
  const badges = groups.badges.map((c) => [c, cell(c, row)] as const).filter(([, v]) => !isBlankCell(v))
  const pairs = groups.meta.map((c) => [c, cell(c, row)] as const).filter(([, v]) => !isBlankCell(v))
  const subtitle = groups.subtitle ? cell(groups.subtitle, row) : null

  return (
    <>
      {(groups.title || badges.length > 0) && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {groups.title && (
              <p className="font-medium break-words text-slate-900">{cell(groups.title, row)}</p>
            )}
            {!isBlankCell(subtitle) && (
              <p className="mt-0.5 text-sm break-words text-slate-600">{subtitle}</p>
            )}
          </div>
          {badges.length > 0 && (
            <div className="flex shrink-0 flex-wrap justify-end gap-1">
              {badges.map(([c, value]) => (
                <Fragment key={c.key}>{value}</Fragment>
              ))}
            </div>
          )}
        </div>
      )}

      {pairs.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
          {pairs.map(([c, value]) => (
            <div key={c.key} className={`min-w-0 ${isWideCell(value) ? 'col-span-2' : ''}`}>
              {c.header && (
                <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                  {c.header}
                </dt>
              )}
              <dd className="mt-0.5 text-sm break-words text-slate-700">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {groups.actions.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {/* A Fragment, not a wrapper with `display: contents` — that drops
              the element out of the accessibility tree in some browsers, and
              these are buttons. */}
          {groups.actions.map((c) => (
            <Fragment key={c.key}>{cell(c, row)}</Fragment>
          ))}
        </div>
      )}
    </>
  )
}
