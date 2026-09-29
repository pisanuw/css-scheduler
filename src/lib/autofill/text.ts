/**
 * Reading the free text of a teaching-preference survey.
 *
 * The survey is a Google Form whose answers are paragraphs: "343, 342, 385,
 * 422. Ideally: Autumn 2 x 342 (back-to-back if possible), 1 x 343", or "The
 * 8-10pm time slots are very difficult for me." Nothing here pretends to
 * understand English. It recognises the handful of shapes these answers
 * actually take — course numbers, quarter names, day patterns, clock times,
 * and a short list of words that turn a time into a constraint — and it keeps
 * the phrase each finding came from, so the coordinator can see what was read
 * and correct it in the workbook rather than trust it.
 *
 * Every function is pure and every one is tested against the phrasings the
 * real AY 2026-27 responses used.
 */

import type { Quarter } from '../types'

/** The three quarters a teaching year is planned over. Summer is not. */
export const YEAR_QUARTERS: Quarter[] = ['autumn', 'winter', 'spring']

export const QUARTER_SHORT: Record<Quarter, string> = {
  autumn: 'Aut',
  winter: 'Win',
  spring: 'Spr',
  summer: 'Sum',
}

/** Monday is 1, as in the rest of the app. */
export const DAY_LETTER: Record<number, string> = { 1: 'M', 2: 'T', 3: 'W', 4: 'Th', 5: 'F', 6: 'Sa', 7: 'Su' }

const DAY_NAME: Record<number, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' }

/** [1, 3] → 'M/W'; a single day is spelled out ('Wed'), because a lone 'W' reads back as nothing. */
export function daysLabel(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b)
  if (sorted.length === 1) return DAY_NAME[sorted[0]!] ?? '?'
  return sorted.map((d) => DAY_LETTER[d] ?? '?').join('/')
}

/** 13:15 → '1:15 PM'. */
export function clockLabel(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** Line endings and the dash family collapsed, so the patterns below have one shape to match. */
export function normalise(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u00a0/g, ' ')
    .replace(/\b([ap])\.\s?m\.?/gi, (_m, a: string) => `${a.toLowerCase()}m`)
}

// ── Courses ──────────────────────────────────────────────────────────────────

export interface CourseMention {
  /** '342', 'SKL342', 'BCORE115' — what a section's course is matched on. */
  key: string
  /** A section letter written straight after the number, as in '112A'. */
  letter: string | null
  index: number
  end: number
}

/**
 * Other subjects that CSS faculty teach and the schedule lists without a
 * `CSS` prefix. BCUSP is the old name of BCORE; the coordinator's own note on
 * one response asks exactly that question, so the two are treated as one.
 */
const SUBJECTS = 'B\\s?CORE|BCUSP|BST|BIS|BLEAD|BIMD|BBUS|BEE|BES|STMATH|STAT|EE'
const SUBJECT_ALIAS: Record<string, string> = { BCUSP: 'BCORE', 'B CORE': 'BCORE' }

/**
 * Every course a piece of text names, in the order it names them.
 *
 * Three shapes, taken in priority order so one number is never read twice:
 * another subject's code (`BCORE 115/116`, `BST205A`), a skills lab
 * (`CSS SKL 342`, `CSSSKL 511`), then a bare or `CSS`-prefixed number. A
 * number counts only if it is three digits from 100 to 799 and is not part of
 * a time (`845am`, `1:15`), a percentage (`100% online`), a year or a room.
 */
export function courseMentions(raw: string): CourseMention[] {
  const text = normalise(raw)
  const found: CourseMention[] = []
  const taken: [number, number][] = []
  const free = (a: number, b: number) => taken.every(([x, y]) => b <= x || a >= y)
  const claim = (m: RegExpMatchArray, keys: string[], letter: string | null) => {
    const a = m.index ?? 0
    const b = a + m[0].length
    if (!free(a, b)) return
    taken.push([a, b])
    for (const key of keys) found.push({ key, letter, index: a, end: b })
  }

  for (const m of text.matchAll(new RegExp(`\\b(${SUBJECTS})\\s*-?\\s*(\\d{3})(?:\\s*/\\s*(\\d{3}))?([A-Z])?(?![\\d])`, 'gi'))) {
    const subject = m[1]!.toUpperCase()
    const prefix = SUBJECT_ALIAS[subject] ?? subject.replace(/\s/g, '')
    const keys = [`${prefix}${m[2]}`]
    if (m[3]) keys.push(`${prefix}${m[3]}`)
    claim(m, keys, m[4]?.toUpperCase() ?? null)
  }
  for (const m of text.matchAll(/\b(?:CSS\s*-?\s*SKL|CSSSKL|CSSKLS?|SKL)\s*-?\s*(\d{3})([A-Z])?(?![\d])/gi)) {
    claim(m, [`SKL${m[1]}`], m[2]?.toUpperCase() ?? null)
  }
  for (const m of text.matchAll(
    /(?<![\w:.$#/'])(?:CSS\s*-?\s*)?([1-7]\d{2})([A-Z](?![a-z]))?(?![\d%:]|\.\d|\s*(?:am|pm)\b|-\d{3}\b)/gi,
  )) {
    claim(m, [m[1]!], m[2]?.toUpperCase() ?? null)
  }
  return found.sort((a, b) => a.index - b.index)
}

/** The distinct course keys a text names, first mention first. */
export function courseKeys(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of courseMentions(text)) {
    if (seen.has(m.key)) continue
    seen.add(m.key)
    out.push(m.key)
  }
  return out
}

/** How a schedule cell names its course: '142A', 'SKL142A', '490C/582A', 'BCORE 115/116', '427 Lab'. */
export function parseSectionLabel(raw: string): { keys: string[]; letter: string | null; lab: boolean } | null {
  const label = normalise(raw).trim().toUpperCase()
  if (!label) return null
  let m = /^(\d{3})\s*LAB$/.exec(label)
  if (m) return { keys: [m[1]!], letter: null, lab: true }
  m = /^SKL\s*(\d{3})\s*([A-Z]{1,2})?$/.exec(label)
  if (m) return { keys: [`SKL${m[1]}`], letter: m[2] ?? null, lab: true }
  m = /^(\d{3})\s*([A-Z]{1,2})?$/.exec(label)
  if (m) return { keys: [m[1]!], letter: m[2] ?? null, lab: false }
  // Joint listings: '490C/582A' is one room and one instructor under two numbers.
  if (/^\d{3}[A-Z]{0,2}(\s*\/\s*\d{3}[A-Z]{0,2})+$/.test(label)) {
    const parts = label.split('/').map((p) => /^\s*(\d{3})([A-Z]{0,2})\s*$/.exec(p)!)
    return { keys: parts.map((p) => p[1]!), letter: parts[0]![2] || null, lab: false }
  }
  // Other subjects, as the whole cell: 'BCORE 115/116', 'BST 205A', 'BCORE 107B'.
  m = new RegExp(`^(${SUBJECTS})\\s*-?\\s*(\\d{3})(?:\\s*/\\s*(\\d{3}))?\\s*([A-Z])?$`, 'i').exec(label)
  if (m) {
    const subject = m[1]!.toUpperCase()
    const prefix = SUBJECT_ALIAS[subject] ?? subject.replace(/\s/g, '')
    return { keys: [`${prefix}${m[2]}`, ...(m[3] ? [`${prefix}${m[3]}`] : [])], letter: m[4] ?? null, lab: false }
  }
  return null
}

// ── Quarters ─────────────────────────────────────────────────────────────────

export interface QuarterMention {
  quarter: Quarter
  index: number
  end: number
  /** False when a year is written and it is not this academic year's (e.g. win'26 in 2026-27). */
  inYear: boolean
}

const QUARTER_WORDS: [RegExp, Quarter][] = [
  [/^(autumn|aut|fall|au|fa)$/i, 'autumn'],
  [/^(winter|win|wint|wi)$/i, 'winter'],
  [/^(spring|spr|sp)$/i, 'spring'],
  [/^(summer|sum|su)$/i, 'summer'],
]

/**
 * Quarter names, with the year when one is written. The two-letter forms
 * (`Wi`, `Sp`) count only where a survey uses them — before a colon, a
 * quote or a number — because as bare words they are too easily something else.
 *
 * `autumnYear` is the calendar year the academic year starts in (2026 for
 * 2026-27), so a mention of last year's quarter can be recognised and ignored.
 */
export function quarterMentions(raw: string, autumnYear?: number): QuarterMention[] {
  const text = normalise(raw)
  const out: QuarterMention[] = []
  const re =
    /\b(autumn|aut|fall|winter|wint|win|spring|spr|summer|sum|au|fa|wi|sp|su)\b\.?(?:\s*(?:quarter|qtr|term)s?)?(?:\s*'?\s*(\d{4}|\d{2})(?![\d:]|\.\d))?/gi
  for (const m of text.matchAll(re)) {
    const word = m[1]!
    if (/^(au|fa|wi|sp|su)$/i.test(word) && !/^\s*[:'\d]/.test(text.slice((m.index ?? 0) + word.length))) continue
    const quarter = QUARTER_WORDS.find(([w]) => w.test(word))?.[1]
    if (!quarter) continue
    let inYear = true
    if (m[2] && autumnYear !== undefined) {
      let year = Number(m[2])
      if (year < 100) year += 2000
      const expected = quarter === 'autumn' ? autumnYear : autumnYear + 1
      // A two-digit number after a quarter is sometimes a count ("Fall 2"), not a year.
      if (m[2].length === 4 || year >= autumnYear - 1) inYear = year === expected
    }
    out.push({ quarter, index: m.index ?? 0, end: (m.index ?? 0) + m[0].length, inYear })
  }
  return out
}

// ── Days ─────────────────────────────────────────────────────────────────────

export interface DayMention {
  days: number[]
  index: number
  end: number
}

const DAY_NAMES: [RegExp, number][] = [
  [/^(m|mo|mon|monday|mondays)$/i, 1],
  [/^(t|tu|tue|tues|tuesday|tuesdays)$/i, 2],
  [/^(w|we|wed|weds|wednesday|wednesdays)$/i, 3],
  [/^(th|thu|thur|thurs|thursday|thursdays|r)$/i, 4],
  [/^(f|fr|fri|friday|fridays)$/i, 5],
]

function dayOf(word: string): number | null {
  for (const [re, d] of DAY_NAMES) if (re.test(word)) return d
  return null
}

/**
 * Day patterns: `M/W`, `MW`, `T/Th`, `TTH`, `Tue/Thur`, `Mon and Wed`,
 * `Tuesday/Friday`, ranges such as `M-Th` or `Mon -Thu`, runs such as
 * `MTuWThF`, and single named days (`Fridays`, `WEDNESDAY`).
 */
export function dayMentions(raw: string): DayMention[] {
  const text = normalise(raw)
  const out: DayMention[] = []
  const taken: [number, number][] = []
  const add = (index: number, end: number, days: number[]) => {
    if (days.length === 0 || taken.some(([a, b]) => index < b && end > a)) return
    taken.push([index, end])
    out.push({ days: [...new Set(days)].sort((a, b) => a - b), index, end })
  }
  const word = '(?:mondays?|monday|mon|tuesdays?|tues|tue|tu|wednesdays?|weds|wed|thursdays?|thurs|thur|thu|th|fridays?|fri|m|t|w|f|r)'

  // Weekdays in general.
  for (const m of text.matchAll(/\b(?:any\s+)?week\s?days?\b|\bM\s*-\s*F\b|\bMTuWThF\b|\bMTWTHF?\b/gi)) {
    add(m.index ?? 0, (m.index ?? 0) + m[0].length, [1, 2, 3, 4, 5])
  }
  // Ranges: M-Th, Mon -Thu, Monday through Thursday.
  for (const m of text.matchAll(new RegExp(`\\b(${word})\\.?\\s*(?:-|to|through|thru)\\s*(${word})\\b`, 'gi'))) {
    const a = dayOf(m[1]!)
    const b = dayOf(m[2]!)
    if (a === null || b === null || b <= a) continue
    // "Mon-Wed" is the two-day pattern, not three days; a longer range means every day in it.
    const days = b - a === 2 && a === 1 ? [1, 3] : Array.from({ length: b - a + 1 }, (_, i) => a + i)
    add(m.index ?? 0, (m.index ?? 0) + m[0].length, days)
  }
  // Pairs: M/W, T/Th, Tue/Thur, Mon and Wed, Tuesday, Thursdays.
  for (const m of text.matchAll(new RegExp(`\\b(${word})\\.?\\s*(?:/|&|and|,)\\s*(${word})\\b`, 'gi'))) {
    const a = dayOf(m[1]!)
    const b = dayOf(m[2]!)
    // Single letters are too ambiguous to pair with ',' or 'and' ("a, t").
    if (a === null || b === null || a === b) continue
    if ((m[1]!.length === 1 || m[2]!.length === 1) && !/\//.test(m[0])) continue
    add(m.index ?? 0, (m.index ?? 0) + m[0].length, [a, b])
  }
  // Squashed pairs: MW, TTh, TTH, TR.
  for (const m of text.matchAll(/\b(MW|TTH|TTh|TR|TuTh|MWF)\b/g)) {
    const days = m[1]!.toUpperCase() === 'MWF' ? [1, 3, 5] : m[1]!.toUpperCase() === 'MW' ? [1, 3] : [2, 4]
    add(m.index ?? 0, (m.index ?? 0) + m[0].length, days)
  }
  // Single named days, spelled out or abbreviated (never a lone letter).
  for (const m of text.matchAll(/\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|mon|tues?|wed|thu(?:rs?)?|fri)\b/gi)) {
    const d = dayOf(m[1]!)
    if (d !== null) add(m.index ?? 0, (m.index ?? 0) + m[0].length, [d])
  }
  return out.sort((a, b) => a.index - b.index)
}

// ── Times ────────────────────────────────────────────────────────────────────

/** The standard teaching blocks of the academic year, by start time. */
export const BLOCK_STARTS = [8 * 60 + 45, 11 * 60, 13 * 60 + 15, 15 * 60 + 30, 17 * 60 + 45, 20 * 60]

/**
 * A clock time written without a meridiem, read the way this campus's
 * schedule is: 8:45 and 8:30 are morning classes, a bare 8 or 8:00 is the
 * 8–10 PM block, 9 to 11 are morning, and 12 to 7 are afternoon or evening.
 */
export function inferMeridiem(h: number, m: number): number {
  if (h >= 13) return h * 60 + m
  if (h === 12) return 12 * 60 + m
  if (h === 8) return m >= 30 ? 8 * 60 + m : 20 * 60 + m
  if (h >= 9 && h <= 11) return h * 60 + m
  return (h + 12) * 60 + m
}

export interface TimeMention {
  start: number
  /** Null when only a start was written; a class then runs its standard two hours. */
  end: number | null
  index: number
  endIndex: number
  raw: string
}

function toMinutes(h: string, m: string | undefined, mer: string | undefined): number {
  const hh = Number(h)
  const mm = m ? Number(m) : 0
  if (mer) {
    const pm = mer.toLowerCase().startsWith('p')
    return ((hh % 12) + (pm ? 12 : 0)) * 60 + mm
  }
  return inferMeridiem(hh, mm)
}

/**
 * Clock times and ranges: `8:45`, `845am`, `11am`, `5:45pm`, `8-10pm`,
 * `11-1pm`, `1:15pm-3:15pm`, `3 PM to 5 PM`, `7 - 9 pm`. A meridiem written
 * once at the end of a range belongs to the end; the start is whichever
 * reading puts it before the end.
 */
export function timeMentions(raw: string): TimeMention[] {
  const text = normalise(raw)
  const out: TimeMention[] = []
  const t = '(\\d{1,2})(?::(\\d{2})|(?<=\\d)(\\d{2})(?=\\s*[ap]m))?\\s*([ap]m)?'
  const range = new RegExp(`(?<![\\d:/.$])${t}\\s*(?:-|to|until|till)\\s*${t}(?![\\d%])`, 'gi')
  const single = new RegExp(`(?<![\\d:/.$-])(\\d{1,2})(?::(\\d{2})|(\\d{2})(?=\\s*[ap]m))?\\s*([ap]m)?(?![\\d%:/])`, 'gi')
  const taken: [number, number][] = []

  for (const m of text.matchAll(range)) {
    const [, h1, m1a, m1b, mer1, h2, m2a, m2b, mer2] = m
    const hasClock = !!(m1a || m1b || m2a || m2b || mer1 || mer2)
    if (!hasClock) continue // '1-2' is a count, not a time.
    if (Number(h1) > 12 || Number(h2) > 12) continue
    const end = toMinutes(h2!, m2a ?? m2b, mer2)
    let start = toMinutes(h1!, m1a ?? m1b, mer1 ?? (mer2 && !mer1 ? undefined : undefined))
    if (!mer1 && mer2) {
      // The written meridiem is the end's; take the reading of the start that precedes it.
      const am = (Number(h1) % 12) * 60 + Number(m1a ?? m1b ?? 0)
      const pm = am + 12 * 60
      start = pm < end && end - pm <= 6 * 60 ? pm : am
    }
    if (start >= end) {
      // '8:30-6:00' reads as morning to evening; '11-1' as eleven to one.
      const bumped = end + 12 * 60
      if (bumped - start <= 12 * 60 && bumped <= 24 * 60) {
        out.push({ start, end: bumped, index: m.index ?? 0, endIndex: (m.index ?? 0) + m[0].length, raw: m[0] })
        taken.push([m.index ?? 0, (m.index ?? 0) + m[0].length])
      }
      continue
    }
    out.push({ start, end, index: m.index ?? 0, endIndex: (m.index ?? 0) + m[0].length, raw: m[0] })
    taken.push([m.index ?? 0, (m.index ?? 0) + m[0].length])
  }
  for (const m of text.matchAll(single)) {
    const a = m.index ?? 0
    const b = a + m[0].length
    if (taken.some(([x, y]) => a < y && b > x)) continue
    const [, h, mA, mB, mer] = m
    if (!mA && !mB && !mer) continue // A bare number is a count or a course, not a time.
    if (Number(h) > 12 || Number(h) === 0) continue
    out.push({ start: toMinutes(h!, mA ?? mB, mer), end: null, index: a, endIndex: b, raw: m[0] })
  }
  return out.sort((a, b) => a.index - b.index)
}

// ── Time rules ───────────────────────────────────────────────────────────────

export type Strength = 'hard' | 'strong' | 'soft'

/**
 * One thing somebody said about when they can teach.
 *
 * - `avoid`: a class that overlaps [start, end) on one of `days` is bad.
 * - `startBefore`: a class that starts before `at` is bad ("not before 1:15").
 * - `startAfter`: a class that starts after `at` is bad ("the latest I can
 *   teach is the 1:15 slot").
 * - `endAfter`: a class that ends after `at` is bad ("5:30 to be the latest").
 * - `only`: a class that does not sit inside one of `windows` is bad — a
 *   part-time instructor's availability around a day job.
 */
export type TimeRule =
  | { kind: 'avoid'; start: number; end: number; days?: number[]; strength: Strength; quarters?: Quarter[] }
  | { kind: 'startBefore' | 'startAfter' | 'endAfter'; at: number; days?: number[]; strength: Strength; quarters?: Quarter[] }
  | { kind: 'only'; windows: { start: number; end: number; days?: number[] }[]; strength: Strength; quarters?: Quarter[] }

export interface Meeting {
  days: number[]
  start: number
  end: number
}

const DAY_END = 24 * 60

/** Whether a meeting breaks a rule. A section with no meeting (online, arranged) breaks none. */
export function breaks(rule: TimeRule, meeting: Meeting | null, quarter?: Quarter): boolean {
  if (!meeting) return false
  if (rule.quarters && quarter && !rule.quarters.includes(quarter)) return false
  const onDays = (days?: number[]) => !days || meeting.days.some((d) => days.includes(d))
  switch (rule.kind) {
    case 'avoid':
      return onDays(rule.days) && meeting.start < rule.end && meeting.end > rule.start
    case 'startBefore':
      return onDays(rule.days) && meeting.start < rule.at
    case 'startAfter':
      return onDays(rule.days) && meeting.start > rule.at
    case 'endAfter':
      return onDays(rule.days) && meeting.end > rule.at
    case 'only':
      return !rule.windows.some(
        (w) =>
          (!w.days || meeting.days.every((d) => w.days!.includes(d))) && meeting.start >= w.start && meeting.end <= w.end,
      )
  }
}

/** A rule in words a coordinator can read — and that {@link parseRuleList} reads back. */
export function describeRule(rule: TimeRule): string {
  const verb = rule.strength === 'hard' ? 'no' : rule.strength === 'strong' ? 'avoid' : 'prefer not'
  const scope = `${rule.quarters ? `${rule.quarters.map((q) => QUARTER_SHORT[q]).join('+')}: ` : ''}`
  const on = (days?: number[]) => (days ? ` on ${daysLabel(days)}` : '')
  switch (rule.kind) {
    case 'avoid':
      return `${scope}${verb} ${clockLabel(rule.start)}-${rule.end >= DAY_END ? 'midnight' : clockLabel(rule.end)}${on(rule.days)}`
    case 'startBefore':
      return `${scope}${verb} starting before ${clockLabel(rule.at)}${on(rule.days)}`
    case 'startAfter':
      return `${scope}${verb} starting after ${clockLabel(rule.at)}${on(rule.days)}`
    case 'endAfter':
      return `${scope}${verb} ending after ${clockLabel(rule.at)}${on(rule.days)}`
    case 'only':
      return `${scope}${rule.strength === 'hard' ? 'only' : 'prefers'} ${rule.windows
        .map((w) => `${w.days ? `${daysLabel(w.days)} ` : ''}${clockLabel(w.start)}-${w.end >= DAY_END ? 'midnight' : clockLabel(w.end)}`)
        .join(', ')}`
  }
}

/** The days a phrase names, when naming days is all it does: "T/Th", "on Tue and Thu". */
function onlyDays(text: string): number[] | null {
  const t = normalise(text).replace(/^\s*on\s+/i, '')
  const found = dayMentions(t)
  if (found.length === 0) return null
  let rest = t
  for (const d of [...found].reverse()) rest = rest.slice(0, d.index) + rest.slice(d.end)
  if (!/^[\s,/&]*(?:and[\s,/&]*)*$/i.test(rest)) return null
  return [...new Set(found.flatMap((d) => d.days))].sort((a, b) => a - b)
}

/**
 * Reads back what {@link describeRule} wrote, one rule per `;`. Unreadable parts are returned, not dropped.
 *
 * It also takes the way a coordinator would write one by hand — "no T/Th 1:15 PM" — as the two-hour class
 * that starts then, on those days.
 */
export function parseRuleList(text: string): { rules: TimeRule[]; unread: string[] } {
  const rules: TimeRule[] = []
  const unread: string[] = []
  const clock = (s: string): number | null => {
    if (/^midnight$/i.test(s.trim())) return DAY_END
    const m = /^(\d{1,2}):(\d{2})\s*([ap]m)$/i.exec(s.trim())
    return m ? toMinutes(m[1]!, m[2], m[3]) : null
  }
  const daysOf = (s: string | undefined) => {
    const all = s ? [...new Set(dayMentions(s).flatMap((d) => d.days))].sort((a, b) => a - b) : []
    return all.length ? all : undefined
  }
  for (const part of normalise(text).split(/;|\n/).map((p) => p.trim()).filter(Boolean)) {
    let body = part
    let quarters: Quarter[] | undefined
    const scope = /^([A-Za-z+]+):\s*(.*)$/.exec(body)
    if (scope) {
      const qs = scope[1]!.split('+').map((q) => quarterMentions(q)[0]?.quarter).filter((q): q is Quarter => !!q)
      if (qs.length) {
        quarters = qs
        body = scope[2]!
      }
    }
    const strength: Strength | null = /^no\b/i.test(body) ? 'hard' : /^avoid\b/i.test(body) ? 'strong' : /^prefer not\b/i.test(body) ? 'soft' : null
    const rest = body.replace(/^(no|avoid|prefer not)\s+/i, '')
    let m: RegExpExecArray | null
    if (strength && (m = /^(starting before|starting after|ending after)\s+(\d{1,2}:\d{2}\s*[AP]M)(?:\s+on\s+(.+))?$/i.exec(rest))) {
      const at = clock(m[2]!)
      const kind = m[1]!.toLowerCase() === 'starting before' ? 'startBefore' : m[1]!.toLowerCase() === 'starting after' ? 'startAfter' : 'endAfter'
      if (at !== null) {
        rules.push({ kind, at, days: daysOf(m[3]), strength, ...(quarters ? { quarters } : {}) })
        continue
      }
    }
    if (strength && (m = /^(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M|midnight)(?:\s+on\s+(.+))?$/i.exec(rest))) {
      const start = clock(m[1]!)
      const end = clock(m[2]!)
      if (start !== null && end !== null) {
        rules.push({ kind: 'avoid', start, end, days: daysOf(m[3]), strength, ...(quarters ? { quarters } : {}) })
        continue
      }
    }
    if (strength && (m = /^(.+?)\s+(?:at\s+)?(\d{1,2}):(\d{2})\s*([ap]m)?$/i.exec(rest))) {
      // "no T/Th 1:15 PM", "avoid Fri 3:30".
      const days = onlyDays(m[1]!)
      if (days && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
        const start = toMinutes(m[2]!, m[3], m[4])
        rules.push({ kind: 'avoid', start, end: start + 120, days, strength, ...(quarters ? { quarters } : {}) })
        continue
      }
    }
    if ((m = /^(only|prefers)\s+(.+)$/i.exec(body))) {
      const windows: { start: number; end: number; days?: number[] }[] = []
      let ok = true
      for (const w of m[2]!.split(',').map((x) => x.trim())) {
        const wm = /^(?:(.+?)\s+)?(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M|midnight)$/i.exec(w)
        const start = wm ? clock(wm[2]!) : null
        const end = wm ? clock(wm[3]!) : null
        if (!wm || start === null || end === null) {
          ok = false
          break
        }
        windows.push({ start, end, days: daysOf(wm[1]) })
      }
      if (ok && windows.length) {
        rules.push({ kind: 'only', windows, strength: m[1]!.toLowerCase() === 'only' ? 'hard' : 'soft', ...(quarters ? { quarters } : {}) })
        continue
      }
    }
    unread.push(part)
  }
  return { rules, unread }
}

/** Sentences, split so that `2.5`, `8:45` and `p.m.` survive. */
export function sentences(text: string): { text: string; index: number }[] {
  const t = normalise(text)
  const out: { text: string; index: number }[] = []
  let start = 0
  const push = (end: number) => {
    const s = t.slice(start, end)
    if (s.trim()) out.push({ text: s, index: start })
  }
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!
    const next = t[i + 1] ?? ''
    const decimal = ch === '.' && /\d/.test(next) && /\d/.test(t[i - 1] ?? '')
    if (ch === '\n' || ch === ';' || (ch === '.' && !decimal) || ch === '!' || ch === '?') {
      push(i)
      start = i + 1
    }
  }
  push(t.length)
  return out
}

const HARD = /\b(cannot|can ?not|can't|unable|not able|do not wish|don't wish|will not|won't|no longer|not available|unavailable|impossible|must not)\b/i
const STRONG = /\b(very difficult|really difficult|strongly prefer not|really prefer not|extremely difficult|hard for me|difficult for me|reserved for)\b/i
const SOFT = /\b(prefer not|rather not|would rather|limit|avoid|not ideal|if possible|i'?d like|would like|prefer)\b/i

/** Named parts of the day. Longer names first, so "late afternoon" is not also read as "afternoon". */
const PERIODS: [RegExp, number, number][] = [
  [/\blate evenings?\b/i, 20 * 60, DAY_END],
  [/\blate afternoons?\b/i, 15 * 60 + 30, 17 * 60 + 30],
  [/\b(?:8\s*-\s*10\s*pm|night classes|nights?)\b/i, 20 * 60, DAY_END],
  [/\bevenings?\b/i, 17 * 60 + 45, DAY_END],
  [/\bmornings?\b/i, 0, 13 * 60],
  [/\bafternoons?\b/i, 13 * 60, 17 * 60 + 30],
  [/\b(?:daytime|day time|business hours)\b/i, 0, 17 * 60 + 30],
]

function periodWindows(text: string): { start: number; end: number; index: number; endIndex: number }[] {
  const out: { start: number; end: number; index: number; endIndex: number }[] = []
  for (const [re, a, b] of PERIODS) {
    for (const m of text.matchAll(new RegExp(re.source, 'gi'))) {
      const i = m.index ?? 0
      const j = i + m[0].length
      if (out.some((o) => i >= o.index && j <= o.endIndex)) continue
      out.push({ start: a, end: b, index: i, endIndex: j })
    }
  }
  return out.sort((x, y) => x.index - y.index)
}

/**
 * Widen a window to take in a standard block it mostly covers. People write
 * "3 PM to 5 PM" for the 3:30 class and "1pm" for the 1:15 one; read
 * literally, neither would fit the class they mean.
 */
export function snapWindow(start: number, end: number): { start: number; end: number } {
  let a = start
  let b = end
  for (const block of BLOCK_STARTS) {
    const overlap = Math.min(end, block + 120) - Math.max(start, block)
    if (overlap >= 90) {
      a = Math.min(a, block)
      b = Math.max(b, block + 120)
    }
  }
  return { start: a, end: b }
}

/**
 * Constraints stated in prose — the comments box of the full-time survey, or
 * a faculty member's note about a course. Only negative or limiting sentences
 * become rules; "I'd love the 11am slot" is a wish, not a constraint, and is
 * left for the coordinator to read.
 */
export function proseTimeRules(raw: string, autumnYear?: number): { rules: TimeRule[]; phrases: string[] } {
  const rules: TimeRule[] = []
  const phrases: string[] = []
  for (const s of sentences(raw)) {
    const text = s.text
    const lower = text.toLowerCase()
    const strength: Strength | null = HARD.test(text) ? 'hard' : STRONG.test(text) ? 'strong' : SOFT.test(text) ? 'soft' : null
    const days = dayMentions(text).flatMap((d) => d.days)
    const dayScope = days.length && days.length < 5 ? [...new Set(days)].sort((a, b) => a - b) : undefined
    const quarters = quarterMentions(text, autumnYear).filter((q) => q.inYear).map((q) => q.quarter)
    const times = timeMentions(text)
    const before = rules.length
    const wishful = /\b(i'?d like|would like|prefer)\b/i.test(lower)
    let m: RegExpExecArray | null

    if (/\bcan only\b/i.test(lower) && dayScope && !times.length) {
      // "Most quarters I can only teach T/Th."
      rules.push({ kind: 'only', windows: [{ start: 0, end: DAY_END, days: dayScope }], strength: /\bmost\b/i.test(lower) ? 'strong' : 'hard' })
    } else if (/\blatest\b/i.test(lower) && times.length) {
      // "The latest I can teach is 1:15 slot"; "I'd like 5:30 to be the latest I teach".
      const t = times[times.length - 1]!
      const isStart = t.end === null && (BLOCK_STARTS.includes(t.start) || /\bslot\b/i.test(lower))
      rules.push(
        isStart
          ? { kind: 'startAfter', at: t.start, strength: wishful ? 'soft' : 'hard', days: dayScope }
          : { kind: 'endAfter', at: t.end ?? t.start, strength: wishful ? 'soft' : 'hard', days: dayScope },
      )
    } else if (strength && (m = /\b(?:later than|after)\s+(\d{1,2}(?::\d{2})?\s*(?:[ap]m)?)/i.exec(text)) && timeMentions(m[1]!).length) {
      // "I cannot teach later than 11:00".
      rules.push({ kind: 'startAfter', at: timeMentions(m[1]!)[0]!.start, strength, days: dayScope })
    } else if (/\b(?:not|no|never)\b[^.]*\b(?:before|earlier than)\b/i.test(lower) && times.length) {
      // "I prefer not to teach before 1:15pm".
      rules.push({ kind: 'startBefore', at: times[0]!.start, strength: strength ?? 'soft', days: dayScope })
    } else if (strength) {
      const windows: { start: number; end: number }[] = periodWindows(text).map((p) => ({ start: p.start, end: p.end }))
      for (const t of times) {
        if (windows.some((w) => t.start >= w.start && t.start < w.end)) continue
        windows.push({ start: t.start, end: t.end ?? t.start + 120 })
      }
      const positiveOnly = strength === 'soft' && /\bprefer\b/i.test(lower) && !/\b(not|limit|avoid|rather not)\b/i.test(lower)
      if (positiveOnly) {
        // "Prefer earlier times", "prefer daytime classes": a lean away from evenings.
        if (/\b(daytime|day time|earlier)\b/i.test(lower)) rules.push({ kind: 'avoid', start: 17 * 60 + 45, end: DAY_END, strength: 'soft' })
      } else {
        for (const w of windows) rules.push({ kind: 'avoid', start: w.start, end: w.end, strength, days: dayScope })
      }
    }
    // "…but willing to teach 845am if necessary": a willingness, stated as a reluctance.
    if (/\bwilling\b/i.test(lower)) {
      for (const r of rules.slice(before)) if (r.kind === 'avoid' && r.start < 11 * 60) r.strength = 'soft'
    }
    for (const r of rules.slice(before)) {
      if (quarters.length && quarters.length < 3) r.quarters = [...new Set(quarters)]
      if (r.kind !== 'only' && r.days === undefined) delete r.days
    }
    if (rules.length > before) phrases.push(text.trim())
  }
  return { rules, phrases }
}

export type BackToBack = 'prefer' | 'avoid'

/**
 * What an answer says about back-to-back classes: wanted ("Autumn 2 x 342
 * (back-to-back if possible)"), not wanted ("no back-to-back", "I need a break
 * between classes"), or nothing. "I don't mind back-to-back" is nothing — a
 * tolerance, not a wish — and so is "two consecutive quarters", which is about
 * something else entirely.
 */
export function backToBackPreference(raw: string): { pref: BackToBack; phrase: string } | null {
  for (const s of sentences(raw)) {
    const text = s.text
    const mention = /\bback[\s-]*to[\s-]*back\b|\bconsecutive\s+(?:classes|courses|sections|lectures|slots|time\s*slots|blocks)\b|\b(?:classes|courses|sections|lectures)\s+in\s+a\s+row\b/i.test(text)
    const gap = /\b(?:breaks?|gaps?|time)\s+between\s+(?:my\s+)?(?:classes|courses|sections|lectures)\b/i.test(text)
    if (!mention && !gap) continue
    const phrase = text.trim()
    if (/\b(?:don'?t|do not|wouldn'?t|would not)\s+mind\b|\b(?:fine|ok|okay|happy)\s+with\b|\bnot a problem\b|\bno problem\b|\bopen to\b|\beither way\b/i.test(text)) continue
    if (!mention) {
      // "No gaps between my classes" wants them together; "a break between classes" wants them apart.
      const none = /\b(?:no|without|don'?t (?:want|need)|do not (?:want|need))\s+(?:a\s+|any\s+)?(?:breaks?|gaps?|time)\b/i.test(text)
      return { pref: none ? 'prefer' : 'avoid', phrase }
    }
    const against = /\b(?:no|not|avoid|avoiding|don'?t|do not|never|without|rather not|prefer not|dislike|hate|can'?t|cannot|can not|unable|hard|difficult|tiring|exhausting)\b/i.test(text)
    return { pref: against ? 'avoid' : 'prefer', phrase }
  }
  return null
}

/**
 * When a part-time instructor can teach, from the survey's time question:
 * "Mon -Thu and after 4:30 PM", "MW 8-10pm", "11am or 1pm. M/W or Tue/Thu.
 * No evening class.", "Fall: M/W 1:15pm, 3:30pm. Wi: Tu/Th 11am". The answer
 * to that question is availability, so what it names becomes an `only` rule;
 * "flexible" and its relatives name nothing and so constrain nothing.
 */
export function availabilityRules(raw: string, autumnYear?: number): TimeRule[] {
  const text = normalise(raw)
  if (!text.trim() || /^\s*(flexible|very flexible|i'?m very flexible|any|anytime|open|n\/?a)\s*\.?\s*$/i.test(text)) return []
  const rules: TimeRule[] = []
  for (const seg of quarterSegments(text, autumnYear)) {
    const scope = seg.quarters?.filter((q) => q !== 'summer')
    if (seg.quarters && !scope?.length) continue
    const quarters = scope && scope.length < 3 ? { quarters: scope } : {}
    const w = availabilityWindows(seg.text)
    if (w.only.length) rules.push({ kind: 'only', windows: w.only, strength: w.soft ? 'soft' : 'hard', ...quarters })
    for (const a of w.avoid) rules.push({ ...a, ...quarters })
  }
  return rules
}

/** "Fall: …  Wi: …  Sp: …" into one piece per quarter; "for the Winter term" sentences likewise. */
function quarterSegments(text: string, autumnYear?: number): { text: string; quarters?: Quarter[] }[] {
  const mentions = quarterMentions(text, autumnYear)
  // Quarters listed together ("Fall, Winter, Spring -") label one segment.
  const groups: { quarters: Quarter[]; index: number; end: number; inYear: boolean }[] = []
  for (const m of mentions) {
    const last = groups[groups.length - 1]
    if (last && /^[\s,&]*(and|&|,)?[\s,]*$/i.test(text.slice(last.end, m.index))) {
      last.quarters.push(m.quarter)
      last.end = m.end
      last.inYear &&= m.inYear
    } else groups.push({ quarters: [m.quarter], index: m.index, end: m.end, inYear: m.inYear })
  }
  const labels = groups.filter(
    (g) => /^\s*(?:\d{4})?\s*[:\n-]/.test(text.slice(g.end)) && (g.index === 0 || /[\n.;:]\s*$|^\s*$/.test(text.slice(0, g.index)) || /(^|\n)[^\n]{0,3}$/.test(text.slice(0, g.index))),
  )
  if (labels.length > 0 && labels[0]!.index <= 3) {
    return labels.map((g, i) => ({ text: text.slice(g.end, labels[i + 1]?.index ?? text.length), quarters: g.inYear ? g.quarters : [] }))
  }
  const parts = sentences(text).map((p) => ({
    text: p.text,
    quarters: [...new Set(quarterMentions(p.text, autumnYear).filter((q) => q.inYear).map((q) => q.quarter))],
  }))
  const scoped = parts.filter((p) => p.quarters.length > 0 && (timeMentions(p.text).length > 0 || dayMentions(p.text).length > 0))
  if (scoped.length > 0 && scoped.length === parts.filter((p) => timeMentions(p.text).length > 0).length) {
    return scoped.map((p) => ({ text: p.text, quarters: p.quarters }))
  }
  return [{ text }]
}

type Window = { start: number; end: number; days?: number[] }

function availabilityWindows(raw: string): { only: Window[]; avoid: Extract<TimeRule, { kind: 'avoid' }>[]; soft: boolean } {
  const only: Window[] = []
  const avoid: Extract<TimeRule, { kind: 'avoid' }>[] = []
  const daysOnly: number[][] = []
  const unscoped: Window[] = []
  let softSentences = 0
  let hardSentences = 0

  for (const sen of sentences(raw)) {
    let text = sen.text
    const trailingPreference = /\bpreferably\W*$/i.test(text)
    // "Evening (preferably after 7)": the preference is a wish inside a constraint; drop it.
    text = text.replace(/\(?\bpreferably\b[^.;)]*\)?/gi, (m) => ' '.repeat(m.length))
    const lower = text.toLowerCase()
    const neg = /\b(no|not|cannot|can't|avoid|don't)\b/i.test(lower) && !/\bif not\b/i.test(lower)
    const anyDay = /\bany\s*(?:week\s*)?days?\b|\bopen to other days\b|\bany day\b/i.test(lower)
    const soft = trailingPreference || /\b(prefer|generally|ideally)\b/i.test(lower)

    type Tok = { at: number; kind: 'win'; start: number; end: number } | { at: number; kind: 'days'; days: number[]; end: number }
    const toks: Tok[] = []
    const covered: [number, number][] = []
    let m: RegExpExecArray | null
    const afterRe = /\b(after|starting at|later than)\s+(\d{1,2})(?::(\d{2}))?\s*([ap]m)?/gi
    while ((m = afterRe.exec(text))) {
      const from = toMinutes(m[2]!, m[3], m[4] ?? (Number(m[2]) < 12 && Number(m[2]) > 7 && !m[3] ? 'pm' : undefined))
      const end = /\bafternoon/.test(lower) ? 17 * 60 + 30 : DAY_END
      toks.push({ at: m.index, kind: 'win', start: from, end })
      covered.push([m.index, m.index + m[0].length])
    }
    const between = /\bbetween\s+(\d{1,2})(?::(\d{2}))?\s*([ap]m)?\s+and\s+(\d{1,2})(?::(\d{2}))?\s*([ap]m)?/gi
    while ((m = between.exec(text))) {
      toks.push({ at: m.index, kind: 'win', start: toMinutes(m[1]!, m[2], m[3]), end: toMinutes(m[4]!, m[5], m[6]) })
      covered.push([m.index, m.index + m[0].length])
    }
    for (const t of timeMentions(text)) {
      if (covered.some(([a, b]) => t.index < b && t.endIndex > a)) continue
      const w = snapWindow(t.start, t.end ?? t.start + 120)
      toks.push({ at: t.index, kind: 'win', ...w })
      covered.push([t.index, t.endIndex])
    }
    if (/\bslots?\b/i.test(lower)) {
      // Bare hours in a list of slots: "M-Th, 11, 1:15, or 3:30 slots".
      for (const b of text.matchAll(/(?<![\d:])\b(8|9|10|11|12|1|2|3|4|5|6|7)\b(?![:\d]|\s*(?:am|pm))/gi)) {
        const at = b.index ?? 0
        if (covered.some(([x, y]) => at >= x && at < y)) continue
        const start = inferMeridiem(Number(b[1]), 0)
        const w = snapWindow(start, start + 120)
        toks.push({ at, kind: 'win', ...w })
      }
    }
    for (const p of periodWindows(text)) {
      if (covered.some(([a, b]) => p.index < b && p.endIndex > a)) continue
      if (toks.some((x) => x.kind === 'win' && x.start >= p.start && x.end <= p.end && x.at > p.index && x.at <= p.endIndex + 20)) continue
      toks.push({ at: p.index, kind: 'win', start: Math.max(p.start, p.start === 0 ? 8 * 60 : p.start), end: p.end })
    }
    // Day mentions joined only by "and", "or" or commas are one set of choices.
    for (const d of dayMentions(text)) {
      const last = toks.filter((x): x is Extract<Tok, { kind: 'days' }> => x.kind === 'days').pop()
      if (last && /^[\s,&/]*(and|or|&)?[\s,]*$/i.test(text.slice(last.end, d.index)) && !toks.some((x) => x.kind === 'win' && x.at > last.at && x.at < d.index)) {
        last.days = [...new Set([...last.days, ...d.days])].sort((a, b) => a - b)
        last.end = d.end
      } else toks.push({ at: d.index, kind: 'days', days: d.days, end: d.end })
    }
    toks.sort((a, b) => a.at - b.at)

    const wins = toks.filter((t): t is Extract<Tok, { kind: 'win' }> => t.kind === 'win')
    const dayToks = toks.filter((t): t is Extract<Tok, { kind: 'days' }> => t.kind === 'days')
    if (wins.length === 0) {
      if (dayToks.length && !neg && !anyDay) daysOnly.push(dayToks.flatMap((d) => d.days))
      continue
    }
    // "M/W 3:30 (1 class) T/Th 8:45 and 11:00": days lead their times. "545pm on Tue/Thu": days follow.
    const daysLead = toks[0]!.kind === 'days'
    for (const w of wins) {
      let days: number[] | undefined
      if (!anyDay && dayToks.length) {
        const prev = [...dayToks].reverse().find((d) => d.at < w.at)
        const next = dayToks.find((d) => d.at > w.at)
        days = (daysLead ? (prev ?? next) : (next ?? prev))?.days
        if (days && days.length >= 5) days = undefined
      }
      const window: Window = { start: w.start, end: w.end, ...(days ? { days } : {}) }
      if (neg) {
        avoid.push({
          kind: 'avoid',
          start: w.start,
          end: w.end,
          strength: SOFT.test(lower) && !HARD.test(lower) ? 'soft' : 'hard',
          ...(days ? { days } : {}),
        })
      } else {
        only.push(window)
        if (!days && !anyDay) unscoped.push(window)
        if (soft) softSentences++
        else hardSentences++
      }
    }
  }
  // "11am or 1pm. M/W or Tue/Thu." — days in a sentence of their own belong to the times.
  if (daysOnly.length) {
    const days = [...new Set(daysOnly.flat())].sort((a, b) => a - b)
    if (only.length === 0) only.push({ start: 0, end: DAY_END, days })
    else for (const w of unscoped) if (days.length < 5) w.days = days
  }
  return { only: dropContained(only), avoid, soft: softSentences > 0 && hardSentences === 0 }
}

/** Windows another window already covers add nothing and read as noise. */
function dropContained(ws: Window[]): Window[] {
  const same = (a?: number[], b?: number[]) => String(a ?? '') === String(b ?? '')
  const covers = (o: Window, w: Window) => o.start <= w.start && o.end >= w.end && (!o.days || (!!w.days && w.days.every((d) => o.days!.includes(d))))
  return ws.filter((w, i) => !ws.some((o, j) => j !== i && covers(o, w) && !(same(o.days, w.days) && o.start === w.start && o.end === w.end && j > i)))
}

// ── Counts ───────────────────────────────────────────────────────────────────

const NUMBER_WORDS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 }

/** The first count in a piece of text: `8 for now (possibly 1 ISS)` → 8, `One` → 1. */
export function firstNumber(raw: string | number | null): number | null {
  if (typeof raw === 'number') return raw
  if (!raw) return null
  const text = normalise(raw)
  const m = /(?<![\w.])(\d+(?:\.\d+)?)(?!\s*%)|\b(zero|one|two|three|four|five|six|seven|eight)\b/i.exec(text)
  if (!m) return null
  return m[1] !== undefined ? Number(m[1]) : (NUMBER_WORDS[m[2]!.toLowerCase()] ?? null)
}

/**
 * How many courses a part-time instructor asked for, by quarter: `2`,
 * `Autumn 3 - Winter 3 - Spring 2`, `Three courses in Autumn, Two in Winter`,
 * `For now just 2 in Winter Quarter`, `Fall 2, Wi 2.5, Sp 2.5`,
 * `Autumn and Spring 1 or more courses. Winter and Summer 0.` A range takes
 * its upper end, since this is a ceiling. `flat` is a count that applies to
 * every quarter, when no quarter is named.
 */
export function quarterCounts(
  raw: string | number | null,
  autumnYear?: number,
): { perQuarter: Partial<Record<Quarter, number>>; flat: number | null } {
  if (raw === null || raw === '') return { perQuarter: {}, flat: null }
  if (typeof raw === 'number') return { perQuarter: {}, flat: raw }
  let text = normalise(raw)
  // Course numbers, room codes and years are not counts.
  for (const c of courseMentions(text)) text = text.slice(0, c.index) + ' '.repeat(c.end - c.index) + text.slice(c.end)
  text = text.replace(/\b[A-Z]{2,4}\d?-\d{3}\b/g, (m) => ' '.repeat(m.length))

  type Tok = { at: number; end: number } & ({ kind: 'n'; n: number } | { kind: 'q'; q: Quarter; inYear: boolean })
  const toks: Tok[] = []
  const quarters = quarterMentions(text, autumnYear)
  for (const q of quarters) toks.push({ kind: 'q', q: q.quarter, inYear: q.inYear, at: q.index, end: q.end })
  const inQuarter = (i: number) => quarters.some((q) => i >= q.index && i < q.end)
  for (const m of text.matchAll(/(?<![\w.:'])(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?(?![\d%:]|\s*(?:am|pm)\b)|\b(zero|one|two|three|four|five|six|seven|eight)\b/gi)) {
    const at = m.index ?? 0
    if (inQuarter(at)) continue
    const n = m[3] ? NUMBER_WORDS[m[3].toLowerCase()]! : Number(m[2] ?? m[1])
    if (n > 12) continue
    toks.push({ kind: 'n', n, at, end: at + m[0].length })
  }
  toks.sort((a, b) => a.at - b.at)

  const perQuarter: Partial<Record<Quarter, number>> = {}
  const assigned = new Set<number>()
  const usedQ = new Set<number>()
  const joined = (a: number, b: number) => /^[\s,&]*(and|or|&|,)?[\s,]*$/i.test(text.slice(a, b))

  // A number, then "in"/"for" and the quarter(s) it counts: "Three courses in Autumn",
  // "2 maximum in winter quarter", "1 course in each of the following quarters: Winter, Fall".
  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i]!
    const next = toks[i + 1]
    if (tok.kind !== 'n' || !next || next.kind !== 'q') continue
    const gap = text.slice(tok.end, next.at)
    if (gap.length > 45 || /[.;\n]/.test(gap) || !/\b(in|for|during|of)\b/i.test(gap)) continue
    assigned.add(i)
    for (let j = i + 1; j < toks.length && toks[j]!.kind === 'q'; j++) {
      const q = toks[j] as Extract<Tok, { kind: 'q' }>
      usedQ.add(j)
      if (q.inYear && q.q !== 'summer') perQuarter[q.q] ??= tok.n
      if (!toks[j + 1] || !joined(q.end, toks[j + 1]!.at)) break
    }
  }
  // The quarter(s), then the number: "Autumn 3", "Autumn and Spring 1", "Winter 2027: 2-3".
  for (let i = 0; i < toks.length; i++) {
    if (toks[i]!.kind !== 'q' || usedQ.has(i)) continue
    let j = i
    while (toks[j + 1]?.kind === 'q' && !usedQ.has(j + 1) && joined(toks[j]!.end, toks[j + 1]!.at)) j++
    const next = toks[j + 1]
    const gap = next ? text.slice(toks[j]!.end, next.at) : ''
    if (next && next.kind === 'n' && !assigned.has(j + 1) && gap.length <= 12 && !/[.;\n]/.test(gap)) {
      for (let k = i; k <= j; k++) {
        const q = toks[k] as Extract<Tok, { kind: 'q' }>
        if (q.inYear && q.q !== 'summer') perQuarter[q.q] ??= next.n
      }
      assigned.add(j + 1)
    }
    i = j
  }

  const named = Object.keys(perQuarter).length > 0
  if (named) {
    for (const q of YEAR_QUARTERS) perQuarter[q] ??= 0
    return { perQuarter, flat: null }
  }
  const first = toks.find((t, i) => t.kind === 'n' && !assigned.has(i)) as Extract<Tok, { kind: 'n' }> | undefined
  return { perQuarter: {}, flat: first ? first.n : null }
}
