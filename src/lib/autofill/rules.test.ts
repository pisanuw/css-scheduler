import { describe, expect, it } from 'vitest'
import { XlsxBook, buildXlsx, type CellValue } from './xlsx'
import { DEFAULT_RULES, RULES_SHEET, departmentRuleRows, describeRuleRow, readDepartmentRules, rulesFor } from './rules'
import { describeRule } from './text'

const book = (rows: CellValue[][]) => XlsxBook.read(buildXlsx([{ name: 'qtr-day-tm-inst', rows: [['x']] }, { name: RULES_SHEET, rows }]))

describe('department rules', () => {
  it('start from the rule the coordinator asked for: no T/Th 1:15 PM for full-time faculty', () => {
    const file = readDepartmentRules(XlsxBook.read(buildXlsx([{ name: 'qtr-day-tm-inst', rows: [['x']] }])))
    expect(file.source).toBe('default')
    expect(file.rows).toEqual(DEFAULT_RULES)
    expect(rulesFor('full-time', file.rows).map(describeRule)).toEqual(['no 1:15 PM-3:15 PM on T/Th'])
    expect(rulesFor('part-time', file.rows)).toEqual([])
    expect(file.rows.map(describeRuleRow)).toEqual(['Full-time: no 1:15 PM-3:15 PM on T/Th'])
  })

  it('are exactly what the sheet says, once there is one', () => {
    const file = readDepartmentRules(
      book([
        ['Applies to', 'Rule', 'Notes'],
        ['Everyone', 'no Fri 3:30 PM', 'Labs on Friday afternoons'],
        ['PT', 'no 8:00 PM-10:00 PM on M/W; no T/Th 1:15 PM', ''],
        ['Adjuncts', 'no T/Th 1:15 PM', ''],
        ['Full-time', 'not before lunch', 'to check'],
        ['Full-time', '', 'an empty rule is no rule'],
      ]),
    )
    expect(file.source).toBe('sheet')
    expect(rulesFor('full-time', file.rows).map(describeRule)).toEqual(['no 3:30 PM-5:30 PM on Fri'])
    expect(rulesFor('part-time', file.rows).map(describeRule)).toEqual(['no 3:30 PM-5:30 PM on Fri', 'no 8:00 PM-10:00 PM on M/W', 'no 1:15 PM-3:15 PM on T/Th'])
    expect(file.warnings).toEqual([
      'Department rule “no T/Th 1:15 PM” not used: “Applies to” should say Full-time, Part-time or Everyone, not “Adjuncts”.',
      'Department rule not understood, so not used: “not before lunch”. Write it like “no T/Th 1:15 PM” or “no 8:00 PM-10:00 PM on M/W”.',
    ])
  })

  it('are none when every row is deleted', () => {
    expect(readDepartmentRules(book([['Applies to', 'Rule', 'Notes']])).rows).toEqual([])
  })

  it('write back what they read, and keep what they could not read for fixing', () => {
    const first = readDepartmentRules(
      book([
        ['Applies to', 'Rule', 'Notes'],
        ['full time', 'no T/Th 1:15 PM', 'Faculty meetings'],
        ['Adjuncts', 'no T/Th 1:15 PM', 'check this'],
      ]),
    )
    const rows = departmentRuleRows(first).map((r) => r.map((c): CellValue => (c !== null && typeof c === 'object' ? c.v : c)))
    expect(rows).toEqual([
      ['Applies to', 'Rule', 'Notes'],
      ['Full-time', 'no 1:15 PM-3:15 PM on T/Th', 'Faculty meetings'],
      ['Adjuncts', 'no T/Th 1:15 PM', 'check this'],
    ])
    const again = readDepartmentRules(book(rows))
    expect(again.rows).toEqual(first.rows)
    expect(again.unread).toEqual(first.unread)
  })
})
