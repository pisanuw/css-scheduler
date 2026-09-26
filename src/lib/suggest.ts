/**
 * Proposes instructors for the sections nobody is teaching yet.
 *
 * Not a solver in the optimising sense, and deliberately so: the point of the
 * whole application is that a human makes this decision with the constraints
 * visible. This fills the obvious gaps so the coordinator can spend their
 * attention on the hard ones, and every proposal is shown with its reasons
 * before anything is written.
 *
 * Two things make it better than ranking each section independently:
 *
 * Hardest first. A section three people could teach is placed before one that
 * twenty could, because doing it the other way round lets a common section
 * take the only person a rare one had.
 *
 * It accounts for its own proposals. Each placement goes into the working
 * snapshot, so the next section sees the load and the clashes the previous
 * one just created. Ranking every section against the original state would
 * cheerfully propose the same person for two sections at the same hour.
 */

import type { ScheduleSnapshot, Section } from './conflicts'
import { rankCandidates, type Candidate } from './suitability'

export interface Suggestion {
  sectionId: string
  sectionLabel: string
  termId: string
  instructorId: string
  instructorName: string
  /** Soft caveats only; anything hard is refused rather than warned about. */
  warnings: string[]
}

export interface Unfillable {
  sectionId: string
  sectionLabel: string
  reason: string
}

export interface SuggestionResult {
  suggestions: Suggestion[]
  unfillable: Unfillable[]
}

const label = (s: Section) => `${s.courseCode} ${s.sectionLetter}`

/**
 * A candidate is refused outright when taking the section would break a rule
 * rather than merely disappoint someone. These are exactly the conflicts the
 * engine reports as errors, so a suggestion can never introduce one.
 */
function acceptable(c: Candidate): boolean {
  return (
    c.tier !== 'unqualified' && !c.wouldClash && !c.unavailableThisTerm && !c.atQuarterMax
  )
}

/** Why a section could not be filled, in the coordinator's terms. */
function refusalReason(candidates: Candidate[]): string {
  if (candidates.length === 0) return 'there are no instructors on the roster'
  const clash = candidates.filter((c) => c.wouldClash).length
  const unavailable = candidates.filter((c) => c.unavailableThisTerm).length
  const cannot = candidates.filter((c) => c.tier === 'unqualified').length
  const full = candidates.filter((c) => c.atQuarterMax).length
  const bits = [
    cannot > 0 && `${cannot} say they cannot teach it`,
    clash > 0 && `${clash} are busy at that hour`,
    unavailable > 0 && `${unavailable} are away that quarter`,
    full > 0 && `${full} are at their limit for the quarter`,
  ].filter(Boolean) as string[]
  return bits.length > 0 ? `everyone is ruled out — ${bits.join(', ')}` : 'nobody is available'
}

export function suggestAssignments(snap: ScheduleSnapshot): SuggestionResult {
  const unstaffed = snap.sections.filter((s) => s.instructorIds.length === 0)
  if (unstaffed.length === 0) return { suggestions: [], unfillable: [] }

  // A working copy: proposals are written into it as they are made, so later
  // sections are ranked against the schedule as it would then stand.
  let working: ScheduleSnapshot = { ...snap, sections: snap.sections.map((s) => ({ ...s })) }

  const remaining = new Set(unstaffed.map((s) => s.id))
  const suggestions: Suggestion[] = []
  const unfillable: Unfillable[] = []

  while (remaining.size > 0) {
    // Re-measure every round: a placement can narrow another section's options.
    let best: { section: Section; options: Candidate[] } | null = null
    for (const id of remaining) {
      const section = working.sections.find((s) => s.id === id)
      if (!section) {
        remaining.delete(id)
        continue
      }
      const options = rankCandidates(working, section).filter(acceptable)
      if (!best || options.length < best.options.length) best = { section, options }
      // Nothing is scarcer than no options at all; stop looking.
      if (options.length === 0) break
    }
    if (!best) break

    remaining.delete(best.section.id)

    const pick = best.options[0]
    if (!pick) {
      unfillable.push({
        sectionId: best.section.id,
        sectionLabel: label(best.section),
        reason: refusalReason(rankCandidates(working, best.section)),
      })
      continue
    }

    suggestions.push({
      sectionId: best.section.id,
      sectionLabel: label(best.section),
      termId: best.section.termId,
      instructorId: pick.instructorId,
      instructorName: pick.name,
      warnings: pick.warnings,
    })

    working = {
      ...working,
      sections: working.sections.map((s) =>
        s.id === best!.section.id ? { ...s, instructorIds: [pick.instructorId] } : s,
      ),
    }
  }

  // Report in a stable order rather than the order they happened to be solved.
  const termOrder = new Map(snap.terms.map((t, i) => [t.id, i]))
  suggestions.sort(
    (a, b) =>
      (termOrder.get(a.termId) ?? 0) - (termOrder.get(b.termId) ?? 0) ||
      a.sectionLabel.localeCompare(b.sectionLabel, undefined, { numeric: true }),
  )
  unfillable.sort((a, b) => a.sectionLabel.localeCompare(b.sectionLabel, undefined, { numeric: true }))

  return { suggestions, unfillable }
}
