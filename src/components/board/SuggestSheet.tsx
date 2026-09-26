import { useEffect, useMemo, useState } from 'react'
import type { SuggestionResult } from '../../lib/suggest'

/**
 * Proposals, with their reasons, before anything is written. Every one starts
 * ticked — the coordinator is reviewing a draft, not assembling one — but
 * nothing is applied until they say so, and a proposal with a caveat says
 * what it is right next to the name.
 */
export default function SuggestSheet({
  result,
  termLabel,
  applying,
  onApply,
  onClose,
}: {
  result: SuggestionResult
  termLabel: (termId: string) => string
  applying: boolean
  onApply: (picks: { sectionId: string; instructorId: string }[]) => void
  onClose: () => void
}) {
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set(result.suggestions.map((s) => s.sectionId)),
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const picks = useMemo(
    () =>
      result.suggestions
        .filter((s) => chosen.has(s.sectionId))
        .map((s) => ({ sectionId: s.sectionId, instructorId: s.instructorId })),
    [result.suggestions, chosen],
  )

  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const allOn = chosen.size === result.suggestions.length && result.suggestions.length > 0

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Suggested assignments"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-xl bg-white shadow-xl sm:rounded-xl">
        <div className="shrink-0 border-b border-slate-200 p-4">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-slate-900">Suggested assignments</h2>
              <p className="mt-0.5 text-sm text-slate-600">
                {result.suggestions.length === 0
                  ? 'Nothing could be filled automatically.'
                  : `${result.suggestions.length} unstaffed section${
                      result.suggestions.length === 1 ? '' : 's'
                    } could be filled without breaking a rule.`}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            >
              ×
            </button>
          </div>
          {result.suggestions.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setChosen(allOn ? new Set() : new Set(result.suggestions.map((s) => s.sectionId)))
              }
              className="mt-2 flex min-h-11 items-center text-sm text-slate-600 underline"
            >
              {allOn ? 'Clear all' : 'Select all'}
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <ul className="divide-y divide-slate-100">
            {result.suggestions.map((s) => {
              const on = chosen.has(s.sectionId)
              return (
                <li key={s.sectionId}>
                  <label className="flex min-h-14 cursor-pointer items-start gap-3 p-3 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(s.sectionId)}
                      className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-slate-800">
                        <span className="font-medium">{s.sectionLabel}</span>
                        <span className="text-slate-400"> · {termLabel(s.termId)} → </span>
                        <span className="font-medium">{s.instructorName}</span>
                      </span>
                      {s.warnings.length > 0 && (
                        <span className="mt-0.5 block text-xs text-amber-700">
                          {s.warnings.join(' · ')}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>

          {result.unfillable.length > 0 && (
            <div className="border-t border-slate-200 p-3">
              <h3 className="text-sm font-medium text-slate-700">
                Needs you ({result.unfillable.length})
              </h3>
              <ul className="mt-1 space-y-1">
                {result.unfillable.map((u) => (
                  <li key={u.sectionId} className="text-xs text-slate-600">
                    <span className="font-medium text-slate-800">{u.sectionLabel}</span> — {u.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-slate-200 p-4">
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-11 items-center rounded-md border border-slate-300 px-4 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onApply(picks)}
            disabled={applying || picks.length === 0}
            style={{ background: 'var(--uw-purple)' }}
            className="ml-auto flex min-h-11 items-center rounded-md px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {applying ? 'Assigning…' : `Assign ${picks.length}`}
          </button>
        </div>
      </div>
    </div>
  )
}
