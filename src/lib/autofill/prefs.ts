/**
 * Teaching preferences, from the survey export or from the sheet this tool
 * wrote on an earlier run.
 *
 * The survey is a Google Form, so an answer is a paragraph. This turns each
 * response into a {@link FacultyPrefs} — a load, the courses in the order they
 * were wanted, what they would rather not teach, when they cannot teach — and
 * keeps everything it was unsure of as a review note rather than a guess
 * applied quietly. "8 for now (possibly 1 ISS)" plans for 8 and says so;
 * "possibly leave all quarters" does not empty anybody's year.
 *
 * The output workbook carries the same records as an editable sheet. A
 * coordinator who disagrees with a reading fixes the cell and runs again with
 * that workbook; the sheet is then read instead of the survey. That round trip
 * is the point: the parser only has to be right most of the time, because
 * being wrong costs one edit rather than a re-run that makes the same mistake.
 */

import type { Quarter } from '../types'
import type { CellValue, OutCell, Sheet, XlsxBook } from './xlsx'
import {
  QUARTER_SHORT,
  YEAR_QUARTERS,
  availabilityRules,
  backToBackPreference,
  clockLabel,
  courseKeys,
  courseMentions,
  dayMentions,
  daysLabel,
  describeRule,
  firstNumber,
  normalise,
  parseRuleList,
  proseTimeRules,
  quarterCounts,
  quarterMentions,
  sentences,
  timeMentions,
  type BackToBack,
  type TimeRule,
} from './text'

export type FacultyKind = 'full-time' | 'part-time'
export type YearQuarter = 'autumn' | 'winter' | 'spring'

/** One course somebody asked for, with whatever they said about when. */
export interface CourseWish {
  key: string
  /** Quarters the answer ties this course to. Empty means any. */
  quarters: YearQuarter[]
  /** Sections wanted in a quarter: "Autumn 2 x 342". */
  counts: Partial<Record<YearQuarter, number>>
  /** Start times asked for, in minutes: "CSS 343 - Win 2027 11-1pm and 1:15pm-3:15pm". */
  times: number[]
  days: number[] | null
  /** A section letter, when one was named: "112A". */
  letter: string | null
}

export interface FacultyPrefs {
  name: string
  kind: FacultyKind
  /** Full-time: the year's load. Part-time: null — their caps are the limit. */
  target: number | null
  /** Most load a quarter can hold. 0 is a quarter off. */
  quarterMax: Record<YearQuarter, number>
  /** Part-time policy caps the coordinator can fill in: any two consecutive quarters, and the year. */
  sixMonthMax: number | null
  yearMax: number | null
  /** Courses the coordinator already wrote beside the load ("3: 502, 584, 343"). */
  pinned: string[]
  desired: CourseWish[]
  ok: CourseWish[]
  avoid: string[]
  noGraduate: boolean
  rules: TimeRule[]
  sameDays: boolean
  /** Classes back to back on a day: wanted, not wanted, or no view (null). */
  backToBack: BackToBack | null
  /** Recently hired: what they ask for counts for more when a colleague wants the same section. */
  newFaculty: boolean
  /** Courses a G&O plan or the chair asks them to teach — special topics, a course that widens their portfolio. */
  requests: string[]
  /** What a reader should check, in sentences. */
  flags: string[]
  /** The answers, condensed, so the review sheet shows what was read from. */
  wrote: string
}

const TENTATIVE = /\b(possib\w*|may|maybe|might|pending|applied|if (?:awarded|approved|honored)|not (?:yet )?confirmed|depend\w*|in case|tbd|unsure|potential)\b/i

function isYes(v: string): boolean {
  return /^\s*y(es)?\b/i.test(v)
}

function yearQuarter(q: Quarter): q is YearQuarter {
  return q === 'autumn' || q === 'winter' || q === 'spring'
}

// ── Wishes ───────────────────────────────────────────────────────────────────

/**
 * The courses a paragraph names, in order, each with the quarters, counts,
 * times and days said about it.
 *
 * Attribution is by sentence. A quarter named just before a count or a course
 * ("Autumn 2 x 342, 1 x 343; Winter 2 x 343") leads, and applies to what
 * follows until the next quarter; any other quarter, time or day belongs to
 * the nearest course ("CSS 421 (Winter), CSS 360 (Autumn, Spring)"). Two
 * courses joined by "or" share what is said about the second ("CSS 101 or
 * CSS 142 (Spring)").
 */
export function parseWishes(raw: string, autumnYear?: number): CourseWish[] {
  const text = normalise(raw).replace(/[ \t]+/g, ' ')
  const wishes = new Map<string, CourseWish>()
  const get = (key: string, letter: string | null) => {
    let w = wishes.get(key)
    if (!w) wishes.set(key, (w = { key, quarters: [], counts: {}, times: [], days: null, letter }))
    return w
  }
  for (const m of courseMentions(text)) get(m.key, m.letter)

  let lastCourse: { key: string; letter: string | null } | null = null
  for (const sen of sentences(text)) {
    const s = sen.text
    const courses = courseMentions(s)
    if (courses.length === 0) {
      // "…1:15pm-3:15pm. Mon-Wed": a fragment of days or times finishes the sentence before it.
      if (lastCourse && s.trim().length <= 24) {
        const w = get(lastCourse.key, lastCourse.letter)
        for (const t of timeMentions(s)) if (!w.times.includes(t.start)) w.times.push(t.start)
        const d = dayMentions(s).flatMap((x) => x.days)
        if (d.length) w.days = [...new Set([...(w.days ?? []), ...d])].sort((a, b) => a - b)
      }
      continue
    }
    lastCourse = courses[courses.length - 1]!
    const quarters = quarterMentions(s, autumnYear)
    const times = timeMentions(s)
    const days = [...dayMentions(s)]
    // In a table row ("112A 8:45 T/Th", "SKL123A 1:15 W") a lone letter after a time is a day.
    for (const t of times) {
      const m = /^\s*(TH|Th|M|T|W|F|R)\b/.exec(s.slice(t.endIndex))
      if (m && !days.some((d) => d.index >= t.endIndex && d.index <= t.endIndex + 3)) {
        const at = t.endIndex + m.index + (m[0].length - m[1]!.length)
        const day = { M: 1, T: 2, W: 3, TH: 4, Th: 4, R: 4, F: 5 }[m[1] as 'M']
        days.push({ days: [day], index: at, end: at + m[1]!.length })
      }
    }

    // "or" links: "101 or 142 (Spring)" — the first borrows the second's details.
    const partner = new Map<number, number>()
    for (let i = 0; i + 1 < courses.length; i++) {
      if (/^\s*(or|\/)\s*(?:css\s*)?$/i.test(s.slice(courses[i]!.end, courses[i + 1]!.index))) partner.set(i + 1, i)
    }
    // What follows a course belongs to it: "CSS 421 (Winter), CSS 360 (Autumn, Spring)".
    const owner = (at: number): number => {
      let best = -1
      courses.forEach((c, i) => {
        if (c.end <= at) best = i
      })
      return best >= 0 ? best : 0
    }
    const apply = (i: number, f: (w: CourseWish) => void) => {
      const c = courses[i]!
      f(get(c.key, c.letter))
      const p = partner.get(i)
      if (p !== undefined) f(get(courses[p]!.key, courses[p]!.letter))
    }

    // Leading quarters: the quarter comes before the count or the course it governs.
    const leading = quarters.filter((q) => {
      const next = courses.find((c) => c.index >= q.end)
      const gap = next ? s.slice(q.end, next.index) : null
      return gap !== null && gap.length <= 16 && /^\s*[:,-]?\s*(?:\d(?:\.\d)?\s*(?:x|×)?\s*)?(?:css\s*)?$/i.test(gap)
    })
    const quarterFor = (index: number) => [...leading].reverse().find((q) => q.index < index)
    for (const q of quarters) {
      if (!q.inYear || !yearQuarter(q.quarter)) continue
      const yq = q.quarter
      if (leading.includes(q)) {
        const next = leading[leading.indexOf(q) + 1]
        courses.forEach((c, i) => {
          if (c.index > q.index && (!next || c.index < next.index)) apply(i, (w) => w.quarters.includes(yq) || w.quarters.push(yq))
        })
      } else {
        apply(owner(q.index), (w) => w.quarters.includes(yq) || w.quarters.push(yq))
      }
    }
    for (const t of times) apply(owner(t.index), (w) => w.times.includes(t.start) || w.times.push(t.start))
    for (const d of days) apply(owner(d.index), (w) => (w.days = [...new Set([...(w.days ?? []), ...d.days])].sort((a, b) => a - b)))
    // "2 x 342": the count goes with the course after it, in the leading quarter.
    for (const m of s.matchAll(/(\d)\s*(?:x|×)\s*(?:css\s*)?(?=\d{3})/gi)) {
      const at = (m.index ?? 0) + m[0].length
      const i = courses.findIndex((c) => c.index >= at - 1 && c.index <= at + 1)
      const q = quarterFor(m.index ?? 0)
      if (i < 0 || !q || !q.inYear || !yearQuarter(q.quarter)) continue
      const yq = q.quarter
      apply(i, (w) => (w.counts[yq] = Number(m[1])))
    }
    // "2 sections": the count goes with the course before it, in its one named quarter.
    for (const m of s.matchAll(/\b(\d)\s+sections?\b/gi)) {
      const before = courses.filter((c) => c.end <= (m.index ?? 0))
      const c = before[before.length - 1]
      if (!c) continue
      const w = get(c.key, c.letter)
      if (w.quarters.length === 1) w.counts[w.quarters[0]!] = Number(m[1])
    }
  }
  // A letter only means a particular section when the answer also says when ("Aut'26 112A 8:45").
  for (const w of wishes.values()) if (!w.quarters.length && !w.times.length) w.letter = null
  return [...wishes.values()]
}

/** A wish in the review sheet's notation, e.g. `343: Win x2 @ 11:00 AM, 1:15 PM M/W`. */
export function describeWish(w: CourseWish): string | null {
  const qs = w.quarters.map((q) => `${QUARTER_SHORT[q]}${w.counts[q] ? ` x${w.counts[q]}` : ''}`)
  for (const q of YEAR_QUARTERS as YearQuarter[]) if (w.counts[q] && !w.quarters.includes(q)) qs.push(`${QUARTER_SHORT[q]} x${w.counts[q]}`)
  const when = [...w.times.map(clockLabel), ...(w.days ? [daysLabel(w.days)] : [])]
  if (qs.length === 0 && when.length === 0 && !w.letter) return null
  return `${w.key}${w.letter ?? ''}: ${qs.length ? qs.join(', ') : 'any'}${when.length ? ` @ ${when.join(', ')}` : ''}`
}

/** Reads back what {@link describeWish} wrote, `;`-separated. */
export function readWishNotes(text: string, into: CourseWish[]): string[] {
  const unread: string[] = []
  for (const part of normalise(text).split(/;|\n/).map((p) => p.trim()).filter(Boolean)) {
    const m = /^([A-Za-z]*\s*\d{3}[A-Za-z]?)\s*:\s*(.*)$/.exec(part)
    const course = m ? courseMentions(m[1]!.replace(/^([A-Z]+)(\d)/i, '$1 $2'))[0] : undefined
    if (!m || !course) {
      unread.push(part)
      continue
    }
    const [qPart, tPart = ''] = m[2]!.split('@')
    let w = into.find((x) => x.key === course.key)
    if (!w) into.push((w = { key: course.key, quarters: [], counts: {}, times: [], days: null, letter: null }))
    w.letter = course.letter
    for (const item of qPart!.split(',').map((x) => x.trim()).filter(Boolean)) {
      if (/^any$/i.test(item)) continue
      const q = quarterMentions(item)[0]
      if (!q || !yearQuarter(q.quarter)) {
        unread.push(part)
        continue
      }
      const yq = q.quarter
      if (!w.quarters.includes(yq)) w.quarters.push(yq)
      const n = /x\s*(\d+)/i.exec(item)
      if (n) w.counts[yq] = Number(n[1])
    }
    for (const t of timeMentions(tPart)) if (!w.times.includes(t.start)) w.times.push(t.start)
    const d = dayMentions(tPart).flatMap((x) => x.days)
    if (d.length) w.days = [...new Set(d)].sort((a, b) => a - b)
  }
  return unread
}

// ── Survey exports ───────────────────────────────────────────────────────────

type Columns = Record<string, number>

function columns(sheet: Sheet, spec: Record<string, RegExp>): Columns {
  const out: Columns = {}
  for (let c = 1; c <= sheet.maxCol; c++) {
    const h = normalise(sheet.text(1, c)).toLowerCase()
    for (const [key, re] of Object.entries(spec)) if (out[key] === undefined && re.test(h)) out[key] = c
  }
  return out
}

const FT_COLUMNS: Record<string, RegExp> = {
  name: /first and last name|^name$/,
  email: /email/,
  load: /^# of courses|number of courses|teaching load/,
  desired: /most desired/,
  ok: /"other" courses|other courses/,
  avoid: /prefer not to teach/,
  iss: /eligible for a course release/,
  issDrop: /would you like to remove/,
  service: /expect to take a service release/,
  serviceDetail: /number of service release/,
  buyout: /expect to buy-?out/,
  buyoutDetail: /research buy-?out releases/,
  leave: /release\(s\) for sabbatical|take a release\(s\) for sabbatical|sabbatical\/other leave\?/,
  leaveDetail: /quarter\(s\) in which you expect/,
  notTaught: /courses you have not taught before/,
  comments: /additional comments/,
  timestamp: /^timestamp$/,
}

const PT_COLUMNS: Record<string, RegExp> = {
  name: /first and last name|^name$/,
  email: /^email/,
  counts: /how many courses/,
  times: /teaching time\/day|time\/day/,
  courses: /courses you are interested in/,
  constraints: /other constraints/,
  comments: /additional comments/,
  timestamp: /^timestamp$/,
}

export interface PrefsFile {
  kind: FacultyKind
  faculty: FacultyPrefs[]
  /** Where the records came from: the survey, or an edited review sheet. */
  source: 'survey' | 'review sheet'
  warnings: string[]
}

export const FT_SHEET = 'FT preferences'
export const PT_SHEET = 'PT preferences'

/**
 * Read preferences from a workbook: the tool's own review sheet if it has one
 * of the kind asked for, otherwise the first sheet that looks like the survey.
 */
export function readPrefs(book: XlsxBook, kind: FacultyKind, autumnYear?: number): PrefsFile | null {
  const review = kind === 'full-time' ? FT_SHEET : PT_SHEET
  if (book.hasSheet(review)) return readReviewSheet(book.sheet(review), kind)
  for (const name of book.sheetNames()) {
    const sheet = book.sheet(name)
    const headerText = Array.from({ length: sheet.maxCol }, (_, i) => sheet.text(1, i + 1).toLowerCase()).join(' | ')
    if (kind === 'full-time' && /most desired/.test(headerText)) return readSurvey(sheet, kind, autumnYear)
    if (kind === 'part-time' && /how many courses/.test(headerText)) return readSurvey(sheet, kind, autumnYear)
  }
  return null
}

/** What sort of preferences a workbook holds, if any — for labelling an upload. */
export function detectPrefsKind(book: XlsxBook): FacultyKind | null {
  if (book.hasSheet(FT_SHEET)) return 'full-time'
  if (book.hasSheet(PT_SHEET)) return 'part-time'
  for (const name of book.sheetNames()) {
    const sheet = book.sheet(name)
    const headerText = Array.from({ length: sheet.maxCol }, (_, i) => sheet.text(1, i + 1).toLowerCase()).join(' | ')
    if (/most desired/.test(headerText)) return 'full-time'
    if (/how many courses/.test(headerText)) return 'part-time'
  }
  return null
}

function readSurvey(sheet: Sheet, kind: FacultyKind, autumnYear?: number): PrefsFile {
  const cols = columns(sheet, kind === 'full-time' ? FT_COLUMNS : PT_COLUMNS)
  const warnings: string[] = []
  if (cols.name === undefined && cols.email === undefined) warnings.push('No name or email column was found; rows are numbered instead.')
  const byName = new Map<string, { prefs: FacultyPrefs; stamp: number; row: number }>()
  for (let r = 2; r <= sheet.maxRow; r++) {
    const cell = (k: string) => (cols[k] === undefined ? '' : normalise(sheet.text(r, cols[k])).trim())
    const raw = (k: string): CellValue => (cols[k] === undefined ? null : sheet.get(r, cols[k]))
    const name = cell('name') || cell('email') || ''
    if (!name && !cell(kind === 'full-time' ? 'desired' : 'courses')) continue
    const who = name || `Row ${r}`
    const prefs = kind === 'full-time' ? fullTime(who, cell, raw, autumnYear) : partTime(who, cell, raw, autumnYear)
    const stamp = typeof raw('timestamp') === 'number' ? (raw('timestamp') as number) : r
    const key = who.toLowerCase()
    const prev = byName.get(key)
    if (prev) {
      const keep = stamp >= prev.stamp ? { prefs, stamp, row: r } : prev
      keep.prefs.flags.push(`Answered the survey more than once; the response in row ${keep.row} is used.`)
      byName.set(key, keep)
    } else byName.set(key, { prefs, stamp, row: r })
  }
  const faculty = [...byName.values()].map((v) => v.prefs)
  faculty.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  return { kind, faculty, source: 'survey', warnings }
}

function emptyPrefs(name: string, kind: FacultyKind): FacultyPrefs {
  return {
    name,
    kind,
    target: null,
    quarterMax: { autumn: 0, winter: 0, spring: 0 },
    sixMonthMax: null,
    yearMax: null,
    pinned: [],
    desired: [],
    ok: [],
    avoid: [],
    noGraduate: false,
    rules: [],
    sameDays: false,
    backToBack: null,
    newFaculty: false,
    requests: [],
    flags: [],
    wrote: '',
  }
}

/** "7 (1 new hire for 2 years ending in AY26-27)": a new-hire release is how the load column says someone is new. */
const NEW_HIRE = /\bnew[\s-]hire\b|\bnew faculty\b|\b(?:i am|i'm|as a) new (?:faculty|hire|professor|colleague)\b|\bmy first year\b/i

function newFacultyFrom(text: string): string | null {
  const m = NEW_HIRE.exec(normalise(text))
  return m ? m[0] : null
}

function backToBackFrom(p: FacultyPrefs, texts: string[]): void {
  const found = backToBackPreference(texts.filter(Boolean).join('\n'))
  if (!found) return
  p.backToBack = found.pref
  p.flags.push(`Back-to-back: read as “${found.pref}” from “${found.phrase}”.`)
}

/**
 * The most a quarter should hold, for a full-time load spread over the
 * quarters they are around for: 8 over three quarters allows 3, 5 allows 2,
 * 3 allows 2 so that "two in one quarter of the same course" is possible.
 */
export function defaultQuarterMax(target: number, quartersAvailable: number): number {
  if (quartersAvailable <= 0) return 0
  // A load of two or less may sit in one quarter — including a lecture with its lab, which is 1.5.
  return Math.max(Math.ceil((target + 1) / quartersAvailable), Math.min(target, 2))
}

function fullTime(name: string, cell: (k: string) => string, raw: (k: string) => CellValue, autumnYear?: number): FacultyPrefs {
  const p = emptyPrefs(name, 'full-time')
  const loadText = cell('load') || (typeof raw('load') === 'number' ? String(raw('load')) : '')
  p.target = firstNumber(raw('load') as string | number | null) ?? firstNumber(loadText)
  if (p.target === null) p.flags.push('No teaching load was given; nothing is assigned until one is entered in the Load column.')

  // "3: 502, 584, 343" — a list the coordinator already wrote. Only a clean list counts.
  const afterColon = /:\s*(.+)$/.exec(loadText)?.[1] ?? ''
  if (afterColon && /^[\sA-Z]*\d{3}[A-Z]?(\s*[,;/&]\s*(and\s+)?[A-Z]*\s*\d{3}[A-Z]?)*\s*$/i.test(afterColon)) {
    p.pinned = courseKeys(afterColon)
  }
  const note = [/\(([^)]*)\)?/.exec(loadText)?.[1], p.pinned.length ? '' : afterColon].filter(Boolean).join('; ')
  if (note.trim()) p.flags.push(`Load note: ${note.trim()} — the load is planned as ${p.target ?? 'given'}; adjust it if this changes.`)
  const newHire = newFacultyFrom(loadText) ?? newFacultyFrom(cell('comments'))
  if (newHire) {
    p.newFaculty = true
    p.flags.push(`New faculty (from “${newHire}”): what they ask for counts for more when a colleague wants the same section. Clear “New faculty” if that is wrong.`)
  }

  p.desired = parseWishes(cell('desired'), autumnYear)
  p.ok = parseWishes(cell('ok'), autumnYear).filter((w) => !p.desired.some((d) => d.key === w.key))
  const avoidText = cell('avoid')
  p.avoid = courseKeys(avoidText)
  p.noGraduate = /\bno (?:more )?grad(?:uate)? (?:classes|courses)\b|\bnot? (?:teach )?(?:any )?(?:more )?grad(?:uate)? (?:classes|courses)\b/i.test(avoidText)
  if (p.noGraduate) p.flags.push('Asked for no graduate courses.')
  for (const both of p.avoid.filter((k) => p.desired.some((d) => d.key === k))) {
    const d = p.desired.find((w) => w.key === both)!
    p.flags.push(
      d.quarters.length
        ? `${both} is both wanted (${d.quarters.map((q) => QUARTER_SHORT[q]).join(', ')}) and on the prefer-not list; it is only placed in the quarter(s) they named.`
        : `${both} is both wanted and on the prefer-not list; treated as wanted.`,
    )
  }

  // Releases and leave: applied where the answer is definite, noted where it is not.
  const quarterOff = new Set<YearQuarter>()
  const reduce: Partial<Record<YearQuarter, number>> = {}
  const tentativeLoad = TENTATIVE.test(loadText)
  if (isYes(cell('iss'))) {
    const drop = courseKeys(cell('issDrop'))
    p.flags.push(`Expects an ISS course release${drop.length ? ` (would drop ${drop.join(', ')})` : ''} — not applied; lower the load if it is granted.`)
  }
  if (isYes(cell('service'))) {
    const detail = cell('serviceDetail')
    const qs = quarterMentions(detail, autumnYear).filter((q) => q.inYear && yearQuarter(q.quarter))
    const n = firstNumber(detail.replace(/\d{1,2}:\d{2}|'\d{2}|\b20\d{2}\b/g, ' ')) ?? 1
    const distinct = [...new Set(qs.map((q) => q.quarter as YearQuarter))]
    if (distinct.length === 1 && !/\bor\b/i.test(detail)) {
      reduce[distinct[0]!] = (reduce[distinct[0]!] ?? 0) + n
      p.flags.push(`Service release: “${detail}” — ${n} fewer in ${QUARTER_SHORT[distinct[0]!]}.`)
    } else p.flags.push(`Service release: “${detail || 'yes'}” — no single quarter named, so not placed; the load already reflects it if it was counted.`)
  }
  if (isYes(cell('buyout'))) p.flags.push(`Possible research buy-out: “${cell('buyoutDetail') || 'yes'}” — not applied.`)
  if (isYes(cell('leave'))) {
    const detail = cell('leaveDetail')
    const qs = [...new Set(quarterMentions(detail, autumnYear).filter((q) => q.inYear && yearQuarter(q.quarter)).map((q) => q.quarter as YearQuarter))]
    if (!tentativeLoad && !TENTATIVE.test(detail) && qs.length > 0 && qs.length < 3) {
      for (const q of qs) quarterOff.add(q)
      p.flags.push(`On leave in ${qs.map((q) => QUARTER_SHORT[q]).join(', ')} — nothing is placed there.`)
    } else p.flags.push(`Leave: “${detail || 'yes'}” — tentative, not applied; set that quarter's max to 0 if it is confirmed.`)
  }

  const comments = cell('comments')
  const prose = proseTimeRules([comments, avoidText].join('\n'), autumnYear)
  p.rules = prose.rules
  p.sameDays = /\bsame days?\b|\bconsolidat|\ball classes either\b/i.test(comments)
  backToBackFrom(p, [cell('desired'), cell('ok'), avoidText, comments])
  for (const m of comments.matchAll(/\b(?:keep|leave)\s+my\s+(\w+)\s+(?:quarter\s+)?(?:free|open|off)\b/gi)) {
    const q = quarterMentions(m[1]!)[0]
    if (q && yearQuarter(q.quarter)) {
      quarterOff.add(q.quarter)
      p.flags.push(`Asked to keep ${QUARTER_SHORT[q.quarter]} free — nothing is placed there.`)
    }
  }
  if (/\b(remote|remotely|online|hybrid)\b/i.test(comments)) p.flags.push('Mentions hybrid or remote teaching — see their comments.')
  // Hints about particular courses can live in the comments too ("342 in fall?").
  for (const extra of parseWishes(comments, autumnYear)) {
    const w = [...p.desired, ...p.ok].find((x) => x.key === extra.key)
    if (w) for (const q of extra.quarters) if (!w.quarters.includes(q)) w.quarters.push(q)
  }

  const available = (YEAR_QUARTERS as YearQuarter[]).filter((q) => !quarterOff.has(q))
  const base = defaultQuarterMax(p.target ?? 0, available.length)
  for (const q of YEAR_QUARTERS as YearQuarter[]) p.quarterMax[q] = quarterOff.has(q) ? 0 : Math.max(0, base - (reduce[q] ?? 0))

  p.wrote = [
    ['Load', loadText],
    ['Most desired', cell('desired')],
    ['Other', cell('ok')],
    ['Prefer not', avoidText],
    ['Comments', comments],
    // Not for this year, but what a G&O plan or the chair might ask of them next.
    ['Not taught before, would like to later', cell('notTaught')],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
  return p
}

function partTime(name: string, cell: (k: string) => string, raw: (k: string) => CellValue, autumnYear?: number): FacultyPrefs {
  const p = emptyPrefs(name, 'part-time')
  const counts = quarterCounts(raw('counts') as string | number | null, autumnYear)
  for (const q of YEAR_QUARTERS as YearQuarter[]) p.quarterMax[q] = counts.perQuarter[q] ?? counts.flat ?? 0
  if (counts.flat === null && Object.keys(counts.perQuarter).length === 0) {
    p.flags.push('No course count was read; set the quarter maximums by hand.')
  }
  p.desired = parseWishes(cell('courses'), autumnYear)
  if (p.desired.length === 0 && cell('courses')) p.flags.push(`No course numbers found in “${cell('courses')}”.`)
  p.rules = [...availabilityRules(cell('times'), autumnYear), ...proseTimeRules([cell('constraints'), cell('comments')].join('\n'), autumnYear).rules]
  p.sameDays = /\bsame days?\b/i.test(cell('comments'))
  backToBackFrom(p, [cell('times'), cell('courses'), cell('constraints'), cell('comments')])
  if (/\bco-?teach/i.test([cell('times'), cell('comments')].join(' '))) p.flags.push('Wants to co-teach — see their answer.')
  p.wrote = [
    ['Courses per quarter', cell('counts') || String(raw('counts') ?? '')],
    ['Times', cell('times')],
    ['Courses', cell('courses')],
    ['Constraints', cell('constraints')],
    ['Comments', cell('comments')],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
  return p
}

// ── The review sheet ─────────────────────────────────────────────────────────

const FT_HEADERS = [
  'Faculty',
  'Load',
  'Aut max',
  'Win max',
  'Spr max',
  'New faculty',
  'Pinned courses',
  'G&O / chair requests',
  'Most desired, in order',
  'Also OK',
  'Prefer not',
  'Quarter and time wishes',
  'Time rules',
  'Back-to-back',
  'Other',
  'Review notes',
  'What they wrote',
]

const PT_HEADERS = [
  'Instructor',
  'Aut max',
  'Win max',
  'Spr max',
  'Two-quarter max',
  'Year max',
  'Courses, in order',
  'Prefer not',
  'Quarter and time wishes',
  'Time rules',
  'Back-to-back',
  'Other',
  'Review notes',
  'What they wrote',
]

/** The Back-to-back column: "prefer", "avoid", or empty for no view. */
function readBackToBack(text: string): BackToBack | null | undefined {
  const t = normalise(text).trim().toLowerCase()
  if (!t) return null
  if (/^(prefer\s+not|rather\s+not|no\b|not\b|avoid|don'?t|never|apart|spread)/.test(t)) return 'avoid'
  if (/^(prefer|yes|want|like|together|ok\b|okay)/.test(t)) return 'prefer'
  return undefined
}

function otherText(p: FacultyPrefs): string {
  return [p.sameDays && 'same days', p.noGraduate && 'no graduate courses'].filter(Boolean).join('; ')
}

function wishNotes(p: FacultyPrefs): string {
  return [...p.desired, ...p.ok].map(describeWish).filter(Boolean).join('; ')
}

/**
 * Rows for the editable review sheet. Every column but the last two is read
 * back on the next run; those two are carried forward unchanged, for reading.
 */
export function reviewSheetRows(file: { kind: FacultyKind; faculty: FacultyPrefs[] }): OutCell[][] {
  const headers = file.kind === 'full-time' ? FT_HEADERS : PT_HEADERS
  const rows: OutCell[][] = [headers.map((h) => ({ v: h, header: true, wrap: true }))]
  for (const p of file.faculty) {
    const rules = p.rules.map(describeRule).join('; ')
    const notes = { v: p.flags.join('\n'), wrap: true }
    const wrote = { v: p.wrote, wrap: true }
    if (file.kind === 'full-time') {
      rows.push([
        p.name,
        p.target,
        p.quarterMax.autumn,
        p.quarterMax.winter,
        p.quarterMax.spring,
        p.newFaculty ? 'yes' : '',
        p.pinned.join(', '),
        p.requests.join(', '),
        { v: p.desired.map((w) => w.key).join(', '), wrap: true },
        { v: p.ok.map((w) => w.key).join(', '), wrap: true },
        p.avoid.join(', '),
        { v: wishNotes(p), wrap: true },
        { v: rules, wrap: true },
        p.backToBack ?? '',
        otherText(p),
        notes,
        wrote,
      ])
    } else {
      rows.push([
        p.name,
        p.quarterMax.autumn,
        p.quarterMax.winter,
        p.quarterMax.spring,
        p.sixMonthMax,
        p.yearMax,
        { v: p.desired.map((w) => w.key).join(', '), wrap: true },
        p.avoid.join(', '),
        { v: wishNotes(p), wrap: true },
        { v: rules, wrap: true },
        p.backToBack ?? '',
        otherText(p),
        notes,
        wrote,
      ])
    }
  }
  return rows
}

export const REVIEW_WIDTHS: Record<FacultyKind, number[]> = {
  'full-time': [10, 7, 8, 8, 8, 9, 14, 14, 24, 18, 14, 36, 36, 10, 14, 48, 70],
  'part-time': [11, 8, 8, 8, 10, 9, 24, 12, 30, 40, 10, 14, 40, 70],
}

function readReviewSheet(sheet: Sheet, kind: FacultyKind): PrefsFile {
  const headers = kind === 'full-time' ? FT_HEADERS : PT_HEADERS
  const col = (h: string) => {
    for (let c = 1; c <= sheet.maxCol; c++) if (sheet.text(1, c).toLowerCase() === h.toLowerCase()) return c
    return null
  }
  const at = Object.fromEntries(headers.map((h) => [h, col(h)])) as Record<string, number | null>
  const warnings: string[] = []
  for (const h of headers.slice(0, 5)) if (at[h] === null) warnings.push(`The “${kind === 'full-time' ? FT_SHEET : PT_SHEET}” sheet has no “${h}” column.`)
  const faculty: FacultyPrefs[] = []
  for (let r = 2; r <= sheet.maxRow; r++) {
    const text = (h: string) => (at[h] ? normalise(sheet.text(r, at[h])).trim() : '')
    const number = (h: string): number | null => {
      if (!at[h]) return null
      const v = sheet.get(r, at[h])
      if (typeof v === 'number') return v
      return firstNumber(typeof v === 'string' ? v : null)
    }
    const name = text(kind === 'full-time' ? 'Faculty' : 'Instructor')
    if (!name) continue
    const p = emptyPrefs(name, kind)
    if (kind === 'full-time') p.target = number('Load')
    p.quarterMax = { autumn: number('Aut max') ?? 0, winter: number('Win max') ?? 0, spring: number('Spr max') ?? 0 }
    if (kind === 'part-time') {
      p.sixMonthMax = number('Two-quarter max')
      p.yearMax = number('Year max')
    }
    p.pinned = courseKeys(text('Pinned courses'))
    const order = courseKeys(text(kind === 'full-time' ? 'Most desired, in order' : 'Courses, in order'))
    const okOrder = courseKeys(text('Also OK'))
    const all: CourseWish[] = [...order, ...okOrder].map((key) => ({ key, quarters: [], counts: {}, times: [], days: null, letter: null }))
    const unreadWishes = readWishNotes(text('Quarter and time wishes'), all)
    p.desired = all.filter((w) => order.includes(w.key) || (!okOrder.includes(w.key) && !order.includes(w.key)))
    p.ok = all.filter((w) => okOrder.includes(w.key) && !order.includes(w.key))
    p.avoid = courseKeys(text('Prefer not'))
    const { rules, unread } = parseRuleList(text('Time rules'))
    p.rules = rules
    const other = text('Other').toLowerCase()
    p.sameDays = /same days?/.test(other)
    p.noGraduate = /no grad/.test(other)
    if (unread.length) p.flags.push(`Time rules not understood, so ignored: ${unread.join('; ')}.`)
    if (unreadWishes.length) p.flags.push(`Wishes not understood, so ignored: ${unreadWishes.join('; ')}.`)
    if (kind === 'full-time' && p.target === null) p.flags.push('No load in the Load column; nothing is assigned.')
    // Carried forward as they were, so a second run does not lose the first run's notes.
    const verbatim = (h: string) => (at[h] ? sheet.text(r, at[h]).replace(/\r\n?/g, '\n') : '')
    const earlier = verbatim('Review notes').split('\n').map((x) => x.trim()).filter(Boolean)
    p.flags = [...earlier.filter((f) => !p.flags.includes(f)), ...p.flags]
    p.wrote = verbatim('What they wrote')

    // Columns added after the first workbooks went out. A sheet written before them is read the
    // way the survey would be, from what they wrote; after that, the column is what counts.
    if (at['Back-to-back']) {
      const b = readBackToBack(text('Back-to-back'))
      if (b === undefined) p.flags.push(`Back-to-back “${text('Back-to-back')}” not understood, so ignored: write prefer or avoid.`)
      p.backToBack = b ?? null
    } else backToBackFrom(p, [p.wrote])
    if (kind === 'full-time') {
      p.requests = courseKeys(text('G&O / chair requests'))
      if (at['New faculty']) p.newFaculty = /^(y|yes|x|true|new|1)\b|^✓/i.test(text('New faculty'))
      else if (newFacultyFrom(p.wrote)) {
        p.newFaculty = true
        p.flags.push(`New faculty (from “${newFacultyFrom(p.wrote)}”): what they ask for counts for more when a colleague wants the same section. Clear “New faculty” if that is wrong.`)
      }
    }
    faculty.push(p)
  }
  return { kind, faculty, source: 'review sheet', warnings }
}

