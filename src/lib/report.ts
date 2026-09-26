/**
 * How well a scenario honours what instructors asked for.
 *
 * The conflict panel answers "what is broken"; this answers "how did we do".
 * They are different questions: a schedule can have no conflicts at all and
 * still have given nobody a course they wanted.
 *
 * Pure over a ScheduleSnapshot, like everything else the board computes.
 *
 * The headline figure counts only assignments where the instructor both
 * submitted preferences and rated that course. Counting an unrated course as
 * a success would flatter the number, and counting it as a failure would
 * punish the coordinator for a question nobody answered — so it is reported
 * separately instead.
 */

import type { PrefTier, ScheduleSnapshot } from './conflicts'
import { meetingsOverlap } from './conflicts'

export type TierBucket = PrefTier | 'unrated'

export const TIER_BUCKETS: TierBucket[] = ['eager', 'willing', 'reluctant', 'unqualified', 'unrated']

export interface InstructorReport {
  instructorId: string
  name: string
  submitted: boolean
  assigned: number
  target: number | null
  byTier: Record<TierBucket, number>
  /** Courses assigned that this person has not taught before. */
  newPreps: number
  maxNewPreps: number | null
  byTerm: { termId: string; label: string; desired: number | null; actual: number }[]
  /** Assigned in a quarter they marked unavailable. */
  unavailableTerms: number
  blockedDayHits: number
  modalityMismatches: number
  /** eager + willing, over everything they rated. Null when they rated none. */
  satisfaction: number | null
}

export interface ScheduleReport {
  totals: {
    sections: number
    staffed: number
    unstaffed: number
    assignments: number
    byTier: Record<TierBucket, number>
    /** Instructors holding at least one section. */
    instructorsAssigned: number
    /** Of those, how many submitted preferences. */
    withPreferences: number
  }
  /** eager + willing over all rated assignments. Null when nothing is rated. */
  satisfaction: number | null
  instructors: InstructorReport[]
  perTerm: { termId: string; label: string; sections: number; unstaffed: number }[]
}

function emptyTiers(): Record<TierBucket, number> {
  return { eager: 0, willing: 0, reluctant: 0, unqualified: 0, unrated: 0 }
}

/** eager + willing as a share of everything actually rated. */
export function satisfactionOf(tiers: Record<TierBucket, number>): number | null {
  const rated = tiers.eager + tiers.willing + tiers.reluctant + tiers.unqualified
  if (rated === 0) return null
  return (tiers.eager + tiers.willing) / rated
}

export function buildReport(snap: ScheduleSnapshot): ScheduleReport {
  const totals = emptyTiers()
  const byInstructor = new Map<string, InstructorReport>()

  const blank = (id: string): InstructorReport => {
    const instructor = snap.instructors.find((i) => i.id === id)
    const prefs = snap.preferences[id]
    return {
      instructorId: id,
      name: instructor?.name ?? 'Unknown',
      submitted: !!prefs,
      assigned: 0,
      target: instructor?.annualTarget ?? null,
      byTier: emptyTiers(),
      newPreps: 0,
      maxNewPreps: prefs?.maxNewPreps ?? null,
      byTerm: snap.terms.map((t) => ({
        termId: t.id,
        label: t.label,
        desired: prefs?.desiredCountByTerm[t.id] ?? null,
        actual: 0,
      })),
      unavailableTerms: 0,
      blockedDayHits: 0,
      modalityMismatches: 0,
      satisfaction: null,
    }
  }

  let staffed = 0
  let assignments = 0

  for (const section of snap.sections) {
    if (section.instructorIds.length > 0) staffed++

    for (const id of section.instructorIds) {
      assignments++
      let rep = byInstructor.get(id)
      if (!rep) {
        rep = blank(id)
        byInstructor.set(id, rep)
      }
      const prefs = snap.preferences[id]
      const tier: TierBucket = prefs?.courseTier[section.courseId] ?? 'unrated'
      rep.byTier[tier]++
      totals[tier]++
      rep.assigned++

      const term = rep.byTerm.find((t) => t.termId === section.termId)
      if (term) term.actual++

      if (prefs) {
        if (prefs.unavailableTermIds.includes(section.termId)) rep.unavailableTerms++
        if (section.meeting?.days.some((d) => prefs.blockedDays.includes(d))) rep.blockedDayHits++
        if (prefs.modalityPrefs.length > 0 && !prefs.modalityPrefs.includes(section.modality)) {
          rep.modalityMismatches++
        }
      }
    }
  }

  // New preparations count distinct courses, so they are tallied per person
  // after the sections have been walked rather than inside the loop.
  for (const [id, rep] of byInstructor) {
    const taught = snap.taughtBefore[id] ?? new Set<string>()
    const courses = new Set(
      snap.sections.filter((s) => s.instructorIds.includes(id)).map((s) => s.courseId),
    )
    rep.newPreps = [...courses].filter((c) => !taught.has(c)).length
    rep.satisfaction = satisfactionOf(rep.byTier)
  }

  const perTerm = snap.terms.map((t) => {
    const inTerm = snap.sections.filter((s) => s.termId === t.id)
    return {
      termId: t.id,
      label: t.label,
      sections: inTerm.length,
      unstaffed: inTerm.filter((s) => s.instructorIds.length === 0).length,
    }
  })

  const instructors = [...byInstructor.values()].sort((a, b) => {
    // Worst-served first: that is the list the coordinator has to act on.
    const sa = a.satisfaction ?? 1
    const sb = b.satisfaction ?? 1
    if (sa !== sb) return sa - sb
    return a.name.localeCompare(b.name)
  })

  return {
    totals: {
      sections: snap.sections.length,
      staffed,
      unstaffed: snap.sections.length - staffed,
      assignments,
      byTier: totals,
      instructorsAssigned: byInstructor.size,
      withPreferences: instructors.filter((i) => i.submitted).length,
    },
    satisfaction: satisfactionOf(totals),
    instructors,
    perTerm,
  }
}

// ------------------------------------------------------------------- exports

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  // A leading BOM so Excel opens UTF-8 course titles correctly.
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/** One row per section: the schedule itself, for a spreadsheet. */
export function scheduleCsv(snap: ScheduleSnapshot, meetingLabel: (id: string) => string): string {
  const nameById = new Map(snap.instructors.map((i) => [i.id, i.name]))
  const termById = new Map(snap.terms.map((t) => [t.id, t.label]))
  const order = new Map(snap.terms.map((t, i) => [t.id, i]))

  const rows = [...snap.sections]
    .sort(
      (a, b) =>
        (order.get(a.termId) ?? 0) - (order.get(b.termId) ?? 0) ||
        a.courseCode.localeCompare(b.courseCode, undefined, { numeric: true }) ||
        a.sectionLetter.localeCompare(b.sectionLetter),
    )
    .map((s) => [
      termById.get(s.termId) ?? '',
      s.courseCode,
      s.sectionLetter,
      meetingLabel(s.id),
      s.modality.replace(/_/g, ' '),
      s.roomLabel ?? '',
      s.instructorIds.map((id) => nameById.get(id) ?? id).join('; '),
    ])

  return toCsv(
    ['Quarter', 'Course', 'Section', 'Meets', 'Format', 'Room', 'Instructor(s)'],
    rows,
  )
}

/** One row per instructor: how well the schedule served them. */
export function reportCsv(report: ScheduleReport): string {
  const rows = report.instructors.map((i) => [
    i.name,
    i.submitted ? 'yes' : 'no',
    i.assigned,
    i.target,
    i.byTier.eager,
    i.byTier.willing,
    i.byTier.reluctant,
    i.byTier.unqualified,
    i.byTier.unrated,
    i.satisfaction === null ? '' : Math.round(i.satisfaction * 100),
    i.newPreps,
    i.maxNewPreps,
    i.unavailableTerms,
    i.blockedDayHits,
    i.modalityMismatches,
  ])
  return toCsv(
    [
      'Instructor',
      'Submitted preferences',
      'Sections assigned',
      'Annual target',
      'Wanted',
      'Willing',
      'Rather not',
      'Cannot teach',
      'Did not rate',
      'Preferences met (%)',
      'New preparations',
      'New prep limit',
      'Quarters marked unavailable',
      'Blocked-day sections',
      'Format mismatches',
    ],
    rows,
  )
}

// -------------------------------------------------------------- comparison

export interface ScenarioComparison {
  label: string
  sections: number
  unstaffed: number
  satisfaction: number | null
  byTier: Record<TierBucket, number>
  errors: number
  warnings: number
  /** Instructors assigned in this scenario but not the other, and vice versa. */
  onlyHere: string[]
}

/**
 * Two scenarios side by side. Deliberately a small set of numbers: the point
 * is to choose between drafts, not to diff every section.
 */
export function compareScenarios(
  a: { label: string; snapshot: ScheduleSnapshot; errors: number; warnings: number },
  b: { label: string; snapshot: ScheduleSnapshot; errors: number; warnings: number },
): [ScenarioComparison, ScenarioComparison] {
  const assignedIn = (s: ScheduleSnapshot) =>
    new Set(s.sections.flatMap((x) => x.instructorIds))

  const side = (
    x: typeof a,
    other: ScheduleSnapshot,
  ): ScenarioComparison => {
    const report = buildReport(x.snapshot)
    const mine = assignedIn(x.snapshot)
    const theirs = assignedIn(other)
    const nameById = new Map(x.snapshot.instructors.map((i) => [i.id, i.name]))
    return {
      label: x.label,
      sections: report.totals.sections,
      unstaffed: report.totals.unstaffed,
      satisfaction: report.satisfaction,
      byTier: report.totals.byTier,
      errors: x.errors,
      warnings: x.warnings,
      onlyHere: [...mine]
        .filter((id) => !theirs.has(id))
        .map((id) => nameById.get(id) ?? id)
        .sort(),
    }
  }

  return [side(a, b.snapshot), side(b, a.snapshot)]
}

/**
 * The comparison as a spreadsheet: one row per number the page shows, one
 * column per scenario, in the order they appear on screen.
 *
 * Long-ways rather than one row per scenario because that is how the page
 * reads and how the choice is actually made — the eye runs across a row
 * asking "which of these two is better at this", not down a column.
 */
export function comparisonCsv(sides: [ScenarioComparison, ScenarioComparison]): string {
  const [a, b] = sides
  const tierLabel: Record<TierBucket, string> = {
    eager: 'Wanted it',
    willing: 'Willing',
    reluctant: 'Rather not',
    unqualified: 'Cannot teach',
    unrated: 'Did not rate',
  }
  const rows: (string | number | null)[][] = [
    [
      'Preferences met (%)',
      a.satisfaction === null ? '' : Math.round(a.satisfaction * 100),
      b.satisfaction === null ? '' : Math.round(b.satisfaction * 100),
    ],
    ['Sections', a.sections, b.sections],
    ['Unstaffed', a.unstaffed, b.unstaffed],
    ['Errors', a.errors, b.errors],
    ['Warnings', a.warnings, b.warnings],
    ...TIER_BUCKETS.map((t) => [tierLabel[t], a.byTier[t], b.byTier[t]]),
    ['Teaching only here', a.onlyHere.join('; '), b.onlyHere.join('; ')],
  ]
  return toCsv(['Metric', a.label, b.label], rows)
}

/**
 * Sections a student taking all of `courseIds` could not attend together.
 * Iteration 5's student-facing check: the same overlap rule the instructor
 * conflicts use, asked of a course list instead of a person.
 */
export function studentClashes(
  snap: ScheduleSnapshot,
  courseIds: string[],
): { termId: string; termLabel: string; a: string; b: string }[] {
  const wanted = new Set(courseIds)
  const out: { termId: string; termLabel: string; a: string; b: string }[] = []
  const label = (id: string) => snap.terms.find((t) => t.id === id)?.label ?? id

  for (const term of snap.terms) {
    const inTerm = snap.sections.filter((s) => s.termId === term.id && wanted.has(s.courseId))
    for (let i = 0; i < inTerm.length; i++) {
      for (let j = i + 1; j < inTerm.length; j++) {
        const x = inTerm[i]!
        const y = inTerm[j]!
        if (x.courseId === y.courseId) continue // another section of the same course
        if (!meetingsOverlap(x.meeting, y.meeting)) continue
        out.push({
          termId: term.id,
          termLabel: label(term.id),
          a: `${x.courseCode} ${x.sectionLetter}`,
          b: `${y.courseCode} ${y.sectionLetter}`,
        })
      }
    }
  }
  return out
}

/**
 * Which pairs of courses a student genuinely cannot combine, as opposed to
 * one unlucky pair of sections: if any pair of sections of the two courses
 * fits, the combination is possible.
 */
export function unavoidableStudentClashes(
  snap: ScheduleSnapshot,
  courseIds: string[],
): { termId: string; termLabel: string; courses: [string, string] }[] {
  const wanted = [...new Set(courseIds)]
  const out: { termId: string; termLabel: string; courses: [string, string] }[] = []

  for (const term of snap.terms) {
    for (let i = 0; i < wanted.length; i++) {
      for (let j = i + 1; j < wanted.length; j++) {
        const first = snap.sections.filter((s) => s.termId === term.id && s.courseId === wanted[i])
        const second = snap.sections.filter((s) => s.termId === term.id && s.courseId === wanted[j])
        if (first.length === 0 || second.length === 0) continue
        const anyFits = first.some((x) => second.some((y) => !meetingsOverlap(x.meeting, y.meeting)))
        if (anyFits) continue
        out.push({
          termId: term.id,
          termLabel: snap.terms.find((t) => t.id === term.id)?.label ?? term.id,
          courses: [first[0]!.courseCode, second[0]!.courseCode],
        })
      }
    }
  }
  return out
}
