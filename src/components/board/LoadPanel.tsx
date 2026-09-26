import type { TermInfo } from '../../lib/conflicts'
import type { LoadTally } from '../../lib/snapshot'

/**
 * Cards on a phone, a table from `sm` up. The same numbers either way — the
 * narrow layout is not a reduced version.
 */
function statusOf(t: LoadTally): { text: string; className: string } {
  if (t.target == null) return { text: 'per course', className: 'text-slate-500' }
  const gap = t.target - t.total
  if (gap === 0) return { text: 'on target', className: 'text-emerald-700' }
  if (gap > 0) return { text: `${gap} to place`, className: 'text-amber-700' }
  return { text: `${-gap} over`, className: 'text-red-700' }
}

export default function LoadPanel({ tallies, terms }: { tallies: LoadTally[]; terms: TermInfo[] }) {
  return (
    <section className="rounded-lg bg-white ring-1 ring-slate-200" aria-labelledby="load-heading">
      <div className="border-b border-slate-200 p-3">
        <h2 id="load-heading" className="font-semibold text-slate-900">
          Load
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Against each person&rsquo;s target: their rank baseline minus any teaching releases.
        </p>
      </div>

      {tallies.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">
          Nobody is assigned yet, and no targets are set for this year.
        </p>
      ) : (
        <>
          {/* Phone: one card per person. */}
          <ul className="divide-y divide-slate-100 sm:hidden">
            {tallies.map((t) => {
              const s = statusOf(t)
              return (
                <li key={t.instructorId} className="p-3">
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{t.name}</span>
                    <span className="text-sm text-slate-700">
                      {t.total}
                      {t.target != null && <span className="text-slate-400"> / {t.target}</span>}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {terms.map((term) => `${term.label} ${t.byTerm[term.id] ?? 0}`).join(' · ')}
                    <span className={`ml-1 font-medium ${s.className}`}>· {s.text}</span>
                  </p>
                </li>
              )
            })}
          </ul>

          {/* Wider: a table, with no horizontal scroll to reach the numbers. */}
          <div className="hidden sm:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Instructor
                  </th>
                  {terms.map((t) => (
                    <th key={t.id} scope="col" className="px-2 py-2 text-right font-semibold">
                      {t.label.slice(0, 3)}
                    </th>
                  ))}
                  <th scope="col" className="px-2 py-2 text-right font-semibold">
                    Year
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tallies.map((t) => {
                  const s = statusOf(t)
                  return (
                    <tr key={t.instructorId}>
                      <th scope="row" className="max-w-[12rem] truncate px-3 py-1.5 text-left font-medium text-slate-800">
                        {t.name}
                      </th>
                      {terms.map((term) => (
                        <td key={term.id} className="px-2 py-1.5 text-right text-slate-600">
                          {t.byTerm[term.id] ?? 0}
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-right text-slate-800">
                        {t.total}
                        {t.target != null && <span className="text-slate-400"> / {t.target}</span>}
                      </td>
                      <td className={`px-3 py-1.5 text-xs font-medium ${s.className}`}>{s.text}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
