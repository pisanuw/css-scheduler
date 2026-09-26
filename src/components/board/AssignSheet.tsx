import { useMemo, useState } from 'react'
import type { PrefTier, ScheduleSnapshot, Section } from '../../lib/conflicts'
import { meetingLabel } from '../../lib/snapshot'
import { filterCandidates, rankCandidates, type Candidate } from '../../lib/suitability'
import Dialog from '../Dialog'

/**
 * Tap a section, tap an instructor. This is the assignment path, not a
 * fallback: the coordinator works on a phone, so it has to be the one that is
 * actually pleasant. It rises from the bottom on a narrow screen and centres
 * on a wide one.
 */

const TIER_BADGE: Record<PrefTier, { label: string; className: string }> = {
  eager: { label: 'Wants it', className: 'bg-emerald-100 text-emerald-800' },
  willing: { label: 'Willing', className: 'bg-sky-100 text-sky-800' },
  reluctant: { label: 'Rather not', className: 'bg-amber-100 text-amber-800' },
  unqualified: { label: 'Cannot', className: 'bg-red-100 text-red-800' },
}

function CandidateRow({
  c,
  assigned,
  onPick,
}: {
  c: Candidate
  assigned: boolean
  onPick: () => void
}) {
  const hard = c.tier === 'unqualified' || c.wouldClash || c.unavailableThisTerm || c.atQuarterMax
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        disabled={assigned}
        className={`flex w-full min-h-14 items-center gap-3 px-4 py-2 text-left transition-colors ${
          assigned ? 'cursor-default bg-slate-50' : 'hover:bg-slate-50'
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-medium text-slate-900">{c.name}</span>
            {c.tier && (
              <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${TIER_BADGE[c.tier].className}`}>
                {TIER_BADGE[c.tier].label}
              </span>
            )}
            {assigned && <span className="text-xs text-slate-500">already on this section</span>}
          </span>
          <span className="mt-0.5 block text-xs text-slate-500">
            {c.assignedThisTerm} this quarter · {c.assignedTotal}
            {c.target != null ? ` of ${c.target}` : ''} this year
            {c.taughtBefore && ' · has taught it'}
          </span>
          {c.warnings.length > 0 && (
            <span className={`mt-0.5 block text-xs ${hard ? 'text-red-700' : 'text-amber-700'}`}>
              {c.warnings.join(' · ')}
            </span>
          )}
        </span>
        {/* The button already says what it does; this is the affordance. */}
        {!assigned && (
          <span aria-hidden className="shrink-0 text-slate-500">
            ＋
          </span>
        )}
      </button>
    </li>
  )
}

export default function AssignSheet({
  section,
  snapshot,
  termLabel,
  onPick,
  onClose,
}: {
  section: Section
  snapshot: ScheduleSnapshot
  termLabel: string
  onPick: (instructorId: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')

  const ranked = useMemo(() => rankCandidates(snapshot, section), [snapshot, section])
  const shown = useMemo(() => filterCandidates(ranked, query), [ranked, query])

  // Escape, the backdrop, the focus trap and returning focus to the section
  // card afterwards all come from Dialog. Focus deliberately lands on the
  // sheet rather than the search box: a phone keyboard springing up over the
  // list of names is worse than a tap.
  return (
    <Dialog
      label={`Assign an instructor to ${section.courseCode} ${section.sectionLetter}`}
      onClose={onClose}
      className="flex max-h-[85vh] max-w-lg flex-col rounded-t-xl sm:max-h-[80vh] sm:rounded-xl"
    >
      <>
        <div className="shrink-0 border-b border-slate-200 p-4">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-slate-900">
                {section.courseCode} {section.sectionLetter}
              </h2>
              <p className="text-sm text-slate-600">
                {termLabel} · {meetingLabel(section.meeting)}
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
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name"
            aria-label="Search instructors by name"
            className="mt-3 block min-h-11 w-full rounded-md border border-slate-300 px-3"
          />
          <p className="mt-2 text-xs text-slate-500">
            Best fit first, from submitted preferences, teaching history and current load.
          </p>
        </div>

        <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
          {shown.map((c) => (
            <CandidateRow
              key={c.instructorId}
              c={c}
              assigned={section.instructorIds.includes(c.instructorId)}
              onPick={() => onPick(c.instructorId)}
            />
          ))}
          {shown.length === 0 && (
            <li className="p-6 text-sm text-slate-500">
              {ranked.length === 0
                ? 'No active instructors on the roster yet.'
                : `Nobody matches “${query}”.`}
            </li>
          )}
        </ul>
      </>
    </Dialog>
  )
}
