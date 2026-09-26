import { describe, expect, it } from 'vitest'
import { groupChanges } from '../components/board/HistoryPanel'
import type { ScenarioChange } from '../hooks/scheduling'

const at = (seconds: number) => new Date(Date.UTC(2026, 8, 26, 12, 0, seconds)).toISOString()

const change = (over: Partial<ScenarioChange> & { id: number }): ScenarioChange => ({
  scenario_id: 'sc',
  section_id: 's',
  action: 'created',
  summary: 'CSS 143 A',
  actor_email: 'pisan@uw.edu',
  occurred_at: at(0),
  detail: { section_id: 's', instructor_id: 'i' },
  undone_at: null,
  undone_by: null,
  undoes_id: null,
  ...over,
})

describe('groupChanges', () => {
  it('collapses a burst of one action by one person', () => {
    const groups = groupChanges([
      change({ id: 3, occurred_at: at(2), summary: 'CSS 360 A' }),
      change({ id: 2, occurred_at: at(1), summary: 'CSS 342 A' }),
      change({ id: 1, occurred_at: at(0), summary: 'CSS 143 A' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.entries).toHaveLength(3)
  })

  it('keeps different actions apart', () => {
    const groups = groupChanges([
      change({ id: 2, action: 'assigned', occurred_at: at(1) }),
      change({ id: 1, action: 'created', occurred_at: at(0) }),
    ])
    expect(groups.map((g) => g.action)).toEqual(['assigned', 'created'])
  })

  it('keeps different people apart', () => {
    const groups = groupChanges([
      change({ id: 2, actor_email: 'minchen2@uw.edu', occurred_at: at(1) }),
      change({ id: 1, actor_email: 'pisan@uw.edu', occurred_at: at(0) }),
    ])
    expect(groups).toHaveLength(2)
  })

  it('starts a new group after a minute, so unrelated edits do not merge', () => {
    const groups = groupChanges([
      change({ id: 2, occurred_at: at(90) }),
      change({ id: 1, occurred_at: at(0) }),
    ])
    expect(groups).toHaveLength(2)
  })

  it('groups entries with no actor, rather than dropping them', () => {
    const groups = groupChanges([
      change({ id: 2, actor_email: null, occurred_at: at(1) }),
      change({ id: 1, actor_email: null, occurred_at: at(0) }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.actor).toBeNull()
  })

  it('handles an empty log', () => {
    expect(groupChanges([])).toEqual([])
  })

  // A line offering to undo four things when only three still stand would be
  // lying about what it is about to do.
  it('never merges an undone entry with a live one', () => {
    const groups = groupChanges([
      change({ id: 3, occurred_at: at(2) }),
      change({ id: 2, occurred_at: at(1), undone_at: at(3) }),
      change({ id: 1, occurred_at: at(0) }),
    ])
    expect(groups).toHaveLength(3)
    expect(groups.map((g) => g.undone)).toEqual([false, true, false])
  })

  it('keeps a reversal apart from the changes around it', () => {
    const groups = groupChanges([
      change({ id: 3, action: 'unassigned', occurred_at: at(2), undoes_id: 1 }),
      change({ id: 2, action: 'unassigned', occurred_at: at(1) }),
    ])
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.reversal)).toEqual([true, false])
  })
})
