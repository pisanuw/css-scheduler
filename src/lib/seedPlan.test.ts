import { describe, expect, it } from 'vitest'
import { describePlan, planFromHistory, type HistoryRow, type SeedInput } from './seedPlan'

const SLOTS = [
  { id: 'mw-115', days: [1, 3], start_time: '13:15:00', end_time: '15:15:00' },
  { id: 'tth-845', days: [2, 4], start_time: '08:45:00', end_time: '10:45:00' },
]

const row = (over: Partial<HistoryRow> = {}): HistoryRow => ({
  id: 'h1',
  course_id: 'c143',
  instructor_id: 'i1',
  instructor_name_raw: 'Stride,Jeff',
  course_code_raw: 'CSS 143',
  academic_year: '2025-26',
  quarter: 'autumn',
  section_letter: 'A',
  days: [1, 3],
  start_time: '13:15:00',
  end_time: '15:15:00',
  room_label: 'UW1 050',
  modality: 'in_person',
  enrollment_cap: 40,
  ...over,
})

function input(over: Partial<SeedInput> = {}): SeedInput {
  return {
    history: [],
    terms: [
      { id: 'au', quarter: 'autumn' },
      { id: 'wi', quarter: 'winter' },
      { id: 'sp', quarter: 'spring' },
    ],
    timeSlots: SLOTS,
    rooms: [
      { id: 'r050', label: 'UW1 050' },
      { id: 'r131', label: 'UW2 131' },
    ],
    activeInstructorIds: new Set(['i1', 'i2']),
    ...over,
  }
}

describe('planFromHistory', () => {
  it('carries a clean row across whole', () => {
    const plan = planFromHistory(input({ history: [row()] }))
    expect(plan.sections).toHaveLength(1)
    expect(plan.sections[0]).toMatchObject({
      term_id: 'au',
      course_id: 'c143',
      section_letter: 'A',
      time_slot_id: 'mw-115',
      is_arranged: false,
      custom_days: null,
      modality: 'in_person',
      room_id: 'r050',
      enrollment_cap: 40,
      instructorIds: ['i1'],
    })
    expect(plan.skipped).toEqual([])
  })

  it('maps each quarter onto the target year, not the source year', () => {
    const plan = planFromHistory(
      input({
        history: [
          row({ id: 'a', quarter: 'autumn' }),
          row({ id: 'b', quarter: 'winter', course_id: 'c342' }),
          row({ id: 'c', quarter: 'spring', course_id: 'c360' }),
        ],
      }),
    )
    expect(plan.sections.map((s) => s.term_id)).toEqual(['au', 'wi', 'sp'])
  })

  it('matches the standard grid regardless of how the days are ordered', () => {
    const plan = planFromHistory(input({ history: [row({ days: [3, 1] })] }))
    expect(plan.sections[0]!.time_slot_id).toBe('mw-115')
  })

  it('keeps an off-grid meeting as a custom time rather than losing it', () => {
    const plan = planFromHistory(
      input({ history: [row({ days: [5], start_time: '09:00:00', end_time: '11:50:00' })] }),
    )
    expect(plan.sections[0]).toMatchObject({
      time_slot_id: null,
      is_arranged: false,
      custom_days: [5],
      custom_start: '09:00',
      custom_end: '11:50',
    })
    expect(plan.stats.customTimes).toBe(1)
  })

  it('marks a row with no meeting time as arranged', () => {
    const plan = planFromHistory(
      input({ history: [row({ days: null, start_time: null, end_time: null, room_label: null })] }),
    )
    expect(plan.sections[0]).toMatchObject({ is_arranged: true, time_slot_id: null, custom_days: null })
    expect(plan.stats.arranged).toBe(1)
  })

  it('treats an empty day list as arranged, not as a zero-day meeting', () => {
    const plan = planFromHistory(input({ history: [row({ days: [] })] }))
    expect(plan.sections[0]!.is_arranged).toBe(true)
  })

  it('resolves rooms by label, case-insensitively', () => {
    const plan = planFromHistory(input({ history: [row({ room_label: 'uw1 050' })] }))
    expect(plan.sections[0]!.room_id).toBe('r050')
    expect(plan.stats.roomsUnresolved).toBe(0)
  })

  it('counts a room it cannot resolve instead of inventing one', () => {
    const plan = planFromHistory(input({ history: [row({ room_label: 'XYZ 999' })] }))
    expect(plan.sections[0]!.room_id).toBeNull()
    expect(plan.stats.roomsUnresolved).toBe(1)
  })

  it('merges a second row for the same section into one co-taught section', () => {
    const plan = planFromHistory(
      input({ history: [row({ id: 'a', instructor_id: 'i1' }), row({ id: 'b', instructor_id: 'i2' })] }),
    )
    expect(plan.sections).toHaveLength(1)
    expect(plan.sections[0]!.instructorIds).toEqual(['i1', 'i2'])
    expect(plan.stats.merged).toBe(1)
  })

  it('does not list the same instructor twice on a merged section', () => {
    const plan = planFromHistory(
      input({ history: [row({ id: 'a', instructor_id: 'i1' }), row({ id: 'b', instructor_id: 'i1' })] }),
    )
    expect(plan.sections[0]!.instructorIds).toEqual(['i1'])
  })

  it('keeps two different letters of the same course apart', () => {
    const plan = planFromHistory(
      input({ history: [row({ id: 'a', section_letter: 'A' }), row({ id: 'b', section_letter: 'B' })] }),
    )
    expect(plan.sections).toHaveLength(2)
    expect(plan.stats.merged).toBe(0)
  })

  it('normalises the section letter, so "a" and "A" are one section', () => {
    const plan = planFromHistory(
      input({ history: [row({ id: 'a', section_letter: 'a' }), row({ id: 'b', section_letter: 'A' })] }),
    )
    expect(plan.sections).toHaveLength(1)
    expect(plan.sections[0]!.section_letter).toBe('A')
  })

  it('defaults a missing section letter to A', () => {
    const plan = planFromHistory(input({ history: [row({ section_letter: null })] }))
    expect(plan.sections[0]!.section_letter).toBe('A')
  })

  it('drops an assignment for someone no longer on the roster, keeping the section', () => {
    const plan = planFromHistory(input({ history: [row({ instructor_id: 'retired' })] }))
    expect(plan.sections).toHaveLength(1)
    expect(plan.sections[0]!.instructorIds).toEqual([])
    expect(plan.stats.instructorsDropped).toBe(1)
  })

  it('does not count an unstaffed historical row as a dropped instructor', () => {
    const plan = planFromHistory(input({ history: [row({ instructor_id: null })] }))
    expect(plan.stats.instructorsDropped).toBe(0)
    expect(plan.sections[0]!.instructorIds).toEqual([])
  })

  it('skips a course that is not in the catalogue, and says which', () => {
    const plan = planFromHistory(
      input({ history: [row({ course_id: null, course_code_raw: 'CSS 999' })] }),
    )
    expect(plan.sections).toHaveLength(0)
    expect(plan.skipped).toEqual([
      { detail: 'CSS 999 A (autumn)', reason: 'course is not in the catalogue' },
    ])
  })

  it('skips a quarter the target year does not have', () => {
    const plan = planFromHistory(
      input({ history: [row({ quarter: 'summer' })], terms: [{ id: 'au', quarter: 'autumn' }] }),
    )
    expect(plan.sections).toHaveLength(0)
    expect(plan.skipped[0]!.reason).toBe('the scenario has no summer term')
  })

  it('defaults a missing modality rather than writing null into a not-null column', () => {
    const plan = planFromHistory(input({ history: [row({ modality: null })] }))
    expect(plan.sections[0]!.modality).toBe('in_person')
  })

  it('counts sections and assignments over a mixed batch', () => {
    const plan = planFromHistory(
      input({
        history: [
          row({ id: 'a' }),
          row({ id: 'b', section_letter: 'B', instructor_id: 'i2' }),
          row({ id: 'c', section_letter: 'C', instructor_id: null }),
          row({ id: 'd', course_id: null }),
        ],
      }),
    )
    expect(plan.stats.sections).toBe(3)
    expect(plan.stats.assignments).toBe(2)
    expect(plan.skipped).toHaveLength(1)
  })

  it('produces a plan that satisfies the table check constraint', () => {
    // Exactly one of: grid slot, custom time, arranged.
    const plan = planFromHistory(
      input({
        history: [
          row({ id: 'a' }),
          row({ id: 'b', section_letter: 'B', days: [5], start_time: '09:00:00', end_time: '11:50:00' }),
          row({ id: 'c', section_letter: 'C', days: null, start_time: null, end_time: null }),
        ],
      }),
    )
    for (const s of plan.sections) {
      const shapes = [
        s.is_arranged && !s.time_slot_id && !s.custom_days,
        !s.is_arranged && !!s.time_slot_id && !s.custom_days,
        !s.is_arranged && !s.time_slot_id && !!s.custom_days && !!s.custom_start && !!s.custom_end,
      ].filter(Boolean)
      expect(shapes).toHaveLength(1)
    }
  })
})

describe('describePlan', () => {
  it('leads with what will be created', () => {
    const plan = planFromHistory(input({ history: [row()] }))
    expect(describePlan(plan)).toBe('1 sections · 1 assignments')
  })

  it('mentions every caveat it has', () => {
    const plan = planFromHistory(
      input({
        history: [
          row({ id: 'a', instructor_id: 'retired' }),
          row({ id: 'b', section_letter: 'B', days: [5], start_time: '09:00:00', end_time: '11:50:00' }),
          row({ id: 'c', course_id: null }),
        ],
      }),
    )
    const text = describePlan(plan)
    expect(text).toContain('off-grid times')
    expect(text).toContain('no longer on the roster')
    expect(text).toContain('skipped')
  })
})
