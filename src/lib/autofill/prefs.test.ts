import { describe, expect, it } from 'vitest'
import { XlsxBook, buildXlsx, type CellValue } from './xlsx'
import { FT_SHEET, PT_SHEET, describeWish, detectPrefsKind, parseWishes, readPrefs, reviewSheetRows, type FacultyPrefs } from './prefs'
import { describeRule } from './text'
import { ftWorkbook, ptWorkbook, type FtAnswer } from './fixtures'

const ft = (answers: FtAnswer[]) => readPrefs(XlsxBook.read(ftWorkbook(answers)), 'full-time', 2026)!.faculty
const one = (a: Partial<FtAnswer>) => ft([{ name: 'F1', load: 5, desired: '', ...a }])[0]!
const wishes = (text: string) => parseWishes(text, 2026).map(describeWish).filter(Boolean)

describe('parseWishes', () => {
  it('keeps a parenthesis with the course before it', () => {
    expect(
      wishes('CSS 497 (Autumn, Winter and Spring), CSS 421 (Winter), CSS 360 (Autumn, Spring), CSS 506 (Autumn - 100% online async), CSS 101 or CSS 142 (Spring)'),
    ).toEqual(['497: Aut, Win, Spr', '421: Win', '360: Aut, Spr', '506: Aut', '101: Spr', '142: Spr'])
  })

  it('reads counts under a leading quarter', () => {
    expect(wishes('343, 342, 385, 422. Ideally: Autumn 2 x 342 (back-to-back if possible), 1 x 343; Winter 2 x 343, 1 x 342; Spring: 1 x 343 and 1 x 385 or 1 x 422')).toEqual([
      '343: Aut x1, Win x2, Spr x1',
      '342: Aut x2, Win x1',
      '385: Spr x1',
      '422: Spr x1',
    ])
  })

  it('reads a requested timetable, line by line', () => {
    const text = ["1. Aut'26       1       112A    8:45    T/Th", "1. Aut'26       0.5     SKL123A 1:15    W", "2. Win'27       0.5     123A    1:15    M/W"].join('\n')
    expect(wishes(text)).toEqual(['112A: Aut @ 8:45 AM, T/Th', 'SKL123A: Aut @ 1:15 PM, Wed', '123A: Win @ 1:15 PM, M/W'])
  })

  it('reads a course, its quarter, its count, its times and its days in one line', () => {
    expect(wishes('CSS 343 - 2 sections Win 2027 11-1pm and 1:15pm-3:15pm. Mon-Wed')).toEqual(['343: Win x2 @ 11:00 AM, 1:15 PM, M/W'])
  })

  it('drops a section letter that says nothing about when', () => {
    expect(parseWishes('497C, BST205A', 2026).map((w) => w.letter)).toEqual([null, null])
  })
})

describe('full-time survey', () => {
  it('plans the load it is given and keeps the maybes as notes', () => {
    const p = one({ load: '8 for now (possibly 1 ISS & possibly leave all quarters): ', iss: 'Yes', issDrop: '422, 385', leave: 'Yes', leaveDetail: '3 quarters: Aut, Win, Spr' })
    expect(p.target).toBe(8)
    expect(p.quarterMax).toEqual({ autumn: 3, winter: 3, spring: 3 })
    expect(p.flags.join('\n')).toMatch(/possibly 1 ISS/)
    expect(p.flags.join('\n')).toMatch(/ISS course release \(would drop 422, 385\) — not applied/)
    expect(p.flags.join('\n')).toMatch(/tentative, not applied/)
  })

  it('reads the coordinator’s own course list after the load', () => {
    expect(one({ load: '3: 502, 584, 343' }).pinned).toEqual(['502', '584', '343'])
    expect(one({ load: '5 for now (possibly 1 ISS): BCUSP OR BCORE? 490 may be 590?' }).pinned).toEqual([])
  })

  it('applies a service release to the quarter it names', () => {
    const p = one({ load: '3: 502, 584, 343', service: 'Yes', serviceDetail: "UPC 2 course release in Aut'26" })
    expect(p.quarterMax).toEqual({ autumn: 0, winter: 2, spring: 2 })
    const q = one({ load: 4, service: 'Yes', serviceDetail: 'Director of an initiative, release in winter quarter' })
    expect(q.quarterMax).toEqual({ autumn: 2, winter: 1, spring: 2 })
  })

  it('applies a definite leave, and only a definite one', () => {
    expect(one({ load: 5, leave: 'Yes', leaveDetail: 'Spring 2027' }).quarterMax.spring).toBe(0)
    expect(one({ load: 5, leave: 'Yes', leaveDetail: 'I have applied for a sabbatical' }).quarterMax.spring).toBe(2)
    expect(one({ load: 3, comments: 'I would like to keep my winter quarter free of classes.' }).quarterMax).toEqual({ autumn: 2, winter: 0, spring: 2 })
  })

  it('reads prefer-not lists, graduate refusals, time rules and day wishes', () => {
    const p = one({
      desired: 'CSS 488, CSS 343',
      avoid: 'After 6 years of teaching 8-10pm. I do not wish to teach any more night classes which means no graduate classes.',
      comments: 'I cannot teach any evening or late afternoon classes. The latest I can teach is 1:15 slot.',
    })
    expect(p.noGraduate).toBe(true)
    expect(p.rules.map(describeRule)).toEqual(['no 5:45 PM-midnight', 'no 3:30 PM-5:30 PM', 'no starting after 1:15 PM', 'no 8:00 PM-midnight'])
    expect(one({ comments: 'When I have two classes, I prefer for them to be on the same days.' }).sameDays).toBe(true)
  })

  it('keeps a course that is both wanted and unwanted to the quarter it was wanted in', () => {
    const p = one({ desired: 'CSS 421 (Winter)', avoid: 'CSS 350, CSS 421 (I prefer to teach one quarter a year)' })
    expect(p.avoid).toEqual(['350', '421'])
    expect(p.flags.join(' ')).toMatch(/421 is both wanted \(Win\)/)
  })

  it('keeps the latest response from someone who answered twice', () => {
    const list = ft([
      { name: 'F7', load: 4, desired: '586', stamp: 46100 },
      { name: 'F7', load: 4, desired: '581', stamp: 46200 },
    ])
    expect(list).toHaveLength(1)
    expect(list[0]!.desired.map((w) => w.key)).toEqual(['581'])
  })
})

describe('part-time survey', () => {
  const pt = readPrefs(
    XlsxBook.read(
      ptWorkbook([
        { name: 'P2', counts: 3, times: 'Mon -Thu and after 4:30 PM', courses: 'CSS 478, CSS 497, CSS 101' },
        { name: 'P4', counts: 'For now just 2 in Winter Quarter', times: 'MW afternoon times starting at 1pm', courses: 'CSS436, CSS430' },
        { name: 'P20', counts: 'Autumn  0\nWinter 1\nSpring 1', times: 'Tue/Thur  11:00  All terms. ', courses: 'CSS 475   Databases', constraints: 'I cannot teach later than 11:00 due to other constraints.' },
      ]),
    ),
    'part-time',
    2026,
  )!.faculty

  it('reads the counts as quarter maximums', () => {
    expect(pt.map((p) => p.quarterMax)).toEqual([
      { autumn: 3, winter: 3, spring: 3 },
      { autumn: 0, winter: 2, spring: 0 },
      { autumn: 0, winter: 1, spring: 1 },
    ])
  })

  it('reads availability and constraints as rules', () => {
    expect(pt[0]!.rules.map(describeRule)).toEqual(['only M/T/W/Th 4:30 PM-midnight'])
    expect(pt[2]!.rules.map(describeRule)).toEqual(['only T/Th 11:00 AM-1:00 PM', 'no starting after 11:00 AM'])
  })
})

describe('the review sheet', () => {
  it('reads back exactly what it wrote', () => {
    const list = ft([
      { name: 'F2', load: '8 for now (possibly 1 ISS): ', desired: 'CSS 497 (Autumn, Winter and Spring), CSS 421 (Winter), CSS 506 (Autumn)', ok: 'CSS 496', avoid: 'CSS 350' },
      { name: 'F13', load: 5, desired: 'CSS 343 - 2 sections Win 2027 11-1pm and 1:15pm-3:15pm. Mon-Wed\nCSS 444 - Spring 2027 Fridays', comments: 'The latest I can teach is 1:15 slot.', avoid: 'no graduate classes' },
      { name: 'F15', load: 8, desired: 'CSS 496, CSSSKL 511', comments: 'the latest course I can teach on WEDNESDAY is 3:30.' },
      { name: 'F1', load: '3: 502, 584, 343', desired: '502, 343', service: 'Yes', serviceDetail: "UPC 2 course release in Aut'26" },
    ])
    const rows = reviewSheetRows({ kind: 'full-time', faculty: list }).map((r) =>
      r.map((c): CellValue => (c !== null && typeof c === 'object' ? c.v : c)),
    )
    const back = readPrefs(XlsxBook.read(buildXlsx([{ name: FT_SHEET, rows }])), 'full-time', 2026)!
    expect(back.source).toBe('review sheet')
    const same = (p: FacultyPrefs) => ({
      target: p.target,
      quarterMax: p.quarterMax,
      pinned: p.pinned,
      desired: p.desired.map(describeWish),
      ok: p.ok.map((w) => w.key),
      avoid: p.avoid,
      rules: p.rules.map(describeRule),
      noGraduate: p.noGraduate,
      sameDays: p.sameDays,
    })
    expect(back.faculty.map(same)).toEqual(list.map(same))
    // The notes come along, so a second run does not lose the first run's warnings.
    const f2 = back.faculty.find((p) => p.name === 'F2')!
    expect(f2.flags).toEqual(list.find((p) => p.name === 'F2')!.flags)
    expect(f2.flags.join(' ')).toMatch(/possibly 1 ISS/)
  })

  it('names the kind of preferences a workbook holds', () => {
    expect(detectPrefsKind(XlsxBook.read(ftWorkbook([{ name: 'F1', load: 5, desired: '343' }])))).toBe('full-time')
    expect(detectPrefsKind(XlsxBook.read(ptWorkbook([{ name: 'P1', counts: 2, times: 'Flexible', courses: '343' }])))).toBe('part-time')
    expect(detectPrefsKind(XlsxBook.read(buildXlsx([{ name: PT_SHEET, rows: [['Instructor']] }])))).toBe('part-time')
    expect(detectPrefsKind(XlsxBook.read(buildXlsx([{ name: 'Sheet1', rows: [['nothing']] }])))).toBeNull()
  })
})
