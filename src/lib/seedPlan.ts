/**
 * Plans a scenario from a past year's schedule.
 *
 * The board starts empty, and typing eighty sections in by hand is a poor
 * first move when three real quarters are already imported. This turns those
 * rows into a draft the coordinator edits, rather than a blank page.
 *
 * Pure, and it reports what it could not carry across rather than dropping it
 * silently — an import that quietly loses six sections is worse than one that
 * says so.
 */

import type { Modality, Quarter } from './conflicts'
import { toHM } from './snapshot'

export interface HistoryRow {
  id: string
  course_id: string | null
  instructor_id: string | null
  instructor_name_raw: string
  course_code_raw: string
  academic_year: string
  quarter: Quarter
  section_letter: string | null
  days: number[] | null
  start_time: string | null
  end_time: string | null
  room_label: string | null
  modality: Modality | null
  enrollment_cap: number | null
}

export interface PlannedSection {
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
  notes: string | null
  /** Resolved at plan time; written to section_instructors after the insert. */
  instructorIds: string[]
}

export interface SeedPlan {
  sections: PlannedSection[]
  /** Rows that could not become a section at all, with the reason. */
  skipped: { detail: string; reason: string }[]
  stats: {
    sections: number
    assignments: number
    /** Rows merged into an existing section because they shared its slot. */
    merged: number
    /** Sections whose meeting time did not match the grid and became custom. */
    customTimes: number
    /** Sections with no meeting time at all. */
    arranged: number
    /** Sections whose room could not be resolved. */
    roomsUnresolved: number
    /** Assignments dropped because the instructor is no longer on the roster. */
    instructorsDropped: number
  }
}

export interface SeedInput {
  history: HistoryRow[]
  /** The scenario's own terms, one per quarter. */
  terms: { id: string; quarter: Quarter }[]
  timeSlots: { id: string; days: number[]; start_time: string; end_time: string }[]
  /** Labels composed as 'UW1 050', matching how the schedules write them. */
  rooms: { id: string; label: string }[]
  /** Instructors who may still be assigned. Anyone else has their row dropped. */
  activeInstructorIds: Set<string>
  /**
   * Sections the scenario already holds, keyed `termId|courseId|letter`.
   *
   * Seeding a new scenario never needs this, but importing a quarter into a
   * board that already has sections does: that key is unique on the table, so a
   * collision would fail the whole insert. Naming them as skipped lets the rest
   * of the import land.
   */
  existingKeys?: Set<string>
}

/** Grid slots are keyed by their shape so a row can be matched in one lookup. */
function slotKey(days: number[], start: string, end: string): string {
  return `${[...days].sort((a, b) => a - b).join(',')}|${toHM(start)}|${toHM(end)}`
}

export function planFromHistory(input: SeedInput): SeedPlan {
  const termByQuarter = new Map(input.terms.map((t) => [t.quarter, t.id]))
  const roomByLabel = new Map(input.rooms.map((r) => [r.label.toUpperCase(), r.id]))
  const slotByShape = new Map(
    input.timeSlots.map((s) => [slotKey(s.days, s.start_time, s.end_time), s.id]),
  )

  const sections: PlannedSection[] = []
  const skipped: SeedPlan['skipped'] = []
  // (term, course, letter) is unique on the sections table, so rows that
  // collide there are the same section taught by two people, not two sections.
  const byKey = new Map<string, PlannedSection>()
  const stats: SeedPlan['stats'] = {
    sections: 0,
    assignments: 0,
    merged: 0,
    customTimes: 0,
    arranged: 0,
    roomsUnresolved: 0,
    instructorsDropped: 0,
  }

  for (const row of input.history) {
    const label = `${row.course_code_raw} ${row.section_letter ?? '?'} (${row.quarter})`

    if (!row.course_id) {
      skipped.push({ detail: label, reason: 'course is not in the catalogue' })
      continue
    }
    const termId = termByQuarter.get(row.quarter)
    if (!termId) {
      skipped.push({ detail: label, reason: `the scenario has no ${row.quarter} term` })
      continue
    }

    const letter = (row.section_letter ?? 'A').trim().toUpperCase() || 'A'
    const key = `${termId}|${row.course_id}|${letter}`

    if (input.existingKeys?.has(key)) {
      skipped.push({ detail: label, reason: 'already in this scenario' })
      continue
    }

    const instructorIds =
      row.instructor_id && input.activeInstructorIds.has(row.instructor_id) ? [row.instructor_id] : []
    if (row.instructor_id && instructorIds.length === 0) stats.instructorsDropped++

    const existing = byKey.get(key)
    if (existing) {
      // Co-taught: keep the section, add the second person.
      for (const id of instructorIds) {
        if (!existing.instructorIds.includes(id)) existing.instructorIds.push(id)
      }
      stats.merged++
      continue
    }

    const hasTime = !!(row.days && row.days.length > 0 && row.start_time && row.end_time)
    const slotId = hasTime ? slotByShape.get(slotKey(row.days!, row.start_time!, row.end_time!)) : undefined

    let timing: Pick<
      PlannedSection,
      'time_slot_id' | 'custom_days' | 'custom_start' | 'custom_end' | 'is_arranged'
    >
    if (slotId) {
      timing = {
        time_slot_id: slotId,
        custom_days: null,
        custom_start: null,
        custom_end: null,
        is_arranged: false,
      }
    } else if (hasTime) {
      // A real meeting that is not on the standard grid keeps its own time.
      timing = {
        time_slot_id: null,
        custom_days: row.days!,
        custom_start: toHM(row.start_time!),
        custom_end: toHM(row.end_time!),
        is_arranged: false,
      }
      stats.customTimes++
    } else {
      timing = {
        time_slot_id: null,
        custom_days: null,
        custom_start: null,
        custom_end: null,
        is_arranged: true,
      }
      stats.arranged++
    }

    const roomId = row.room_label ? (roomByLabel.get(row.room_label.toUpperCase()) ?? null) : null
    if (row.room_label && !roomId) stats.roomsUnresolved++

    const planned: PlannedSection = {
      term_id: termId,
      course_id: row.course_id,
      section_letter: letter,
      ...timing,
      modality: row.modality ?? 'in_person',
      room_id: roomId,
      enrollment_cap: row.enrollment_cap,
      notes: null,
      instructorIds,
    }
    byKey.set(key, planned)
    sections.push(planned)
  }

  stats.sections = sections.length
  stats.assignments = sections.reduce((n, s) => n + s.instructorIds.length, 0)
  return { sections, skipped, stats }
}

/** One line summarising a plan, for the confirmation step before it is written. */
export function describePlan(plan: SeedPlan): string {
  const { stats } = plan
  const bits = [`${stats.sections} sections`, `${stats.assignments} assignments`]
  if (stats.merged) bits.push(`${stats.merged} co-taught`)
  if (stats.customTimes) bits.push(`${stats.customTimes} off-grid times`)
  if (stats.arranged) bits.push(`${stats.arranged} to be arranged`)
  if (stats.instructorsDropped) bits.push(`${stats.instructorsDropped} instructors no longer on the roster`)
  if (plan.skipped.length) bits.push(`${plan.skipped.length} skipped`)
  return bits.join(' · ')
}
