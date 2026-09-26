import type { DropHint, DropTone } from '../../lib/dnd'

/**
 * What follows the pointer while a name is in the air.
 *
 * The verdict rides on the pill rather than on the card underneath it, which
 * is the one place guaranteed to be where the coordinator is looking and the
 * only place that costs no layout: a line of text appearing inside a card
 * would push every card below it down, mid-drag, under the finger.
 */
const NOTE_CLASS: Record<DropTone, string> = {
  ok: 'text-emerald-700',
  caution: 'text-amber-700',
  blocked: 'text-red-700',
  present: 'text-slate-500',
  source: 'text-slate-500',
}

export default function DragPill({ name, hint }: { name: string; hint: DropHint | null }) {
  return (
    <div className="pointer-events-none max-w-[16rem] rounded-full bg-surface px-4 py-2 text-sm shadow-lg ring-1 ring-slate-300">
      <span className="font-medium text-slate-900">{name}</span>
      {hint?.note && (
        <span className={`ml-2 text-xs ${NOTE_CLASS[hint.tone]}`}>{hint.note}</span>
      )}
    </div>
  )
}
