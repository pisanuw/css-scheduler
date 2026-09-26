import type { Section, Severity } from '../../lib/conflicts'
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

export default function SectionCard({
  section,
  instructorNames,
  worst,
  conflictCount,
  highlighted,
  onAssign,
  onUnassign,
  onEdit,
}: {
  section: Section
  instructorNames: { id: string; name: string }[]
  worst: Severity | null
  conflictCount: number
  highlighted: boolean
  onAssign: () => void
  onUnassign: (instructorId: string) => void
  onEdit: () => void
}) {
  const unstaffed = instructorNames.length === 0

  return (
    <li
      id={`section-${section.id}`}
      className={`rounded-lg bg-white p-3 ring-1 transition-shadow ${
        highlighted ? 'ring-2 ring-offset-1' : worst ? SEVERITY_RING[worst] : 'ring-slate-200'
      }`}
      style={highlighted ? { boxShadow: '0 0 0 2px var(--uw-purple)' } : undefined}
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
          <span
            key={i.id}
            className="flex min-h-11 items-center gap-1 rounded-full bg-slate-100 pl-3 pr-1 text-sm text-slate-800"
          >
            {i.name}
            <button
              type="button"
              onClick={() => onUnassign(i.id)}
              aria-label={`Unassign ${i.name} from ${section.courseCode} ${section.sectionLetter}`}
              className="flex h-11 w-11 items-center justify-center rounded-full text-lg text-slate-500 hover:bg-slate-200 hover:text-slate-900"
            >
              ×
            </button>
          </span>
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
