import { describe, expect, it } from 'vitest'
import {
  matchInstructor,
  parseDayPattern,
  parseTimeRange,
  parseTimeSchedule,
  resolveImport,
  type RosterEntry,
} from './timeSchedule'
import { planFromHistory } from './seedPlan'

/**
 * The published schedule, as text. Every line here is the shape one of the
 * three real schedules in `past-course-schedules/` uses — the six grid blocks,
 * `* *` for no room, a `Restr` prefix, and a second meeting on its own line.
 */
const PASTE = `
CSS 101 DIGITAL THINKING (NW)
Restr  12884 A  5       TTh    545-745P  UW1 102      Rajanna,Madhu               Open     6/  24

CSS 107 INTRODUCTION TO PROGRAMMING
       12885 A  5       TTh    545-745P  UW1 220      NIXON,DAVID                 Open    21/  48
       12886 B  5       MW     545-745P  UW1 030      Oliver,Dawn-Marie           Open    11/  48

CSS 142 COMPUTER PROGRAMMING I
       12888 A  5       MW     1100-100  UW2 031      Stride,Jeff                 Open    28/  48
`

const COURSES = [
  { id: 'c101', code: 'CSS 101', number: 101 },
  { id: 'c107', code: 'CSS 107', number: 107 },
  { id: 'c142', code: 'CSS 142', number: 142 },
]

const ROSTER: RosterEntry[] = [
  { id: 'i-nixon', full_name: 'David Nixon', is_active: true },
  { id: 'i-oliver', full_name: 'Dawn-Marie Oliver', is_active: true },
  { id: 'i-stride', full_name: 'Jeff Stride', is_active: true },
]

describe('parseDayPattern', () => {
  it('reads the two standard patterns', () => {
    expect(parseDayPattern('MW')).toEqual([1, 3])
    expect(parseDayPattern('TTh')).toEqual([2, 4])
  })

  it('reads single days, which hybrids use', () => {
    expect(parseDayPattern('F')).toEqual([5])
    expect(parseDayPattern('Th')).toEqual([4])
  })

  it('takes Th before T, so TTh is not Tuesday twice', () => {
    expect(parseDayPattern('TTh')).toEqual([2, 4])
    expect(parseDayPattern('TThF')).toEqual([2, 4, 5])
  })

  it('survives an all-caps paste', () => {
    expect(parseDayPattern('TTH')).toEqual([2, 4])
    expect(parseDayPattern('mw')).toEqual([1, 3])
  })

  it('reads S as Saturday and Su as Sunday', () => {
    expect(parseDayPattern('S')).toEqual([6])
    expect(parseDayPattern('Su')).toEqual([7])
  })

  it('is null for anything that is not a day pattern, so it can be used as a test', () => {
    expect(parseDayPattern('UW1')).toBeNull()
    expect(parseDayPattern('545-745P')).toBeNull()
    expect(parseDayPattern('')).toBeNull()
    expect(parseDayPattern('Open')).toBeNull()
  })
})

describe('parseTimeRange', () => {
  it('reads morning hours as written', () => {
    expect(parseTimeRange('845-1045')).toEqual({ start: '08:45', end: '10:45' })
  })

  /**
   * The rule that cannot be derived from the string: the two halves of one
   * range get different meridiems. 11 AM to 1 PM is written `1100-100`.
   */
  it('crosses noon without a meridiem anywhere in the token', () => {
    expect(parseTimeRange('1100-100')).toEqual({ start: '11:00', end: '13:00' })
  })

  it('reads early afternoon as afternoon', () => {
    expect(parseTimeRange('115-315')).toEqual({ start: '13:15', end: '15:15' })
    expect(parseTimeRange('330-530')).toEqual({ start: '15:30', end: '17:30' })
  })

  it('lets a trailing P carry the whole range', () => {
    expect(parseTimeRange('545-745P')).toEqual({ start: '17:45', end: '19:45' })
    expect(parseTimeRange('800-1000P')).toEqual({ start: '20:00', end: '22:00' })
  })

  it('honours an explicit A', () => {
    expect(parseTimeRange('1030-1120A')).toEqual({ start: '10:30', end: '11:20' })
  })

  it('reproduces all six blocks of the real grid', () => {
    expect([
      parseTimeRange('845-1045'),
      parseTimeRange('1100-100'),
      parseTimeRange('115-315'),
      parseTimeRange('330-530'),
      parseTimeRange('545-745P'),
      parseTimeRange('800-1000P'),
    ]).toEqual([
      { start: '08:45', end: '10:45' },
      { start: '11:00', end: '13:00' },
      { start: '13:15', end: '15:15' },
      { start: '15:30', end: '17:30' },
      { start: '17:45', end: '19:45' },
      { start: '20:00', end: '22:00' },
    ])
  })

  it('is null for a non-time', () => {
    expect(parseTimeRange('UW1')).toBeNull()
    expect(parseTimeRange('MW')).toBeNull()
    expect(parseTimeRange('12884')).toBeNull()
    expect(parseTimeRange('845-1099')).toBeNull()
  })
})

describe('parseTimeSchedule', () => {
  it('reads a real paste end to end', () => {
    const { sections } = parseTimeSchedule(PASTE)
    expect(sections).toHaveLength(4)
    expect(sections[0]).toMatchObject({
      courseCodeRaw: 'CSS 101',
      number: 101,
      sln: '12884',
      sectionLetter: 'A',
      credits: '5',
      instructorRaw: 'Rajanna,Madhu',
      enrollmentCap: 24,
    })
    expect(sections[0]!.meetings).toEqual([
      { days: [2, 4], start: '17:45', end: '19:45', roomLabel: 'UW1 102' },
    ])
  })

  it('carries the heading down to every section under it', () => {
    const { sections } = parseTimeSchedule(PASTE)
    expect(sections.filter((s) => s.courseCodeRaw === 'CSS 107').map((s) => s.sectionLetter)).toEqual([
      'A',
      'B',
    ])
  })

  it('is not fooled by a leading Restr', () => {
    const { sections } = parseTimeSchedule(PASTE)
    expect(sections[0]!.sectionLetter).toBe('A')
    expect(sections[0]!.sln).toBe('12884')
  })

  /**
   * The reason nothing here counts characters: a paste, and a phone paste
   * especially, collapses the column padding.
   */
  it('reads a line whose columns have collapsed to single spaces', () => {
    const { sections } = parseTimeSchedule(
      'CSS 143 COMPUTER PROGRAMMING II\n12890 A 5 MW 115-315 UW1 050 Stride,Jeff Open 30/ 48',
    )
    expect(sections[0]).toMatchObject({ sectionLetter: 'A', instructorRaw: 'Stride,Jeff' })
    expect(sections[0]!.meetings[0]).toEqual({
      days: [1, 3],
      start: '13:15',
      end: '15:15',
      roomLabel: 'UW1 050',
    })
  })

  it('takes F as a section letter after the SLN, not as Friday', () => {
    const { sections } = parseTimeSchedule('CSS 142 X\n12888 F 5 MW 115-315 UW1 050 Stride,Jeff Open 1/ 48')
    expect(sections[0]!.sectionLetter).toBe('F')
    expect(sections[0]!.meetings[0]!.days).toEqual([1, 3])
  })

  it('reads * * as no room at all', () => {
    const { sections } = parseTimeSchedule('CSS 495 INTERNSHIP\n12999 A 1-5 * * Pisan,Yusuf Open 3/ 20')
    expect(sections[0]!.meetings[0]?.roomLabel ?? null).toBeNull()
    expect(sections[0]!.instructorRaw).toBe('Pisan,Yusuf')
    expect(sections[0]!.credits).toBe('1-5')
  })

  it('leaves a to-be-arranged section with no meeting', () => {
    const { sections } = parseTimeSchedule(
      'CSS 499 UNDERGRADUATE RESEARCH\n13000 A 1-5 to be arranged Pisan,Yusuf Open 2/ 10',
    )
    expect(sections[0]!.meetings).toEqual([])
  })

  it('attaches a second meeting line to the section above it', () => {
    const { sections } = parseTimeSchedule(
      [
        'CSS 342 DATA STRUCTURES',
        '12901 A 5 M 115-315 UW1 021 Dimpsey,Robert Open 40/ 48',
        '        W 115-315 UW1 021',
      ].join('\n'),
    )
    expect(sections).toHaveLength(1)
    expect(sections[0]!.meetings).toHaveLength(2)
    expect(sections[0]!.meetings[1]).toEqual({
      days: [3],
      start: '13:15',
      end: '15:15',
      roomLabel: 'UW1 021',
    })
  })

  it('keeps a quiz section separate rather than mistaking it for a lecture', () => {
    const { sections } = parseTimeSchedule(
      ['CSS 132 X', '12910 A LECT 5 MW 115-315 UW1 050 Lin,Johnny Open 40/ 48', '12911 AA QZ F 1030-1120A UW1 041'].join(
        '\n',
      ),
    )
    expect(sections.map((s) => [s.sectionLetter, s.sectionType])).toEqual([
      ['A', 'LECT'],
      ['AA', 'QZ'],
    ])
  })

  it('takes a course code from the section line when the paste has no headings', () => {
    const { sections } = parseTimeSchedule('CSS 143 12890 A 5 MW 115-315 UW1 050 Stride,Jeff Open 30/ 48')
    expect(sections[0]).toMatchObject({ courseCodeRaw: 'CSS 143', sectionLetter: 'A' })
  })

  it('reports a section line it cannot place under a course', () => {
    const { sections, ignored } = parseTimeSchedule('12890 A 5 MW 115-315 UW1 050 Stride,Jeff Open 30/ 48')
    expect(sections).toHaveLength(0)
    expect(ignored[0]!.reason).toMatch(/no course heading/)
  })

  it('reads an online section as online', () => {
    const { sections } = parseTimeSchedule('CSS 301 X\n12920 A 5 TTh 330-530 ONLINE Wang,Zhao Open 30/ 40')
    expect(sections[0]!.modality).toBe('online_sync')
  })

  it('ignores blank lines and prose without inventing sections', () => {
    const { sections } = parseTimeSchedule('\n\nEnrollment restrictions apply.\n\nSee your adviser.\n')
    expect(sections).toHaveLength(0)
  })

  it('does not read an enrolment count as an SLN', () => {
    const { sections } = parseTimeSchedule('CSS 142 X\n12888 A 5 MW 115-315 UW1 050 Stride,Jeff Open 28/ 48')
    expect(sections).toHaveLength(1)
    expect(sections[0]!.sln).toBe('12888')
  })
})

describe('matchInstructor', () => {
  it('matches Last,First against First Last', () => {
    expect(matchInstructor('Nixon,David', ROSTER)?.id).toBe('i-nixon')
  })

  it('does not care about case', () => {
    expect(matchInstructor('NIXON,DAVID', ROSTER)?.id).toBe('i-nixon')
  })

  it('matches a shortened first name when only one person can be meant', () => {
    const roster = [{ id: 'i-dame', full_name: 'Stephen Dame', is_active: true }]
    expect(matchInstructor('Dame,Steve', roster)?.id).toBe('i-dame')
  })

  it('ignores a middle initial on either side', () => {
    const roster = [{ id: 'i-parsons', full_name: 'Erika F. Parsons', is_active: true }]
    expect(matchInstructor('Parsons,Erika', roster)?.id).toBe('i-parsons')
    expect(matchInstructor('Kool,Nancy L.', [{ id: 'k', full_name: 'Nancy Kool', is_active: true }])?.id).toBe('k')
  })

  it('falls back to a unique last name', () => {
    expect(matchInstructor('Stride,J', ROSTER)?.id).toBe('i-stride')
  })

  /** A tie is not a match: picking one of two Wangs silently would be wrong. */
  it('refuses to guess between two people with the same last name', () => {
    const roster = [
      { id: 'w1', full_name: 'Zhao Wang', is_active: true },
      { id: 'w2', full_name: 'Yang Wang', is_active: true },
    ]
    expect(matchInstructor('Wang,X', roster)).toBeNull()
  })

  it('is null for somebody not on the roster', () => {
    expect(matchInstructor('Rajanna,Madhu', ROSTER)).toBeNull()
  })

  it('reads a name written First Last too', () => {
    expect(matchInstructor('David Nixon', ROSTER)?.id).toBe('i-nixon')
  })
})

describe('resolveImport', () => {
  const resolve = (text: string, over: Partial<Parameters<typeof resolveImport>[0]> = {}) =>
    resolveImport({
      parsed: parseTimeSchedule(text).sections,
      courses: COURSES,
      roster: ROSTER,
      quarter: 'autumn',
      academicYear: '2026-27',
      ...over,
    })

  it('resolves courses and instructors it knows', () => {
    const { history } = resolve(PASTE)
    const nixon = history.find((h) => h.course_code_raw === 'CSS 107' && h.section_letter === 'A')
    expect(nixon).toMatchObject({ course_id: 'c107', instructor_id: 'i-nixon', quarter: 'autumn' })
  })

  it('names an instructor it could not place instead of dropping them quietly', () => {
    const { history, unknownInstructors } = resolve(PASTE)
    expect(unknownInstructors).toEqual(['Rajanna,Madhu'])
    const orphan = history.find((h) => h.course_code_raw === 'CSS 101')
    expect(orphan!.instructor_id).toBeNull()
    // The section still lands; it is simply unstaffed, which the board shows.
    expect(orphan!.instructor_name_raw).toBe('Rajanna,Madhu')
  })

  it('names a course the catalogue does not hold, and leaves it out', () => {
    const { history, unknownCourses } = resolve('CSS 999 SOMETHING NEW\n13100 A 5 MW 115-315 UW1 050 Nixon,David Open 1/ 20')
    expect(unknownCourses).toEqual(['CSS 999'])
    expect(history).toHaveLength(0)
  })

  it('leaves quiz sections out with the reason', () => {
    const { history, dropped } = resolve(
      ['CSS 142 X', '12888 A LECT 5 MW 115-315 UW1 050 Stride,Jeff Open 28/ 48', '12889 AA QZ F 1030-1120A UW1 041'].join('\n'),
    )
    expect(history).toHaveLength(1)
    expect(dropped.map((d) => d.reason)).toContain('QZ sections are not scheduled here')
  })

  it('says when a section meets twice, rather than halving it silently', () => {
    const { history, dropped } = resolve(
      ['CSS 142 X', '12888 A 5 M 115-315 UW1 050 Stride,Jeff Open 28/ 48', '       W 115-315 UW1 050'].join('\n'),
    )
    expect(history).toHaveLength(1)
    expect(history[0]!.days).toEqual([1])
    expect(dropped.some((d) => /meets twice/.test(d.reason))).toBe(true)
  })
})

/**
 * The point of resolving into `HistoryRow` rather than straight into sections:
 * the planner's grid matching, co-teaching merge and room resolution all apply
 * to an import without being written a second time.
 */
describe('an import through the seed planner', () => {
  const plan = (text: string, existingKeys?: Set<string>) =>
    planFromHistory({
      history: resolveImport({
        parsed: parseTimeSchedule(text).sections,
        courses: COURSES,
        roster: ROSTER,
        quarter: 'autumn',
        academicYear: '2026-27',
      }).history,
      terms: [{ id: 'au', quarter: 'autumn' }],
      timeSlots: [
        { id: 'tth-545', days: [2, 4], start_time: '17:45:00', end_time: '19:45:00' },
        { id: 'mw-1100', days: [1, 3], start_time: '11:00:00', end_time: '13:00:00' },
      ],
      rooms: [{ id: 'r102', label: 'UW1 102' }],
      activeInstructorIds: new Set(ROSTER.map((r) => r.id)),
      existingKeys,
    })

  it('lands the paste on the real time grid', () => {
    const result = plan(PASTE)
    const css101 = result.sections.find((s) => s.course_id === 'c101')
    expect(css101!.time_slot_id).toBe('tth-545')
    expect(css101!.room_id).toBe('r102')
    expect(result.stats.sections).toBe(4)
    expect(result.stats.assignments).toBe(3)
  })

  it('keeps an off-grid time rather than rounding it onto the grid', () => {
    const result = plan('CSS 142 X\n12888 A 5 MW 900-1000 UW1 102 Stride,Jeff Open 1/ 48')
    expect(result.sections[0]!.time_slot_id).toBeNull()
    expect(result.sections[0]!.custom_start).toBe('09:00')
    expect(result.stats.customTimes).toBe(1)
  })

  /**
   * Importing into a quarter that already has sections. `(term, course, letter)`
   * is unique, so without this the whole insert would fail on one collision.
   */
  it('skips a section the scenario already has, and imports the rest', () => {
    const result = plan(PASTE, new Set(['au|c107|A']))
    expect(result.stats.sections).toBe(3)
    expect(result.skipped).toEqual([{ detail: 'CSS 107 A (autumn)', reason: 'already in this scenario' }])
  })
})
