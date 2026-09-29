/**
 * Rules for the whole department, as against one person's.
 *
 * "No T/Th 1:15 PM for full-time faculty" is not something any survey answer
 * says; it is how the department runs. So it lives on a sheet of its own in
 * the workbook — one rule per row, in the notation the "Time rules" column of
 * the preferences sheets uses — and travels with the workbook the way the
 * corrected preferences do. A workbook without the sheet gets the rules the
 * coordinator has asked for so far; a workbook with it gets exactly what is
 * on it, so deleting a row turns a rule off and adding one turns one on.
 */

import type { FacultyKind } from './prefs'
import type { OutCell, XlsxBook } from './xlsx'
import { describeRule, normalise, parseRuleList, type TimeRule } from './text'

export const RULES_SHEET = 'Department rules'

export type Applies = FacultyKind | 'everyone'

/** One row of the sheet: who it binds, and the rules written on it. */
export interface RuleRow {
  appliesTo: Applies
  rules: TimeRule[]
  /** What the coordinator wrote beside it: carried forward, never read. */
  note: string
}

export interface RulesFile {
  rows: RuleRow[]
  source: 'default' | 'sheet'
  /** Rows that could not be read, written back as they were so they can be fixed. */
  unread: { appliesTo: string; rule: string; note: string }[]
  warnings: string[]
}

/** The coordinator's rules so far: full-time faculty do not teach in the T/Th 1:15 block. */
export const DEFAULT_RULES: RuleRow[] = [
  {
    appliesTo: 'full-time',
    rules: [{ kind: 'avoid', start: 13 * 60 + 15, end: 15 * 60 + 15, days: [2, 4], strength: 'hard' }],
    note: 'Full-time faculty do not teach T/Th 1:15 PM. Delete this row to turn it off.',
  },
]

const HEADERS = ['Applies to', 'Rule', 'Notes']

const APPLIES_LABEL: Record<Applies, string> = { 'full-time': 'Full-time', 'part-time': 'Part-time', everyone: 'Everyone' }

function appliesTo(text: string): Applies | null {
  const t = normalise(text).trim().toLowerCase()
  if (!t || /^(all|every|both|any)/.test(t)) return 'everyone'
  if (/^(ft|full)/.test(t)) return 'full-time'
  if (/^(pt|part)/.test(t)) return 'part-time'
  return null
}

/** The department rules a workbook carries, or the defaults when it carries none. */
export function readDepartmentRules(book: XlsxBook): RulesFile {
  if (!book.hasSheet(RULES_SHEET)) {
    return { rows: DEFAULT_RULES.map((r) => ({ ...r, rules: [...r.rules] })), source: 'default', unread: [], warnings: [] }
  }
  const sheet = book.sheet(RULES_SHEET)
  const col = (h: string) => {
    for (let c = 1; c <= sheet.maxCol; c++) if (sheet.text(1, c).trim().toLowerCase() === h.toLowerCase()) return c
    return null
  }
  const at = { applies: col('Applies to'), rule: col('Rule'), note: col('Notes') }
  const file: RulesFile = { rows: [], source: 'sheet', unread: [], warnings: [] }
  if (at.rule === null) {
    file.warnings.push(`The “${RULES_SHEET}” sheet has no “Rule” column, so no department rules were used.`)
    return file
  }
  for (let r = 2; r <= sheet.maxRow; r++) {
    const text = (c: number | null) => (c ? sheet.text(r, c).replace(/\r\n?/g, '\n').trim() : '')
    const rule = text(at.rule)
    if (!rule) continue
    const who = text(at.applies)
    const note = text(at.note)
    const binds = appliesTo(who)
    const { rules, unread } = parseRuleList(rule)
    if (!binds) {
      file.unread.push({ appliesTo: who, rule, note })
      file.warnings.push(`Department rule “${rule}” not used: “Applies to” should say Full-time, Part-time or Everyone, not “${who}”.`)
    } else if (unread.length || rules.length === 0) {
      file.unread.push({ appliesTo: who, rule, note })
      file.warnings.push(`Department rule not understood, so not used: “${rule}”. Write it like “no T/Th 1:15 PM” or “no 8:00 PM-10:00 PM on M/W”.`)
    } else {
      file.rows.push({ appliesTo: binds, rules, note })
    }
  }
  return file
}

/** The rules that bind one kind of instructor. */
export function rulesFor(kind: FacultyKind, rows: RuleRow[]): TimeRule[] {
  return rows.filter((r) => r.appliesTo === 'everyone' || r.appliesTo === kind).flatMap((r) => r.rules)
}

/** A row in words, for the summary: "Full-time: no 1:15 PM-3:15 PM on T/Th". */
export function describeRuleRow(row: RuleRow): string {
  return `${APPLIES_LABEL[row.appliesTo]}: ${row.rules.map(describeRule).join('; ')}`
}

/** The sheet as read: each rule in the notation it is read back from, and anything unread as it was written. */
export function departmentRuleRows(file: RulesFile): OutCell[][] {
  const rows: OutCell[][] = [HEADERS.map((h) => ({ v: h, header: true }))]
  for (const r of file.rows) rows.push([APPLIES_LABEL[r.appliesTo], r.rules.map(describeRule).join('; '), { v: r.note, wrap: true }])
  for (const u of file.unread) rows.push([u.appliesTo, u.rule, { v: u.note, wrap: true }])
  return rows
}

export const RULES_WIDTHS = [12, 36, 80]
