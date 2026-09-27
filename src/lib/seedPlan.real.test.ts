/**
 * The cold start, against the year that was actually taught.
 *
 * A coordinator opening this app for the first time meets an empty database —
 * which is exactly the state the live one is in: 76 instructors, 128 courses and
 * no scenario at all. Their first real move is *New scenario → start from the
 * 2025-26 schedule as it was taught*, and what comes out of that one tap is the
 * board they will work in for the rest of the year. If it drops rows, loses
 * rooms, or turns standard meeting times into custom ones, the alternative is
 * typing two hundred sections into a phone.
 *
 * `seedPlan.test.ts` checks the rules one at a time against two slots and two
 * rooms. This checks the same function against all 240 real rows, the real
 * 42-slot UW Bothell grid and the real room list, and asserts the thing the
 * coordinator actually cares about: **the whole year comes across.**
 *
 * What it does not prove: the CSV is itself an import of three published PDFs,
 * so this cannot show those were read correctly — `timeSchedule.real.test.ts`
 * is the round trip that speaks to that, over these same 240 rows. The time and
 * day parsing used to build the fixture here is the code that test exercises
 * exhaustively, which is why it is safe to lean on it to *build* a fixture.
 */
import { describe, expect, it } from 'vitest'
import { realHistoryRecords } from './historyCsv'
import { parseDayPattern, parseTimeRange } from './timeSchedule'
import { describePlan, planFromHistory, type HistoryRow, type SeedInput } from './seedPlan'
import type { Quarter } from './conflicts'

const records = realHistoryRecords()

/**
 * The real UW Bothell grid: seven day patterns by six two-hour blocks.
 *
 * The same table `scripts/generate_seed.py` writes into `time_slots`, in the
 * same order, which is why the count comes to the 42 rows the live database
 * holds. Written out here rather than read from the generator because a
 * Python file is not importable from a test — and because the *point* of this
 * test is that real published times fall on this grid, so the grid has to be
 * stated, not derived from the same rows being checked against it.
 */
const BLOCKS = ['845-1045', '1100-100', '115-315', '330-530', '545-745P', '800-1000P']
const PATTERNS = ['MW', 'TTh', 'M', 'T', 'W', 'Th', 'F']

const TIME_SLOTS = PATTERNS.flatMap((pattern) =>
  BLOCKS.map((block) => {
    const range = parseTimeRange(block)
    if (!range) throw new Error(`the grid itself does not parse: ${block}`)
    return {
      id: `${pattern} ${block}`,
      days: parseDayPattern(pattern) ?? [],
      start_time: range.start,
      end_time: range.end,
    }
  }),
)

/**
 * Rooms as the app composes them: `'<building code> <number>'`, e.g. `UW1 050`.
 *
 * This is worth being explicit about, because the `rooms` table does **not**
 * hold that string. `useRooms` joins `buildings` and builds the label from
 * `code` and `room_number`; the seed derives the rooms themselves from these
 * very labels by splitting on the space. A room list labelled any other way
 * matches nothing at all, which is the failure `resolves every real room`
 * below exists to catch.
 */
const ROOM_LABELS = [...new Set(records.map((r) => r.room).filter((r) => r && r !== '* *'))]
const ROOMS = ROOM_LABELS.map((label) => ({ id: `room:${label}`, label: label! }))

/** Every name that appears in the schedules, all still on the roster. */
const NAMES = [...new Set(records.map((r) => r.instructor!).filter(Boolean))]
const instructorId = (raw: string) => `i:${raw}`

/**
 * The fixture rows, shaped the way `teaching_history` holds them.
 *
 * Course and instructor resolution is an identity map on purpose. The seed SQL
 * resolves those by joining on course number and `full_name`, and reproducing
 * that join in TypeScript would test a reading of a Python file rather than the
 * planner. What is real here is the part the planner has opinions about: the
 * times, the days, the rooms, the section letters and the caps.
 */
const HISTORY: HistoryRow[] = records.map((r, i) => {
  const range = r.time ? parseTimeRange(r.time) : null
  return {
    id: `h${i}`,
    course_id: `c${r.course}`,
    instructor_id: r.instructor ? instructorId(r.instructor) : null,
    instructor_name_raw: r.instructor ?? '',
    course_code_raw: `CSS ${r.course}`,
    academic_year: r.academic_year ?? '',
    quarter: r.quarter as Quarter,
    section_letter: r.section || null,
    days: r.days ? parseDayPattern(r.days) : null,
    start_time: range?.start ?? null,
    end_time: range?.end ?? null,
    room_label: r.room && r.room !== '* *' ? r.room : null,
    // The CSV does not carry modality; the planner is expected to default it.
    modality: null,
    enrollment_cap: r.limit ? parseInt(r.limit, 10) : null,
  }
})

const TERMS = [
  { id: 'au', quarter: 'autumn' as Quarter },
  { id: 'wi', quarter: 'winter' as Quarter },
  { id: 'sp', quarter: 'spring' as Quarter },
]

function input(over: Partial<SeedInput> = {}): SeedInput {
  return {
    history: HISTORY,
    terms: TERMS,
    timeSlots: TIME_SLOTS,
    rooms: ROOMS,
    activeInstructorIds: new Set(NAMES.map(instructorId)),
    ...over,
  }
}

const plan = planFromHistory(input())

/** How many rows the published schedules marked "to be arranged". */
const ARRANGED = records.filter((r) => r.arranged === 'True').length
const TIMED = records.length - ARRANGED

describe('the fixture this rests on', () => {
  it('is all 240 real rows, with the grid and rooms they were taught in', () => {
    expect(records).toHaveLength(240)
    expect(TIME_SLOTS).toHaveLength(42)
    expect(ROOMS).toHaveLength(37)
    expect(NAMES).toHaveLength(59)
    // The split that explains why `teaching_history` holds 199 rows live: the
    // seed SQL excludes the arranged ones, and this test does not.
    expect(TIMED).toBe(199)
    expect(ARRANGED).toBe(41)
  })
})

describe('seeding a scenario from the real year', () => {
  it('carries every row across and skips nothing', () => {
    expect(plan.skipped).toEqual([])
    expect(plan.sections).toHaveLength(records.length)
    expect(plan.stats.sections).toBe(records.length)
    expect(plan.stats.merged).toBe(0)
  })

  /*
   * The one that would quietly ruin a cold start. A published time that does
   * not match the grid becomes a custom meeting: still correct, but it stops
   * being a slot the board can reason about as a block, and 199 of them would
   * mean the grid in the database does not describe the schedule it was built
   * from.
   */
  it('puts every published meeting on the grid, with nothing custom', () => {
    expect(plan.stats.customTimes).toBe(0)
    const timed = plan.sections.filter((s) => !s.is_arranged)
    expect(timed).toHaveLength(TIMED)
    expect(timed.every((s) => s.time_slot_id !== null)).toBe(true)
    expect(timed.every((s) => s.custom_days === null && s.custom_start === null)).toBe(true)
  })

  /*
   * 41 real sections had no time at all. They are not errors and must not be
   * skipped: an arranged section is a section the coordinator still has to
   * place, and losing it loses the fact that the course was offered.
   */
  it('keeps the arranged sections as arranged rather than dropping them', () => {
    expect(plan.stats.arranged).toBe(ARRANGED)
    const arranged = plan.sections.filter((s) => s.is_arranged)
    expect(arranged).toHaveLength(ARRANGED)
    expect(arranged.every((s) => s.time_slot_id === null)).toBe(true)
    // In the real data these are the TBA sections, with no instructor named.
    expect(arranged.every((s) => s.instructorIds.length === 0)).toBe(true)
  })

  it('resolves every real room', () => {
    expect(plan.stats.roomsUnresolved).toBe(0)
    const withRoom = records.filter((r) => r.room && r.room !== '* *').length
    expect(plan.sections.filter((s) => s.room_id !== null)).toHaveLength(withRoom)
  })

  /*
   * The trap, pinned. `rooms.room_number` on its own is `'050'`, and a room
   * list built from it — rather than from `buildings.code` joined on, the way
   * `useRooms` does it — resolves *nothing*, silently, on every row. The whole
   * year would land with no rooms and the room-clash check would have nothing
   * to work with.
   */
  it('resolves nothing when the room labels are missing their building', () => {
    const numbersOnly = ROOMS.map((r) => ({ id: r.id, label: r.label.split(' ')[1]! }))
    const bare = planFromHistory(input({ rooms: numbersOnly }))
    expect(bare.stats.roomsUnresolved).toBeGreaterThan(190)
    expect(bare.sections.every((s) => s.room_id === null)).toBe(true)
  })

  it('files each quarter under its own term', () => {
    const counts = new Map<string, number>()
    for (const s of plan.sections) counts.set(s.term_id, (counts.get(s.term_id) ?? 0) + 1)
    for (const { id, quarter } of TERMS) {
      expect(counts.get(id)).toBe(records.filter((r) => r.quarter === quarter).length)
    }
  })

  it('keeps the section letters, and gives one course one letter per quarter', () => {
    expect([...new Set(plan.sections.map((s) => s.section_letter))].sort()).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
      'G',
    ])
    const keys = plan.sections.map((s) => `${s.term_id}|${s.course_id}|${s.section_letter}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('assigns everybody the schedules named', () => {
    const named = records.filter((r) => r.instructor).length
    expect(plan.stats.assignments).toBe(named)
    expect(plan.stats.instructorsDropped).toBe(0)
  })

  /*
   * Somebody in the 2025-26 schedule has since left — one, in the live data.
   * Their section is still real and still has to be created; it is the
   * assignment that cannot be carried, and the coordinator is told so rather
   * than finding an unfamiliar name in a draft.
   */
  it('drops the assignment but keeps the section when somebody has left', () => {
    const gone = NAMES[0]!
    const theirRows = records.filter((r) => r.instructor === gone).length
    expect(theirRows).toBeGreaterThan(0)
    const without = planFromHistory(
      input({ activeInstructorIds: new Set(NAMES.slice(1).map(instructorId)) }),
    )
    expect(without.sections).toHaveLength(records.length)
    expect(without.stats.instructorsDropped).toBe(theirRows)
    expect(without.stats.assignments).toBe(plan.stats.assignments - theirRows)
  })

  /*
   * The sentence in the New scenario dialog. It is the only description of this
   * plan the coordinator ever sees before committing to it, so it is checked
   * against the real numbers rather than assumed.
   */
  it('describes itself truthfully in the dialog', () => {
    expect(describePlan(plan)).toBe('240 sections · 199 assignments · 41 to be arranged')
  })
})
