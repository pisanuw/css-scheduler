/**
 * The parser against a current quarter, published, in full.
 *
 * Everything else that checks this parser reads `history_sections.csv`, which
 * is a *round trip*: rows this repo already extracted, written back out in
 * published layout and read again. That cannot catch anything the extraction
 * itself smoothed over, and for three runs the honest note in
 * `timeSchedule.real.test.ts` said so — the published UW time schedule sits
 * behind a NetID now, so only somebody signed in could supply one.
 *
 * `scripts/data/aut2026_timeschedule.txt` is that listing: the Autumn 2026 CSS
 * time schedule as published on 26 September 2026, supplied by the coordinator
 * and extracted from `past-course-schedules/aut2026.pdf`. It is text taken from
 * a PDF rather than a browser copy, so the column spacing is the PDF's — which
 * makes it a harder input than a paste, not an easier one: `UW1  040` arrives
 * with two spaces, page furniture and column headers are interleaved, and every
 * course note is present as the wrapped prose it really is.
 *
 * The coordinator then supplied the same quarter a second way — the web page
 * itself, `past-course-schedules/aut2026.html`, rendered to text in
 * `scripts/data/aut2026_timeschedule_web.txt`. That is not a spare copy. The
 * page is HTML 4 with unclosed `<pre>` tags and `&nbsp;` inside its headings,
 * and its course notes wrap in different places than the PDF's — which is
 * exactly where the bugs were. Parsing both and requiring them to *agree* is
 * the strongest check in this file: two independent renderings of one truth.
 *
 * Between them they found three bugs on first contact, all pinned below. None
 * would have shown up in the round trip, because the round trip synthesises
 * tidy headings and never writes a course note at all.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { matchInstructor, parseTimeSchedule, resolveImport, type RosterEntry } from './timeSchedule'

const LISTING = readFileSync(
  new URL('../../scripts/data/aut2026_timeschedule.txt', import.meta.url),
  'utf8',
)

const parsed = parseTimeSchedule(LISTING)

/**
 * The same quarter as the web page renders it.
 *
 * Honest about what this is: the text was produced by stripping the markup, not
 * captured from a real clipboard, so the tabs and newlines between table cells
 * are a reading of what a browser would put there. What is *not* a guess is
 * where the lines break inside the course notes — those breaks are the page's
 * own, and they are what broke the parser.
 */
const WEB = readFileSync(
  new URL('../../scripts/data/aut2026_timeschedule_web.txt', import.meta.url),
  'utf8',
)

const fromWeb = parseTimeSchedule(WEB)

describe('Autumn 2026, as published', () => {
  it('reads every section and ignores no line', () => {
    expect(parsed.sections).toHaveLength(75)
    expect(parsed.ignored).toEqual([])
  })

  /*
   * The first bug. A course note wrapped so that a line began "OF CSS 112,",
   * the subject pattern accepted any two short words, and the two CSS 142
   * sections printed under that note were filed against a course called
   * "OF CSS 112" — which the catalogue does not hold, so the import dropped
   * them. Two real sections lost, with a nonsense course name as the only clue.
   */
  it('files every section under a CSS course, not under a sentence', () => {
    const strange = parsed.sections.filter((s) => s.subject !== 'CSS')
    expect(strange.map((s) => `${s.subject} ${s.number} ${s.sectionLetter}`)).toEqual([])
  })

  it('keeps all four sections of CSS 142 together', () => {
    const c142 = parsed.sections.filter((s) => s.number === 142)
    expect(c142.map((s) => s.sectionLetter)).toEqual(['A', 'B', 'C', 'D'])
    expect(c142.map((s) => s.sln)).toEqual(['13454', '13455', '13456', '13457'])
  })

  /*
   * The second bug. `to be arranged` sits in the meeting-times column of every
   * independent study; the parser noticed the phrase but left the words in the
   * stream, so they fell through to the instructor reader. Six sections came
   * back taught by a person called "to be arranged", and one by "to be arranged
   * * *".
   */
  it('hires nobody called "to be arranged"', () => {
    const names = parsed.sections.map((s) => s.instructorRaw).filter(Boolean) as string[]
    expect(names.filter((n) => /arranged|^\*/i.test(n))).toEqual([])
    // 36 real people, and the sections with nobody named are genuinely unstaffed.
    expect(new Set(names).size).toBe(36)
    expect(parsed.sections.filter((s) => !s.instructorRaw)).toHaveLength(18)
  })

  it('leaves the arranged sections without a meeting rather than inventing one', () => {
    const arranged = parsed.sections.filter((s) => s.meetings.length === 0)
    expect(arranged).toHaveLength(14)
    expect(arranged.every((s) => s.instructorRaw === null)).toBe(true)
  })

  /** One row, every field, against what the page actually prints. */
  it('recovers a whole row exactly', () => {
    const first = parsed.sections[0]!
    expect(first).toMatchObject({
      courseCodeRaw: 'CSS 101',
      subject: 'CSS',
      number: 101,
      sln: '13450',
      sectionLetter: 'A',
      credits: '5',
      instructorRaw: 'Pyle,Douglas M.',
      enrollmentCap: 30,
    })
    // `UW1  040` in the PDF, one space in `rooms.label`.
    expect(first.meetings).toEqual([
      { days: [1, 3], start: '13:15', end: '15:15', roomLabel: 'UW1 040' },
    ])
  })

  it('reads the evening block and the two-day patterns the grid uses', () => {
    const evening = parsed.sections.find((s) => s.sln === '13451')!
    expect(evening.meetings[0]).toMatchObject({ start: '17:45', end: '19:45', days: [1, 3] })
    const tth = parsed.sections.find((s) => s.sln === '13452')!
    expect(tth.meetings[0]).toMatchObject({ start: '08:45', end: '10:45', days: [2, 4] })
  })

  it('gives every section a five-digit SLN of its own', () => {
    const slns = parsed.sections.map((s) => s.sln)
    expect(slns.every((s) => s !== null && /^\d{5}$/.test(s))).toBe(true)
    expect(new Set(slns).size).toBe(slns.length)
  })
})

describe('the same quarter, copied from the web page instead', () => {
  it('reads the same 75 sections with nothing ignored', () => {
    expect(fromWeb.sections).toHaveLength(75)
    expect(fromWeb.ignored).toEqual([])
  })

  /*
   * The third bug, and the one the PDF could not have found. The note wraps
   * differently here, leaving a line that is nothing but `OR 142` — two
   * capitals and three digits, immediately above CSS 142's sections. It read as
   * a course heading for a subject called "OR", and took all four sections of
   * CSS 142 and two of CSS 143 with it.
   */
  it('does not file six sections under a conjunction', () => {
    const strange = fromWeb.sections.filter((s) => s.subject !== 'CSS')
    expect(strange.map((s) => `${s.subject} ${s.number} ${s.sectionLetter}`)).toEqual([])
    expect(fromWeb.sections.filter((s) => s.number === 142)).toHaveLength(4)
    expect(fromWeb.sections.filter((s) => s.number === 143)).toHaveLength(2)
  })

  /*
   * The real assertion. Two renderings of one published quarter — different
   * whitespace, different line breaks, `&nbsp;` in one and plain spaces in the
   * other — have to produce the same sections, field for field. A parser that
   * depends on how the page was copied is a parser that will fail on somebody's
   * phone.
   */
  it('agrees with the PDF on every field of every section', () => {
    const shape = (s: (typeof parsed.sections)[number]) => ({
      course: s.courseCodeRaw,
      number: s.number,
      letter: s.sectionLetter,
      type: s.sectionType,
      credits: s.credits,
      instructor: s.instructorRaw,
      cap: s.enrollmentCap,
      meetings: s.meetings,
    })
    const byPdf = new Map(parsed.sections.map((s) => [s.sln!, shape(s)]))
    const byWeb = new Map(fromWeb.sections.map((s) => [s.sln!, shape(s)]))
    expect([...byWeb.keys()].sort()).toEqual([...byPdf.keys()].sort())
    for (const [sln, want] of byPdf) expect({ sln, ...byWeb.get(sln) }).toEqual({ sln, ...want })
  })
})

/**
 * A small roster of real people, spelled as the roster spells them, to check
 * the published spellings against. These four are the awkward shapes the
 * listing actually contains: a nickname, a shortened first name, a middle
 * initial with no full stop, and a name that already matches.
 */
const ROSTER: RosterEntry[] = [
  { id: 'i-rubin', full_name: 'Zachary Rubin', is_active: true },
  { id: 'i-carr', full_name: 'Matthew Carr', is_active: true },
  { id: 'i-shaw', full_name: 'Carol Shaw', is_active: true },
  { id: 'i-pyle', full_name: 'Douglas M. Pyle', is_active: true },
]

describe('what a coordinator would get from this paste', () => {
  const courses = [...new Set(parsed.sections.map((s) => s.number))].map((n) => ({
    id: `c${n}`,
    code: `CSS ${n}`,
    number: n,
  }))

  const resolved = resolveImport({
    parsed: parsed.sections,
    courses,
    roster: ROSTER,
    quarter: 'autumn',
    academicYear: '2026-27',
  })

  /*
   * Every course code in the listing resolves. This is the assertion that would
   * have failed before the heading fix — "OF CSS 112" is not in any catalogue.
   */
  it('recognises every course code, with no phantoms', () => {
    expect(resolved.unknownCourses).toEqual([])
  })

  /*
   * 75 sections in, 74 rows out: the one lab section is not something this app
   * schedules, and the section that meets twice is kept with a warning rather
   * than silently halved.
   */
  it('carries the lectures through and says what it left behind', () => {
    expect(resolved.history).toHaveLength(74)
    expect(resolved.dropped).toEqual([
      { detail: 'CSS 427 AA', reason: 'LB sections are not scheduled here' },
      {
        detail: 'CSS 475 A',
        reason: 'meets twice; only the first meeting was kept — check the section',
      },
    ])
  })

  it('matches the published spellings of names it knows', () => {
    expect(matchInstructor('Rubin,Zak', ROSTER)?.id).toBe('i-rubin')
    expect(matchInstructor('Carr,Matt', ROSTER)?.id).toBe('i-carr')
    expect(matchInstructor('Shaw,Carol A', ROSTER)?.id).toBe('i-shaw')
    expect(matchInstructor('Pyle,Douglas M.', ROSTER)?.id).toBe('i-pyle')
  })

  /*
   * And says so when it does not know one, rather than guessing. Against the
   * live roster this listing produces exactly three: somebody genuinely new,
   * and two people marked inactive who are teaching again.
   */
  it('reports a name it has never seen instead of picking somebody close', () => {
    expect(matchInstructor('Longtchi,Theodore', ROSTER)).toBeNull()
    expect(resolved.unknownInstructors).toContain('Longtchi,Theodore')
  })
})
