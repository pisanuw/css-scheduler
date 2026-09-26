import { describe, expect, it } from 'vitest'
import type { ScenarioChange } from '../hooks/scheduling'
import { groupUndo, isUndoable, myLastUndoable, undoneMessage } from './undo'

const at = (seconds: number) => new Date(Date.UTC(2026, 8, 26, 12, 0, seconds)).toISOString()

const change = (over: Partial<ScenarioChange> & { id: number }): ScenarioChange => ({
  scenario_id: 'sc',
  section_id: 's',
  action: 'assigned',
  summary: 'Laurie Anderson — CSS 343 A',
  actor_email: 'pisan@uw.edu',
  occurred_at: at(0),
  detail: { section_id: 's', instructor_id: 'i' },
  undone_at: null,
  undone_by: null,
  undoes_id: null,
  ...over,
})

describe('isUndoable', () => {
  it('accepts an ordinary change', () => {
    expect(isUndoable(change({ id: 1 }))).toBe(true)
  })

  // The column arrived with the feature; everything logged before it is prose
  // and a timestamp, which is not enough to reverse anything.
  it('refuses an entry recorded before undo existed', () => {
    expect(isUndoable(change({ id: 1, detail: {} }))).toBe(false)
  })

  // The reversal it wrote is what undoes that.
  it('refuses an entry that has already been undone', () => {
    expect(isUndoable(change({ id: 1, undone_at: at(5) }))).toBe(false)
  })

  it('offers a reversal for undoing again, which is redo', () => {
    expect(isUndoable(change({ id: 2, action: 'unassigned', undoes_id: 1 }))).toBe(true)
  })
})

describe('groupUndo', () => {
  it('offers a single change whatever it is', () => {
    expect(groupUndo([change({ id: 7, action: 'deleted', detail: { section: { id: 's' } } })]))
      .toEqual({ ids: [7], confirm: false })
  })

  it('offers a burst of assignments together, and asks first', () => {
    const undo = groupUndo([change({ id: 9 }), change({ id: 8 }), change({ id: 7 })])
    expect(undo).toEqual({ ids: [9, 8, 7], confirm: true })
  })

  it('reverses newest first, whatever order the entries arrive in', () => {
    expect(groupUndo([change({ id: 3 }), change({ id: 9 }), change({ id: 5 })])?.ids).toEqual([9, 5, 3])
  })

  // Undoing two hundred section creations in one tap is a different and much
  // larger thing than undoing two hundred assignments; it already has a name,
  // which is deleting the scenario.
  it('will not undo a burst of section changes in one go', () => {
    const seeded = [1, 2, 3].map((id) =>
      change({ id, action: 'created', detail: { section: { id: `s${id}` } } }),
    )
    expect(groupUndo(seeded)).toBeNull()
  })

  it('skips the entries it cannot reverse when counting', () => {
    const undo = groupUndo([change({ id: 3 }), change({ id: 2, undone_at: at(9) }), change({ id: 1 })])
    expect(undo).toEqual({ ids: [3, 1], confirm: true })
  })

  it('offers nothing when nothing in the group can be reversed', () => {
    expect(groupUndo([change({ id: 1, detail: {} })])).toBeNull()
    expect(groupUndo([])).toBeNull()
  })
})

describe('myLastUndoable', () => {
  const log = [
    change({ id: 4, actor_email: 'minchen2@uw.edu', occurred_at: at(4) }),
    change({ id: 3, occurred_at: at(3) }),
    change({ id: 2, occurred_at: at(2), undone_at: at(5) }),
    change({ id: 1, occurred_at: at(1) }),
  ]

  it('finds my most recent change, not the most recent change', () => {
    expect(myLastUndoable(log, 'pisan@uw.edu')?.id).toBe(3)
  })

  it('skips over what I have already taken back', () => {
    const mine = log.filter((c) => c.id !== 3)
    expect(myLastUndoable(mine, 'pisan@uw.edu')?.id).toBe(1)
  })

  it('finds nothing for someone who has changed nothing', () => {
    expect(myLastUndoable(log, 'mashhadi@uw.edu')).toBeNull()
  })

  it('finds nothing when the profile has not loaded yet', () => {
    expect(myLastUndoable(log, null)).toBeNull()
    expect(myLastUndoable(log, undefined)).toBeNull()
  })
})

describe('undoneMessage', () => {
  it('names the one change it reversed', () => {
    expect(undoneMessage(1, 'Laurie Anderson — CSS 343 A')).toBe('Undone: Laurie Anderson — CSS 343 A')
  })

  it('counts them when there were several', () => {
    expect(undoneMessage(12, null)).toBe('Undid 12 changes.')
  })

  it('says something useful when the database named nothing', () => {
    expect(undoneMessage(1, null)).toBe('Undone.')
  })
})
