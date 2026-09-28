import { describe, expect, it } from 'vitest'
import { XlsxBook, buildXlsx } from './xlsx'
import { PROPOSAL_FILL, parseDaysCell, parseTimeCell, readGlance } from './glance'
import { glanceRows, glanceWorkbook, t } from './fixtures'

const h = (hh: number, mm = 0) => hh * 60 + mm

describe('readGlance', () => {
  const g = readGlance(XlsxBook.read(glanceWorkbook()))
  const find = (quarter: string, label: string) => g.sections.find((s) => s.quarter === quarter && s.label === label)!

  it('finds the three teaching quarters by their headings and leaves summer alone', () => {
    expect(g.blocks.map((b) => [b.quarter, b.label])).toEqual([
      ['autumn', 'Autumn 2026'],
      ['winter', 'Winter 2027'],
      ['spring', 'Spring 2027'],
    ])
    expect(g.yearLabel).toBe('AY 2026-27')
    expect(g.sections.some((s) => s.quarter === 'summer')).toBe(false)
    expect(g.blocks[0]!.col).toMatchObject({ load: 12, course: 13, time: 14, day: 15, instructor: 17 })
  })

  it('reads times the way the sheet writes them', () => {
    expect(find('autumn', '142A').meeting).toEqual({ days: [1, 3], start: h(13, 15), end: h(15, 15) })
    expect(find('autumn', '343A').meeting?.start).toBe(h(20))
    expect(find('autumn', 'SKL142A').meeting).toEqual({ days: [5], start: h(8, 45), end: h(11, 15) })
    expect(find('autumn', '427 Lab').meeting).toEqual({ days: [5], start: h(9, 30), end: h(13) })
    expect(find('autumn', '506A').meeting).toEqual({ days: [3], start: h(19), end: h(21) })
    expect(find('autumn', '501A')).toMatchObject({ meeting: null, online: true, when: 'online' })
    expect(find('winter', 'BCORE 115/116')).toMatchObject({ meeting: null, timing: 'tbd', keys: ['BCORE115', 'BCORE116'] })
  })

  it('knows what is not ours to fill', () => {
    expect(find('autumn', '474A').external).toBe(true)
    expect(g.sections.some((s) => s.label === '497')).toBe(false) // arranged: '**'
    expect(g.skipped).toEqual([{ quarter: 'spring', row: expect.any(Number) as number, label: '490A', reason: 'no load in the load column' }])
    // The stray note in a course column is not a section.
    expect(g.sections.some((s) => /ask EE/.test(s.label))).toBe(false)
  })

  it('reads the notes that change how a section is treated', () => {
    expect(find('autumn', '142B').reserved).toBe(true)
    expect(find('autumn', '142A').reserved).toBe(false)
    expect(find('winter', '590A')).toMatchObject({ placeholder: true, graduate: true })
    expect(find('winter', '490C/582A').keys).toEqual(['490', '582'])
    expect(find('autumn', 'SKL142A').lab).toBe(true)
    expect(find('autumn', '142A').category).toBe('prerequisite')
  })

  it('tells a proposal from a decision by its shading', () => {
    const rows = glanceRows()
    const book = XlsxBook.read(buildXlsx([{ name: 'qtr-day-tm-inst', rows }]))
    const first = readGlance(book)
    const a = first.sections.find((s) => s.quarter === 'autumn' && s.label === '142A')!
    const b = first.sections.find((s) => s.quarter === 'autumn' && s.label === '342A')!
    book.setCell(first.sheetName, a.row, 17, 'F9', { fill: PROPOSAL_FILL })
    book.setCell(first.sheetName, b.row, 17, 'F3', {})
    const again = readGlance(XlsxBook.read(book.write()))
    expect(again.sections.find((s) => s.id === a.id)).toMatchObject({ proposed: 'F9', fixed: null })
    expect(again.sections.find((s) => s.id === b.id)).toMatchObject({ proposed: null, fixed: 'F3' })
  })

  it('says what it expected when it is given the wrong workbook', () => {
    const wrong = XlsxBook.read(buildXlsx([{ name: 'Form Responses 1', rows: [['Timestamp', 'Name']] }]))
    expect(() => readGlance(wrong)).toThrow(/year-at-a-glance/)
  })
})

describe('cells', () => {
  it('reads day patterns', () => {
    expect(parseDaysCell('M/W')).toEqual([1, 3])
    expect(parseDaysCell('T/TH')).toEqual([2, 4])
    expect(parseDaysCell('MTWTH')).toEqual([1, 2, 3, 4])
    expect(parseDaysCell('N/A')).toEqual([])
  })

  it('reads time cells', () => {
    expect(parseTimeCell(t(11))).toEqual({ timing: 'scheduled', start: h(11), end: h(13) })
    expect(parseTimeCell('11:30-2:00')).toEqual({ timing: 'scheduled', start: h(11, 30), end: h(14) })
    expect(parseTimeCell('8:00-9:00')).toEqual({ timing: 'scheduled', start: h(20), end: h(21) })
    expect(parseTimeCell('**').timing).toBe('arranged')
    expect(parseTimeCell('N/A').timing).toBe('online')
    expect(parseTimeCell('TBD').timing).toBe('tbd')
  })
})
