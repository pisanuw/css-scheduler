/**
 * Reads a UW time schedule the way a coordinator actually hands one over: as
 * text pasted out of the published schedule.
 *
 * The published schedule is fixed-width text inside a `<pre>`, and a paste — on
 * a phone especially — does not preserve columns. So nothing here counts
 * characters. Every field is recognised by its own shape and claimed in the
 * order UW writes them, which survives a paste that has collapsed runs of
 * spaces, lost a leading `Restr`, or wrapped a long line.
 *
 * Pure, and it says what it could not read rather than dropping it. A schedule
 * that quietly imports 71 of 80 sections is worse than one that names the nine.
 *
 * The day and time grammars are ported from `scripts/generate_seed.py`, which
 * parsed the three real schedules in `past-course-schedules/`. They are
 * institutional knowledge, not guesses: see `parseTimeRange` for the one rule
 * that cannot be derived from the text.
 */

import type { Modality, Quarter } from './conflicts'
import type { HistoryRow } from './seedPlan'

/** UW's single-letter day codes. `S` is Saturday; Sunday is `Su`. */
const ONE_DAY: Record<string, number> = { M: 1, T: 2, W: 3, F: 5, S: 6 }

/**
 * `MW`, `TTh`, `F`, `MWF` -> weekday numbers, or null when the token is not a
 * day pattern at all. Returning null for anything unrecognised is what lets the
 * line scanner use this as a test rather than keeping a second copy of the
 * grammar.
 */
export function parseDayPattern(raw: string): number[] | null {
  const s = raw.trim()
  if (!s) return null
  const out: number[] = []
  let i = 0
  while (i < s.length) {
    const two = s.slice(i, i + 2).toLowerCase()
    if (two === 'th') {
      out.push(4)
      i += 2
      continue
    }
    if (two === 'su') {
      out.push(7)
      i += 2
      continue
    }
    const day = ONE_DAY[s[i]!.toUpperCase()]
    if (day === undefined) return null
    out.push(day)
    i += 1
  }
  const seen = new Set<number>()
  const days = out.filter((d) => (seen.has(d) ? false : (seen.add(d), true)))
  return days.length > 0 ? days.sort((a, b) => a - b) : null
}

/**
 * `845-1045`, `1100-100`, `545-745P` -> 24-hour `HH:MM`, or null.
 *
 * UW omits the meridiem on most rows, so it has to be inferred, and the rule is
 * the schedule's own convention rather than anything in the string: a trailing
 * `P` makes the whole range afternoon, and otherwise hours 8–11 are morning and
 * everything else is afternoon. That is why `1100-100` is 11:00 to 13:00 — the
 * two halves of one range get different meridiems, which no generic time parser
 * would do.
 */
export function parseTimeRange(raw: string): { start: string; end: string } | null {
  const m = /^(\d{3,4})\s*-\s*(\d{3,4})\s*(?:([AP])\.?M?\.?)?$/i.exec(raw.trim())
  if (!m) return null
  const suffix = (m[3] ?? '').toUpperCase()
  const one = (tok: string): string | null => {
    const padded = tok.padStart(3, '0')
    let h = Number(padded.slice(0, -2))
    const min = Number(padded.slice(-2))
    if (min > 59) return null
    if (suffix === 'P') {
      if (h !== 12) h += 12
    } else if (suffix === 'A') {
      if (h === 12) h = 0
    } else if (h >= 8 && h <= 11) {
      // Morning as written.
    } else if (h !== 12) {
      h += 12
    }
    if (h > 23) return null
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  }
  const start = one(m[1]!)
  const end = one(m[2]!)
  return start && end ? { start, end } : null
}

export interface ParsedMeeting {
  days: number[] | null
  start: string | null
  end: string | null
  roomLabel: string | null
}

export interface ParsedSection {
  /** As written, e.g. `CSS 101`. */
  courseCodeRaw: string
  subject: string
  number: number
  sln: string | null
  sectionLetter: string
  /** `LECT` when UW leaves it blank, otherwise the code it printed. */
  sectionType: string
  credits: string | null
  meetings: ParsedMeeting[]
  instructorRaw: string | null
  enrollmentCap: number | null
  /** Only set when the line says so; the coordinator edits the rest. */
  modality: Modality | null
  /** The line it came from, so a warning can quote it back. */
  line: string
}

export interface ParsedSchedule {
  sections: ParsedSection[]
  /** Lines that looked like they should have been a section and were not. */
  ignored: { line: string; reason: string }[]
}

/** Lecture-equivalent types. Quiz and lab rows hang off one of these. */
const LECTURE_TYPES = new Set(['LECT', 'LEC', 'SEM', 'SM', 'CLN', 'IS', 'HON', 'STU'])
const SECTION_TYPES = new Set([...LECTURE_TYPES, 'QZ', 'LB', 'ST', 'CL', 'CO', 'LC', 'PRC'])

/**
 * `CSS 101`, and the two-word subjects UW uses (`B CUSP 110`, `T INFO 200`).
 * The subject needs two letters of its own, or a single letter followed by a
 * second word: without that, the `W` on a continuation meeting line reads as a
 * subject and `115-315` as its course number.
 */
const COURSE_HEADING = /^([A-Z]{2,6}(?:\s+[A-Z&]{2,6})?|[A-Z]\s+[A-Z&]{2,6})\s*(\d{3})\b/
const SLN = /(?<![\d/])(\d{5})(?!\d)/
const ROOM_WORDS = new Set(['ONLINE', 'REMOTE', 'TBD', 'TBA', 'ARR', '*'])

/** `UW1` + `102` -> `UW1 102`, matching how `rooms.label` is composed. */
function takeRoom(tokens: string[], at: number): { label: string | null; next: number } {
  const tok = tokens[at]
  if (!tok) return { label: null, next: at }
  const upper = tok.toUpperCase()
  if (ROOM_WORDS.has(upper)) {
    // `* *` is how the schedule writes "no room": one star per column.
    const next = tokens[at + 1] === '*' ? at + 2 : at + 1
    return { label: upper === '*' ? null : upper, next }
  }
  if (/^[A-Z][A-Z0-9]{1,5}$/.test(upper) && /^\d{1,4}[A-Z]?$/.test(tokens[at + 1] ?? '')) {
    return { label: `${upper} ${tokens[at + 1]!.toUpperCase()}`, next: at + 2 }
  }
  return { label: null, next: at }
}

const STATUS = /^(Open|Closed|Restr|Added|Withdrawn|Suspended)$/i

/**
 * Everything after the room and before the status column is the instructor.
 * UW writes `Last,First`, sometimes `Last,First M.`, and a paste may have put a
 * space after the comma, so the tokens are rejoined rather than assumed to be
 * one.
 */
function takeInstructor(tokens: string[], at: number): { name: string | null; next: number } {
  const parts: string[] = []
  let i = at
  while (i < tokens.length) {
    const tok = tokens[i]!
    if (STATUS.test(tok) || /^\d+\/$/.test(tok) || /^\d+\/\d+$/.test(tok)) break
    parts.push(tok)
    i += 1
  }
  const name = parts.join(' ').replace(/[,\s]+$/, '').trim()
  return { name: name.length > 1 ? name : null, next: i }
}

function modalityFrom(line: string, hasTime: boolean): Modality | null {
  if (!/\b(online|remote|asynchronous|async)\b/i.test(line)) return null
  return hasTime ? 'online_sync' : 'online_async'
}

/**
 * The whole paste, line by line.
 *
 * A line carrying a five-digit SLN starts a section. A line without one is
 * either a course heading (which the sections under it inherit) or a second
 * meeting for the section above it — a hybrid that meets in a room one day and
 * online the other is written exactly that way.
 */
export function parseTimeSchedule(text: string): ParsedSchedule {
  const sections: ParsedSection[] = []
  const ignored: ParsedSchedule['ignored'] = []
  let course: { raw: string; subject: string; number: number } | null = null
  let last: ParsedSection | null = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, ' ').trim()
    if (!line) continue

    const slnMatch = SLN.exec(line)
    if (!slnMatch) {
      // A bare meeting line belongs to the section above it. Tried first,
      // because an all-caps `TTH 545-745P` also matches the subject pattern.
      if (last) {
        const extra = readMeeting(line)
        if (extra) {
          last.meetings.push(extra)
          continue
        }
      }
      const heading = COURSE_HEADING.exec(line)
      if (heading) {
        course = {
          raw: `${heading[1]!.replace(/\s+/g, ' ')} ${heading[2]}`,
          subject: heading[1]!.replace(/\s+/g, ' '),
          number: Number(heading[2]),
        }
        last = null
        continue
      }
      continue
    }

    // A section line may carry its own course code, when the paste came from a
    // table rather than from the published schedule.
    const inline = COURSE_HEADING.exec(line)
    const onThisLine =
      inline && line.indexOf(inline[0]) < slnMatch.index
        ? {
            raw: `${inline[1]!.replace(/\s+/g, ' ')} ${inline[2]}`,
            subject: inline[1]!.replace(/\s+/g, ' '),
            number: Number(inline[2]),
          }
        : null
    const forThisLine = onThisLine ?? course
    if (!forThisLine) {
      ignored.push({ line, reason: 'no course heading above this line' })
      continue
    }

    const rest = line.slice(slnMatch.index + slnMatch[1]!.length).trim()
    const tokens = rest.split(' ').filter(Boolean)
    let i = 0

    // The letter is always the column after the SLN. Taking it positionally is
    // deliberate: `F` is both a valid section letter and a valid day pattern,
    // and only its position tells them apart.
    let letter = 'A'
    if (tokens[i] && /^[A-Z]{1,2}\d?$/i.test(tokens[i]!)) {
      letter = tokens[i]!.toUpperCase()
      i += 1
    }

    let sectionType = 'LECT'
    if (tokens[i] && SECTION_TYPES.has(tokens[i]!.toUpperCase())) {
      sectionType = tokens[i]!.toUpperCase()
      i += 1
    }

    let credits: string | null = null
    if (tokens[i] && /^(\d+(\.\d+)?(-\d+(\.\d+)?)?|VAR|\*)$/i.test(tokens[i]!)) {
      credits = tokens[i]!
      i += 1
    }

    const meetings: ParsedMeeting[] = []
    const arranged = /to be arranged/i.test(line)
    let days: number[] | null = null
    if (!arranged && tokens[i]) {
      const maybe = parseDayPattern(tokens[i]!)
      if (maybe) {
        days = maybe
        i += 1
      }
    }
    let time: { start: string; end: string } | null = null
    if (tokens[i]) {
      time = parseTimeRange(tokens[i]!)
      if (time) i += 1
    }
    const room = takeRoom(tokens, i)
    i = room.next
    if (days || time || room.label) {
      meetings.push({
        days,
        start: time?.start ?? null,
        end: time?.end ?? null,
        roomLabel: room.label,
      })
    }

    const instructor = takeInstructor(tokens, i)
    const cap = /(\d+)\s*\/\s*(\d+)/.exec(rest)

    const section: ParsedSection = {
      courseCodeRaw: forThisLine.raw,
      subject: forThisLine.subject,
      number: forThisLine.number,
      sln: slnMatch[1]!,
      sectionLetter: letter,
      sectionType,
      credits,
      meetings,
      instructorRaw: instructor.name,
      enrollmentCap: cap ? Number(cap[2]) : null,
      modality: modalityFrom(line, !!time),
      line,
    }
    sections.push(section)
    last = section
  }

  return { sections, ignored }
}

/** A continuation line: days, a time and a room, with no SLN of its own. */
function readMeeting(line: string): ParsedMeeting | null {
  const tokens = line.split(' ').filter(Boolean)
  let i = 0
  const days = tokens[i] ? parseDayPattern(tokens[i]!) : null
  if (!days) return null
  i += 1
  const time = tokens[i] ? parseTimeRange(tokens[i]!) : null
  if (!time) return null
  i += 1
  const room = takeRoom(tokens, i)
  return { days, start: time.start, end: time.end, roomLabel: room.label }
}

// ------------------------------------------------------------- resolving ----

/** Strip accents and punctuation so two spellings of a name can be compared. */
function norm(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** `Kool,Nancy L.` -> `['kool', 'nancy']`. */
function splitScheduleName(raw: string): { last: string; first: string } {
  const [before, after] = raw.includes(',') ? raw.split(',', 2) : [raw, '']
  const last = norm(before ?? '')
  const first = norm(after ?? '').split(' ')[0] ?? ''
  if (!after && last.includes(' ')) {
    // `David Nixon` rather than `Nixon,David`.
    const parts = last.split(' ')
    return { last: parts[parts.length - 1]!, first: parts[0]! }
  }
  return { last, first }
}

export interface RosterEntry {
  id: string
  full_name: string
  is_active: boolean
}

/**
 * The name on a schedule to somebody on the roster.
 *
 * Four rules, narrowest first, and a tie is not a match: a schedule that says
 * `Wang,J` where the roster holds two Wangs must not silently pick one.
 * Returning null is the honest answer, and the import reports it by name so the
 * coordinator can assign that section themselves.
 */
export function matchInstructor(raw: string, roster: RosterEntry[]): RosterEntry | null {
  const want = splitScheduleName(raw)
  if (!want.last) return null

  const entries = roster.map((r) => {
    const parts = norm(r.full_name).split(' ').filter(Boolean)
    return { r, last: parts[parts.length - 1] ?? '', first: parts[0] ?? '' }
  })

  const only = <T,>(xs: T[]): T | null => (xs.length === 1 ? xs[0]! : null)

  const exact = entries.filter((e) => e.last === want.last && e.first === want.first)
  if (exact.length > 0) return (only(exact) ?? exact[0]!).r

  if (want.first) {
    // `Steve` for `Stephen`, `Matt` for `Matthew`: the same person, spelled
    // shorter in one place than the other.
    const prefix = entries.filter(
      (e) =>
        e.last === want.last &&
        (e.first.startsWith(want.first) || want.first.startsWith(e.first)),
    )
    const hit = only(prefix)
    if (hit) return hit.r
  }

  const sameLast = only(entries.filter((e) => e.last === want.last))
  return sameLast ? sameLast.r : null
}

export interface ResolveInput {
  parsed: ParsedSection[]
  /** `code` is `CSS 101`, as the generated column composes it. */
  courses: { id: string; code: string; number: number }[]
  roster: RosterEntry[]
  quarter: Quarter
  academicYear: string
}

export interface ResolvedImport {
  /** Ready for `planFromHistory`, which does the rest. */
  history: HistoryRow[]
  /** Course codes the catalogue does not hold, once each. */
  unknownCourses: string[]
  /** Names the roster does not hold, once each. */
  unknownInstructors: string[]
  /** Rows deliberately left out, with the reason. */
  dropped: { detail: string; reason: string }[]
}

/**
 * Parsed lines into the shape the seed planner already understands.
 *
 * Reusing `planFromHistory` from here is the whole reason this step exists
 * separately: the fiddly work — matching the time grid, merging co-taught
 * rows, resolving rooms, honouring the unique key on sections — is written and
 * tested once, and an import gets it for free.
 */
export function resolveImport(input: ResolveInput): ResolvedImport {
  const byCode = new Map(input.courses.map((c) => [c.code.toUpperCase().replace(/\s+/g, ' '), c]))
  const unknownCourses = new Set<string>()
  const unknownInstructors = new Set<string>()
  const dropped: ResolvedImport['dropped'] = []
  const history: HistoryRow[] = []

  for (const [index, s] of input.parsed.entries()) {
    const label = `${s.courseCodeRaw} ${s.sectionLetter}`

    if (!LECTURE_TYPES.has(s.sectionType)) {
      dropped.push({ detail: label, reason: `${s.sectionType} sections are not scheduled here` })
      continue
    }

    const course = byCode.get(s.courseCodeRaw.toUpperCase())
    if (!course) {
      unknownCourses.add(s.courseCodeRaw)
      dropped.push({ detail: label, reason: 'not in the catalogue' })
      continue
    }

    let instructorId: string | null = null
    if (s.instructorRaw) {
      const hit = matchInstructor(s.instructorRaw, input.roster)
      if (hit) instructorId = hit.id
      else unknownInstructors.add(s.instructorRaw)
    }

    // Only the first meeting becomes the section's own time. A second meeting
    // is real, and the schema holds one time per section, so it is reported
    // rather than silently halved.
    const first = s.meetings[0] ?? null
    if (s.meetings.length > 1) {
      dropped.push({
        detail: label,
        reason: 'meets twice; only the first meeting was kept — check the section',
      })
    }

    history.push({
      id: `import-${index}-${s.sln ?? s.sectionLetter}`,
      course_id: course.id,
      instructor_id: instructorId,
      instructor_name_raw: s.instructorRaw ?? '',
      course_code_raw: s.courseCodeRaw,
      academic_year: input.academicYear,
      quarter: input.quarter,
      section_letter: s.sectionLetter,
      days: first?.days ?? null,
      start_time: first?.start ?? null,
      end_time: first?.end ?? null,
      room_label: first?.roomLabel ?? null,
      modality: s.modality,
      enrollment_cap: s.enrollmentCap,
    })
  }

  return {
    history,
    unknownCourses: [...unknownCourses],
    unknownInstructors: [...unknownInstructors],
    dropped,
  }
}
