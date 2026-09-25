import { describe, it, expect } from 'vitest'
import {
  detectConflicts,
  meetingsOverlap,
  countBySeverity,
  type ScheduleSnapshot,
  type Section,
  type Preferences,
} from './conflicts'

const MW_115 = { days: [1, 3], start: '13:15', end: '15:15' }
const MW_330 = { days: [1, 3], start: '15:30', end: '17:30' }
const TTH_115 = { days: [2, 4], start: '13:15', end: '15:15' }
const MW_200 = { days: [1, 3], start: '14:00', end: '16:00' }

const AUT = { id: 'aut', quarter: 'autumn' as const, label: 'Autumn 2026' }
const WIN = { id: 'win', quarter: 'winter' as const, label: 'Winter 2027' }

function section(over: Partial<Section> & { id: string }): Section {
  return {
    termId: 'aut',
    courseId: 'c343',
    courseCode: 'CSS 343',
    sectionLetter: 'A',
    meeting: MW_115,
    modality: 'in_person',
    roomId: null,
    instructorIds: ['i1'],
    ...over,
  }
}

function prefs(over: Partial<Preferences> = {}): Preferences {
  return {
    instructorId: 'i1',
    unavailableTermIds: [],
    desiredCountByTerm: {},
    courseTier: {},
    blockedDays: [],
    modalityPrefs: [],
    maxNewPreps: null,
    ...over,
  }
}

function snapshot(over: Partial<ScheduleSnapshot> = {}): ScheduleSnapshot {
  return {
    terms: [AUT, WIN],
    sections: [],
    instructors: [{ id: 'i1', name: 'Pisan', annualTarget: null, maxPerQuarter: null }],
    preferences: {},
    taughtBefore: {},
    ...over,
  }
}

const codes = (s: ScheduleSnapshot) => detectConflicts(s).map((c) => c.code)

describe('meetingsOverlap', () => {
  it('is false when the days do not intersect', () => {
    expect(meetingsOverlap(MW_115, TTH_115)).toBe(false)
  })

  it('is false for back-to-back slots that merely touch', () => {
    expect(meetingsOverlap(MW_115, MW_330)).toBe(false)
  })

  it('is true when the same days overlap in time', () => {
    expect(meetingsOverlap(MW_115, MW_200)).toBe(true)
  })

  it('treats an arranged section as never clashing', () => {
    expect(meetingsOverlap(null, MW_115)).toBe(false)
    expect(meetingsOverlap(MW_115, null)).toBe(false)
  })
})

describe('time conflicts', () => {
  it('flags one instructor in two overlapping sections', () => {
    const s = snapshot({
      sections: [section({ id: 's1' }), section({ id: 's2', meeting: MW_200, courseCode: 'CSS 430' })],
    })
    expect(codes(s)).toContain('instructor_time_overlap')
  })

  it('does not flag overlapping times in different quarters', () => {
    const s = snapshot({
      sections: [section({ id: 's1' }), section({ id: 's2', termId: 'win', meeting: MW_200 })],
    })
    expect(codes(s)).not.toContain('instructor_time_overlap')
  })

  it('does not flag two different instructors in the same slot', () => {
    const s = snapshot({
      instructors: [
        { id: 'i1', name: 'Pisan', annualTarget: null, maxPerQuarter: null },
        { id: 'i2', name: 'Olson', annualTarget: null, maxPerQuarter: null },
      ],
      sections: [section({ id: 's1' }), section({ id: 's2', instructorIds: ['i2'] })],
    })
    expect(codes(s)).not.toContain('instructor_time_overlap')
  })

  it('flags a co-taught instructor clashing with their own other section', () => {
    const s = snapshot({
      sections: [
        section({ id: 's1', instructorIds: ['i1', 'i2'] }),
        section({ id: 's2', meeting: MW_200, instructorIds: ['i2'] }),
      ],
      instructors: [
        { id: 'i1', name: 'Pisan', annualTarget: null, maxPerQuarter: null },
        { id: 'i2', name: 'Olson', annualTarget: null, maxPerQuarter: null },
      ],
    })
    const overlaps = detectConflicts(s).filter((c) => c.code === 'instructor_time_overlap')
    expect(overlaps).toHaveLength(1)
    expect(overlaps[0]!.instructorId).toBe('i2')
  })
})

describe('load', () => {
  it('flags going over the per-quarter maximum', () => {
    const s = snapshot({
      instructors: [{ id: 'i1', name: 'Pisan', annualTarget: null, maxPerQuarter: 2 }],
      sections: [
        section({ id: 's1' }),
        section({ id: 's2', meeting: MW_330 }),
        section({ id: 's3', meeting: TTH_115 }),
      ],
    })
    expect(codes(s)).toContain('instructor_over_quarter_max')
  })

  it('counts each quarter separately against the maximum', () => {
    const s = snapshot({
      instructors: [{ id: 'i1', name: 'Pisan', annualTarget: null, maxPerQuarter: 2 }],
      sections: [
        section({ id: 's1' }),
        section({ id: 's2', meeting: MW_330 }),
        section({ id: 's3', termId: 'win' }),
      ],
    })
    expect(codes(s)).not.toContain('instructor_over_quarter_max')
  })

  it('reports over and under the annual target', () => {
    const over = snapshot({
      instructors: [{ id: 'i1', name: 'Pisan', annualTarget: 1, maxPerQuarter: null }],
      sections: [section({ id: 's1' }), section({ id: 's2', termId: 'win' })],
    })
    expect(codes(over)).toContain('instructor_over_annual_target')

    const under = snapshot({
      instructors: [{ id: 'i1', name: 'Pisan', annualTarget: 6, maxPerQuarter: null }],
      sections: [section({ id: 's1' })],
    })
    expect(codes(under)).toContain('instructor_under_annual_target')
  })
})

describe('preferences', () => {
  it('flags assignment in an unavailable quarter as an error', () => {
    const s = snapshot({
      sections: [section({ id: 's1' })],
      preferences: { i1: prefs({ unavailableTermIds: ['aut'] }) },
    })
    expect(codes(s)).toContain('instructor_unavailable_term')
  })

  it('separates "cannot teach" from "would rather not"', () => {
    const cannot = snapshot({
      sections: [section({ id: 's1' })],
      preferences: { i1: prefs({ courseTier: { c343: 'unqualified' } }) },
    })
    expect(detectConflicts(cannot).find((c) => c.code === 'assigned_unqualified_course')?.severity)
      .toBe('error')

    const rather = snapshot({
      sections: [section({ id: 's1' })],
      preferences: { i1: prefs({ courseTier: { c343: 'reluctant' } }) },
    })
    expect(detectConflicts(rather).find((c) => c.code === 'assigned_reluctant_course')?.severity)
      .toBe('warning')
  })

  it('does not complain about a course they were eager to teach', () => {
    const s = snapshot({
      sections: [section({ id: 's1' })],
      preferences: { i1: prefs({ courseTier: { c343: 'eager' } }) },
    })
    expect(codes(s)).not.toContain('assigned_reluctant_course')
    expect(codes(s)).not.toContain('assigned_unqualified_course')
  })

  it('flags a section meeting on a day they asked to keep free', () => {
    const s = snapshot({
      sections: [section({ id: 's1' })], // meets Mon + Wed
      preferences: { i1: prefs({ blockedDays: [3] }) },
    })
    const c = detectConflicts(s).find((x) => x.code === 'blocked_day')
    expect(c?.message).toContain('Wed')
  })

  it('flags a modality they did not ask for, and stays quiet when they did', () => {
    const mismatch = snapshot({
      sections: [section({ id: 's1', modality: 'online_sync' })],
      preferences: { i1: prefs({ modalityPrefs: ['in_person'] }) },
    })
    expect(codes(mismatch)).toContain('modality_mismatch')

    const ok = snapshot({
      sections: [section({ id: 's1', modality: 'online_sync' })],
      preferences: { i1: prefs({ modalityPrefs: ['in_person', 'online_sync'] }) },
    })
    expect(codes(ok)).not.toContain('modality_mismatch')
  })

  it('counts distinct new preparations, not sections', () => {
    // Two sections of the same unfamiliar course is one new prep.
    const s = snapshot({
      sections: [
        section({ id: 's1' }),
        section({ id: 's2', meeting: MW_330 }),
      ],
      preferences: { i1: prefs({ maxNewPreps: 1 }) },
      taughtBefore: { i1: new Set<string>() },
    })
    expect(codes(s)).not.toContain('new_prep_over_limit')

    const twoNew = snapshot({
      sections: [
        section({ id: 's1' }),
        section({ id: 's2', courseId: 'c430', courseCode: 'CSS 430', meeting: MW_330 }),
      ],
      preferences: { i1: prefs({ maxNewPreps: 1 }) },
      taughtBefore: { i1: new Set<string>() },
    })
    expect(codes(twoNew)).toContain('new_prep_over_limit')
  })

  it('does not count a course they have taught before as a new prep', () => {
    const s = snapshot({
      sections: [
        section({ id: 's1' }),
        section({ id: 's2', courseId: 'c430', courseCode: 'CSS 430', meeting: MW_330 }),
      ],
      preferences: { i1: prefs({ maxNewPreps: 1 }) },
      taughtBefore: { i1: new Set(['c343']) },
    })
    expect(codes(s)).not.toContain('new_prep_over_limit')
  })
})

describe('sections and rooms', () => {
  it('flags an unstaffed section', () => {
    const s = snapshot({ sections: [section({ id: 's1', instructorIds: [] })] })
    expect(codes(s)).toContain('section_unstaffed')
  })

  it('flags a double-booked room but allows the same room back-to-back', () => {
    const clash = snapshot({
      sections: [
        section({ id: 's1', roomId: 'r1', roomLabel: 'UW1 021' }),
        section({ id: 's2', roomId: 'r1', meeting: MW_200, instructorIds: ['i2'] }),
      ],
    })
    expect(codes(clash)).toContain('room_double_booked')

    const fine = snapshot({
      sections: [
        section({ id: 's1', roomId: 'r1' }),
        section({ id: 's2', roomId: 'r1', meeting: MW_330, instructorIds: ['i2'] }),
      ],
    })
    expect(codes(fine)).not.toContain('room_double_booked')
  })

  it('never reports a time clash for arranged sections', () => {
    const s = snapshot({
      sections: [
        section({ id: 's1', meeting: null, courseCode: 'CSS 498' }),
        section({ id: 's2', meeting: null, courseCode: 'CSS 499' }),
      ],
    })
    expect(codes(s)).not.toContain('instructor_time_overlap')
  })
})

describe('reporting', () => {
  it('sorts errors ahead of warnings and info', () => {
    const s = snapshot({
      sections: [
        section({ id: 's1' }),
        section({ id: 's2', meeting: MW_200 }),
        section({ id: 's3', termId: 'win', instructorIds: [] }),
      ],
    })
    const severities = detectConflicts(s).map((c) => c.severity)
    expect(severities).toEqual([...severities].sort((a, b) =>
      ({ error: 0, warning: 1, info: 2 })[a] - ({ error: 0, warning: 1, info: 2 })[b]))
  })

  it('tallies by severity', () => {
    const s = snapshot({ sections: [section({ id: 's1', instructorIds: [] })] })
    expect(countBySeverity(detectConflicts(s))).toEqual({ error: 0, warning: 1, info: 0 })
  })

  it('finds nothing wrong with a clean schedule', () => {
    const s = snapshot({
      sections: [section({ id: 's1' }), section({ id: 's2', meeting: MW_330 })],
      preferences: { i1: prefs({ courseTier: { c343: 'eager' } }) },
    })
    expect(detectConflicts(s)).toEqual([])
  })
})
