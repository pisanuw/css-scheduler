import { describe, expect, it } from 'vitest'
import { filterCandidates, rankCandidates } from './suitability'
import type { Instructor, Preferences, ScheduleSnapshot, Section } from './conflicts'

const MW_EARLY = { days: [1, 3], start: '08:45', end: '10:45' }
const MW_LATE = { days: [1, 3], start: '13:15', end: '15:15' }

const sec = (over: Partial<Section> = {}): Section => ({
  id: 's1',
  termId: 'au',
  courseId: 'c143',
  courseCode: 'CSS 143',
  sectionLetter: 'A',
  meeting: MW_EARLY,
  modality: 'in_person',
  roomId: null,
  instructorIds: [],
  ...over,
})

const inst = (id: string, name: string, over: Partial<Instructor> = {}): Instructor => ({
  id,
  name,
  annualTarget: 8,
  maxPerQuarter: 3,
  ...over,
})

const prefs = (instructorId: string, over: Partial<Preferences> = {}): Preferences => ({
  instructorId,
  unavailableTermIds: [],
  desiredCountByTerm: {},
  courseTier: {},
  blockedDays: [],
  modalityPrefs: [],
  maxNewPreps: null,
  ...over,
})

function snapshot(over: Partial<ScheduleSnapshot> = {}): ScheduleSnapshot {
  return {
    terms: [
      { id: 'au', quarter: 'autumn', label: 'Autumn' },
      { id: 'wi', quarter: 'winter', label: 'Winter' },
    ],
    sections: [sec()],
    instructors: [inst('i1', 'Ada')],
    preferences: {},
    taughtBefore: {},
    ...over,
  }
}

const by = (id: string) => (cs: ReturnType<typeof rankCandidates>) =>
  cs.find((c) => c.instructorId === id)!

describe('rankCandidates', () => {
  it('prefers the person who wants the course over the one who is merely willing', () => {
    const snap = snapshot({
      instructors: [inst('i1', 'Willing'), inst('i2', 'Eager')],
      preferences: {
        i1: prefs('i1', { courseTier: { c143: 'willing' } }),
        i2: prefs('i2', { courseTier: { c143: 'eager' } }),
      },
      taughtBefore: { i1: new Set(['c143']), i2: new Set(['c143']) },
    })
    expect(rankCandidates(snap, sec()).map((c) => c.name)).toEqual(['Eager', 'Willing'])
  })

  it('prefers someone who said nothing over someone who would rather not', () => {
    const snap = snapshot({
      instructors: [inst('i1', 'Reluctant'), inst('i2', 'Silent')],
      preferences: { i1: prefs('i1', { courseTier: { c143: 'reluctant' } }) },
    })
    expect(rankCandidates(snap, sec()).map((c) => c.name)).toEqual(['Silent', 'Reluctant'])
  })

  it('puts someone who cannot teach it last, but still lists them', () => {
    const snap = snapshot({
      instructors: [inst('i1', 'Cannot'), inst('i2', 'Anyone')],
      preferences: { i1: prefs('i1', { courseTier: { c143: 'unqualified' } }) },
    })
    const ranked = rankCandidates(snap, sec())
    expect(ranked.map((c) => c.name)).toEqual(['Anyone', 'Cannot'])
    expect(by('i1')(ranked).warnings).toContain('says they cannot teach this')
  })

  it('flags a time clash with something they already teach that quarter', () => {
    const snap = snapshot({
      sections: [sec(), sec({ id: 's2', courseId: 'c342', courseCode: 'CSS 342', instructorIds: ['i1'] })],
    })
    expect(by('i1')(rankCandidates(snap, sec())).wouldClash).toBe(true)
  })

  it('does not flag a clash against a section at a different time', () => {
    const snap = snapshot({
      sections: [
        sec(),
        sec({ id: 's2', courseId: 'c342', courseCode: 'CSS 342', meeting: MW_LATE, instructorIds: ['i1'] }),
      ],
    })
    expect(by('i1')(rankCandidates(snap, sec())).wouldClash).toBe(false)
  })

  it('does not flag a clash against a section in another quarter', () => {
    const snap = snapshot({
      sections: [sec(), sec({ id: 's2', termId: 'wi', instructorIds: ['i1'] })],
    })
    expect(by('i1')(rankCandidates(snap, sec())).wouldClash).toBe(false)
  })

  it('does not treat the section itself as a clash when they are already on it', () => {
    const snap = snapshot({ sections: [sec({ instructorIds: ['i1'] })] })
    expect(by('i1')(rankCandidates(snap, sec({ instructorIds: ['i1'] }))).wouldClash).toBe(false)
  })

  it('flags a quarter they marked unavailable', () => {
    const snap = snapshot({ preferences: { i1: prefs('i1', { unavailableTermIds: ['au'] }) } })
    const c = by('i1')(rankCandidates(snap, sec()))
    expect(c.unavailableThisTerm).toBe(true)
    expect(c.warnings).toContain('marked this quarter unavailable')
  })

  it('flags a day they asked to keep free', () => {
    const snap = snapshot({ preferences: { i1: prefs('i1', { blockedDays: [3] }) } })
    expect(by('i1')(rankCandidates(snap, sec())).blockedDay).toBe(true)
  })

  it('does not invent a blocked day for someone who never submitted', () => {
    expect(by('i1')(rankCandidates(snapshot(), sec())).blockedDay).toBe(false)
  })

  it('flags the assignment that would breach a per-quarter cap', () => {
    const snap = snapshot({
      instructors: [inst('i1', 'Ada', { maxPerQuarter: 1 })],
      sections: [sec(), sec({ id: 's2', meeting: MW_LATE, instructorIds: ['i1'] })],
    })
    const c = by('i1')(rankCandidates(snap, sec()))
    expect(c.atQuarterMax).toBe(true)
    expect(c.warnings).toContain('over their 1 a quarter')
  })

  it('does not count the cap against someone already on the section', () => {
    const snap = snapshot({
      instructors: [inst('i1', 'Ada', { maxPerQuarter: 1 })],
      sections: [sec({ instructorIds: ['i1'] })],
    })
    expect(by('i1')(rankCandidates(snap, sec({ instructorIds: ['i1'] }))).atQuarterMax).toBe(false)
  })

  it('warns once the assignment would push them past their annual target', () => {
    const snap = snapshot({
      instructors: [inst('i1', 'Ada', { annualTarget: 1, maxPerQuarter: 9 })],
      sections: [sec(), sec({ id: 's2', termId: 'wi', instructorIds: ['i1'] })],
    })
    expect(by('i1')(rankCandidates(snap, sec())).warnings).toContain('over their target of 1')
  })

  it('says nothing about the target of a per-course hire', () => {
    const snap = snapshot({ instructors: [inst('i1', 'Hire', { annualTarget: null })] })
    expect(by('i1')(rankCandidates(snap, sec())).warnings).not.toContain('over their target of null')
  })

  it('calls out a new preparation but does not weigh it heavily', () => {
    const snap = snapshot({
      instructors: [inst('i1', 'Taught it'), inst('i2', 'Has not')],
      preferences: {
        i1: prefs('i1', { courseTier: { c143: 'eager' } }),
        i2: prefs('i2', { courseTier: { c143: 'eager' } }),
      },
      taughtBefore: { i1: new Set(['c143']) },
    })
    const ranked = rankCandidates(snap, sec())
    expect(ranked.map((c) => c.name)).toEqual(['Taught it', 'Has not'])
    expect(by('i2')(ranked).warnings).toContain('new preparation')
    // A new prep must not outrank a hard objection.
    expect(by('i2')(ranked).score).toBeLessThan(1000)
  })

  it('breaks an exact tie towards whoever has the most room left', () => {
    const snap = snapshot({
      instructors: [inst('i1', 'Busy', { annualTarget: 8 }), inst('i2', 'Free', { annualTarget: 8 })],
      sections: [
        sec(),
        sec({ id: 's2', termId: 'wi', instructorIds: ['i1'] }),
        sec({ id: 's3', termId: 'wi', meeting: MW_LATE, instructorIds: ['i1'] }),
      ],
      taughtBefore: { i1: new Set(['c143']), i2: new Set(['c143']) },
    })
    expect(rankCandidates(snap, sec()).map((c) => c.name)).toEqual(['Free', 'Busy'])
  })

  it('reports current load so the list can show it without recounting', () => {
    const snap = snapshot({
      sections: [
        sec(),
        sec({ id: 's2', meeting: MW_LATE, instructorIds: ['i1'] }),
        sec({ id: 's3', termId: 'wi', instructorIds: ['i1'] }),
      ],
    })
    const c = by('i1')(rankCandidates(snap, sec()))
    expect(c.assignedThisTerm).toBe(1)
    expect(c.assignedTotal).toBe(2)
  })

  it('ranks a clash as worse than being merely reluctant', () => {
    const snap = snapshot({
      instructors: [inst('i1', 'Clashing'), inst('i2', 'Reluctant')],
      sections: [sec(), sec({ id: 's2', instructorIds: ['i1'] })],
      preferences: { i2: prefs('i2', { courseTier: { c143: 'reluctant' } }) },
    })
    expect(rankCandidates(snap, sec()).map((c) => c.name)).toEqual(['Reluctant', 'Clashing'])
  })

  it('has no caveat at all for the ideal candidate', () => {
    const snap = snapshot({
      preferences: { i1: prefs('i1', { courseTier: { c143: 'eager' } }) },
      taughtBefore: { i1: new Set(['c143']) },
    })
    const c = by('i1')(rankCandidates(snapshot({ ...snap }), sec()))
    expect(c.warnings).toEqual([])
    expect(c.score).toBe(0)
  })

  it('treats an arranged section as clashing with nothing', () => {
    const snap = snapshot({
      sections: [sec({ meeting: null }), sec({ id: 's2', instructorIds: ['i1'] })],
    })
    expect(by('i1')(rankCandidates(snap, sec({ meeting: null }))).wouldClash).toBe(false)
  })
})

describe('filterCandidates', () => {
  const snap = snapshot({ instructors: [inst('i1', 'Ada Lovelace'), inst('i2', 'Grace Hopper')] })
  const all = rankCandidates(snap, sec())

  it('matches any part of the name, ignoring case', () => {
    expect(filterCandidates(all, 'hop').map((c) => c.name)).toEqual(['Grace Hopper'])
    expect(filterCandidates(all, 'ADA').map((c) => c.name)).toEqual(['Ada Lovelace'])
  })

  it('returns everyone for an empty query', () => {
    expect(filterCandidates(all, '   ')).toHaveLength(2)
  })
})
