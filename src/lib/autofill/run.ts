/**
 * One auto-fill, from the three uploaded workbooks to the one handed back.
 *
 * Everything here is pure apart from the clock, which is passed in: the page
 * and the command line both call {@link runAutofill}, and the tests call it
 * with fixtures and a fixed date. Nothing is uploaded anywhere — the page runs
 * this in the browser, on bytes the coordinator chose from their own disk.
 */

import { XlsxBook, type OutCell } from './xlsx'
import { PROPOSAL_FILL, readGlance, type GlanceSchedule, type GlanceSection } from './glance'
import { FT_SHEET, PT_SHEET, REVIEW_WIDTHS, readPrefs, reviewSheetRows, type PrefsFile } from './prefs'
import { autofill, type EngineResult, type FacultyResult } from './engine'
import { QUARTER_SHORT, YEAR_QUARTERS } from './text'
import type { Quarter } from '../types'

export interface InputFile {
  name: string
  bytes: Uint8Array
}

export interface AutofillInput {
  schedule: InputFile
  fullTime?: InputFile | null
  partTime?: InputFile | null
  /** Also place part-time instructors in what the full-time pass leaves, within their caps. */
  placePartTime: boolean
  now: Date
}

export interface QuarterTally {
  quarter: Quarter
  label: string
  toStaff: number
  fullTime: number
  partTime: number
  open: number
}

export interface AutofillRun {
  schedule: GlanceSchedule
  fullTime: PrefsFile
  partTime: PrefsFile | null
  result: EngineResult
  tallies: QuarterTally[]
  /** Full-time load placed (including names already in the sheet) against the loads owed. */
  fullTimeLoad: { placed: number; owed: number }
  warnings: string[]
  output: Uint8Array
  outputName: string
}

/** The sheets this tool adds, which a later run replaces rather than duplicates. */
export const REPORT_SHEETS = ['Auto-fill summary', 'Faculty load', 'Assignments', 'Open sections', 'By faculty', FT_SHEET, PT_SHEET]

function outputName(input: string): string {
  const base = input.replace(/\.xlsx$/i, '').replace(/\s*\(auto-filled\)\s*$/i, '')
  return `${base} (auto-filled).xlsx`
}

function when(s: GlanceSection): string {
  return `${s.label} ${s.when}`
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10)
}

/** Read everything, fill, and write the workbook back. Throws a readable sentence on bad input. */
export function runAutofill(input: AutofillInput): AutofillRun {
  const warnings: string[] = []
  const book = XlsxBook.read(input.schedule.bytes)
  const schedule = readGlance(book)
  const year = schedule.autumnYear ?? undefined

  let fullTime: PrefsFile | null
  if (input.fullTime) {
    fullTime = readPrefs(XlsxBook.read(input.fullTime.bytes), 'full-time', year)
    if (!fullTime) throw new Error(`“${input.fullTime.name}” does not look like the full-time preference survey (no “most desired” column) or a workbook with an “${FT_SHEET}” sheet.`)
  } else {
    fullTime = readPrefs(book, 'full-time', year)
    if (!fullTime || fullTime.source !== 'review sheet') throw new Error('Add the full-time preferences: the survey export, or a workbook this page produced earlier.')
  }
  let partTime: PrefsFile | null = null
  if (input.partTime) {
    partTime = readPrefs(XlsxBook.read(input.partTime.bytes), 'part-time', year)
    if (!partTime) throw new Error(`“${input.partTime.name}” does not look like the part-time preference survey (no “how many courses” column) or a workbook with a “${PT_SHEET}” sheet.`)
  } else if (book.hasSheet(PT_SHEET)) {
    partTime = readPrefs(book, 'part-time', year)
  }
  warnings.push(...fullTime.warnings, ...(partTime?.warnings ?? []))

  const everyone = new Set([...fullTime.faculty, ...(partTime?.faculty ?? [])].map((p) => p.name.toLowerCase()))
  const strangers = [...new Set(schedule.sections.filter((s) => s.fixed && !everyone.has(s.fixed.toLowerCase())).map((s) => s.fixed!))]
  if (strangers.length) warnings.push(`Names already in the schedule that match no preference response were kept as they are: ${strangers.join(', ')}.`)
  const dupes = fullTime.faculty.filter((f) => partTime?.faculty.some((p) => p.name.toLowerCase() === f.name.toLowerCase()))
  if (dupes.length) warnings.push(`In both the full-time and part-time responses: ${dupes.map((d) => d.name).join(', ')}.`)

  const result = autofill(schedule.sections, fullTime.faculty, partTime?.faculty ?? [], { placePartTime: input.placePartTime })

  const tallies: QuarterTally[] = schedule.blocks.map((b) => {
    const inQ = schedule.sections.filter((s) => s.quarter === b.quarter && !s.external)
    const placed = result.placements.filter((p) => p.section.quarter === b.quarter)
    return {
      quarter: b.quarter,
      label: b.label,
      toStaff: inQ.filter((s) => !s.fixed).length,
      fullTime: placed.filter((p) => p.kind === 'full-time').length,
      partTime: placed.filter((p) => p.kind === 'part-time').length,
      open: result.open.filter((o) => o.section.quarter === b.quarter).length,
    }
  })
  const ftResults = result.faculty.filter((f) => f.prefs.kind === 'full-time')
  const fullTimeLoad = {
    placed: ftResults.reduce((a, f) => a + f.load, 0),
    owed: ftResults.reduce((a, f) => a + (f.prefs.target ?? 0), 0),
  }

  writeBack(book, schedule, fullTime, partTime, result, input, tallies, fullTimeLoad, warnings)
  return {
    schedule,
    fullTime,
    partTime,
    result,
    tallies,
    fullTimeLoad,
    warnings,
    output: book.write(),
    outputName: outputName(input.schedule.name),
  }
}

function writeBack(
  book: XlsxBook,
  schedule: GlanceSchedule,
  fullTime: PrefsFile,
  partTime: PrefsFile | null,
  result: EngineResult,
  input: AutofillInput,
  tallies: QuarterTally[],
  fullTimeLoad: { placed: number; owed: number },
  warnings: string[],
): void {
  const col = new Map(schedule.blocks.map((b) => [b.quarter, b.col.instructor]))
  const placed = new Set(result.placements.map((p) => p.section.id))
  // Last run's proposals that nobody took this time are cleared, shading and all.
  for (const s of schedule.sections) {
    if (s.proposed && !placed.has(s.id)) book.setCell(schedule.sheetName, s.row, col.get(s.quarter)!, null, { fill: null })
  }
  for (const p of result.placements) {
    book.setCell(schedule.sheetName, p.section.row, col.get(p.section.quarter)!, p.faculty, {
      fill: PROPOSAL_FILL,
      italic: p.kind === 'part-time',
    })
  }

  for (const name of REPORT_SHEETS) book.removeSheet(name)
  book.addSheet('Auto-fill summary', summaryRows(schedule, fullTime, partTime, result, input, tallies, fullTimeLoad, warnings), { widths: [26, 110] })
  book.addSheet('Faculty load', facultyRows(result.faculty, input.placePartTime), {
    widths: [10, 10, 7, 9, 6, 6, 6, 6, 9, 30, 30, 30, 70],
    freezeHeader: true,
    autoFilter: true,
  })
  book.addSheet('Assignments', assignmentRows(result), { widths: [8, 12, 16, 6, 11, 10, 52, 44, 44], freezeHeader: true, autoFilter: true })
  book.addSheet('Open sections', openRows(result), { widths: [8, 12, 16, 6, 10, 60, 60], freezeHeader: true, autoFilter: true })
  book.addSheet('By faculty', byFacultyRows(result.faculty, input.placePartTime), { widths: [11, 10, 32, 32, 32, 8], freezeHeader: true, autoFilter: true })
  book.addSheet(FT_SHEET, reviewSheetRows(fullTime), { widths: REVIEW_WIDTHS['full-time'], freezeHeader: true, autoFilter: true })
  if (partTime) book.addSheet(PT_SHEET, reviewSheetRows(partTime), { widths: REVIEW_WIDTHS['part-time'], freezeHeader: true, autoFilter: true })
}

function summaryRows(
  schedule: GlanceSchedule,
  fullTime: PrefsFile,
  partTime: PrefsFile | null,
  result: EngineResult,
  input: AutofillInput,
  tallies: QuarterTally[],
  load: { placed: number; owed: number },
  warnings: string[],
): OutCell[][] {
  const date = input.now.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
  const ftShort = result.faculty.filter((f) => f.prefs.kind === 'full-time' && f.gap > 1e-6)
  const reserved = result.placements.filter((p) => p.section.reserved)
  const rows: OutCell[][] = [
    [{ v: `Auto-fill of ${schedule.yearLabel}`, bold: true }, date],
    [],
    [{ v: 'Inputs', bold: true }, [input.schedule.name, input.fullTime?.name ?? `the “${FT_SHEET}” sheet in the schedule`, input.partTime?.name ?? (partTime ? `the “${PT_SHEET}” sheet in the schedule` : 'no part-time file')].join('  ·  ')],
    [{ v: 'Preferences read', bold: true }, `${fullTime.faculty.length} full-time (${fullTime.source})${partTime ? `, ${partTime.faculty.length} part-time (${partTime.source})` : ''}`],
    [{ v: 'Part-time placed', bold: true }, input.placePartTime ? 'Yes — within the per-quarter counts they asked for (and any two-quarter or year caps on the PT preferences sheet). A draft: title-based load policy is not modelled.' : 'No — the sections left open list the part-time instructors who asked for them and are free then.'],
    [],
    [{ v: 'Full-time load', bold: true }, `${fmt(load.placed)} of ${fmt(load.owed)} placed. ${ftShort.length ? `Short: ${ftShort.map((f) => `${f.prefs.name} (${fmt(f.load)} of ${fmt(f.prefs.target ?? 0)})`).join(', ')} — see Faculty load.` : 'Everyone is at their load.'}`],
    ...tallies.map((t): OutCell[] => [
      { v: t.label, bold: true },
      `${t.toStaff} sections to staff: ${t.fullTime} proposed for full-time${input.placePartTime ? `, ${t.partTime} for part-time` : ''}, ${t.open} left open.`,
    ]),
    [{ v: 'Reserved sections used', bold: true }, reserved.length ? `${reserved.map((p) => `${QUARTER_SHORT[p.section.quarter]} ${p.section.label} (${p.faculty})`).join(', ')} — marked “reserved” in the internal notes, so they may not run.` : 'None.'],
    [],
    [{ v: 'How to read it', bold: true }, { v: 'Every name this run wrote is shaded purple — the sheet’s own legend for “assignments that still need to be made or confirmed”. Italic names are part-time, as the legend says. Nothing else in the schedule was changed.', wrap: true }],
    [{ v: 'Accepting a proposal', bold: true }, { v: 'Remove the purple shading from the name. A name without the shading is kept exactly as it is on the next run, and counts toward that person’s load.', wrap: true }],
    [{ v: 'Correcting a preference', bold: true }, { v: `Edit the “${FT_SHEET}” sheet — the load, the quarter maximums (0 is a quarter off), the course order, the time rules — then upload this workbook again as the schedule. The edited sheet is used instead of the survey, and every purple name is worked out again.`, wrap: true }],
    [{ v: 'Why each name', bold: true }, { v: '“Assignments” gives the reason for every proposal and who else wanted that section. “Open sections” says, for each section left, which full-time faculty asked for it and why they did not get it, and which part-time instructors could take it.', wrap: true }],
    [{ v: 'Rules it follows', bold: true }, { v: 'Never over a full-time load, never two classes at once, never in a quarter someone is away or has maxed out, never against a hard constraint (“cannot teach 8-10pm”, “no graduate classes”). Within that: pinned courses first, then higher-ranked choices, the quarter and time they named, fewer preparations; shortfalls are shared rather than piled on one person. Reserved sections are used last.', wrap: true }],
  ]
  if (warnings.length) {
    rows.push([], [{ v: 'Check', bold: true }, { v: warnings.join('\n'), wrap: true }])
  }
  if (schedule.skipped.length) {
    rows.push([{ v: 'Rows not staffed', bold: true }, { v: schedule.skipped.map((s) => `${QUARTER_SHORT[s.quarter]} ${s.label} (row ${s.row}): ${s.reason}`).join('\n'), wrap: true }])
  }
  return rows
}

function sectionList(f: FacultyResult, q: Quarter): string {
  const fixed = f.fixed.filter((s) => s.quarter === q).map((s) => `${when(s)} (in sheet)`)
  const placed = f.placed.filter((s) => s.quarter === q).map(when)
  return [...fixed, ...placed].join('\n')
}

function facultyRows(faculty: FacultyResult[], withPartTime: boolean): OutCell[][] {
  const header = ['Faculty', 'Type', 'Load', 'Assigned', 'Aut', 'Win', 'Spr', 'Gap', 'Top-3 share', 'Autumn', 'Winter', 'Spring', 'Notes']
  const rows: OutCell[][] = [header.map((h) => ({ v: h, header: true, wrap: true }))]
  for (const f of faculty) {
    if (f.prefs.kind === 'part-time' && (!withPartTime || f.load === 0)) continue
    const notes = [
      ...(f.gap > 1e-6 && f.prefs.kind === 'full-time' ? [`Short by ${fmt(f.gap)}: ${f.shortBecause.join('; ')}.`] : []),
      ...(f.notOffered.length && !f.shortBecause.some((x) => x.startsWith('not offered')) ? [`Not offered this year: ${f.notOffered.join(', ')}.`] : []),
      ...f.prefs.flags,
    ]
    rows.push([
      f.prefs.name,
      f.prefs.kind === 'full-time' ? 'Full-time' : 'Part-time',
      f.prefs.kind === 'full-time' ? f.prefs.target : null,
      f.load,
      f.byQuarter.autumn,
      f.byQuarter.winter,
      f.byQuarter.spring,
      f.prefs.kind === 'full-time' ? Math.round(f.gap * 10) / 10 : null,
      f.topShare === null ? null : `${Math.round(f.topShare * 100)}%`,
      { v: sectionList(f, 'autumn'), wrap: true },
      { v: sectionList(f, 'winter'), wrap: true },
      { v: sectionList(f, 'spring'), wrap: true },
      { v: notes.join('\n'), wrap: true },
    ])
  }
  return rows
}

function assignmentRows(result: EngineResult): OutCell[][] {
  const header = ['Quarter', 'Section', 'When', 'Load', 'Instructor', 'Type', 'Why', 'Watch out', 'Also wanted by']
  const rows: OutCell[][] = [header.map((h) => ({ v: h, header: true }))]
  for (const p of result.placements) {
    rows.push([
      QUARTER_SHORT[p.section.quarter],
      p.section.label,
      p.section.when,
      p.section.load,
      { v: p.faculty, fill: 'FFE4DFEC', italic: p.kind === 'part-time' },
      p.kind === 'full-time' ? 'Full-time' : 'Part-time',
      { v: p.reasons.join('; '), wrap: true },
      { v: p.caveats.join('; '), wrap: true },
      { v: p.alsoWanted.join(', '), wrap: true },
    ])
  }
  return rows
}

function openRows(result: EngineResult): OutCell[][] {
  const header = ['Quarter', 'Section', 'When', 'Load', 'Reserved', 'Full-time who asked for it — and why not', 'Part-time who asked for it']
  const rows: OutCell[][] = [header.map((h) => ({ v: h, header: true, wrap: true }))]
  for (const o of result.open) {
    const ft = o.fullTime.map((c) => `${c.name}: ${c.note}`).join('\n')
    const free = o.partTime.filter((c) => c.note === 'could take it').map((c) => c.name)
    const blocked = o.partTime.filter((c) => c.note !== 'could take it').map((c) => `${c.name}: ${c.note}`)
    const pt = [free.length ? `Free then: ${free.join(', ')}` : '', ...blocked].filter(Boolean).join('\n')
    rows.push([
      QUARTER_SHORT[o.section.quarter],
      o.section.label,
      o.section.when,
      o.section.load,
      o.section.reserved ? 'yes' : '',
      { v: ft || '—', wrap: true },
      { v: pt || '—', wrap: true },
    ])
  }
  return rows
}

function byFacultyRows(faculty: FacultyResult[], withPartTime: boolean): OutCell[][] {
  const rows: OutCell[][] = [['Faculty', 'Type', 'Autumn', 'Winter', 'Spring', 'Load'].map((h) => ({ v: h, header: true }))]
  const list = faculty.filter((f) => f.prefs.kind === 'full-time' || (withPartTime && f.load > 0))
  for (const f of list) {
    rows.push([
      { v: f.prefs.name, italic: f.prefs.kind === 'part-time' },
      f.prefs.kind === 'full-time' ? 'Full-time' : 'Part-time',
      ...(YEAR_QUARTERS as ('autumn' | 'winter' | 'spring')[]).map((q): OutCell => ({ v: sectionList(f, q), wrap: true })),
      f.load,
    ])
  }
  return rows
}

