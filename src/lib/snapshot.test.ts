import { describe, expect, it } from 'vitest'
import {
  buildSnapshot,
  loadTallies,
  meetingLabel,
  sectionMeeting,
  toHM,
  type SnapshotInput,
  type TimeSlotRow,
} from './snapshot'
import { detectConflicts } from './conflicts'

const slot = (over: Partial<TimeSlotRow> = {}): TimeSlotRow => ({
  id: 'slot-mw-1315',
  label: 'MW 1:15–3:15 PM',
  day_pattern: 'MW',
  days: [1, 3],
  start_time: '13:15:00',
  end_time: '15:15:00',
  is_standard: true,
  sort_order: 3,
  is_active: true,
  ...over,
})

/** A minimal but complete input; each test overrides only what it cares about. */
function input(over: Partial<SnapshotInput> = {}): SnapshotInput {
  return {
    terms: [
      { id: 'au', academic_year_id: 'y1', quarter: 'autumn', sort_order: 1 },
      { id: 'wi', academic_year_id: 'y1', quarter: 'winter', sort_order: 2 },
    ],
    sections: [],
    assignments: [],
    courses: [
      { id: 'c143', code: 'CSS 143' },
      { id: 'c342', code: 'CSS 342' },
    ],
    timeSlots: [slot()],
    rooms: [{ id: 'r1', label: 'UW2-005' }],
    instructors: [{ id: 'i1', full_name: 'Ada Lovelace', max_courses_per_quarter: 3 }],
    loadTargets: [{ instructor_id: 'i1', effective_target: 8 }],
    submissions: [],
    history: [],
    ...over,
  }
}

const section = (over: Partial<SnapshotInput['sections'][number]> = {}) => ({
  id: 's1',
  scenario_id: 'sc1',
  term_id: 'au',
  course_id: 'c143',
  section_letter: 'A',
  time_slot_id: 'slot-mw-1315' as string | null,
  custom_days: null,
  custom_start: null,
  custom_end: null,
  is_arranged: false,
  modality: 'in_person' as const,
  room_id: null as string | null,
  enrollment_cap: null,
  status: 'planned' as const,
  notes: null,
  ...over,
})

describe('toHM', () => {
  it('trims the seconds Postgres adds, so string comparison stays sound', () => {
    expect(toHM('13:15:00')).toBe('13:15')
    expect(toHM('08:45')).toBe('08:45')
  })
})

describe('sectionMeeting', () => {
  const slots = new Map([[slot().id, slot()]])

  it('reads the grid slot when one is set', () => {
    expect(sectionMeeting(section(), slots)).toEqual({ days: [1, 3], start: '13:15', end: '15:15' })
  })

  it('reads the custom override when there is no grid slot', () => {
    const m = sectionMeeting(
      section({ time_slot_id: null, custom_days: [5], custom_start: '09:00:00', custom_end: '11:50:00' }),
      slots,
    )
    expect(m).toEqual({ days: [5], start: '09:00', end: '11:50' })
  })

  it('is null for arranged sections, which can never clash on time', () => {
    expect(sectionMeeting(section({ is_arranged: true, time_slot_id: null }), slots)).toBeNull()
  })

  it('is null rather than throwing when the slot is missing from the cache', () => {
    expect(sectionMeeting(section({ time_slot_id: 'gone' }), slots)).toBeNull()
  })
})

describe('meetingLabel', () => {
  it('reads like a time schedule', () => {
    expect(meetingLabel({ days: [1, 3], start: '13:15', end: '15:15' })).toBe('MW 1:15pm–3:15pm')
    expect(meetingLabel({ days: [2, 4], start: '08:45', end: '10:45' })).toBe('TTh 8:45am–10:45am')
    expect(meetingLabel({ days: [1, 3], start: '11:00', end: '13:00' })).toBe('MW 11am–1pm')
  })

  it('says so when there is no time', () => {
    expect(meetingLabel(null)).toBe('To be arranged')
  })
})

describe('buildSnapshot', () => {
  it('orders terms by the calendar, not by insertion', () => {
    const snap = buildSnapshot(
      input({
        terms: [
          { id: 'wi', academic_year_id: 'y1', quarter: 'winter', sort_order: 2 },
          { id: 'au', academic_year_id: 'y1', quarter: 'autumn', sort_order: 1 },
        ],
      }),
    )
    expect(snap.terms.map((t) => t.label)).toEqual(['Autumn', 'Winter'])
  })

  it('attaches every assigned instructor to its section', () => {
    const snap = buildSnapshot(
      input({
        sections: [section()],
        assignments: [
          { id: 'a1', section_id: 's1', instructor_id: 'i1', is_primary: true },
          { id: 'a2', section_id: 's1', instructor_id: 'i2', is_primary: false },
        ],
      }),
    )
    expect(snap.sections[0]!.instructorIds).toEqual(['i1', 'i2'])
  })

  it('resolves the course code and room label a conflict message needs', () => {
    const snap = buildSnapshot(input({ sections: [section({ room_id: 'r1' })] }))
    expect(snap.sections[0]!.courseCode).toBe('CSS 143')
    expect(snap.sections[0]!.roomLabel).toBe('UW2-005')
  })

  it('names an unknown course rather than rendering a bare uuid', () => {
    const snap = buildSnapshot(input({ sections: [section({ course_id: 'missing' })] }))
    expect(snap.sections[0]!.courseCode).toBe('Unknown course')
  })

  it('carries the effective target through, including a numeric string', () => {
    const snap = buildSnapshot(input({ loadTargets: [{ instructor_id: 'i1', effective_target: '6.0' }] }))
    expect(snap.instructors[0]!.annualTarget).toBe(6)
  })

  it('leaves the target null for a per-course hire, so load rules are skipped', () => {
    const snap = buildSnapshot(input({ loadTargets: [{ instructor_id: 'i1', effective_target: null }] }))
    expect(snap.instructors[0]!.annualTarget).toBeNull()
  })

  it('ignores an instructor with no row in the load view at all', () => {
    const snap = buildSnapshot(input({ loadTargets: [] }))
    expect(snap.instructors[0]!.annualTarget).toBeNull()
  })

  it('honours submitted preferences', () => {
    const snap = buildSnapshot(
      input({
        submissions: [
          {
            instructor_id: 'i1',
            status: 'submitted',
            blocked_days: [5],
            modality_prefs: ['in_person'],
            max_new_preps: 1,
            courses: [{ course_id: 'c342', tier: 'unqualified' }],
            terms: [
              { term_id: 'au', available: true, desired_course_count: 2 },
              { term_id: 'wi', available: false, desired_course_count: null },
            ],
          },
        ],
      }),
    )
    expect(snap.preferences.i1).toEqual({
      instructorId: 'i1',
      unavailableTermIds: ['wi'],
      desiredCountByTerm: { au: 2 },
      courseTier: { c342: 'unqualified' },
      blockedDays: [5],
      modalityPrefs: ['in_person'],
      maxNewPreps: 1,
    })
  })

  it('ignores a draft, so the board never judges an answer nobody stood behind', () => {
    const snap = buildSnapshot(
      input({
        submissions: [
          {
            instructor_id: 'i1',
            status: 'draft',
            blocked_days: [1, 2, 3, 4, 5],
            modality_prefs: [],
            max_new_preps: 0,
            courses: [{ course_id: 'c143', tier: 'unqualified' }],
            terms: [{ term_id: 'au', available: false, desired_course_count: null }],
          },
        ],
      }),
    )
    expect(snap.preferences.i1).toBeUndefined()
  })

  it('collapses history into the set of courses each person has taught', () => {
    const snap = buildSnapshot(
      input({
        history: [
          { instructor_id: 'i1', course_id: 'c143' },
          { instructor_id: 'i1', course_id: 'c143' },
          { instructor_id: 'i1', course_id: 'c342' },
          { instructor_id: null, course_id: 'c342' },
          { instructor_id: 'i2', course_id: null },
        ],
      }),
    )
    expect(snap.taughtBefore.i1).toEqual(new Set(['c143', 'c342']))
    expect(snap.taughtBefore.i2).toBeUndefined()
  })

  it('feeds the engine well enough to catch a real double booking', () => {
    const snap = buildSnapshot(
      input({
        sections: [
          section({ id: 's1', course_id: 'c143' }),
          // Same grid slot, same quarter, different course.
          section({ id: 's2', course_id: 'c342' }),
        ],
        assignments: [
          { id: 'a1', section_id: 's1', instructor_id: 'i1', is_primary: true },
          { id: 'a2', section_id: 's2', instructor_id: 'i1', is_primary: true },
        ],
      }),
    )
    const codes = detectConflicts(snap).map((c) => c.code)
    expect(codes).toContain('instructor_time_overlap')
  })

  it('does not report an overlap across different quarters', () => {
    const snap = buildSnapshot(
      input({
        sections: [
          section({ id: 's1', term_id: 'au' }),
          section({ id: 's2', term_id: 'wi', course_id: 'c342' }),
        ],
        assignments: [
          { id: 'a1', section_id: 's1', instructor_id: 'i1', is_primary: true },
          { id: 'a2', section_id: 's2', instructor_id: 'i1', is_primary: true },
        ],
      }),
    )
    expect(detectConflicts(snap).map((c) => c.code)).not.toContain('instructor_time_overlap')
  })
})

describe('loadTallies', () => {
  const snap = buildSnapshot(
    input({
      instructors: [
        { id: 'i1', full_name: 'Ada Lovelace', max_courses_per_quarter: 3 },
        { id: 'i2', full_name: 'Grace Hopper', max_courses_per_quarter: 2 },
        { id: 'i3', full_name: 'Per-course hire', max_courses_per_quarter: null },
      ],
      loadTargets: [
        { instructor_id: 'i1', effective_target: 8 },
        { instructor_id: 'i2', effective_target: 5 },
        { instructor_id: 'i3', effective_target: null },
      ],
      sections: [
        section({ id: 's1', term_id: 'au' }),
        section({ id: 's2', term_id: 'au', course_id: 'c342' }),
        section({ id: 's3', term_id: 'wi' }),
      ],
      assignments: [
        { id: 'a1', section_id: 's1', instructor_id: 'i1', is_primary: true },
        { id: 'a2', section_id: 's2', instructor_id: 'i1', is_primary: true },
        { id: 'a3', section_id: 's3', instructor_id: 'i2', is_primary: true },
      ],
    }),
  )

  it('counts per quarter and across the year', () => {
    const ada = loadTallies(snap).find((t) => t.instructorId === 'i1')!
    expect(ada.byTerm).toEqual({ au: 2 })
    expect(ada.total).toBe(2)
    expect(ada.target).toBe(8)
  })

  it('puts the biggest shortfall first, so the coordinator sees the work', () => {
    // Ada is 6 short of 8, Grace is 4 short of 5.
    expect(loadTallies(snap).map((t) => t.name).slice(0, 2)).toEqual(['Ada Lovelace', 'Grace Hopper'])
  })

  it('drops people with neither a target nor an assignment', () => {
    expect(loadTallies(snap).map((t) => t.instructorId)).not.toContain('i3')
  })

  it('keeps a per-course hire once they are actually assigned something', () => {
    const withHire = buildSnapshot(
      input({
        instructors: [{ id: 'i3', full_name: 'Per-course hire', max_courses_per_quarter: null }],
        loadTargets: [{ instructor_id: 'i3', effective_target: null }],
        sections: [section({ id: 's1' })],
        assignments: [{ id: 'a1', section_id: 's1', instructor_id: 'i3', is_primary: true }],
      }),
    )
    const tally = loadTallies(withHire)
    expect(tally).toHaveLength(1)
    expect(tally[0]!.total).toBe(1)
    expect(tally[0]!.target).toBeNull()
  })
})
