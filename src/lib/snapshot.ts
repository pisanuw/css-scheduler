/**
 * Builds the conflict engine's input from database rows.
 *
 * Kept separate from both the engine and the hooks, and pure, because this is
 * where the fiddly reconciliation lives: three ways of expressing a meeting
 * time collapse into one, Postgres `time` values need trimming before the
 * engine's string comparisons are safe, and preferences arrive spread across
 * three tables. All of that is worth testing without a database.
 */

import type {
  Instructor,
  Meeting,
  Modality,
  PrefTier,
  Preferences,
  Quarter,
  ScheduleSnapshot,
  Section,
  TermInfo,
} from './conflicts'

// ---------------------------------------------------------------- row shapes

export interface SectionRow {
  id: string
  scenario_id: string
  term_id: string
  course_id: string
  section_letter: string
  time_slot_id: string | null
  custom_days: number[] | null
  custom_start: string | null
  custom_end: string | null
  is_arranged: boolean
  modality: Modality
  room_id: string | null
  enrollment_cap: number | null
  status: 'planned' | 'staffed' | 'confirmed' | 'cancelled'
  notes: string | null
}

export interface AssignmentRow {
  id: string
  section_id: string
  instructor_id: string
  is_primary: boolean
}

export interface TimeSlotRow {
  id: string
  label: string
  day_pattern: string
  days: number[]
  start_time: string
  end_time: string
  is_standard: boolean
  sort_order: number
  is_active: boolean
}

export interface TermRow {
  id: string
  academic_year_id: string
  quarter: Quarter
  sort_order: number
}

export interface SubmissionBundle {
  instructor_id: string
  status: 'not_started' | 'draft' | 'submitted'
  blocked_days: number[]
  modality_prefs: Modality[]
  max_new_preps: number | null
  courses: { course_id: string; tier: PrefTier }[]
  terms: { term_id: string; available: boolean; desired_course_count: number | null }[]
}

export interface SnapshotInput {
  terms: TermRow[]
  sections: SectionRow[]
  assignments: AssignmentRow[]
  courses: { id: string; code: string }[]
  timeSlots: TimeSlotRow[]
  rooms?: { id: string; label: string }[]
  instructors: { id: string; full_name: string; max_courses_per_quarter: number | null }[]
  /** From instructor_load_targets, already filtered to one academic year. */
  loadTargets: { instructor_id: string; effective_target: number | string | null }[]
  submissions: SubmissionBundle[]
  /** teaching_history rows, resolved to ids where the import could match them. */
  history: { instructor_id: string | null; course_id: string | null }[]
}

// ------------------------------------------------------------------ helpers

const QUARTER_LABEL: Record<Quarter, string> = {
  autumn: 'Autumn',
  winter: 'Winter',
  spring: 'Spring',
  summer: 'Summer',
}

/**
 * Postgres `time` serialises as 'HH:MM:SS'. The engine orders meetings with
 * plain string comparison, which is only sound when every value has the same
 * shape — mixing '13:15' with '13:15:00' would compare wrong at the boundary.
 */
export function toHM(t: string): string {
  return t.slice(0, 5)
}

/**
 * One meeting out of the three mutually exclusive ways a section can express
 * its time. Returns null for arranged sections, which can never clash.
 */
export function sectionMeeting(
  s: Pick<SectionRow, 'is_arranged' | 'time_slot_id' | 'custom_days' | 'custom_start' | 'custom_end'>,
  slotById: Map<string, TimeSlotRow>,
): Meeting | null {
  if (s.is_arranged) return null
  if (s.time_slot_id) {
    const slot = slotById.get(s.time_slot_id)
    if (!slot) return null
    return { days: slot.days, start: toHM(slot.start_time), end: toHM(slot.end_time) }
  }
  if (s.custom_days && s.custom_start && s.custom_end) {
    return { days: s.custom_days, start: toHM(s.custom_start), end: toHM(s.custom_end) }
  }
  return null
}

/** Human label for a section's meeting time, used on the board and in exports. */
export function meetingLabel(m: Meeting | null): string {
  if (!m) return 'To be arranged'
  const letters = ['', 'M', 'T', 'W', 'Th', 'F', 'S', 'Su']
  const days = m.days.map((d) => letters[d] ?? '?').join('')
  return `${days} ${to12h(m.start)}–${to12h(m.end)}`
}

function to12h(hm: string): string {
  const [h, min] = hm.split(':')
  const hour = Number(h)
  const suffix = hour >= 12 ? 'pm' : 'am'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return min === '00' ? `${h12}${suffix}` : `${h12}:${min}${suffix}`
}

function numberOrNull(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

// ----------------------------------------------------------------- the build

/**
 * Only submitted preferences are honoured. A half-filled draft would have the
 * engine judge an assignment against answers the instructor has not stood
 * behind yet, and the Responses page already shows who still owes one.
 */
export function buildSnapshot(input: SnapshotInput): ScheduleSnapshot {
  const slotById = new Map(input.timeSlots.map((s) => [s.id, s]))
  const courseById = new Map(input.courses.map((c) => [c.id, c]))
  const roomById = new Map((input.rooms ?? []).map((r) => [r.id, r]))
  const targetByInstructor = new Map(
    input.loadTargets.map((t) => [t.instructor_id, numberOrNull(t.effective_target)]),
  )

  const instructorIdsBySection = new Map<string, string[]>()
  for (const a of input.assignments) {
    const list = instructorIdsBySection.get(a.section_id)
    if (list) list.push(a.instructor_id)
    else instructorIdsBySection.set(a.section_id, [a.instructor_id])
  }

  const terms: TermInfo[] = [...input.terms]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((t) => ({ id: t.id, quarter: t.quarter, label: QUARTER_LABEL[t.quarter] }))

  const sections: Section[] = input.sections.map((s) => ({
    id: s.id,
    termId: s.term_id,
    courseId: s.course_id,
    courseCode: courseById.get(s.course_id)?.code ?? 'Unknown course',
    sectionLetter: s.section_letter,
    meeting: sectionMeeting(s, slotById),
    modality: s.modality,
    roomId: s.room_id,
    roomLabel: s.room_id ? roomById.get(s.room_id)?.label : undefined,
    instructorIds: instructorIdsBySection.get(s.id) ?? [],
  }))

  const instructors: Instructor[] = input.instructors.map((i) => ({
    id: i.id,
    name: i.full_name,
    annualTarget: targetByInstructor.get(i.id) ?? null,
    maxPerQuarter: i.max_courses_per_quarter,
  }))

  const preferences: Record<string, Preferences> = {}
  for (const sub of input.submissions) {
    if (sub.status !== 'submitted') continue
    const courseTier: Record<string, PrefTier> = {}
    for (const c of sub.courses) courseTier[c.course_id] = c.tier
    const desiredCountByTerm: Record<string, number> = {}
    const unavailableTermIds: string[] = []
    for (const t of sub.terms) {
      if (!t.available) unavailableTermIds.push(t.term_id)
      else if (t.desired_course_count != null) desiredCountByTerm[t.term_id] = t.desired_course_count
    }
    preferences[sub.instructor_id] = {
      instructorId: sub.instructor_id,
      unavailableTermIds,
      desiredCountByTerm,
      courseTier,
      blockedDays: sub.blocked_days ?? [],
      modalityPrefs: sub.modality_prefs ?? [],
      maxNewPreps: sub.max_new_preps,
    }
  }

  const taughtBefore: Record<string, Set<string>> = {}
  for (const h of input.history) {
    if (!h.instructor_id || !h.course_id) continue
    const set = taughtBefore[h.instructor_id] ?? (taughtBefore[h.instructor_id] = new Set())
    set.add(h.course_id)
  }

  return { terms, sections, instructors, preferences, taughtBefore }
}

// -------------------------------------------------------------- load tallies

export interface LoadTally {
  instructorId: string
  name: string
  /** termId -> sections assigned that quarter. */
  byTerm: Record<string, number>
  total: number
  target: number | null
  maxPerQuarter: number | null
}

/**
 * Per-instructor counts against their effective target. Everyone with a target
 * or an assignment appears; the long tail of historical names with neither is
 * left out so the panel stays readable.
 */
export function loadTallies(snap: ScheduleSnapshot): LoadTally[] {
  const byInstructor = new Map<string, Record<string, number>>()
  for (const s of snap.sections) {
    for (const id of s.instructorIds) {
      let counts = byInstructor.get(id)
      if (!counts) {
        counts = {}
        byInstructor.set(id, counts)
      }
      counts[s.termId] = (counts[s.termId] ?? 0) + 1
    }
  }

  return snap.instructors
    .filter((i) => i.annualTarget != null || byInstructor.has(i.id))
    .map((i) => {
      const byTerm = byInstructor.get(i.id) ?? {}
      return {
        instructorId: i.id,
        name: i.name,
        byTerm,
        total: Object.values(byTerm).reduce((a, b) => a + b, 0),
        target: i.annualTarget,
        maxPerQuarter: i.maxPerQuarter,
      }
    })
    .sort((a, b) => {
      // Work to do first: the furthest below target, then by name.
      const gapA = a.target == null ? 0 : a.target - a.total
      const gapB = b.target == null ? 0 : b.target - b.total
      if (gapA !== gapB) return gapB - gapA
      return a.name.localeCompare(b.name)
    })
}
