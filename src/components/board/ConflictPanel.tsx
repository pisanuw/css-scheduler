import { useState } from 'react'
import type { Conflict, Severity } from '../../lib/conflicts'
import { conflictSummary } from '../../lib/format'

const SEVERITY: Record<Severity, { label: string; dot: string; text: string }> = {
  error: { label: 'Errors', dot: 'bg-red-600', text: 'text-red-800' },
  warning: { label: 'Warnings', dot: 'bg-amber-500', text: 'text-amber-800' },
  info: { label: 'Notes', dot: 'bg-sky-500', text: 'text-sky-800' },
}

const ORDER: Severity[] = ['error', 'warning', 'info']

export default function ConflictPanel({
  conflicts,
  counts,
  onPick,
}: {
  conflicts: Conflict[]
  counts: Record<Severity, number>
  /** Called with the first section a finding refers to, to reveal it. */
  onPick: (sectionId: string) => void
}) {
  const [hidden, setHidden] = useState<Severity[]>([])
  const shown = conflicts.filter((c) => !hidden.includes(c.severity))

  const toggle = (s: Severity) =>
    setHidden((h) => (h.includes(s) ? h.filter((x) => x !== s) : [...h, s]))

  return (
    <section className="rounded-lg bg-white ring-1 ring-slate-200" aria-labelledby="conflicts-heading">
      <div className="border-b border-slate-200 p-3">
        <h2 id="conflicts-heading" className="font-semibold text-slate-900">
          Conflicts
        </h2>
        {/*
          The tally, spoken. Every assignment changes these numbers, and the
          pills below carry them only visually — three button labels read out
          after each tap is not the same as being told whether anything broke.
          Polite, so it waits for a gap rather than cutting across the name that
          was just chosen.
        */}
        <p className="sr-only" role="status" aria-live="polite">
          {conflictSummary(counts)}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {ORDER.map((s) => {
            const off = hidden.includes(s)
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggle(s)}
                aria-pressed={!off}
                className={`flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${
                  off ? 'border-slate-200 bg-white text-slate-500' : 'border-slate-300 bg-slate-50 text-slate-700'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${off ? 'bg-slate-300' : SEVERITY[s].dot}`} aria-hidden />
                {counts[s]} {SEVERITY[s].label.toLowerCase()}
              </button>
            )
          })}
        </div>
      </div>

      {conflicts.length === 0 ? (
        <p className="p-4 text-sm text-emerald-800">
          Nothing to flag. Every section is staffed and no rule is broken.
        </p>
      ) : shown.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">
          All {conflicts.length} findings are filtered out. Tap a pill above to bring them back.
        </p>
      ) : (
        <ul className="max-h-[22rem] divide-y divide-slate-100 overflow-y-auto lg:max-h-[32rem]">
          {shown.map((c, i) => (
            <li key={`${c.code}-${c.sectionIds.join('-')}-${c.instructorId ?? ''}-${i}`}>
              <button
                type="button"
                onClick={() => c.sectionIds[0] && onPick(c.sectionIds[0])}
                disabled={c.sectionIds.length === 0}
                className="flex w-full min-h-11 items-start gap-2 p-3 text-left hover:bg-slate-50 disabled:hover:bg-white"
              >
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY[c.severity].dot}`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 text-sm text-slate-700">
                  {c.message}
                  <span className="mt-0.5 block text-xs text-slate-500">{c.code}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
