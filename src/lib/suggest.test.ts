import { describe, expect, it } from 'vitest'
import { suggestAssignments } from './suggest'
import { detectConflicts, type Instructor, type Preferences, type ScheduleSnapshot, type Section } from './conflicts'

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

/** Applies suggestions so the result can be checked against the engine. */
function apply(snap: ScheduleSnapshot, result: ReturnType<typeof suggestAssignments>): ScheduleSnapshot {
  const byId = new Map(result.suggestions.map((s) => [s.sectionId, s.instructorId]))
  return {
    ...snap,
    sections: snap.sections.map((s) =>
      byId.has(s.id) ? { ...s, instructorIds: [byId.get(s.id)!] } : s,
    ),
  }
}

describe('suggestAssignments', () => {
  it('suggests nothing when everything is already staffed', () => {
    const r = suggestAssignments(snapshot({ sections: [sec({ instructorIds: ['i1'] })] }))
    expect(r.suggestions).toEqual([])
    expect(r.unfillable).toEqual([])
  })

  it('fills an empty section with the only available person', () => {
    const r = suggestAssignments(snapshot())
    expect(r.suggestions).toHaveLength(1)
    expect(r.suggestions[0]).toMatchObject({ sectionLabel: 'CSS 143 A', instructorName: 'Ada' })
  })

  it('prefers whoever wants the course', () => {
    const r = suggestAssignments(
      snapshot({
        instructors: [inst('i1', 'Indifferent'), inst('i2', 'Keen')],
        preferences: { i2: prefs('i2', { courseTier: { c143: 'eager' } }) },
      }),
    )
    expect(r.suggestions[0]!.instructorName).toBe('Keen')
  })

  it('never proposes someone who said they cannot teach it', () => {
    const r = suggestAssignments(
      snapshot({
        instructors: [inst('i1', 'Cannot')],
        preferences: { i1: prefs('i1', { courseTier: { c143: 'unqualified' } }) },
      }),
    )
    expect(r.suggestions).toEqual([])
    expect(r.unfillable[0]!.reason).toContain('cannot teach it')
  })

  it('never proposes someone away that quarter', () => {
    const r = suggestAssignments(
      snapshot({ preferences: { i1: prefs('i1', { unavailableTermIds: ['au'] }) } }),
    )
    expect(r.suggestions).toEqual([])
    expect(r.unfillable[0]!.reason).toContain('away that quarter')
  })

  it('never proposes someone already teaching at that hour', () => {
    const r = suggestAssignments(
      snapshot({
        sections: [sec({ id: 's1' }), sec({ id: 's2', courseId: 'c342', instructorIds: ['i1'] })],
      }),
    )
    expect(r.suggestions).toEqual([])
    expect(r.unfillable[0]!.reason).toContain('busy at that hour')
  })

  it('never proposes someone at their quarterly cap', () => {
    const r = suggestAssignments(
      snapshot({
        instructors: [inst('i1', 'Full', { maxPerQuarter: 1 })],
        sections: [sec({ id: 's1' }), sec({ id: 's2', meeting: MW_LATE, instructorIds: ['i1'] })],
      }),
    )
    expect(r.suggestions).toEqual([])
    expect(r.unfillable[0]!.reason).toContain('at their limit')
  })

  it('does not put one person in two places at once', () => {
    // Two sections at the same hour, one person able to take either.
    const snap = snapshot({
      sections: [
        sec({ id: 's1', courseId: 'c143' }),
        sec({ id: 's2', courseId: 'c342', courseCode: 'CSS 342' }),
      ],
    })
    const r = suggestAssignments(snap)
    expect(r.suggestions).toHaveLength(1)
    expect(r.unfillable).toHaveLength(1)
    expect(detectConflicts(apply(snap, r)).filter((c) => c.severity === 'error')).toEqual([])
  })

  it('places the most constrained section first, so a rare fit is not stolen', () => {
    // Only Specialist can teach c500; both can teach c143. They clash, so
    // taking them in the wrong order would leave c500 unstaffed.
    const snap = snapshot({
      instructors: [inst('i1', 'Generalist'), inst('i2', 'Specialist')],
      sections: [
        sec({ id: 'common', courseId: 'c143', courseCode: 'CSS 143' }),
        sec({ id: 'rare', courseId: 'c500', courseCode: 'CSS 500' }),
      ],
      preferences: {
        i1: prefs('i1', { courseTier: { c500: 'unqualified' } }),
      },
    })
    const r = suggestAssignments(snap)
    expect(r.suggestions).toHaveLength(2)
    const byLabel = Object.fromEntries(r.suggestions.map((s) => [s.sectionLabel, s.instructorName]))
    expect(byLabel['CSS 500 A']).toBe('Specialist')
    expect(byLabel['CSS 143 A']).toBe('Generalist')
  })

  it('never introduces an error the conflict engine would report', () => {
    const snap = snapshot({
      instructors: [inst('i1', 'Ada', { maxPerQuarter: 2 }), inst('i2', 'Grace', { maxPerQuarter: 2 })],
      sections: [
        sec({ id: 'a', courseId: 'c143', meeting: MW_EARLY }),
        sec({ id: 'b', courseId: 'c342', courseCode: 'CSS 342', meeting: MW_EARLY }),
        sec({ id: 'c', courseId: 'c360', courseCode: 'CSS 360', meeting: MW_LATE }),
        sec({ id: 'd', courseId: 'c370', courseCode: 'CSS 370', meeting: MW_LATE }),
        sec({ id: 'e', courseId: 'c380', courseCode: 'CSS 380', termId: 'wi', meeting: MW_EARLY }),
      ],
    })
    const r = suggestAssignments(snap)
    const errors = detectConflicts(apply(snap, r)).filter((c) => c.severity === 'error')
    expect(errors).toEqual([])
    expect(r.suggestions.length).toBeGreaterThan(0)
  })

  it('warns about a soft objection rather than refusing it', () => {
    const r = suggestAssignments(
      snapshot({
        instructors: [inst('i1', 'Reluctant')],
        preferences: { i1: prefs('i1', { courseTier: { c143: 'reluctant' }, blockedDays: [1] }) },
      }),
    )
    expect(r.suggestions).toHaveLength(1)
    expect(r.suggestions[0]!.warnings).toContain('would rather not')
    expect(r.suggestions[0]!.warnings).toContain('meets on a day they keep free')
  })

  it('reports an empty roster plainly', () => {
    const r = suggestAssignments(snapshot({ instructors: [] }))
    expect(r.unfillable[0]!.reason).toBe('there are no instructors on the roster')
  })

  it('returns suggestions in calendar then course order', () => {
    const snap = snapshot({
      instructors: [inst('i1', 'A'), inst('i2', 'B'), inst('i3', 'C')],
      sections: [
        sec({ id: 'x', termId: 'wi', courseId: 'c360', courseCode: 'CSS 360', meeting: MW_LATE }),
        sec({ id: 'y', termId: 'au', courseId: 'c342', courseCode: 'CSS 342', meeting: MW_LATE }),
        sec({ id: 'z', termId: 'au', courseId: 'c143', courseCode: 'CSS 143', meeting: MW_EARLY }),
      ],
    })
    const r = suggestAssignments(snap)
    expect(r.suggestions.map((s) => s.sectionLabel)).toEqual(['CSS 143 A', 'CSS 342 A', 'CSS 360 A'])
  })

  it('spreads work rather than loading one person to their target', () => {
    const snap = snapshot({
      instructors: [inst('i1', 'Ada', { annualTarget: 2, maxPerQuarter: 9 }), inst('i2', 'Grace', { annualTarget: 2, maxPerQuarter: 9 })],
      sections: [
        sec({ id: 'a', courseId: 'c143', meeting: MW_EARLY }),
        sec({ id: 'b', courseId: 'c342', courseCode: 'CSS 342', meeting: MW_LATE }),
      ],
    })
    const names = suggestAssignments(snap).suggestions.map((s) => s.instructorName)
    expect(new Set(names).size).toBe(2)
  })
})
