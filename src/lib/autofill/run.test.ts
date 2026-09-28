import { describe, expect, it } from 'vitest'
import { XlsxBook } from './xlsx'
import { PROPOSAL_FILL, readGlance } from './glance'
import { FT_SHEET, PT_SHEET } from './prefs'
import { REPORT_SHEETS, runAutofill } from './run'
import { ftWorkbook, glanceWorkbook, ptWorkbook } from './fixtures'

const now = new Date('2026-09-28T12:00:00Z')
const schedule = { name: '26-27 at a glance working.xlsx', bytes: glanceWorkbook() }
const fullTime = {
  name: 'FT responses.xlsx',
  bytes: ftWorkbook([
    { name: 'F3', load: 3, desired: '343, 342', comments: 'Cannot teach 8-10pm course, but willing to teach 845am if necessary' },
    { name: 'F8', load: '1.5 for now', desired: 'CSS 427' },
    { name: 'F22', load: 1, desired: "2. Win'27 0.5 SKL123A 1:15 W\n2. Win'27 0.5 123A 1:15 M/W" },
  ]),
}
const partTime = {
  name: 'PT responses.xlsx',
  bytes: ptWorkbook([{ name: 'P9', counts: 2, times: 'Any weekday during normal business hours.', courses: '342, 142' }]),
}

describe('runAutofill', () => {
  const run = runAutofill({ schedule, fullTime, partTime, placePartTime: false, now })
  const out = XlsxBook.read(run.output)
  const g = readGlance(out)
  const named = (label: string, quarter = 'autumn') => g.sections.find((s) => s.label === label && s.quarter === quarter)!

  it('writes each proposal into the instructor column, shaded as unconfirmed', () => {
    expect(run.fullTimeLoad).toEqual({ placed: 5.5, owed: 5.5 })
    expect(named('427A').proposed).toBe('F8')
    expect(named('427 Lab').proposed).toBe('F8')
    expect(named('123A', 'winter').proposed).toBe('F22')
    expect(named('SKL123A', 'winter').proposed).toBe('F22')
    // F3 cannot teach at 8 PM, so 343A (8:00 T/Th) is not theirs.
    expect(named('343A').proposed).toBeNull()
    expect(out.fillOf(g.sheetName, named('427A').row, 17)).toBe(PROPOSAL_FILL)
    expect(out.isItalic(g.sheetName, named('427A').row, 17)).toBe(false)
  })

  it('changes nothing else in the schedule', () => {
    const before = XlsxBook.read(schedule.bytes).sheet('qtr-day-tm-inst')
    const after = out.sheet('qtr-day-tm-inst')
    for (let r = 1; r <= before.maxRow; r++)
      for (let c = 1; c <= before.maxCol; c++) {
        if ([17, 26, 35].includes(c) && after.get(r, c) !== before.get(r, c)) continue // instructor columns
        expect(after.get(r, c)).toEqual(before.get(r, c))
      }
    expect(out.sheet('LinksToResources').get(1, 1)).toBe('By Faculty Public View Version')
  })

  it('adds the report and the editable preferences', () => {
    expect(out.sheetNames()).toEqual(['qtr-day-tm-inst', 'LinksToResources', ...REPORT_SHEETS])
    expect(out.sheet('Auto-fill summary').get(1, 1)).toBe('Auto-fill of AY 2026-27')
    const assignments = out.sheet('Assignments')
    expect(assignments.get(1, 1)).toBe('Quarter')
    expect(assignments.maxRow).toBe(run.result.placements.length + 1)
    const open = out.sheet('Open sections')
    const rows = Array.from({ length: open.maxRow }, (_, i) => [open.text(i + 1, 2), open.text(i + 1, 7)])
    // The part-time survey is read even when part-time instructors are not placed: open sections name who could take them.
    expect(rows.find(([label]) => label === '342A')?.[1]).toMatch(/Free then: P9/)
    // Numeric order, as the coordinator would sort them: F3, F8, F22.
    expect([2, 3, 4].map((r) => out.sheet(FT_SHEET).get(r, 1))).toEqual(['F3', 'F8', 'F22'])
    expect(out.sheet(PT_SHEET).get(2, 1)).toBe('P9')
    expect(run.outputName).toBe('26-27 at a glance working (auto-filled).xlsx')
  })

  it('runs again from its own output, keeping what was accepted and replacing its sheets', () => {
    const book = XlsxBook.read(run.output)
    const row = named('427A').row
    // Accept F8 on 427A by taking the shading off; move F22 to a load of 0.
    book.setCell(g.sheetName, row, 17, 'F8', { fill: null })
    const prefs = book.sheet(FT_SHEET)
    const f22 = Array.from({ length: prefs.maxRow }, (_, i) => i + 1).find((r) => prefs.text(r, 1) === 'F22')!
    book.setCell(FT_SHEET, f22, 2, 0)
    const second = runAutofill({ schedule: { name: run.outputName, bytes: book.write() }, placePartTime: false, now })
    expect(second.fullTime.source).toBe('review sheet')
    expect(second.partTime?.source).toBe('review sheet')
    const g2 = readGlance(XlsxBook.read(second.output))
    expect(g2.sections.find((s) => s.id === named('427A').id)).toMatchObject({ fixed: 'F8', proposed: null })
    // F22's proposals are cleared, shading and all.
    expect(g2.sections.find((s) => s.id === named('123A', 'winter').id)).toMatchObject({ fixed: null, proposed: null })
    expect(XlsxBook.read(second.output).fillOf(g2.sheetName, named('123A', 'winter').row, 26)).toBeNull()
    expect(XlsxBook.read(second.output).sheetNames()).toEqual(['qtr-day-tm-inst', 'LinksToResources', ...REPORT_SHEETS])
    expect(second.outputName).toBe('26-27 at a glance working (auto-filled).xlsx')
  })

  it('writes part-time names in italics when asked to place them', () => {
    const withPt = runAutofill({ schedule, fullTime, partTime, placePartTime: true, now })
    const p = withPt.result.placements.find((x) => x.kind === 'part-time')!
    expect(p.faculty).toBe('P9')
    const book = XlsxBook.read(withPt.output)
    const col = { autumn: 17, winter: 26, spring: 35 }[p.section.quarter as 'autumn']
    expect(book.isItalic('qtr-day-tm-inst', p.section.row, col)).toBe(true)
    expect(book.fillOf('qtr-day-tm-inst', p.section.row, col)).toBe(PROPOSAL_FILL)
  })

  it('says which file is wrong', () => {
    expect(() => runAutofill({ schedule, fullTime: partTime, placePartTime: false, now })).toThrow(/full-time preference survey/)
    expect(() => runAutofill({ schedule, placePartTime: false, now })).toThrow(/Add the full-time preferences/)
    expect(() => runAutofill({ schedule: fullTime, fullTime, placePartTime: false, now })).toThrow(/year-at-a-glance/)
  })
})
