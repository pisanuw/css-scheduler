import type { Section, TermInfo } from '../../lib/conflicts'

/**
 * The only thing on the board allowed to scroll sideways. Three quarters fit
 * across a phone, but the counts make each pill wide enough that a fourth
 * (Summer, if the scope ever widens) would not.
 */
export default function QuarterTabs({
  terms,
  sections,
  selected,
  onSelect,
}: {
  terms: TermInfo[]
  sections: Section[]
  selected: string | null
  onSelect: (termId: string) => void
}) {
  return (
    <div className="mb-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Quarter">
      {terms.map((t) => {
        const all = sections.filter((s) => s.termId === t.id)
        const unstaffed = all.filter((s) => s.instructorIds.length === 0).length
        const active = t.id === selected
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(t.id)}
            style={active ? { background: 'var(--uw-purple)' } : undefined}
            className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium ${
              active ? 'border-transparent text-white' : 'border-slate-300 bg-surface text-slate-700'
            }`}
          >
            {t.label}
            <span className={active ? 'text-white/70' : 'text-slate-500'}>{all.length}</span>
            {unstaffed > 0 && (
              <span
                className={`rounded-full px-1.5 text-xs ${
                  active ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
                }`}
                title={`${unstaffed} unstaffed`}
              >
                {unstaffed}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
