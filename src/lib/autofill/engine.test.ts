import { describe, expect, it } from 'vitest'
import { autofill, fitFor } from './engine'
import { meetingsClash, type GlanceSection } from './glance'
import type { CourseWish, FacultyPrefs, YearQuarter } from './prefs'
import { breaks, type TimeRule } from './text'

const h = (hh: number, mm = 0) => hh * 60 + mm

let rowNo = 10
function sec(quarter: YearQuarter, label: string, start: number | null, days = [1, 3], extra: Partial<GlanceSection> = {}): GlanceSection {
  const row = rowNo++
  const m = /^(SKL)?(\d{3})([A-Z]*)$/.exec(label)
  const keys = extra.keys ?? (m ? [`${m[1] ?? ''}${m[2]}`] : [label])
  return {
    id: `${quarter}:${row}`,
    quarter,
    row,
    label,
    keys,
    letter: m?.[3] || null,
    load: 1,
    meeting: start === null ? null : { days, start, end: start + 120 },
    when: '',
    timing: start === null ? 'online' : 'scheduled',
    cap: 40,
    category: 'core',
    fixed: null,
    proposed: null,
    external: false,
    tsNotes: '',
    notes: '',
    reserved: false,
    hybrid: false,
    online: start === null,
    graduate: keys.some((k) => Number(/\d{3}/.exec(k)?.[0]) >= 500),
    lab: !!m?.[1],
    placeholder: false,
    ...extra,
  }
}

const wish = (key: string, more: Partial<CourseWish> = {}): CourseWish => ({ key, quarters: [], counts: {}, times: [], days: null, letter: null, ...more })

/** Quarter caps default to the whole load, so a test only meets a cap when it sets one. */
function person(name: string, target: number, desired: (string | CourseWish)[], more: Partial<FacultyPrefs> = {}): FacultyPrefs {
  const max = target
  return {
    name,
    kind: 'full-time',
    target,
    quarterMax: { autumn: max, winter: max, spring: max },
    sixMonthMax: null,
    yearMax: null,
    pinned: [],
    desired: desired.map((d) => (typeof d === 'string' ? wish(d) : d)),
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
    ...more,
  }
}

const who = (r: ReturnType<typeof autofill>, id: string) => r.placements.find((p) => p.section.id === id)?.faculty ?? null
const loadOf = (r: ReturnType<typeof autofill>, name: string) => r.faculty.find((f) => f.prefs.name === name)!.load

describe('autofill', () => {
  it('fills a load with the courses asked for, first choices first', () => {
    const a = sec('autumn', '342A', h(11))
    const b = sec('winter', '343A', h(13, 15))
    const c = sec('spring', '385A', h(11))
    const r = autofill([a, b, c], [person('F1', 2, ['343', '342', '385'])], [], { placePartTime: false })
    expect(r.placements.map((p) => p.section.label).sort()).toEqual(['342A', '343A'])
    expect(r.placements.find((p) => p.section.label === '343A')!.reasons).toContain('#1 of their most-wanted')
  })

  it('gives a contested section to whoever it matters more to, and says who else wanted it', () => {
    const x = sec('autumn', '427A', h(13, 15))
    const y = sec('autumn', '430A', h(15, 30))
    const r = autofill([x, y], [person('F8', 1, ['427', '430']), person('F21', 1, ['427'])], [], { placePartTime: false })
    // F21 has no other option, so F21 teaches 427 and F8 still gets a course they listed.
    expect(who(r, x.id)).toBe('F21')
    expect(who(r, y.id)).toBe('F8')
    expect(r.placements.find((p) => p.section.id === x.id)!.alsoWanted).toEqual(['F8 (#1)'])
  })

  it('puts the coordinator’s pinned courses ahead of anybody’s first choice', () => {
    const s = sec('winter', '502A', null)
    const r = autofill([s], [person('F1', 1, ['343'], { pinned: ['502'] }), person('F6', 1, ['502'])], [], { placePartTime: false })
    expect(who(r, s.id)).toBe('F1')
  })

  it('reads a pinned list as one of each, not the easiest one twice', () => {
    const sections = [sec('winter', '343C', h(15, 30)), sec('spring', '343A', h(17, 45), [2, 4]), sec('spring', '584A', h(15, 30), [1]), sec('winter', '502A', null)]
    const f6 = person('F6', 1, ['502', '343'])
    const r = autofill(sections, [person('F1', 3, [], { pinned: ['502', '584', '343'] }), f6], [], { placePartTime: false })
    const f1 = r.faculty.find((f) => f.prefs.name === 'F1')!
    expect(f1.placed.map((s) => s.keys[0]).sort()).toEqual(['343', '502', '584'])
  })

  it('reads named quarters as one section each, not as many as will fit', () => {
    const sections = [
      sec('autumn', '497E', h(13, 15)),
      sec('autumn', '497G', h(17, 45)),
      sec('autumn', '360D', h(17, 45), [2, 4]),
      sec('winter', '497E', h(11), [2, 4]),
      sec('winter', '421A', h(11)),
    ]
    const r = autofill(sections, [person('F2', 4, [wish('497', { quarters: ['autumn', 'winter'] }), wish('421', { quarters: ['winter'] }), wish('360', { quarters: ['autumn'] })])], [], {
      placePartTime: false,
    })
    expect(r.placements.map((p) => `${p.section.quarter} ${p.section.label}`).sort()).toEqual(['autumn 360D', 'autumn 497E', 'winter 421A', 'winter 497E'])
  })

  it('honours counts asked for in a quarter', () => {
    const sections = [sec('autumn', '342A', h(11)), sec('autumn', '342B', h(13, 15)), sec('autumn', '343A', h(15, 30))]
    const r = autofill(sections, [person('F3', 2, [wish('343'), wish('342', { counts: { autumn: 2 } })])], [], { placePartTime: false })
    expect(r.placements.map((p) => p.section.label).sort()).toEqual(['342A', '342B'])
  })

  it('never breaks a hard rule, and names the soft ones it had to', () => {
    const late = sec('autumn', '343A', h(17, 45), [2, 4])
    const early = sec('autumn', '343B', h(11), [2, 4])
    const noLate: TimeRule = { kind: 'startAfter', at: h(13, 15), strength: 'hard' }
    const r = autofill([late, early], [person('F13', 2, ['343'], { rules: [noLate] })], [], { placePartTime: false })
    expect(r.placements.map((p) => p.section.label)).toEqual(['343B'])
    expect(r.faculty[0]!.gap).toBe(1)
    expect(fitFor(person('F13', 2, ['343'], { rules: [noLate] }), late)).toMatch(/said: no starting after 1:15 PM/)

    const soft: TimeRule = { kind: 'avoid', start: h(17, 45), end: 24 * 60, strength: 'soft' }
    const s = autofill([late], [person('F17', 1, ['343'], { rules: [soft] })], [], { placePartTime: false })
    expect(s.placements[0]!.caveats.join(' ')).toMatch(/prefer not 5:45 PM/)
  })

  it('keeps a quarter someone is away empty', () => {
    const w = sec('winter', '342A', h(11))
    const r = autofill([w], [person('F20', 1, ['342'], { quarterMax: { autumn: 2, winter: 0, spring: 2 } })], [], { placePartTime: false })
    expect(r.placements).toEqual([])
    expect(r.open[0]!.fullTime).toEqual([{ name: 'F20', kind: 'full-time', note: 'not teaching in Win' }])
  })

  it('shares a shortfall rather than leaving it all on one person', () => {
    const sections = [sec('autumn', '342A', h(11)), sec('winter', '342A', h(11)), sec('spring', '342A', h(11))]
    const r = autofill(sections, [person('A', 2, ['342']), person('B', 2, ['342'])], [], { placePartTime: false })
    expect([loadOf(r, 'A'), loadOf(r, 'B')].sort()).toEqual([1, 2])
    const four = [...sections, sec('autumn', '342B', h(13, 15))]
    const r4 = autofill(four, [person('A', 3, ['342']), person('B', 3, ['342'])], [], { placePartTime: false })
    expect([loadOf(r4, 'A'), loadOf(r4, 'B')]).toEqual([2, 2])
  })

  it('places a course’s own lab with its lecture, and a skills lab that meets with it too', () => {
    const lecture = sec('autumn', '427A', h(13, 15))
    const lab = sec('autumn', '427 Lab', h(9, 30), [5], { keys: ['427'], lab: true, load: 0.5 })
    const r = autofill([lecture, lab], [person('F8', 1.5, ['427'])], [], { placePartTime: false })
    expect(r.placements.map((p) => p.section.label).sort()).toEqual(['427 Lab', '427A'])

    const course = sec('winter', '123A', h(13, 15), [1, 3], { load: 0.5 })
    const skills = sec('winter', 'SKL123A', h(13, 15), [3], { load: 0.5 })
    const w = autofill([course, skills], [person('F22', 1, ['SKL123', '123'])], [], { placePartTime: false })
    expect(w.placements.map((p) => p.section.label).sort()).toEqual(['123A', 'SKL123A'])
  })

  it('uses a reserved section only when nothing else will do', () => {
    const reserved = sec('autumn', '342C', h(15, 30), [1, 3], { reserved: true })
    const regular = sec('autumn', '342D', h(11), [2, 4])
    const r = autofill([reserved, regular], [person('F12', 1, ['342'])], [], { placePartTime: false })
    expect(r.placements.map((p) => p.section.label)).toEqual(['342D'])
    const only = autofill([reserved], [person('F12', 1, ['342'])], [], { placePartTime: false })
    expect(only.placements[0]!.caveats).toContain('reserved section: may not run')
  })

  it('counts names already in the sheet toward the load, and never moves them', () => {
    const fixed = sec('autumn', '342A', h(11), [1, 3], { fixed: 'F3' })
    const open = sec('autumn', '343A', h(11), [1, 3])
    const other = sec('winter', '343A', h(11), [1, 3])
    const r = autofill([fixed, open, other], [person('F3', 2, ['343'])], [], { placePartTime: false })
    // 343A in autumn clashes with the 342A they already have; winter's does not.
    expect(r.placements.map((p) => p.section.id)).toEqual([other.id])
    expect(loadOf(r, 'F3')).toBe(2)
  })

  it('offers part-time instructors what is left, within what they asked for', () => {
    const a = sec('autumn', '342A', h(11))
    const b = sec('autumn', '342B', h(17, 45), [2, 4])
    const evenings: TimeRule = { kind: 'only', windows: [{ start: h(17, 45), end: 24 * 60 }], strength: 'hard' }
    const pt: FacultyPrefs = { ...person('P1', 0, ['342'], { rules: [evenings] }), kind: 'part-time', target: null, quarterMax: { autumn: 1, winter: 0, spring: 0 } }
    const off = autofill([a, b], [], [pt], { placePartTime: false })
    expect(off.placements).toEqual([])
    expect(off.open.find((o) => o.section.id === b.id)!.partTime).toEqual([{ name: 'P1', kind: 'part-time', note: 'could take it' }])
    const on = autofill([a, b], [], [pt], { placePartTime: true })
    expect(on.placements.map((p) => [p.section.label, p.faculty, p.kind])).toEqual([['342B', 'P1', 'part-time']])
  })

  describe('department rules', () => {
    const tth: TimeRule = { kind: 'avoid', start: h(13, 15), end: h(15, 15), days: [2, 4], strength: 'hard' }

    it('keep full-time faculty out of what they keep free, and let part-time in', () => {
      const t = sec('winter', '451A', h(13, 15), [2, 4])
      const m = sec('winter', '452A', h(13, 15), [1, 3])
      const pt: FacultyPrefs = { ...person('P1', 0, ['451']), kind: 'part-time', target: null, quarterMax: { autumn: 0, winter: 1, spring: 0 } }
      const r = autofill([t, m], [person('F4', 2, ['451', '452'])], [pt], { placePartTime: true, rules: { 'full-time': [tth] } })
      expect(who(r, m.id)).toBe('F4')
      expect(who(r, t.id)).toBe('P1')

      const alone = autofill([t], [person('F4', 1, ['451'])], [], { placePartTime: false, rules: { 'full-time': [tth] } })
      expect(alone.placements).toEqual([])
      expect(alone.open[0]!.fullTime).toEqual([{ name: 'F4', kind: 'full-time', note: 'department rule: no 1:15 PM-3:15 PM on T/Th' }])
      expect(alone.faculty[0]!.shortBecause).toContain('1 ruled out by the department rules')
    })

    it('bind a lecture through its lab', () => {
      const lecture = sec('autumn', '427A', h(11), [1, 3])
      const lab = sec('autumn', '427 Lab', h(13, 15), [2], { keys: ['427'], lab: true, load: 0.5 })
      const r = autofill([lecture, lab], [person('F8', 1.5, ['427'])], [], { placePartTime: false, rules: { 'full-time': [tth] } })
      expect(r.placements).toEqual([])
      expect(r.open.find((o) => o.section.id === lecture.id)!.fullTime[0]!.note).toBe('427 Lab: department rule: no 1:15 PM-3:15 PM on T/Th')
    })
  })

  it('puts classes back to back for someone who asked for that, and apart for someone who asked not to', () => {
    const labels = (r: ReturnType<typeof autofill>) => r.placements.map((p) => p.section.label).sort()
    const a = sec('autumn', '342A', h(11))
    const b = sec('autumn', '342B', h(13, 15))
    const c = sec('autumn', '342C', h(17, 45))
    // Liking 11:00 and 5:45, they would get A and C — unless back to back matters more.
    const apart = wish('342', { counts: { autumn: 2 }, times: [h(11), h(17, 45)] })
    expect(labels(autofill([a, b, c], [person('F3', 2, [apart])], [], { placePartTime: false }))).toEqual(['342A', '342C'])
    const together = autofill([a, b, c], [person('F3', 2, [apart], { backToBack: 'prefer' })], [], { placePartTime: false })
    expect(labels(together)).toEqual(['342A', '342B'])
    expect(together.placements[0]!.reasons).toContain('back to back with 342B, as they asked')
    // Liking 11:00 and 1:15, they would get A and B — unless they asked not to be back to back.
    const close = wish('342', { counts: { autumn: 2 }, times: [h(11), h(13, 15)] })
    expect(labels(autofill([a, b, c], [person('F3', 2, [close])], [], { placePartTime: false }))).toEqual(['342A', '342B'])
    expect(labels(autofill([a, b, c], [person('F3', 2, [close], { backToBack: 'avoid' })], [], { placePartTime: false }))).not.toEqual(['342A', '342B'])
  })

  it('gives a contested section to a new faculty member, and says why', () => {
    const contested = sec('autumn', '385A', h(15, 30))
    const others = [sec('autumn', '290A', h(11)), sec('autumn', '350A', h(13, 15))]
    // F4 wants 385 first and 290 fifth; F21 wants 385 third and 350 sixth.
    const f4 = person('F4', 1, ['385', '451', '452', '342', '290'])
    const f21 = (more: Partial<FacultyPrefs> = {}) => person('F21', 1, ['416', '427', '385', '301', '310', '350'], more)
    expect(who(autofill([contested, ...others], [f4, f21()], [], { placePartTime: false }), contested.id)).toBe('F4')
    const r = autofill([contested, ...others], [f4, f21({ newFaculty: true })], [], { placePartTime: false })
    expect(who(r, contested.id)).toBe('F21')
    expect(r.placements.find((p) => p.section.id === contested.id)!.reasons).toContain('new faculty, so their wishes count for more')
    // Load is not traded for it: both still teach one.
    expect([loadOf(r, 'F4'), loadOf(r, 'F21')]).toEqual([1, 1])
  })

  it('places a G&O or chair request even when it was not on their list, and says why when it cannot', () => {
    const topics = sec('spring', '490A', h(11), [2, 4])
    const other = sec('spring', '360A', h(11), [1, 3])
    const r = autofill([topics, other], [person('F7', 1, ['360'], { requests: ['490'] })], [], { placePartTime: false })
    expect(who(r, topics.id)).toBe('F7')
    expect(r.placements[0]!.reasons).toContain('a G&O or chair request')
    expect(r.faculty[0]!.requestsMissed).toEqual([])

    const none = autofill([other], [person('F7', 1, ['360'], { requests: ['590'] })], [], { placePartTime: false })
    expect(none.faculty[0]!.requestsMissed).toEqual(['590: not offered this year'])
    // A course the coordinator pinned for someone else comes first; the miss says where it went.
    const pinned = autofill([topics, other], [person('F7', 1, ['360'], { requests: ['490'] }), person('F19', 1, [], { pinned: ['490'] })], [], { placePartTime: false })
    expect(who(pinned, topics.id)).toBe('F19')
    expect(pinned.faculty.find((f) => f.prefs.name === 'F7')!.requestsMissed).toEqual(['490: 1 went to F19'])
  })

  it('reads a request as one section of the course, not every section there is', () => {
    const sections = [sec('autumn', '490A', h(11), [2, 4]), sec('spring', '490B', h(15, 30), [2, 4]), sec('autumn', '211A', h(17, 45), [2, 4]), sec('spring', '478A', h(13, 15))]
    const r = autofill(sections, [person('F24', 2, ['211', '478'], { requests: ['490'] })], [], { placePartTime: false })
    expect(r.placements.map((p) => p.section.keys[0]).sort()).toEqual(['211', '490'])
  })

  it('keeps last run’s proposals when nothing has changed', () => {
    const sections = [sec('autumn', '342A', h(11)), sec('autumn', '342B', h(13, 15))]
    const people = [person('A', 1, ['342']), person('B', 1, ['342'])]
    const first = autofill(sections, people, [], { placePartTime: false })
    const again = autofill(
      sections.map((s) => ({ ...s, proposed: who(first, s.id) })),
      [...people].reverse(),
      [],
      { placePartTime: false },
    )
    expect(again.placements.map((p) => [p.section.id, p.faculty])).toEqual(first.placements.map((p) => [p.section.id, p.faculty]))
  })
})

describe('autofill invariants', () => {
  // A small deterministic generator: schedules and preferences that collide a lot.
  function lcg(seed: number) {
    let s = seed
    return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296
  }

  it('never overloads, double-books, or breaks a hard rule, on many random years', () => {
    const department: TimeRule = { kind: 'avoid', start: h(13, 15), end: h(15, 15), days: [2, 4], strength: 'hard' }
    for (let seed = 1; seed <= 25; seed++) {
      const rand = lcg(seed)
      const courses = ['142', '143', '342', '343', '360', '430', '497', '581']
      const starts = [h(8, 45), h(11), h(13, 15), h(15, 30), h(17, 45), h(20)]
      const quarters: YearQuarter[] = ['autumn', 'winter', 'spring']
      const sections: GlanceSection[] = []
      for (const q of quarters) {
        for (let i = 0; i < 14; i++) {
          const course = courses[Math.floor(rand() * courses.length)]!
          sections.push(
            sec(q, `${course}${String.fromCharCode(65 + i)}`, starts[Math.floor(rand() * starts.length)]!, rand() < 0.5 ? [1, 3] : [2, 4], {
              keys: [course],
              reserved: rand() < 0.15,
              load: rand() < 0.15 ? 0.5 : 1,
            }),
          )
        }
      }
      const people = Array.from({ length: 6 }, (_, i) => {
        const picks = [...courses].sort(() => rand() - 0.5).slice(0, 3)
        const rules: TimeRule[] = rand() < 0.5 ? [{ kind: 'avoid', start: h(20), end: 24 * 60, strength: 'hard' }] : []
        const backToBack = rand() < 0.3 ? 'prefer' : rand() < 0.3 ? 'avoid' : null
        const requests = rand() < 0.3 ? [courses[Math.floor(rand() * courses.length)]!] : []
        return person(`F${i + 1}`, 3 + Math.floor(rand() * 4), picks, { rules, backToBack, requests, newFaculty: rand() < 0.3 })
      })
      const r = autofill(sections, people, [], { placePartTime: false, rules: { 'full-time': [department] } })

      const seen = new Set<string>()
      for (const p of r.placements) {
        expect(seen.has(p.section.id)).toBe(false)
        seen.add(p.section.id)
      }
      for (const f of r.faculty) {
        const mine = f.placed
        expect(f.load).toBeLessThanOrEqual(f.prefs.target! + 1e-9)
        for (const q of quarters) expect(mine.filter((s) => s.quarter === q).reduce((a, s) => a + s.load, 0)).toBeLessThanOrEqual(f.prefs.quarterMax[q] + 1e-9)
        for (let i = 0; i < mine.length; i++)
          for (let j = i + 1; j < mine.length; j++) {
            if (mine[i]!.quarter === mine[j]!.quarter) expect(meetingsClash(mine[i]!.meeting, mine[j]!.meeting)).toBe(false)
          }
        for (const s of mine) {
          for (const rule of [...f.prefs.rules, department]) if (rule.strength === 'hard') expect(breaks(rule, s.meeting, s.quarter)).toBe(false)
          expect(s.keys.some((k) => f.prefs.desired.some((w) => w.key === k) || f.prefs.requests.includes(k))).toBe(true)
        }
      }
      // Anything left open that someone could still take is explained, never silently dropped.
      for (const o of r.open) for (const c of o.fullTime) expect(c.note).not.toBe('')
    }
  })

  it('gives the same answer every time', () => {
    const sections = [sec('autumn', '342A', h(11)), sec('autumn', '342B', h(13, 15)), sec('winter', '343A', h(11))]
    const people = [person('A', 2, ['342', '343']), person('B', 2, ['343', '342'])]
    const a = autofill(sections, people, [], { placePartTime: false })
    const b = autofill(sections, [...people].reverse(), [], { placePartTime: false })
    expect(b.placements.map((p) => [p.section.id, p.faculty])).toEqual(a.placements.map((p) => [p.section.id, p.faculty]))
  })
})
