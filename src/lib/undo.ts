import type { ChangeAction, ScenarioChange } from '../hooks/scheduling'

/**
 * Which entries in the change log can be taken back, and which of them the
 * board should offer to take back together.
 *
 * Pure, so the rules are testable on their own. The database enforces all of
 * this again in `undo_change` — see 20260926000400_undo.sql — because a rule
 * only the client knows is not a rule. What lives here is the question of what
 * to *show*: an Undo button that is going to be refused is worse than no
 * button at all.
 */

/** Reversing these only ever costs a tap to put back, so they undo in bulk. */
const REVERSIBLE_IN_BULK: ChangeAction[] = ['assigned', 'unassigned']

/**
 * Entries written before undo existed carry no `detail`, and there is nothing
 * to reverse them with. Neither is there anything to do to an entry that has
 * already been undone — the reversal it wrote is what undoes *that*.
 */
export function isUndoable(c: ScenarioChange): boolean {
  return c.undone_at === null && !!c.detail && Object.keys(c.detail).length > 0
}

export interface GroupUndo {
  /** Newest first, which is the order a group has to reverse in. */
  ids: number[]
  /** More than one change at a time is worth a second tap. */
  confirm: boolean
}

/**
 * What one line of the history panel offers.
 *
 * A single entry is offered whatever it is. A burst is offered only when it is
 * all assignments: undoing two hundred section *creations* in one tap is a
 * different and much larger thing than undoing two hundred assignments, and it
 * already has a name — deleting the scenario. Those entries keep their own
 * Undo buttons in the expanded list.
 */
export function groupUndo(entries: ScenarioChange[]): GroupUndo | null {
  const undoable = entries.filter(isUndoable)
  if (undoable.length === 0) return null
  if (undoable.length === 1) return { ids: [undoable[0]!.id], confirm: false }
  if (!undoable.every((c) => REVERSIBLE_IN_BULK.includes(c.action))) return null
  return { ids: undoable.map((c) => c.id).sort((a, b) => b - a), confirm: true }
}

/**
 * What ⌘Z reverses: the most recent change *I* made that still can be. Someone
 * else's later edit is theirs to take back, not mine to overwrite by accident;
 * their entries still carry their own Undo button for when it is deliberate.
 *
 * `changes` arrives newest first, as the query orders it.
 */
export function myLastUndoable(
  changes: ScenarioChange[],
  email: string | null | undefined,
): ScenarioChange | null {
  if (!email) return null
  return changes.find((c) => c.actor_email === email && isUndoable(c)) ?? null
}

/**
 * How far apart two entries can be and still be halves of one move. Long
 * enough to cover a slow round trip, short enough that two deliberate edits a
 * coffee apart are never mistaken for one gesture.
 */
const MOVE_WINDOW_MS = 5_000

const detailString = (c: ScenarioChange, key: string): string | null => {
  const v = c.detail?.[key]
  return typeof v === 'string' ? v : null
}

/**
 * What ⌘Z should actually take back — one id usually, two when the last thing
 * I did was move someone.
 *
 * A move is an unassign and an assign written as one gesture, so reversing
 * only the assign would leave that person teaching neither section: the board
 * would look like the undo had gone wrong, and the coordinator would be right.
 * The two are recognised by substance rather than by a flag the log does not
 * carry — same instructor, different sections, seconds apart, both mine — and
 * that is the correct reading even when the coordinator typed them as two
 * separate actions, because that is a move too.
 *
 * `undo_changes` reverses by descending id, which puts the assign back before
 * the unassign, which is the only order that works.
 */
export function myLastUndoableIds(
  changes: ScenarioChange[],
  email: string | null | undefined,
): number[] | null {
  if (!email) return null
  const mine = changes.filter((c) => c.actor_email === email && isUndoable(c))
  const last = mine[0]
  if (!last) return null
  const before = mine[1]
  const isMove =
    before &&
    last.action === 'assigned' &&
    before.action === 'unassigned' &&
    detailString(last, 'instructor_id') !== null &&
    detailString(last, 'instructor_id') === detailString(before, 'instructor_id') &&
    detailString(last, 'section_id') !== detailString(before, 'section_id') &&
    new Date(last.occurred_at).getTime() - new Date(before.occurred_at).getTime() <= MOVE_WINDOW_MS
  return isMove ? [last.id, before!.id] : [last.id]
}

/** What the toast says once a reversal has gone through. */
export function undoneMessage(count: number, summary: string | null): string {
  if (count > 1) return `Undid ${count} changes.`
  return summary ? `Undone: ${summary}` : 'Undone.'
}
