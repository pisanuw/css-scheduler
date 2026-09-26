import { describe, expect, it } from 'vitest'
import {
  buildReport,
  compareScenarios,
  reportCsv,
  satisfactionOf,
  scheduleCsv,
  studentClashes,
  toCsv,
  unavoidableStudentClashes,
} from './report'
import type { Instructor, Preferences, ScheduleSnapshot, Section } from './conflicts'

const MW_EARLY = { days: [1, 3], start: '08:45', end: '10:45' }
const MW_LATE = { days: [1, 3], start: '13:15', end: '15:15' }

const sec = (over: Partial<Section> = {}): Section => ({
  id: 's1',
  termId: 'au',
  courseId: 'c143',
  courseCode: 'CSS 143',
  sectionLetter: 'A',
  meeting: MW_EARLY,
  modality: 'in_person',
  roomId: null,
  instructorIds: ['i1'],
  ...over,
})

const inst = (id: string, name: string, over: Partial<Instructor> = {}): Instructor => ({
  id,
  name,
  annualTarget: 8,
  maxPerQuarter: 3,
  ...over,
})

const prefs = (instructorId: string, over: Partial<Preferences> = {}): Preferences => ({
  instructorId,
  unavailableTermIds: [],
  desiredCountByTerm: {},
  courseTier: {},
  blockedDays: [],
  modalityPrefs: [],
  maxNewPreps: null,
  ...over,
})

function snapshot(over: Partial<ScheduleSnapshot> = {}): ScheduleSnapshot {
  return {
    terms: [
      { id: 'au', quarter: 'autumn', label: 'Autumn' },
      { id: 'wi', quarter: 'winter', label: 'Winter' },
    ],
    sections: [sec()],
    instructors: [inst('i1', 'Ada Lovelace')],
    preferences: {},
    taughtBefore: {},
    ...over,
  }
}

describe('satisfactionOf', () => {
  it('is the share of rated assignments that were wanted or willing', () => {
    expect(satisfactionOf({ eager: 3, willing: 1, reluctant: 1, unqualified: 1, unrated: 0 })).toBe(
      4 / 6,
    )
  })

  it('ignores unrated assignments entirely, rather than guessing', () => {
    expect(satisfactionOf({ eager: 1, willing: 0, reluctant: 0, unqualified: 0, unrated: 99 })).toBe(1)
  })

  it('is null when nothing was rated, rather than a misleading zero', () => {
    expect(satisfactionOf({ eager: 0, willing: 0, reluctant: 0, unqualified: 0, unrated: 5 })).toBeNull()
  })
})

describe('buildReport', () => {
  it('counts staffed and unstaffed sections', () => {
    const r = buildReport(
      snapshot({
        sections: [sec({ id: 'a' }), sec({ id: 'b', instructorIds: [] }), sec({ id: 'c' })],
      }),
    )
    expect(r.totals).toMatchObject({ sections: 3, staffed: 2, unstaffed: 1, assignments: 2 })
  })

  it('buckets each assignment by what the instructor said about the course', () => {
    const r = buildReport(
      snapshot({
        sections: [
          sec({ id: 'a', courseId: 'c143' }),
          sec({ id: 'b', courseId: 'c342' }),
          sec({ id: 'c', courseId: 'c360' }),
        ],
        preferences: {
          i1: prefs('i1', { courseTier: { c143: 'eager', c342: 'reluctant' } }),
        },
      }),
    )
    expect(r.totals.byTier).toEqual({
      eager: 1,
      willing: 0,
      reluctant: 1,
      unqualified: 0,
      unrated: 1,
    })
    // 1 of 2 rated assignments was wanted or willing.
    expect(r.satisfaction).toBe(0.5)
  })

  it('treats an instructor who never submitted as unrated, not as unhappy', () => {
    const r = buildReport(snapshot({ sections: [sec()] }))
    expect(r.totals.byTier.unrated).toBe(1)
    expect(r.satisfaction).toBeNull()
    expect(r.instructors[0]!.submitted).toBe(false)
  })

  it('counts new preparations as distinct courses, not sections', () => {
    const r = buildReport(
      snapshot({
        sections: [
          sec({ id: 'a', courseId: 'c143' }),
          sec({ id: 'b', courseId: 'c143', sectionLetter: 'B' }),
          sec({ id: 'c', courseId: 'c342' }),
        ],
        taughtBefore: { i1: new Set(['c342']) },
      }),
    )
    expect(r.instructors[0]!.newPreps).toBe(1)
  })

  it('reports desired against actual for each quarter', () => {
    const r = buildReport(
      snapshot({
        sections: [sec({ id: 'a', termId: 'au' }), sec({ id: 'b', termId: 'au' })],
        preferences: { i1: prefs('i1', { desiredCountByTerm: { au: 3, wi: 1 } }) },
      }),
    )
    expect(r.instructors[0]!.byTerm).toEqual([
      { termId: 'au', label: 'Autumn', desired: 3, actual: 2 },
      { termId: 'wi', label: 'Winter', desired: 1, actual: 0 },
    ])
  })

  it('counts assignments in a quarter the instructor marked off', () => {
    const r = buildReport(
      snapshot({ preferences: { i1: prefs('i1', { unavailableTermIds: ['au'] }) } }),
    )
    expect(r.instructors[0]!.unavailableTerms).toBe(1)
  })

  it('counts sections landing on a day they asked to keep free', () => {
    const r = buildReport(snapshot({ preferences: { i1: prefs('i1', { blockedDays: [3] }) } }))
    expect(r.instructors[0]!.blockedDayHits).toBe(1)
  })

  it('counts a format they did not ask for', () => {
    const r = buildReport(
      snapshot({ preferences: { i1: prefs('i1', { modalityPrefs: ['online_sync'] }) } }),
    )
    expect(r.instructors[0]!.modalityMismatches).toBe(1)
  })

  it('does not call it a mismatch when they expressed no format preference', () => {
    const r = buildReport(snapshot({ preferences: { i1: prefs('i1', { modalityPrefs: [] }) } }))
    expect(r.instructors[0]!.modalityMismatches).toBe(0)
  })

  it('lists the worst-served instructor first', () => {
    const r = buildReport(
      snapshot({
        instructors: [inst('i1', 'Happy'), inst('i2', 'Unhappy')],
        sections: [
          sec({ id: 'a', instructorIds: ['i1'], courseId: 'c143' }),
          sec({ id: 'b', instructorIds: ['i2'], courseId: 'c143' }),
        ],
        preferences: {
          i1: prefs('i1', { courseTier: { c143: 'eager' } }),
          i2: prefs('i2', { courseTier: { c143: 'reluctant' } }),
        },
      }),
    )
    expect(r.instructors.map((i) => i.name)).toEqual(['Unhappy', 'Happy'])
  })

  it('leaves out instructors with no assignments at all', () => {
    const r = buildReport(
      snapshot({ instructors: [inst('i1', 'Ada'), inst('i2', 'Idle')] }),
    )
    expect(r.instructors.map((i) => i.instructorId)).toEqual(['i1'])
  })

  it('counts both people on a co-taught section', () => {
    const r = buildReport(
      snapshot({
        instructors: [inst('i1', 'Ada'), inst('i2', 'Grace')],
        sections: [sec({ instructorIds: ['i1', 'i2'] })],
      }),
    )
    expect(r.totals.assignments).toBe(2)
    expect(r.totals.staffed).toBe(1)
    expect(r.instructors).toHaveLength(2)
  })

  it('summarises each quarter', () => {
    const r = buildReport(
      snapshot({
        sections: [
          sec({ id: 'a', termId: 'au' }),
          sec({ id: 'b', termId: 'au', instructorIds: [] }),
          sec({ id: 'c', termId: 'wi' }),
        ],
      }),
    )
    expect(r.perTerm).toEqual([
      { termId: 'au', label: 'Autumn', sections: 2, unstaffed: 1 },
      { termId: 'wi', label: 'Winter', sections: 1, unstaffed: 0 },
    ])
  })
})

describe('toCsv', () => {
  it('quotes cells containing a comma, quote or newline', () => {
    const out = toCsv(['a', 'b'], [['plain', 'has,comma'], ['say "hi"', 'two\nlines']])
    expect(out).toContain('"has,comma"')
    expect(out).toContain('"say ""hi"""')
    expect(out).toContain('"two\nlines"')
  })

  it('writes a BOM so Excel reads it as UTF-8', () => {
    expect(toCsv(['a'], [['x']]).startsWith('﻿')).toBe(true)
  })

  it('renders null as an empty cell rather than the text null', () => {
    expect(toCsv(['a', 'b'], [[null, 1]])).toContain('\r\n,1')
  })
})

describe('scheduleCsv', () => {
  it('has one row per section, in calendar then course order', () => {
    const snap = snapshot({
      instructors: [inst('i1', 'Ada Lovelace'), inst('i2', 'Grace Hopper')],
      sections: [
        sec({ id: 'b', termId: 'wi', courseCode: 'CSS 143' }),
        sec({ id: 'a', termId: 'au', courseCode: 'CSS 342', instructorIds: ['i1', 'i2'] }),
      ],
    })
    const lines = scheduleCsv(snap, () => 'MW 8:45am–10:45am').trim().split('\r\n')
    expect(lines[0]).toContain('Quarter,Course,Section')
    expect(lines[1]).toContain('Autumn,CSS 342')
    expect(lines[1]).toContain('Ada Lovelace; Grace Hopper')
    expect(lines[2]).toContain('Winter,CSS 143')
  })

  it('leaves the instructor cell empty for an unstaffed section', () => {
    const snap = snapshot({ sections: [sec({ instructorIds: [] })] })
    expect(scheduleCsv(snap, () => 'x').trim().split('\r\n')[1]!.endsWith(',')).toBe(true)
  })
})

describe('reportCsv', () => {
  it('writes a percentage, and leaves it blank when nothing was rated', () => {
    const rated = buildReport(
      snapshot({ preferences: { i1: prefs('i1', { courseTier: { c143: 'eager' } }) } }),
    )
    expect(reportCsv(rated)).toContain('100')

    const unrated = buildReport(snapshot())
    const row = reportCsv(unrated).trim().split('\r\n')[1]!
    expect(row).toContain('Ada Lovelace')
    expect(row).toContain(',,') // the blank percentage cell
  })
})

describe('compareScenarios', () => {
  const base = snapshot({
    instructors: [inst('i1', 'Ada'), inst('i2', 'Grace')],
    preferences: { i1: prefs('i1', { courseTier: { c143: 'eager' } }) },
  })

  it('reports each side and who appears only there', () => {
    const other = snapshot({
      instructors: [inst('i1', 'Ada'), inst('i2', 'Grace')],
      sections: [sec({ instructorIds: ['i2'] })],
    })
    const [a, b] = compareScenarios(
      { label: 'First pass', snapshot: base, errors: 0, warnings: 1 },
      { label: 'Alternative', snapshot: other, errors: 2, warnings: 0 },
    )
    expect(a.label).toBe('First pass')
    expect(a.onlyHere).toEqual(['Ada'])
    expect(a.satisfaction).toBe(1)
    expect(a.warnings).toBe(1)
    expect(b.onlyHere).toEqual(['Grace'])
    expect(b.errors).toBe(2)
  })

  it('reports nobody as unique when both use the same people', () => {
    const [a, b] = compareScenarios(
      { label: 'A', snapshot: base, errors: 0, warnings: 0 },
      { label: 'B', snapshot: base, errors: 0, warnings: 0 },
    )
    expect(a.onlyHere).toEqual([])
    expect(b.onlyHere).toEqual([])
  })
})

describe('studentClashes', () => {
  const snap = snapshot({
    sections: [
      sec({ id: 'a', courseId: 'c143', courseCode: 'CSS 143', meeting: MW_EARLY }),
      sec({ id: 'b', courseId: 'c342', courseCode: 'CSS 342', meeting: MW_EARLY }),
      sec({ id: 'c', courseId: 'c360', courseCode: 'CSS 360', meeting: MW_LATE }),
    ],
  })

  it('finds two required courses a student cannot attend together', () => {
    const out = studentClashes(snap, ['c143', 'c342'])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ termLabel: 'Autumn', a: 'CSS 143 A', b: 'CSS 342 A' })
  })

  it('says nothing about courses at different times', () => {
    expect(studentClashes(snap, ['c143', 'c360'])).toEqual([])
  })

  it('ignores courses the student did not ask for', () => {
    expect(studentClashes(snap, ['c143'])).toEqual([])
  })

  it('does not report two sections of the same course as a clash', () => {
    const two = snapshot({
      sections: [
        sec({ id: 'a', courseId: 'c143', sectionLetter: 'A', meeting: MW_EARLY }),
        sec({ id: 'b', courseId: 'c143', sectionLetter: 'B', meeting: MW_EARLY }),
      ],
    })
    expect(studentClashes(two, ['c143'])).toEqual([])
  })

  it('does not compare across quarters', () => {
    const split = snapshot({
      sections: [
        sec({ id: 'a', courseId: 'c143', termId: 'au', meeting: MW_EARLY }),
        sec({ id: 'b', courseId: 'c342', termId: 'wi', meeting: MW_EARLY }),
      ],
    })
    expect(studentClashes(split, ['c143', 'c342'])).toEqual([])
  })
})

describe('unavoidableStudentClashes', () => {
  it('stays quiet when another section of one course fits', () => {
    const snap = snapshot({
      sections: [
        sec({ id: 'a', courseId: 'c143', courseCode: 'CSS 143', meeting: MW_EARLY }),
        sec({ id: 'b', courseId: 'c143', courseCode: 'CSS 143', sectionLetter: 'B', meeting: MW_LATE }),
        sec({ id: 'c', courseId: 'c342', courseCode: 'CSS 342', meeting: MW_EARLY }),
      ],
    })
    // The pair clashes section-by-section, but B of CSS 143 makes it workable.
    expect(studentClashes(snap, ['c143', 'c342'])).toHaveLength(1)
    expect(unavoidableStudentClashes(snap, ['c143', 'c342'])).toEqual([])
  })

  it('reports a pair with no workable combination at all', () => {
    const snap = snapshot({
      sections: [
        sec({ id: 'a', courseId: 'c143', courseCode: 'CSS 143', meeting: MW_EARLY }),
        sec({ id: 'b', courseId: 'c342', courseCode: 'CSS 342', meeting: MW_EARLY }),
      ],
    })
    const out = unavoidableStudentClashes(snap, ['c143', 'c342'])
    expect(out).toHaveLength(1)
    expect(out[0]!.courses).toEqual(['CSS 143', 'CSS 342'])
  })

  it('says nothing when one of the courses is not offered that quarter', () => {
    const snap = snapshot({
      sections: [sec({ id: 'a', courseId: 'c143', meeting: MW_EARLY })],
    })
    expect(unavoidableStudentClashes(snap, ['c143', 'c342'])).toEqual([])
  })

  it('treats an arranged course as always combinable', () => {
    const snap = snapshot({
      sections: [
        sec({ id: 'a', courseId: 'c143', meeting: MW_EARLY }),
        sec({ id: 'b', courseId: 'c499', courseCode: 'CSS 499', meeting: null }),
      ],
    })
    expect(unavoidableStudentClashes(snap, ['c143', 'c499'])).toEqual([])
  })
})
