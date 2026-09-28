/**
 * Reading the year "at a glance" workbook: the coordinator's working copy of
 * every section in the year, one block of columns per quarter.
 *
 * The layout is found, not assumed. A header row holds `course`, `time`,
 * `day`, `instructor` and friends once per quarter; the row above names the
 * quarter ("Autumn 2026"). So a column inserted next year, a quarter block
 * moved, or a different number of note columns still reads — what would not
 * is a header renamed out of recognition, and that is reported by name.
 *
 * Only the three teaching quarters are read. Summer sits in the same sheet and
 * is already staffed by the time the year is planned; the preference survey
 * does not ask about it.
 */

import type { Quarter } from '../types'
import type { Sheet, XlsxBook } from './xlsx'
import { serialToMinutes } from './xlsx'
import { YEAR_QUARTERS, inferMeridiem, normalise, parseSectionLabel, quarterMentions, type Meeting } from './text'

/**
 * The fill the tool gives a name it wrote. It is the coordinator's own
 * convention — the sheet's legend says purple shading marks "assignments that
 * still need to be made or confirmed" — so a proposal looks like what it is,
 * and taking the shading off is how a proposal becomes a decision. A name
 * still in this fill when the workbook comes back is treated as a proposal
 * and worked out again; any other name is kept.
 */
export const PROPOSAL_FILL = 'FFE4DFEC'

export interface QuarterBlock {
  quarter: Quarter
  /** As written above the block: 'Autumn 2026'. */
  label: string
  year: number | null
  col: {
    load: number
    course: number
    time: number
    day: number
    cap: number | null
    instructor: number
    tsNotes: number | null
    notes: number | null
  }
}

export interface GlanceSection {
  /** `autumn:57` — the quarter and the sheet row, which is where the name goes. */
  id: string
  quarter: Quarter
  row: number
  /** As written: '142A', 'SKL142A', '490C/582A', '427 Lab'. */
  label: string
  /** What preferences are matched on: ['142'], ['SKL142'], ['490', '582']. */
  keys: string[]
  letter: string | null
  load: number
  meeting: Meeting | null
  /** How the time reads in the sheet, for reports: '1:15 PM M/W', 'online', 'TBD'. */
  when: string
  timing: 'scheduled' | 'online' | 'tbd'
  cap: number | null
  category: string
  /** A name already in the sheet that is not a proposal: kept, and counted. */
  fixed: string | null
  /** A name the tool wrote on an earlier run and nobody has confirmed. */
  proposed: string | null
  /** Staffed by another unit ("Non-CSS"): not ours to fill. */
  external: boolean
  tsNotes: string
  notes: string
  /** "reserved, assign if needed": may not run, so filled last. */
  reserved: boolean
  hybrid: boolean
  online: boolean
  graduate: boolean
  /** A skills lab (SKL…) or a course's own lab session. */
  lab: boolean
  /** Special topics (490/590): a placeholder until a topic is set. */
  placeholder: boolean
}

export interface SkippedRow {
  quarter: Quarter
  row: number
  label: string
  reason: string
}

export interface GlanceSchedule {
  sheetName: string
  headerRow: number
  blocks: QuarterBlock[]
  sections: GlanceSection[]
  skipped: SkippedRow[]
  /** The calendar year autumn falls in: 2026 for 2026-27. */
  autumnYear: number | null
  /** 'AY 2026-27', for file names and headings. */
  yearLabel: string
}

const HEADER_WORDS: Record<string, RegExp> = {
  load: /^load$/i,
  course: /^course$/i,
  time: /^time$/i,
  day: /^days?$/i,
  cap: /^cap(acity)?$/i,
  instructor: /^instructors?$/i,
  tsNotes: /^ts notes$|^time schedule notes$/i,
  notes: /^internal notes$|^notes$/i,
}

/** Find the sheet and row that look like the at-a-glance header. */
function findHeader(book: XlsxBook): { sheet: Sheet; row: number } | null {
  for (const name of book.sheetNames()) {
    const sheet = book.sheet(name)
    for (let r = 1; r <= Math.min(20, sheet.maxRow); r++) {
      let courses = 0
      let instructors = 0
      for (let c = 1; c <= sheet.maxCol; c++) {
        const t = sheet.text(r, c)
        if (HEADER_WORDS.course!.test(t)) courses++
        if (HEADER_WORDS.instructor!.test(t)) instructors++
      }
      if (courses > 0 && instructors > 0) return { sheet, row: r }
    }
  }
  return null
}

function readBlocks(sheet: Sheet, headerRow: number): { blocks: QuarterBlock[]; problems: string[] } {
  const problems: string[] = []
  const courseCols: number[] = []
  for (let c = 1; c <= sheet.maxCol; c++) if (HEADER_WORDS.course!.test(sheet.text(headerRow, c))) courseCols.push(c)

  const blocks: QuarterBlock[] = []
  courseCols.forEach((course, i) => {
    const prevCourse = courseCols[i - 1] ?? 0
    const nextCourse = courseCols[i + 1] ?? sheet.maxCol + 3
    const find = (word: string, from: number, to: number): number | null => {
      for (let c = from; c <= to; c++) if (HEADER_WORDS[word]!.test(sheet.text(headerRow, c))) return c
      return null
    }
    const right = (word: string) => find(word, course + 1, nextCourse - 3)
    const load = find('load', Math.max(prevCourse + 1, course - 3), course - 1)
    const time = right('time')
    const day = right('day')
    const instructor = right('instructor')
    if (load === null || time === null || day === null || instructor === null) {
      problems.push(`The block of columns around ${sheet.text(headerRow, course)} in row ${headerRow} is missing a load, time, day or instructor heading.`)
      return
    }
    // The quarter's name sits above the block, usually merged across it.
    let label = ''
    for (let c = Math.max(1, load - 2); c <= instructor + 2 && !label; c++) {
      for (let r = headerRow - 1; r >= Math.max(1, headerRow - 3) && !label; r--) {
        const t = sheet.text(r, c)
        if (t && quarterMentions(t).length) label = t
      }
    }
    const q = quarterMentions(label)[0]
    if (!q) {
      problems.push(`No quarter name was found above the columns headed “course” in column ${course}.`)
      return
    }
    const year = /\b(20\d{2})\b/.exec(label)?.[1]
    blocks.push({
      quarter: q.quarter,
      label: label.trim(),
      year: year ? Number(year) : null,
      col: { load, course, time, day, cap: right('cap'), instructor, tsNotes: right('tsNotes'), notes: right('notes') },
    })
  })
  return { blocks, problems }
}

/** 'M/W', 'T/Th', 'T/TH', 'MTWTH', 'F' → weekday numbers. */
export function parseDaysCell(raw: string): number[] {
  const t = normalise(raw).toUpperCase().replace(/[^A-Z]/g, '')
  if (!t || /^(NA|TBD|TBA|ARR)$/.test(t)) return []
  const out: number[] = []
  const map: Record<string, number> = { M: 1, T: 2, TU: 2, W: 3, TH: 4, R: 4, F: 5, SA: 6, SU: 7 }
  for (const m of t.matchAll(/TH|TU|SA|SU|M|T|W|R|F/g)) {
    const d = map[m[0]]
    if (d && !out.includes(d)) out.push(d)
  }
  return out.sort((a, b) => a - b)
}

/**
 * The time cell, which is one of: an Excel time with no meridiem (1:15 means
 * 1:15 PM), a range written as text ('8:45-11:15', '7:00-9:00'), 'N/A' for an
 * online course, '**' for arranged, or 'TBD'.
 */
export function parseTimeCell(value: string | number | boolean | null): {
  timing: 'scheduled' | 'online' | 'tbd' | 'arranged'
  start: number | null
  end: number | null
} {
  if (value === null || value === '') return { timing: 'tbd', start: null, end: null }
  if (typeof value === 'number') {
    const m = serialToMinutes(value)
    const start = inferMeridiem(Math.floor(m / 60) % 12 || 12, m % 60)
    return { timing: 'scheduled', start, end: start + 120 }
  }
  const t = normalise(String(value)).trim()
  if (/^\*+$/.test(t)) return { timing: 'arranged', start: null, end: null }
  if (/^n\/?a$|online|async/i.test(t)) return { timing: 'online', start: null, end: null }
  const range = /(\d{1,2}):?(\d{2})?\s*([ap]m)?\s*-\s*(\d{1,2}):?(\d{2})?\s*([ap]m)?/i.exec(t)
  if (range) {
    const start = range[3] ? to24(range[1]!, range[2], range[3]) : inferMeridiem(Number(range[1]), Number(range[2] ?? 0))
    let end = range[6] ? to24(range[4]!, range[5], range[6]) : inferMeridiem(Number(range[4]), Number(range[5] ?? 0))
    // '11:30-2:00' crosses noon; '9:30-1:00' too. An end before the start is twelve hours on.
    if (end <= start) end += 12 * 60
    if (end - start > 8 * 60) end -= 12 * 60
    return end > start ? { timing: 'scheduled', start, end } : { timing: 'tbd', start: null, end: null }
  }
  const single = /^(\d{1,2}):(\d{2})\s*([ap]m)?$/i.exec(t)
  if (single) {
    const start = single[3] ? to24(single[1]!, single[2], single[3]) : inferMeridiem(Number(single[1]), Number(single[2]))
    return { timing: 'scheduled', start, end: start + 120 }
  }
  return { timing: 'tbd', start: null, end: null }
}

function to24(h: string, m: string | undefined, mer: string): number {
  const pm = mer.toLowerCase().startsWith('p')
  return ((Number(h) % 12) + (pm ? 12 : 0)) * 60 + Number(m ?? 0)
}

function clock(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

function num(v: string | number | boolean | null): number | null {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const m = /^\s*(\d+(?:\.\d+)?)\s*$/.exec(v)
    return m ? Number(m[1]) : null
  }
  return null
}

/** Read the schedule. Throws, with a sentence a coordinator can act on, when it cannot. */
export function readGlance(book: XlsxBook): GlanceSchedule {
  const header = findHeader(book)
  if (!header)
    throw new Error(
      'No schedule found: no sheet has a row with both a “course” and an “instructor” heading. This expects the year-at-a-glance workbook.',
    )
  const { sheet, row: headerRow } = header
  const { blocks: all, problems } = readBlocks(sheet, headerRow)
  const blocks = all.filter((b) => YEAR_QUARTERS.includes(b.quarter))
  if (blocks.length === 0)
    throw new Error(problems[0] ?? 'The schedule has no Autumn, Winter or Spring block of columns.')

  const autumn = blocks.find((b) => b.quarter === 'autumn')
  const later = blocks.find((b) => b.quarter !== 'autumn' && b.year)
  const autumnYear = autumn?.year ?? (later?.year ? later.year - 1 : null)
  const yearLabel = autumnYear ? `AY ${autumnYear}-${String(autumnYear + 1).slice(2)}` : 'the year'

  // Category labels ("core", "electives") sit alone in the sheet's first used column.
  const firstCol = Math.min(...all.map((b) => b.col.load)) - 1
  const sections: GlanceSection[] = []
  const skipped: SkippedRow[] = []
  let category = ''
  for (let r = headerRow + 1; r <= sheet.maxRow; r++) {
    const marker = firstCol >= 1 ? sheet.text(r, firstCol) : ''
    if (marker && /^[a-z][a-z ()]{2,40}$/i.test(marker) && !/^x$/i.test(marker)) {
      const busy = blocks.some((b) => sheet.text(r, b.col.course))
      if (!busy) category = marker.replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase()
    }
    for (const b of blocks) {
      const label = sheet.text(r, b.col.course)
      if (!label) continue
      const parsed = parseSectionLabel(label)
      if (!parsed) continue
      const time = parseTimeCell(sheet.get(r, b.col.time))
      const load = num(sheet.get(r, b.col.load))
      if (time.timing === 'arranged') continue // Independent study and the like: no section to staff.
      if (load === null || load <= 0) {
        skipped.push({ quarter: b.quarter, row: r, label, reason: 'no load in the load column' })
        continue
      }
      const days = parseDaysCell(sheet.text(r, b.col.day))
      const instructorText = sheet.text(r, b.col.instructor)
      const proposal = !!instructorText && book.fillOf(sheet.name, r, b.col.instructor) === PROPOSAL_FILL
      const external = /^non[- ]?css$/i.test(instructorText)
      const tsNotes = b.col.tsNotes ? normalise(sheet.text(r, b.col.tsNotes)) : ''
      const notes = b.col.notes ? normalise(sheet.text(r, b.col.notes)) : ''
      const online = time.timing === 'online' || /asynchronous online|100% online|online course/i.test(tsNotes)
      const meeting = time.timing === 'scheduled' && days.length && time.start !== null && time.end !== null ? { days, start: time.start, end: time.end } : null
      const timing = meeting ? 'scheduled' : online ? 'online' : 'tbd'
      const dayText = days.length ? days.map((d) => ['', 'M', 'T', 'W', 'Th', 'F', 'Sa', 'Su'][d]).join('/') : ''
      sections.push({
        id: `${b.quarter}:${r}`,
        quarter: b.quarter,
        row: r,
        label,
        keys: parsed.keys,
        letter: parsed.letter,
        load,
        meeting,
        when: meeting ? `${clock(meeting.start)} ${dayText}` : online ? 'online' : 'time TBD',
        timing,
        cap: num(sheet.get(r, b.col.cap ?? 0)),
        category,
        fixed: instructorText && !proposal && !external ? instructorText : null,
        proposed: proposal ? instructorText : null,
        external,
        tsNotes,
        notes,
        reserved: /\breserved?\b/i.test(notes),
        hybrid: /hybrid/i.test(tsNotes) || /hybrid/i.test(notes),
        online,
        graduate: parsed.keys.some((k) => Number(/\d{3}/.exec(k)?.[0] ?? 0) >= 500),
        lab: parsed.lab,
        placeholder: parsed.keys.some((k) => k === '490' || k === '590'),
      })
    }
  }
  return { sheetName: sheet.name, headerRow, blocks, sections, skipped, autumnYear, yearLabel }
}

/** Do two meetings overlap in time on a shared day? */
export function meetingsClash(a: Meeting | null, b: Meeting | null): boolean {
  if (!a || !b) return false
  return a.days.some((d) => b.days.includes(d)) && a.start < b.end && b.start < a.end
}
