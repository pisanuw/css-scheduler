/**
 * What a drag on the assignment board means.
 *
 * Dragging is an accelerator, never the only way to do anything: every move it
 * performs is also reachable by tapping a section and picking a name, which is
 * how the coordinator works on a phone and how anyone works from a keyboard.
 * That is why the rules live here as plain functions over a snapshot rather
 * than inside pointer handlers — the decisions ("this drop is a move, not an
 * assignment", "this one would clash") are the interesting part, and they are
 * worth testing without a browser or a mouse.
 *
 * dnd-kit addresses things by opaque string ids, so the encoding of those ids
 * is here too: it is the one place a section id and an instructor id have to
 * survive a round trip through a library that knows about neither.
 */

import type { ScheduleSnapshot, Section } from './conflicts'
import { rankCandidates, type Candidate } from './suitability'

/** Where a drag started. */
export type DragSource =
  /** A name in the load panel: nobody is being taken off anything. */
  | { kind: 'instructor'; instructorId: string }
  /** A chip on a section card: dropping it elsewhere is a move. */
  | { kind: 'assignment'; instructorId: string; sectionId: string }

export type DropPlan =
  | { type: 'assign'; instructorId: string; sectionId: string }
  | { type: 'move'; instructorId: string; from: string; to: string }
  /** Nothing to do. `reason` is null when saying so would be noise. */
  | { type: 'none'; reason: string | null }

// ------------------------------------------------------------------- ids
//
// Ids are UUIDs and course-scoped strings; none of them contains a colon, so a
// colon is safe as the separator. Parsing is total — a malformed or unknown id
// returns null rather than throwing, because these values arrive from a
// library's event payload and a bad drag should do nothing, not crash a board.

export function dragId(source: DragSource): string {
  return source.kind === 'instructor'
    ? `instructor:${source.instructorId}`
    : `assignment:${source.sectionId}:${source.instructorId}`
}

export function parseDragId(id: unknown): DragSource | null {
  if (typeof id !== 'string') return null
  const parts = id.split(':')
  if (parts[0] === 'instructor' && parts.length === 2 && parts[1]) {
    return { kind: 'instructor', instructorId: parts[1] }
  }
  if (parts[0] === 'assignment' && parts.length === 3 && parts[1] && parts[2]) {
    return { kind: 'assignment', sectionId: parts[1], instructorId: parts[2] }
  }
  return null
}

export function dropId(sectionId: string): string {
  return `section:${sectionId}`
}

export function parseDropId(id: unknown): string | null {
  if (typeof id !== 'string') return null
  const parts = id.split(':')
  return parts[0] === 'section' && parts.length === 2 && parts[1] ? parts[1] : null
}

// ----------------------------------------------------------------- hints

/**
 * How a section card should look while something is hovering over the board.
 *
 * `blocked` is a warning, not a veto. The coordinator sometimes has to ask
 * someone to teach a course they said they could not, or to accept a clash
 * they will resolve by moving a section afterwards; the board says so in red
 * and lets them do it, exactly as the assign sheet ranks such people last
 * rather than hiding them.
 */
export type DropTone = 'ok' | 'caution' | 'blocked' | 'present' | 'source'

export interface DropHint {
  tone: DropTone
  /** The shortest true thing to say on the card. Null when there is nothing. */
  note: string | null
}

/** A candidate's hard problems — the ones that make a drop red rather than amber. */
function isHard(c: Candidate): boolean {
  return c.tier === 'unqualified' || c.wouldClash || c.unavailableThisTerm || c.atQuarterMax
}

/**
 * The snapshot as it would stand with one assignment already taken off.
 *
 * A move has to be judged against where the instructor is *going*, not where
 * they are. Without this, dragging someone from Monday 8:45 to another Monday
 * 8:45 section would report a clash with the section they are in the act of
 * leaving, and every move would look red.
 */
export function withoutAssignment(
  snap: ScheduleSnapshot,
  sectionId: string,
  instructorId: string,
): ScheduleSnapshot {
  return {
    ...snap,
    sections: snap.sections.map((s) =>
      s.id === sectionId
        ? { ...s, instructorIds: s.instructorIds.filter((id) => id !== instructorId) }
        : s,
    ),
  }
}

/**
 * One hint per section, for the person currently being dragged.
 *
 * Computed once when a drag starts rather than on every pointer move: it walks
 * the roster per section, which is cheap for a quarter's worth of cards and
 * wasteful sixty times a second.
 */
export function dropHints(
  snap: ScheduleSnapshot,
  source: DragSource,
  sections: Section[],
): Map<string, DropHint> {
  const from = source.kind === 'assignment' ? source.sectionId : null
  const effective = from ? withoutAssignment(snap, from, source.instructorId) : snap
  const out = new Map<string, DropHint>()

  for (const section of sections) {
    if (section.id === from) {
      out.set(section.id, { tone: 'source', note: 'From here' })
      continue
    }
    if (section.instructorIds.includes(source.instructorId)) {
      out.set(section.id, { tone: 'present', note: 'Already here' })
      continue
    }
    // The section as the engine would see it after the move, so the ranking
    // reflects the drop rather than the state being left behind.
    const target = effective.sections.find((s) => s.id === section.id) ?? section
    const c = rankCandidates(effective, target).find((x) => x.instructorId === source.instructorId)
    if (!c) {
      // Not on the roster for this year: nothing useful to say, and the drop
      // would fail at the database anyway.
      out.set(section.id, { tone: 'blocked', note: 'not on the roster' })
      continue
    }
    if (isHard(c)) out.set(section.id, { tone: 'blocked', note: c.warnings[0] ?? null })
    else if (c.warnings.length > 0) out.set(section.id, { tone: 'caution', note: c.warnings[0]! })
    else out.set(section.id, { tone: 'ok', note: c.tier === 'eager' ? 'wants this course' : null })
  }

  return out
}

// ------------------------------------------------------------------ drops

function label(snap: ScheduleSnapshot, sectionId: string): string {
  const s = snap.sections.find((x) => x.id === sectionId)
  return s ? `${s.courseCode} ${s.sectionLetter}` : 'that section'
}

function nameOf(snap: ScheduleSnapshot, instructorId: string): string {
  return snap.instructors.find((i) => i.id === instructorId)?.name ?? 'That instructor'
}

/**
 * What a drop should do. Dropping on nothing, or back where it came from, is a
 * cancelled drag and says nothing: a message for every aborted gesture would
 * make the board chatter.
 */
export function planDrop(
  snap: ScheduleSnapshot,
  source: DragSource,
  targetSectionId: string | null,
): DropPlan {
  if (!targetSectionId) return { type: 'none', reason: null }
  if (source.kind === 'assignment' && source.sectionId === targetSectionId) {
    return { type: 'none', reason: null }
  }
  const target = snap.sections.find((s) => s.id === targetSectionId)
  if (!target) return { type: 'none', reason: null }

  if (target.instructorIds.includes(source.instructorId)) {
    return {
      type: 'none',
      reason: `${nameOf(snap, source.instructorId)} is already on ${label(snap, targetSectionId)}.`,
    }
  }

  return source.kind === 'instructor'
    ? { type: 'assign', instructorId: source.instructorId, sectionId: targetSectionId }
    : {
        type: 'move',
        instructorId: source.instructorId,
        from: source.sectionId,
        to: targetSectionId,
      }
}

/**
 * What to tell the coordinator afterwards.
 *
 * The caveat is carried into the confirmation deliberately. A drop the board
 * painted red still happens, and "Assigned — clashes with another section" is
 * the moment to say so; the conflict panel will repeat it, but by then the
 * finger has moved on.
 */
export function describeDrop(
  snap: ScheduleSnapshot,
  plan: DropPlan,
  hint?: DropHint | null,
): string | null {
  const caveat =
    hint && (hint.tone === 'blocked' || hint.tone === 'caution') && hint.note
      ? ` — ${hint.note}`
      : ''
  switch (plan.type) {
    case 'assign':
      return `Assigned ${nameOf(snap, plan.instructorId)} to ${label(snap, plan.sectionId)}${caveat}.`
    case 'move':
      return `Moved ${nameOf(snap, plan.instructorId)} from ${label(snap, plan.from)} to ${label(
        snap,
        plan.to,
      )}${caveat}.`
    case 'none':
      return plan.reason
  }
}

// ---------------------------------------------------------- announcements

export type DragPhase = 'start' | 'over' | 'end' | 'cancel'

/**
 * What a screen reader hears while a drag is happening.
 *
 * dnd-kit announces by id if nobody tells it otherwise, and this board's ids
 * are `assignment:<uuid>:<uuid>` — technically an announcement, practically
 * noise. These say who is being moved and where they are, in the words the
 * cards use.
 */
export function dragAnnouncement(
  snap: ScheduleSnapshot,
  phase: DragPhase,
  activeId: unknown,
  overId: unknown,
): string | undefined {
  const source = parseDragId(activeId)
  if (!source) return undefined
  const who = nameOf(snap, source.instructorId)
  const over = parseDropId(overId)
  const where = over ? label(snap, over) : null

  switch (phase) {
    case 'start':
      return source.kind === 'assignment'
        ? `Picked up ${who} from ${label(snap, source.sectionId)}.`
        : `Picked up ${who}.`
    case 'over':
      return where ? `${who} is over ${where}.` : `${who} is not over a section.`
    case 'end':
      return where ? `Dropped ${who} on ${where}.` : `${who} was dropped outside a section, so nothing changed.`
    case 'cancel':
      return `Cancelled. ${who} was not moved.`
  }
}
