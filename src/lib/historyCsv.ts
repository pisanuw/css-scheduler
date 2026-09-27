/**
 * The one reader for `scripts/data/history_sections.csv`.
 *
 * That file is what `scripts/generate_seed.py` got out of the three published
 * schedules in `past-course-schedules/`, and it is the closest thing this repo
 * has to ground truth: every real course, room, name and time block CSS
 * actually used, including the awkward ones. Two tests read it — the parser's
 * round trip in `timeSchedule.real.test.ts` and the cold-start plan in
 * `seedPlan.real.test.ts` — and they had no business carrying two copies of the
 * same quoted-CSV scanner between them.
 *
 * Nothing in `src/main.tsx` imports this, so it is never in the bundle. It
 * lives beside the code it checks rather than under `harness/` because it is
 * data plumbing for tests, not a rendered scene.
 */
import { readFileSync } from 'node:fs'

/** Where the fixture lives, relative to this file. */
const CSV = new URL('../../scripts/data/history_sections.csv', import.meta.url)

/**
 * One row of the fixture, keyed by its header.
 *
 * Deliberately all strings: this is the file as written, and every caller wants
 * to do its own conversion — the point of reading real data is that the
 * conversions are the thing under test.
 */
export type HistoryCsvRow = Record<string, string>

/**
 * Quoted fields matter here: instructor names are `Last,First` and the
 * `meetings` column holds a JSON array, so both contain commas inside quotes.
 * Hand-rolled rather than a dependency for one file read.
 */
export function readHistoryCsv(src: string): HistoryCsvRow[] {
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

/** The fixture itself, read once. */
export function realHistoryRecords(): HistoryCsvRow[] {
  return readHistoryCsv(readFileSync(CSV, 'utf8'))
}
