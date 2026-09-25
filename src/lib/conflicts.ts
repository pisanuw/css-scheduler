/**
 * Conflict detection for a draft teaching schedule.
 *
 * Pure and synchronous on purpose: the assignment board re-runs this on every
 * drag, so it must be fast and must not touch the network. Nothing here reads
 * from Supabase — callers hand in a snapshot and get findings back.
 */

export type Quarter = 'autumn' | 'winter' | 'spring' | 'summer'
export type Modality = 'in_person' | 'hybrid' | 'online_sync' | 'online_async'
export type PrefTier = 'eager' | 'willing' | 'reluctant' | 'unqualified'
export type Severity = 'error' | 'warning' | 'info'

export type ConflictCode =
  | 'section_unstaffed'
  | 'instructor_time_overlap'
  | 'instructor_over_quarter_max'
  | 'instructor_over_annual_target'
  | 'instructor_under_annual_target'
  | 'instructor_unavailable_term'
  | 'assigned_unqualified_course'
  | 'assigned_reluctant_course'
  | 'blocked_day'
  | 'modality_mismatch'
  | 'room_double_booked'
  | 'new_prep_over_limit'

/** `days` uses ISO day-of-week: 1 = Monday ... 7 = Sunday. Times are 'HH:MM'. */
export interface Meeting {
  days: number[]
  start: string
  end: string
}

export interface Section {
  id: string
  termId: string
  courseId: string
  courseCode: string
  sectionLetter: string
  /** null for "to be arranged" sections, which can never clash on time. */
  meeting: Meeting | null
  modality: Modality
  roomId: string | null
  roomLabel?: string
  instructorIds: string[]
}

export interface Instructor {
  id: string
  name: string
  annualTarget: number | null
  maxPerQuarter: number | null
}

export interface TermInfo {
  id: string
  quarter: Quarter
  label: string
}

export interface Preferences {
  instructorId: string
  unavailableTermIds: string[]
  /** termId -> how many sections they asked for that quarter. */
  desiredCountByTerm: Record<string, number>
  /** courseId -> how they rated it. Absent means "did not say". */
  courseTier: Record<string, PrefTier>
  blockedDays: number[]
  modalityPrefs: Modality[]
  maxNewPreps: number | null
}

export interface ScheduleSnapshot {
  terms: TermInfo[]
  sections: Section[]
  instructors: Instructor[]
  /** instructorId -> preferences. Missing means they did not submit. */
  preferences: Record<string, Preferences>
  /** instructorId -> set of courseIds they have taught before. */
  taughtBefore: Record<string, Set<string>>
}

export interface Conflict {
  code: ConflictCode
  severity: Severity
  message: string
  sectionIds: string[]
  instructorId?: string
  termId?: string
}

const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Two meetings clash when they share a weekday and their times intersect. */
export function meetingsOverlap(a: Meeting | null, b: Meeting | null): boolean {
  if (!a || !b) return false
  if (!a.days.some((d) => b.days.includes(d))) return false
  // 'HH:MM' strings order correctly under plain string comparison.
  return a.start < b.end && b.start < a.end
}

function describe(s: Section): string {
  return `${s.courseCode} ${s.sectionLetter}`
}

export function detectConflicts(snap: ScheduleSnapshot): Conflict[] {
  const out: Conflict[] = []
  const termById = new Map(snap.terms.map((t) => [t.id, t]))
  const instructorById = new Map(snap.instructors.map((i) => [i.id, i]))

  const termLabel = (id: string) => termById.get(id)?.label ?? id
  const who = (id: string) => instructorById.get(id)?.name ?? id

  // --- unstaffed sections -------------------------------------------------
  for (const s of snap.sections) {
    if (s.instructorIds.length === 0) {
      out.push({
        code: 'section_unstaffed',
        severity: 'warning',
        message: `${describe(s)} (${termLabel(s.termId)}) has no instructor assigned.`,
        sectionIds: [s.id],
        termId: s.termId,
      })
    }
  }

  // --- per-instructor rules ----------------------------------------------
  const byInstructor = new Map<string, Section[]>()
  for (const s of snap.sections) {
    for (const id of s.instructorIds) {
      const list = byInstructor.get(id)
      if (list) list.push(s)
      else byInstructor.set(id, [s])
    }
  }

  for (const [instructorId, sections] of byInstructor) {
    const prefs = snap.preferences[instructorId]
    const instructor = instructorById.get(instructorId)

    // Time clashes, compared only within the same quarter.
    for (let i = 0; i < sections.length; i++) {
      for (let j = i + 1; j < sections.length; j++) {
        const a = sections[i]!
        const b = sections[j]!
        if (a.termId !== b.termId) continue
        if (!meetingsOverlap(a.meeting, b.meeting)) continue
        out.push({
          code: 'instructor_time_overlap',
          severity: 'error',
          message:
            `${who(instructorId)} is assigned ${describe(a)} and ${describe(b)} ` +
            `at overlapping times in ${termLabel(a.termId)}.`,
          sectionIds: [a.id, b.id],
          instructorId,
          termId: a.termId,
        })
      }
    }

    // Load per quarter and across the year.
    const perTerm = new Map<string, number>()
    for (const s of sections) perTerm.set(s.termId, (perTerm.get(s.termId) ?? 0) + 1)

    if (instructor?.maxPerQuarter != null) {
      for (const [termId, count] of perTerm) {
        if (count > instructor.maxPerQuarter) {
          out.push({
            code: 'instructor_over_quarter_max',
            severity: 'error',
            message:
              `${who(instructorId)} has ${count} sections in ${termLabel(termId)}, ` +
              `over their limit of ${instructor.maxPerQuarter}.`,
            sectionIds: sections.filter((s) => s.termId === termId).map((s) => s.id),
            instructorId,
            termId,
          })
        }
      }
    }

    if (instructor?.annualTarget != null) {
      const total = sections.length
      if (total > instructor.annualTarget) {
        out.push({
          code: 'instructor_over_annual_target',
          severity: 'warning',
          message: `${who(instructorId)} is assigned ${total} sections against a target of ${instructor.annualTarget}.`,
          sectionIds: sections.map((s) => s.id),
          instructorId,
        })
      } else if (total < instructor.annualTarget) {
        out.push({
          code: 'instructor_under_annual_target',
          severity: 'info',
          message: `${who(instructorId)} is assigned ${total} sections against a target of ${instructor.annualTarget}.`,
          sectionIds: sections.map((s) => s.id),
          instructorId,
        })
      }
    }

    if (!prefs) continue

    // Assigned in a quarter they said they were not available.
    for (const termId of perTerm.keys()) {
      if (prefs.unavailableTermIds.includes(termId)) {
        out.push({
          code: 'instructor_unavailable_term',
          severity: 'error',
          message: `${who(instructorId)} is assigned in ${termLabel(termId)} but marked that quarter unavailable.`,
          sectionIds: sections.filter((s) => s.termId === termId).map((s) => s.id),
          instructorId,
          termId,
        })
      }
    }

    for (const s of sections) {
      // Course preference tier.
      const tier = prefs.courseTier[s.courseId]
      if (tier === 'unqualified') {
        out.push({
          code: 'assigned_unqualified_course',
          severity: 'error',
          message: `${who(instructorId)} is assigned ${describe(s)} but marked it as one they cannot teach.`,
          sectionIds: [s.id],
          instructorId,
          termId: s.termId,
        })
      } else if (tier === 'reluctant') {
        out.push({
          code: 'assigned_reluctant_course',
          severity: 'warning',
          message: `${who(instructorId)} would rather not teach ${describe(s)}.`,
          sectionIds: [s.id],
          instructorId,
          termId: s.termId,
        })
      }

      // Blocked days.
      const clash = s.meeting?.days.filter((d) => prefs.blockedDays.includes(d)) ?? []
      if (clash.length > 0) {
        out.push({
          code: 'blocked_day',
          severity: 'warning',
          message:
            `${describe(s)} meets on ${clash.map((d) => DAY_NAMES[d]).join(', ')}, ` +
            `which ${who(instructorId)} asked to keep free.`,
          sectionIds: [s.id],
          instructorId,
          termId: s.termId,
        })
      }

      // Modality.
      if (prefs.modalityPrefs.length > 0 && !prefs.modalityPrefs.includes(s.modality)) {
        out.push({
          code: 'modality_mismatch',
          severity: 'info',
          message: `${describe(s)} is ${s.modality.replace('_', ' ')}, which is not among ${who(instructorId)}'s preferred formats.`,
          sectionIds: [s.id],
          instructorId,
          termId: s.termId,
        })
      }
    }

    // New preps: courses they have never taught before.
    if (prefs.maxNewPreps != null) {
      const taught = snap.taughtBefore[instructorId] ?? new Set<string>()
      const newPreps = new Set(
        sections.map((s) => s.courseId).filter((courseId) => !taught.has(courseId)),
      )
      if (newPreps.size > prefs.maxNewPreps) {
        out.push({
          code: 'new_prep_over_limit',
          severity: 'warning',
          message:
            `${who(instructorId)} has ${newPreps.size} new preparations, ` +
            `over the ${prefs.maxNewPreps} they asked for.`,
          sectionIds: sections.filter((s) => newPreps.has(s.courseId)).map((s) => s.id),
          instructorId,
        })
      }
    }
  }

  // --- rooms --------------------------------------------------------------
  for (let i = 0; i < snap.sections.length; i++) {
    for (let j = i + 1; j < snap.sections.length; j++) {
      const a = snap.sections[i]!
      const b = snap.sections[j]!
      if (!a.roomId || a.roomId !== b.roomId) continue
      if (a.termId !== b.termId) continue
      if (!meetingsOverlap(a.meeting, b.meeting)) continue
      out.push({
        code: 'room_double_booked',
        severity: 'error',
        message:
          `${describe(a)} and ${describe(b)} are both in ${a.roomLabel ?? 'the same room'} ` +
          `at overlapping times in ${termLabel(a.termId)}.`,
        sectionIds: [a.id, b.id],
        termId: a.termId,
      })
    }
  }

  const rank: Record<Severity, number> = { error: 0, warning: 1, info: 2 }
  return out.sort((x, y) => rank[x.severity] - rank[y.severity])
}

export function countBySeverity(conflicts: Conflict[]): Record<Severity, number> {
  const acc: Record<Severity, number> = { error: 0, warning: 0, info: 0 }
  for (const c of conflicts) acc[c.severity]++
  return acc
}
