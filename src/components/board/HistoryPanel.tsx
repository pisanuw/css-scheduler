import { useMemo, useState } from 'react'
import type { ChangeAction, ScenarioChange } from '../../hooks/scheduling'
import { groupUndo, isUndoable } from '../../lib/undo'

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
  /** True when the whole run has been taken back again. */
  undone: boolean
  /** True when the whole run is itself the reversal of something earlier. */
  reversal: boolean
  entries: ScenarioChange[]
}

/**
 * Consecutive entries by one person doing one thing collapse into a line.
 * Seeding a scenario from a past year writes 199 rows in a second, and an
 * unreadable log is not much better than no log.
 *
 * An undone entry never joins a live one, even when everything else about them
 * matches: a line offering to undo four things when only three of them are
 * still standing would be lying about what it is going to do.
 */
export function groupChanges(changes: ScenarioChange[]): Group[] {
  const out: Group[] = []
  for (const c of changes) {
    const last = out[out.length - 1]
    const undone = c.undone_at !== null
    const reversal = c.undoes_id !== null
    const within =
      last &&
      last.action === c.action &&
      last.actor === c.actor_email &&
      last.undone === undone &&
      last.reversal === reversal &&
      Math.abs(new Date(last.at).getTime() - new Date(c.occurred_at).getTime()) < 60_000
    if (within) {
      last!.entries.push(c)
    } else {
      out.push({
        key: String(c.id),
        action: c.action,
        actor: c.actor_email,
        at: c.occurred_at,
        undone,
        reversal,
        entries: [c],
      })
    }
  }
  return out
}

function UndoButton({
  label,
  onClick,
  disabled,
}: {
  label: string
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-11 shrink-0 items-center rounded px-2 text-xs font-medium text-slate-600 underline hover:text-slate-900 disabled:opacity-40"
    >
      {label}
    </button>
  )
}

export default function HistoryPanel({
  changes,
  loading,
  canUndo,
  undoing,
  onUndo,
}: {
  changes: ScenarioChange[]
  loading: boolean
  /** False while the scenario is locked, or for anyone who may not write. */
  canUndo: boolean
  undoing: boolean
  onUndo: (ids: number[]) => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const groups = useMemo(() => groupChanges(changes), [changes])

  return (
    <section className="rounded-lg bg-white ring-1 ring-slate-200" aria-labelledby="history-heading">
      <div className="border-b border-slate-200 p-3">
        <h2 id="history-heading" className="font-semibold text-slate-900">
          History
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Recorded by the database itself, so nothing that changed here is missing from it.
          {canUndo && ' Undo puts a change back — and is itself recorded.'}
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
            const undo = canUndo ? groupUndo(g.entries) : null
            const asking = confirming === g.key
            return (
              <li key={g.key}>
                <div className="flex items-start gap-2 p-3">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ACTION_DOT[g.action]} ${
                      g.undone ? 'opacity-30' : ''
                    }`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${g.undone ? 'text-slate-500' : 'text-slate-700'}`}>
                      <span className="font-medium">{g.actor ?? 'Someone'}</span> {ACTION_LABEL[g.action]}{' '}
                      {many ? (
                        <span className="font-medium">{g.entries.length} sections</span>
                      ) : (
                        <span className="font-medium">{g.entries[0]!.summary}</span>
                      )}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <span>{when(g.at)}</span>
                      {g.undone && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">undone</span>
                      )}
                      {g.reversal && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
                          undoing an earlier change
                        </span>
                      )}
                    </p>
                    {many && open && (
                      <ul className="mt-1 divide-y divide-slate-100 text-xs text-slate-500">
                        {g.entries.slice(0, 50).map((e) => (
                          <li key={e.id} className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 break-words">{e.summary}</span>
                            {canUndo && isUndoable(e) && (
                              <UndoButton
                                label="Undo"
                                disabled={undoing}
                                onClick={() => onUndo([e.id])}
                              />
                            )}
                          </li>
                        ))}
                        {g.entries.length > 50 && <li className="py-1">…and {g.entries.length - 50} more</li>}
                      </ul>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end">
                    {undo &&
                      (asking ? (
                        <>
                          <UndoButton
                            label={`Undo ${undo.ids.length}?`}
                            disabled={undoing}
                            onClick={() => {
                              setConfirming(null)
                              onUndo(undo.ids)
                            }}
                          />
                          <UndoButton label="Keep" disabled={false} onClick={() => setConfirming(null)} />
                        </>
                      ) : (
                        <UndoButton
                          label="Undo"
                          disabled={undoing}
                          onClick={() => {
                            if (undo.confirm) setConfirming(g.key)
                            else onUndo(undo.ids)
                          }}
                        />
                      ))}
                    {many && (
                      <button
                        type="button"
                        onClick={() => setExpanded(open ? null : g.key)}
                        className="flex min-h-11 items-center px-2 text-xs text-slate-500 underline"
                      >
                        {open ? 'Hide' : 'Show'}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
