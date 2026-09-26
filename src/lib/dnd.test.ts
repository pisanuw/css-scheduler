import { describe, expect, it } from 'vitest'
import {
  dragAnnouncement,
  describeDrop,
  dragId,
  dropHints,
  dropId,
  parseDragId,
  parseDropId,
  planDrop,
  withoutAssignment,
  type DragSource,
} from './dnd'
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
    taughtBefore: { i1: new Set(['c143', 'c342']) },
    ...over,
  }
}

describe('drag ids', () => {
  it('round trips a name dragged out of the load panel', () => {
    const source: DragSource = { kind: 'instructor', instructorId: 'i1' }
    expect(parseDragId(dragId(source))).toEqual(source)
  })

  it('round trips a chip dragged off a section card', () => {
    const source: DragSource = { kind: 'assignment', instructorId: 'i1', sectionId: 's1' }
    expect(parseDragId(dragId(source))).toEqual(source)
  })

  it('round trips a section as a drop target', () => {
    expect(parseDropId(dropId('s9'))).toBe('s9')
  })

  it('survives uuids, which is what these ids really are', () => {
    const id = '3f8b1c22-9c0e-4a1f-8a11-0d9e6b5c7a31'
    expect(parseDragId(dragId({ kind: 'instructor', instructorId: id }))).toEqual({
      kind: 'instructor',
      instructorId: id,
    })
    expect(parseDropId(dropId(id))).toBe(id)
  })

  it('returns null rather than throwing on anything unexpected', () => {
    for (const bad of [null, undefined, 42, '', 'instructor:', 'section:', 'nonsense', 'assignment:s1']) {
      expect(parseDragId(bad)).toBeNull()
    }
    for (const bad of [null, undefined, 7, 'instructor:i1', 'section:a:b']) {
      expect(parseDropId(bad)).toBeNull()
    }
  })
})

describe('withoutAssignment', () => {
  it('takes one person off one section and leaves everything else alone', () => {
    const snap = snapshot({
      sections: [
        sec({ id: 's1', instructorIds: ['i1', 'i2'] }),
        sec({ id: 's2', instructorIds: ['i1'] }),
      ],
    })
    const after = withoutAssignment(snap, 's1', 'i1')
    expect(after.sections[0]!.instructorIds).toEqual(['i2'])
    expect(after.sections[1]!.instructorIds).toEqual(['i1'])
    // The original is untouched: the board still renders from it.
    expect(snap.sections[0]!.instructorIds).toEqual(['i1', 'i2'])
  })
})

describe('planDrop', () => {
  const snap = snapshot({
    sections: [
      sec({ id: 's1', instructorIds: ['i1'] }),
      sec({ id: 's2', courseId: 'c342', courseCode: 'CSS 342', meeting: MW_LATE }),
    ],
  })

  it('assigns when a name from the load panel lands on a section', () => {
    expect(planDrop(snap, { kind: 'instructor', instructorId: 'i1' }, 's2')).toEqual({
      type: 'assign',
      instructorId: 'i1',
      sectionId: 's2',
    })
  })

  it('moves when a chip lands on a different section', () => {
    expect(
      planDrop(snap, { kind: 'assignment', instructorId: 'i1', sectionId: 's1' }, 's2'),
    ).toEqual({ type: 'move', instructorId: 'i1', from: 's1', to: 's2' })
  })

  it('says nothing when the drag is dropped on empty space', () => {
    expect(planDrop(snap, { kind: 'instructor', instructorId: 'i1' }, null)).toEqual({
      type: 'none',
      reason: null,
    })
  })

  it('says nothing when a chip is dropped back on its own card', () => {
    expect(
      planDrop(snap, { kind: 'assignment', instructorId: 'i1', sectionId: 's1' }, 's1'),
    ).toEqual({ type: 'none', reason: null })
  })

  it('explains a drop onto a section that person already teaches', () => {
    expect(planDrop(snap, { kind: 'instructor', instructorId: 'i1' }, 's1')).toEqual({
      type: 'none',
      reason: 'Ada is already on CSS 143 A.',
    })
  })

  it('does nothing for a section that is not there any more', () => {
    expect(planDrop(snap, { kind: 'instructor', instructorId: 'i1' }, 'gone')).toEqual({
      type: 'none',
      reason: null,
    })
  })
})

describe('dropHints', () => {
  it('marks the card a chip came from, so it is not a target for itself', () => {
    const snap = snapshot({ sections: [sec({ id: 's1', instructorIds: ['i1'] })] })
    const hints = dropHints(snap, { kind: 'assignment', instructorId: 'i1', sectionId: 's1' }, snap.sections)
    expect(hints.get('s1')).toEqual({ tone: 'source', note: 'From here' })
  })

  it('marks a section the instructor is already on', () => {
    const snap = snapshot({
      sections: [sec({ id: 's1', instructorIds: ['i1'] }), sec({ id: 's2' })],
    })
    const hints = dropHints(snap, { kind: 'assignment', instructorId: 'i1', sectionId: 's2' }, snap.sections)
    expect(hints.get('s1')).toEqual({ tone: 'present', note: 'Already here' })
  })

  it('is plain green for someone free, qualified and under target', () => {
    const snap = snapshot({ sections: [sec({ id: 's1' })] })
    expect(dropHints(snap, { kind: 'instructor', instructorId: 'i1' }, snap.sections).get('s1'))
      .toEqual({ tone: 'ok', note: null })
  })

  it('says so when the course is one they asked for', () => {
    const snap = snapshot({
      sections: [sec({ id: 's1' })],
      preferences: { i1: prefs('i1', { courseTier: { c143: 'eager' } }) },
    })
    expect(dropHints(snap, { kind: 'instructor', instructorId: 'i1' }, snap.sections).get('s1'))
      .toEqual({ tone: 'ok', note: 'wants this course' })
  })

  it('is amber for a soft caveat like a new preparation', () => {
    const snap = snapshot({ sections: [sec({ id: 's1' })], taughtBefore: {} })
    expect(dropHints(snap, { kind: 'instructor', instructorId: 'i1' }, snap.sections).get('s1'))
      .toEqual({ tone: 'caution', note: 'new preparation' })
  })

  it('is red, but still a target, for a clash', () => {
    const snap = snapshot({
      sections: [
        sec({ id: 's1', instructorIds: ['i1'] }),
        sec({ id: 's2', courseId: 'c342', courseCode: 'CSS 342', meeting: MW_EARLY }),
      ],
    })
    const hints = dropHints(snap, { kind: 'instructor', instructorId: 'i1' }, snap.sections)
    expect(hints.get('s2')).toEqual({ tone: 'blocked', note: 'clashes with another section' })
  })

  it('is red when they said they cannot teach the course', () => {
    const snap = snapshot({
      sections: [sec({ id: 's1' })],
      preferences: { i1: prefs('i1', { courseTier: { c143: 'unqualified' } }) },
    })
    expect(dropHints(snap, { kind: 'instructor', instructorId: 'i1' }, snap.sections).get('s1')?.tone)
      .toBe('blocked')
  })

  /**
   * The bug this whole `withoutAssignment` business exists to prevent: moving
   * someone between two sections at the same hour must not report a clash with
   * the one they are leaving.
   */
  it('judges a move against where the instructor is going, not where they are', () => {
    const snap = snapshot({
      sections: [
        sec({ id: 's1', instructorIds: ['i1'] }),
        sec({ id: 's2', courseId: 'c342', courseCode: 'CSS 342', meeting: MW_EARLY }),
      ],
    })
    const moving = dropHints(
      snap,
      { kind: 'assignment', instructorId: 'i1', sectionId: 's1' },
      snap.sections,
    )
    expect(moving.get('s2')).toEqual({ tone: 'ok', note: null })
  })

  it('counts the vacated section against the quarter maximum too', () => {
    const snap = snapshot({
      instructors: [inst('i1', 'Ada', { maxPerQuarter: 1 })],
      sections: [
        sec({ id: 's1', instructorIds: ['i1'] }),
        sec({ id: 's2', courseId: 'c342', courseCode: 'CSS 342', meeting: MW_LATE }),
      ],
    })
    // Dragging the chip is a move, so they end on one section either way.
    expect(
      dropHints(snap, { kind: 'assignment', instructorId: 'i1', sectionId: 's1' }, snap.sections).get('s2'),
    ).toEqual({ tone: 'ok', note: null })
    // Dragging the name is an addition, which would be their second.
    expect(
      dropHints(snap, { kind: 'instructor', instructorId: 'i1' }, snap.sections).get('s2'),
    ).toEqual({ tone: 'blocked', note: 'over their 1 a quarter' })
  })

  it('refuses someone who is not on this year’s roster at all', () => {
    const snap = snapshot({ sections: [sec({ id: 's1' })] })
    expect(dropHints(snap, { kind: 'instructor', instructorId: 'ghost' }, snap.sections).get('s1'))
      .toEqual({ tone: 'blocked', note: 'not on the roster' })
  })
})

describe('describeDrop', () => {
  const snap = snapshot({
    sections: [
      sec({ id: 's1', instructorIds: ['i1'] }),
      sec({ id: 's2', courseId: 'c342', courseCode: 'CSS 342', sectionLetter: 'B' }),
    ],
  })

  it('confirms an assignment', () => {
    expect(describeDrop(snap, { type: 'assign', instructorId: 'i1', sectionId: 's2' })).toBe(
      'Assigned Ada to CSS 342 B.',
    )
  })

  it('confirms a move, naming both ends', () => {
    expect(describeDrop(snap, { type: 'move', instructorId: 'i1', from: 's1', to: 's2' })).toBe(
      'Moved Ada from CSS 143 A to CSS 342 B.',
    )
  })

  it('carries the caveat into the confirmation of a drop that was red', () => {
    expect(
      describeDrop(
        snap,
        { type: 'assign', instructorId: 'i1', sectionId: 's2' },
        { tone: 'blocked', note: 'clashes with another section' },
      ),
    ).toBe('Assigned Ada to CSS 342 B — clashes with another section.')
  })

  it('leaves a green drop unqualified', () => {
    expect(
      describeDrop(
        snap,
        { type: 'assign', instructorId: 'i1', sectionId: 's2' },
        { tone: 'ok', note: 'wants this course' },
      ),
    ).toBe('Assigned Ada to CSS 342 B.')
  })

  it('has nothing to say about a cancelled drag', () => {
    expect(describeDrop(snap, { type: 'none', reason: null })).toBeNull()
  })
})

describe('dragAnnouncement', () => {
  const snap = snapshot({
    sections: [
      sec({ id: 's1', instructorIds: ['i1'] }),
      sec({ id: 's2', courseId: 'c342', courseCode: 'CSS 342', sectionLetter: 'B' }),
    ],
  })

  it('names the person and where they came from', () => {
    expect(
      dragAnnouncement(snap, 'start', dragId({ kind: 'assignment', instructorId: 'i1', sectionId: 's1' }), null),
    ).toBe('Picked up Ada from CSS 143 A.')
  })

  it('names the person alone when the drag started in the load panel', () => {
    expect(dragAnnouncement(snap, 'start', dragId({ kind: 'instructor', instructorId: 'i1' }), null)).toBe(
      'Picked up Ada.',
    )
  })

  it('says where the drag is now', () => {
    const active = dragId({ kind: 'instructor', instructorId: 'i1' })
    expect(dragAnnouncement(snap, 'over', active, dropId('s2'))).toBe('Ada is over CSS 342 B.')
    expect(dragAnnouncement(snap, 'over', active, null)).toBe('Ada is not over a section.')
  })

  it('says what the drop did, or that it did nothing', () => {
    const active = dragId({ kind: 'instructor', instructorId: 'i1' })
    expect(dragAnnouncement(snap, 'end', active, dropId('s2'))).toBe('Dropped Ada on CSS 342 B.')
    expect(dragAnnouncement(snap, 'end', active, null)).toBe(
      'Ada was dropped outside a section, so nothing changed.',
    )
    expect(dragAnnouncement(snap, 'cancel', active, null)).toBe('Cancelled. Ada was not moved.')
  })

  it('says nothing about a drag it cannot make sense of', () => {
    expect(dragAnnouncement(snap, 'start', 'nonsense', null)).toBeUndefined()
  })
})
