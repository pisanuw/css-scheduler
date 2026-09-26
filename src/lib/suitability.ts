/**
 * Ranks instructors for one section.
 *
 * The board's assign step is where a constraint is either honoured or broken,
 * so this puts the reason in front of the coordinator at that moment rather
 * than leaving it to the conflict panel afterwards. Pure over a
 * ScheduleSnapshot for the same reason the engine is: it runs on every
 * keystroke in the search box.
 */

import { meetingsOverlap, type PrefTier, type ScheduleSnapshot, type Section } from './conflicts'

export interface Candidate {
  instructorId: string
  name: string
  /** How they rated this course, or null if they did not say (or did not submit). */
  tier: PrefTier | null
  taughtBefore: boolean
  assignedThisTerm: number
  assignedTotal: number
  target: number | null
  maxPerQuarter: number | null
  unavailableThisTerm: boolean
  /** Already teaching something that overlaps this section's meeting. */
  wouldClash: boolean
  /** This section meets on a day they asked to keep free. */
  blockedDay: boolean
  atQuarterMax: boolean
  /** Why this one is ranked where it is, shortest first. Empty means no caveat. */
  warnings: string[]
  /** Lower is better. */
  score: number
}

/** Penalties, largest first. The order of these numbers *is* the policy. */
const PENALTY = {
  unqualified: 10_000,
  clash: 5_000,
  unavailable: 4_000,
  atQuarterMax: 2_000,
  reluctant: 500,
  blockedDay: 200,
  didNotSay: 60,
  willing: 20,
  newPrep: 8,
  /** Multiplier on how far above target the assignment would put them. */
  overTarget: 3,
}

export function rankCandidates(snap: ScheduleSnapshot, section: Section): Candidate[] {
  const assignedByInstructor = new Map<string, Section[]>()
  for (const s of snap.sections) {
    for (const id of s.instructorIds) {
      const list = assignedByInstructor.get(id)
      if (list) list.push(s)
      else assignedByInstructor.set(id, [s])
    }
  }

  return snap.instructors
    .map((instructor) => {
      const mine = assignedByInstructor.get(instructor.id) ?? []
      const thisTerm = mine.filter((s) => s.termId === section.termId)
      const prefs = snap.preferences[instructor.id]
      const tier = prefs?.courseTier[section.courseId] ?? null
      const taughtBefore = snap.taughtBefore[instructor.id]?.has(section.courseId) ?? false

      const wouldClash = thisTerm.some(
        (s) => s.id !== section.id && meetingsOverlap(s.meeting, section.meeting),
      )
      const unavailableThisTerm = prefs?.unavailableTermIds.includes(section.termId) ?? false
      const blockedDay =
        (section.meeting?.days.some((d) => prefs?.blockedDays.includes(d)) ?? false) && !!prefs
      const alreadyOn = section.instructorIds.includes(instructor.id)
      const countAfter = alreadyOn ? thisTerm.length : thisTerm.length + 1
      const atQuarterMax = instructor.maxPerQuarter != null && countAfter > instructor.maxPerQuarter

      const warnings: string[] = []
      let score = 0

      if (tier === 'unqualified') {
        score += PENALTY.unqualified
        warnings.push('says they cannot teach this')
      } else if (tier === 'reluctant') {
        score += PENALTY.reluctant
        warnings.push('would rather not')
      } else if (tier === 'willing') {
        score += PENALTY.willing
      } else if (tier === null) {
        score += PENALTY.didNotSay
      }

      if (wouldClash) {
        score += PENALTY.clash
        warnings.push('clashes with another section')
      }
      if (unavailableThisTerm) {
        score += PENALTY.unavailable
        warnings.push('marked this quarter unavailable')
      }
      if (atQuarterMax) {
        score += PENALTY.atQuarterMax
        warnings.push(`over their ${instructor.maxPerQuarter} a quarter`)
      }
      if (blockedDay) {
        score += PENALTY.blockedDay
        warnings.push('meets on a day they keep free')
      }
      if (!taughtBefore) {
        score += PENALTY.newPrep
        warnings.push('new preparation')
      }

      const totalAfter = alreadyOn ? mine.length : mine.length + 1
      if (instructor.annualTarget != null) {
        // Below target is where we want to put people, so only the overshoot
        // costs anything; the sort tie-breaks on remaining room below.
        const over = totalAfter - instructor.annualTarget
        if (over > 0) {
          score += over * PENALTY.overTarget
          warnings.push(`over their target of ${instructor.annualTarget}`)
        }
      }

      return {
        instructorId: instructor.id,
        name: instructor.name,
        tier,
        taughtBefore,
        assignedThisTerm: thisTerm.length,
        assignedTotal: mine.length,
        target: instructor.annualTarget,
        maxPerQuarter: instructor.maxPerQuarter,
        unavailableThisTerm,
        wouldClash,
        blockedDay,
        atQuarterMax,
        warnings,
        score,
      }
    })
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score
      // Equal on paper: give it to whoever has the most room left.
      const roomA = a.target == null ? 0 : a.target - a.assignedTotal
      const roomB = b.target == null ? 0 : b.target - b.assignedTotal
      if (roomA !== roomB) return roomB - roomA
      return a.name.localeCompare(b.name)
    })
}

/** Substring match on the name, for the search box above the candidate list. */
export function filterCandidates(candidates: Candidate[], query: string): Candidate[] {
  const q = query.trim().toLowerCase()
  if (!q) return candidates
  return candidates.filter((c) => c.name.toLowerCase().includes(q))
}
