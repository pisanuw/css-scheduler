import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { Section, Severity } from '../../lib/conflicts'
import { dragId, dropId, type DropHint, type DropTone } from '../../lib/dnd'
import { meetingLabel } from '../../lib/snapshot'

const MODALITY_SHORT: Record<Section['modality'], string> = {
  in_person: 'In person',
  hybrid: 'Hybrid',
  online_sync: 'Online, live',
  online_async: 'Online, self-paced',
}

const SEVERITY_DOT: Record<Severity, string> = {
  error: 'bg-red-600',
  warning: 'bg-amber-500',
  info: 'bg-sky-500',
}

const SEVERITY_RING: Record<Severity, string> = {
  error: 'ring-red-300',
  warning: 'ring-amber-300',
  info: 'ring-slate-200',
}

/**
 * How a card looks while something is being dragged over the board. Two
 * strengths of each colour: every card wears the quiet one so the coordinator
 * can see at a glance where this person fits, and the one under the pointer
 * wears the loud one so there is no doubt where the drop will land.
 */
const TONE_RING: Record<DropTone, string> = {
  ok: 'ring-2 ring-emerald-300',
  caution: 'ring-2 ring-amber-300',
  blocked: 'ring-2 ring-red-300',
  present: 'ring-1 ring-slate-200 opacity-60',
  source: 'ring-2 ring-slate-300 opacity-60',
}

const TONE_OVER: Record<DropTone, string> = {
  ok: 'ring-2 ring-emerald-600 bg-emerald-50',
  caution: 'ring-2 ring-amber-600 bg-amber-50',
  blocked: 'ring-2 ring-red-600 bg-red-50',
  present: 'ring-2 ring-slate-400 bg-slate-50',
  source: 'ring-2 ring-slate-400 bg-slate-50',
}

/**
 * A name on a card, and the handle for moving that person to another section.
 *
 * The drag is an accelerator on top of the buttons, not a replacement for
 * them: the × still unassigns, and the card's Assign button still opens the
 * sheet, which is how this works from a keyboard and how it works when a
 * finger would rather tap than hold. That is also why the chip takes dnd-kit's
 * listeners but not its ARIA attributes — announcing a `role="button"` around
 * a real button, focusable and keyboard-activated, would promise a keyboard
 * drag that the sheet already does better.
 */
function InstructorChip({
  instructorId,
  name,
  sectionId,
  sectionLabel,
  draggable,
  onUnassign,
}: {
  instructorId: string
  name: string
  sectionId: string
  sectionLabel: string
  draggable: boolean
  onUnassign: () => void
}) {
  const id = dragId({ kind: 'assignment', instructorId, sectionId })
  const { setNodeRef, listeners, isDragging } = useDraggable({ id, disabled: !draggable })

  return (
    <span
      ref={setNodeRef}
      // A stable handle for the check that drives a real pointer at this.
      data-drag-id={id}
      {...(draggable ? listeners : {})}
      // `manipulation` rather than `none`: the touch sensor only claims the
      // gesture after a long press, so until then the page must still scroll
      // when the finger happens to land on a name.
      style={draggable ? { touchAction: 'manipulation' } : undefined}
      className={`flex min-h-11 items-center gap-1 rounded-full bg-slate-100 pl-3 pr-1 text-sm text-slate-800 ${
        draggable ? 'cursor-grab active:cursor-grabbing' : ''
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      {name}
      <button
        type="button"
        onClick={onUnassign}
        aria-label={`Unassign ${name} from ${sectionLabel}`}
        // slate-500 here is 4.35:1 on the chip's slate-100, which reads fine
        // and fails AA. The scene that measures this card is newer than the
        // card, which is why it shipped that way for four runs.
        className="flex h-11 w-11 items-center justify-center rounded-full text-lg text-slate-600 hover:bg-slate-200 hover:text-slate-900"
      >
        ×
      </button>
    </span>
  )
}

export default function SectionCard({
  section,
  instructorNames,
  worst,
  conflictCount,
  highlighted,
  dragEnabled = false,
  hint = null,
  onAssign,
  onUnassign,
  onEdit,
}: {
  section: Section
  instructorNames: { id: string; name: string }[]
  worst: Severity | null
  conflictCount: number
  highlighted: boolean
  /** Whether names on this card can be picked up. Off while the scenario is locked. */
  dragEnabled?: boolean
  /** Set only while a drag is in flight: how this card relates to what is being dragged. */
  hint?: DropHint | null
  onAssign: () => void
  onUnassign: (instructorId: string) => void
  onEdit: () => void
}) {
  const unstaffed = instructorNames.length === 0
  const label = `${section.courseCode} ${section.sectionLetter}`
  const { setNodeRef, isOver } = useDroppable({ id: dropId(section.id), disabled: !dragEnabled })

  const dropRing = hint ? (isOver ? TONE_OVER[hint.tone] : TONE_RING[hint.tone]) : null

  return (
    <li
      ref={setNodeRef}
      id={`section-${section.id}`}
      className={`rounded-lg bg-white p-3 transition-shadow ${
        dropRing ??
        `ring-1 ${
          highlighted ? 'ring-2 ring-offset-1' : worst ? SEVERITY_RING[worst] : 'ring-slate-200'
        }`
      }`}
      style={highlighted && !dropRing ? { boxShadow: '0 0 0 2px var(--uw-purple)' } : undefined}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">
            {section.courseCode} <span className="text-slate-500">{section.sectionLetter}</span>
          </p>
          <p className="mt-0.5 text-sm text-slate-600">
            {meetingLabel(section.meeting)}
            <span className="text-slate-500"> · </span>
            {MODALITY_SHORT[section.modality]}
            {section.roomLabel && (
              <>
                <span className="text-slate-500"> · </span>
                {section.roomLabel}
              </>
            )}
          </p>
        </div>
        {conflictCount > 0 && worst && (
          <span
            className="flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
            title={`${conflictCount} finding${conflictCount === 1 ? '' : 's'}`}
          >
            <span className={`h-2 w-2 rounded-full ${SEVERITY_DOT[worst]}`} aria-hidden />
            {conflictCount}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {instructorNames.map((i) => (
          <InstructorChip
            key={i.id}
            instructorId={i.id}
            name={i.name}
            sectionId={section.id}
            sectionLabel={label}
            draggable={dragEnabled}
            onUnassign={() => onUnassign(i.id)}
          />
        ))}
        {unstaffed && <span className="text-sm text-amber-700">Nobody assigned</span>}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAssign}
          style={{ background: 'var(--uw-purple)' }}
          className="flex min-h-11 items-center rounded-md px-4 text-sm font-medium text-white hover:opacity-90"
        >
          {unstaffed ? 'Assign' : 'Add instructor'}
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="flex min-h-11 items-center rounded-md border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50"
        >
          Edit
        </button>
      </div>
    </li>
  )
}
