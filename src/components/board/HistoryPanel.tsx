import { useMemo, useState } from 'react'
import type { ChangeAction, ScenarioChange } from '../../hooks/scheduling'

const ACTION_LABEL: Record<ChangeAction, string> = {
  created: 'added',
  updated: 'edited',
  deleted: 'removed',
  assigned: 'assigned',
  unassigned: 'unassigned',
}

const ACTION_DOT: Record<ChangeAction, string> = {
  created: 'bg-emerald-500',
  updated: 'bg-sky-500',
  deleted: 'bg-red-500',
  assigned: 'bg-emerald-500',
  unassigned: 'bg-amber-500',
}

/** '14:32' today, otherwise '26 Sep 14:32'. */
function when(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return sameDay ? time : `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${time}`
}

interface Group {
  key: string
  action: ChangeAction
  actor: string | null
  at: string
  entries: ScenarioChange[]
}

/**
 * Consecutive entries by one person doing one thing collapse into a line.
 * Seeding a scenario from a past year writes 199 rows in a second, and an
 * unreadable log is not much better than no log.
 */
export function groupChanges(changes: ScenarioChange[]): Group[] {
  const out: Group[] = []
  for (const c of changes) {
    const last = out[out.length - 1]
    const within =
      last &&
      last.action === c.action &&
      last.actor === c.actor_email &&
      Math.abs(new Date(last.at).getTime() - new Date(c.occurred_at).getTime()) < 60_000
    if (within) {
      last!.entries.push(c)
    } else {
      out.push({
        key: String(c.id),
        action: c.action,
        actor: c.actor_email,
        at: c.occurred_at,
        entries: [c],
      })
    }
  }
  return out
}

export default function HistoryPanel({
  changes,
  loading,
}: {
  changes: ScenarioChange[]
  loading: boolean
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const groups = useMemo(() => groupChanges(changes), [changes])

  return (
    <section className="rounded-lg bg-white ring-1 ring-slate-200" aria-labelledby="history-heading">
      <div className="border-b border-slate-200 p-3">
        <h2 id="history-heading" className="font-semibold text-slate-900">
          History
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Recorded by the database itself, so nothing that changed here is missing from it.
        </p>
      </div>

      {loading ? (
        <p className="p-4 text-sm text-slate-500">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">Nothing has changed in this scenario yet.</p>
      ) : (
        <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto lg:max-h-[28rem]">
          {groups.map((g) => {
            const many = g.entries.length > 1
            const open = expanded === g.key
            return (
              <li key={g.key}>
                <div className="flex items-start gap-2 p-3">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ACTION_DOT[g.action]}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700">
                      <span className="font-medium">{g.actor ?? 'Someone'}</span> {ACTION_LABEL[g.action]}{' '}
                      {many ? (
                        <span className="font-medium">{g.entries.length} sections</span>
                      ) : (
                        <span className="font-medium">{g.entries[0]!.summary}</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">{when(g.at)}</p>
                    {many && open && (
                      <ul className="mt-1 list-disc pl-4 text-xs text-slate-500">
                        {g.entries.slice(0, 50).map((e) => (
                          <li key={e.id}>{e.summary}</li>
                        ))}
                        {g.entries.length > 50 && <li>…and {g.entries.length - 50} more</li>}
                      </ul>
                    )}
                  </div>
                  {many && (
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : g.key)}
                      className="flex min-h-11 shrink-0 items-center px-2 text-xs text-slate-500 underline"
                    >
                      {open ? 'Hide' : 'Show'}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
