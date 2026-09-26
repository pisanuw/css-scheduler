/**
 * The parser against the three real quarters, not against invented lines.
 *
 * `scripts/data/history_sections.csv` is what `scripts/generate_seed.py` got
 * out of the three published schedules in `past-course-schedules/`, and it is
 * the closest thing this repo has to ground truth. Here every one of its 240
 * rows is written back out in published layout and fed through the parser, and
 * the fields have to come back unchanged.
 *
 * It is a round trip, so it cannot prove the layout is right — but it is the
 * only check that exercises every real course, room, name and time block
 * together, and it catches a token scanner that works on a tidy example and
 * falls over on `* *`, `to be arranged`, or a cap written `48E`.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseDayPattern, parseTimeSchedule, type ParsedSection } from './timeSchedule'

const CSV = new URL('../../scripts/data/history_sections.csv', import.meta.url)

/** Quoted fields matter here: instructor names and the meetings column use them. */
function readCsv(src: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (c !== '\r') cell += c
  }
  if (cell || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  const [head, ...body] = rows.filter((r) => r.length > 5)
  return body.map((r) => Object.fromEntries(head!.map((h, i) => [h, r[i] ?? ''])))
}

/** One published-schedule line, padded into columns the way UW prints them. */
function publishedLine(r: Record<string, string>): string {
  const pad = (v: string, n: number) => v.padEnd(n)
  return (
    `${pad(r.status === 'Restr' ? 'Restr' : '', 6)} ${r.sln} ${pad(r.section!, 2)} ` +
    `${pad(r.credits!, 3)}    ${pad(r.days!, 6)} ${pad(r.time!, 9)} ` +
    `${pad(r.room || '* *', 12)} ${pad(r.instructor!, 28)} ${pad(r.status!, 7)} ` +
    `${String(r.enrl).padStart(3)}/${String(r.limit).padStart(4)}`
  )
}

const records = readCsv(readFileSync(CSV, 'utf8'))

/** Grouped by quarter, because that is the unit a coordinator pastes. */
const quarters = [...new Set(records.map((r) => r.quarter!))].map((quarter) => {
  const list = records.filter((r) => r.quarter === quarter)
  const lines: string[] = []
  let course: string | null = null
  for (const r of list) {
    if (r.course !== course) {
      course = r.course!
      lines.push(`CSS ${course} SOME COURSE TITLE`)
    }
    lines.push(publishedLine(r))
  }
  return { quarter, list, parsed: parseTimeSchedule(lines.join('\n')) }
})

describe('the three real quarters', () => {
  it('has all 240 rows to check', () => {
    expect(records).toHaveLength(240)
    expect(quarters.map((q) => q.quarter).sort()).toEqual(['autumn', 'spring', 'winter'])
  })

  for (const { quarter, list, parsed } of quarters) {
    describe(quarter, () => {
      it('parses every section, and ignores no line', () => {
        expect(parsed.sections).toHaveLength(list.length)
        expect(parsed.ignored).toEqual([])
      })

      it('recovers every field of every section', () => {
        const bySln = new Map<string, ParsedSection>(parsed.sections.map((s) => [s.sln!, s]))
        const wrong: string[] = []
        for (const r of list) {
          const p = bySln.get(r.sln!)
          if (!p) {
            wrong.push(`${r.course}-${r.section}: not parsed`)
            continue
          }
          const meeting = p.meetings[0] ?? null
          const wantRoom = r.room && r.room !== '* *' ? r.room : null
          // `48E` is a cap of 48 with an entry-code marker after it.
          const wantCap = r.limit ? parseInt(r.limit, 10) : null
          const got = {
            number: p.number,
            letter: p.sectionLetter,
            instructor: p.instructorRaw ?? '',
            cap: p.enrollmentCap,
            room: meeting?.roomLabel ?? null,
            days: meeting?.days ?? null,
          }
          const want = {
            number: Number(r.course),
            letter: r.section,
            instructor: r.instructor,
            cap: wantCap,
            room: wantRoom,
            days: r.days ? parseDayPattern(r.days) : null,
          }
          if (JSON.stringify(got) !== JSON.stringify(want)) {
            wrong.push(`CSS${r.course}-${r.section}: ${JSON.stringify(got)} != ${JSON.stringify(want)}`)
          }
        }
        expect(wrong).toEqual([])
      })
    })
  }

  /** The 41 rows with no days and no time are the arranged ones. */
  it('leaves the arranged sections without a meeting', () => {
    const arranged = records.filter((r) => !r.days && !r.time)
    expect(arranged.length).toBeGreaterThan(30)
    const parsedArranged = quarters.flatMap(({ list, parsed }) =>
      parsed.sections.filter((s) => {
        const r = list.find((x) => x.sln === s.sln)
        return r && !r.days && !r.time
      }),
    )
    expect(parsedArranged).toHaveLength(arranged.length)
    for (const s of parsedArranged) expect(s.meetings).toEqual([])
  })
})
