import { useState } from 'react'
import { useAcademicYears, useCycles, useUpsertCycle } from '../hooks/preferences'
import type { CycleStatus, PreferenceCycle } from '../lib/types'

const STATUS_STYLE: Record<CycleStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  open: 'bg-emerald-100 text-emerald-800',
  closed: 'bg-amber-100 text-amber-800',
  archived: 'bg-slate-100 text-slate-500',
}

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function Cycles() {
  const years = useAcademicYears()
  const cycles = useCycles()
  const upsert = useUpsertCycle()
  const [editing, setEditing] = useState<Partial<PreferenceCycle> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const yearName = (id: string) => years.data?.find((y) => y.id === id)?.name ?? '—'

  const startNew = () => {
    const current = years.data?.find((y) => y.is_current) ?? years.data?.[0]
    setEditing({
      academic_year_id: current?.id,
      name: current ? `${current.name} preferences` : '',
      status: 'draft',
      instructions: '',
    })
  }

  const save = () => {
    if (!editing?.academic_year_id || !editing.name) {
      setError('Pick an academic year and give the cycle a name.')
      return
    }
    setError(null)
    upsert.mutate(
      {
        ...(editing.id ? { id: editing.id } : {}),
        academic_year_id: editing.academic_year_id,
        name: editing.name,
        status: editing.status ?? 'draft',
        instructions: editing.instructions || null,
        opens_at: editing.opens_at || null,
        closes_at: editing.closes_at || null,
      },
      { onSuccess: () => setEditing(null), onError: (e) => setError((e as Error).message) },
    )
  }

  return (
    <section>
      <div className="mb-4 flex items-center gap-4">
        <h1 className="text-xl font-semibold text-slate-900">Preference cycles</h1>
        <button
          onClick={startNew}
          style={{ background: 'var(--uw-purple)' }}
          className="ml-auto rounded-md px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          New cycle
        </button>
      </div>

      <p className="mb-4 text-sm text-slate-600">
        Only a cycle with status <strong>open</strong> accepts submissions. Instructors can revise
        until it closes.
      </p>

      <div className="space-y-3">
        {(cycles.data ?? []).map((c) => (
          <div key={c.id} className="rounded-lg bg-white p-4 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium text-slate-900">{c.name}</span>
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[c.status]}`}>
                {c.status}
              </span>
              <span className="text-sm text-slate-500">{yearName(c.academic_year_id)}</span>
              <div className="ml-auto flex gap-2">
                {(['draft', 'open', 'closed', 'archived'] as CycleStatus[])
                  .filter((s) => s !== c.status)
                  .map((s) => (
                    <button
                      key={s}
                      onClick={() => upsert.mutate({ ...c, status: s })}
                      className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      Mark {s}
                    </button>
                  ))}
                <button
                  onClick={() => setEditing(c)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                >
                  Edit
                </button>
              </div>
            </div>
            {c.closes_at && (
              <p className="mt-1 text-sm text-slate-500">
                Closes {new Date(c.closes_at).toLocaleString()}
              </p>
            )}
          </div>
        ))}
        {cycles.data?.length === 0 && (
          <p className="rounded-lg bg-white p-6 text-sm text-slate-500 ring-1 ring-slate-200">
            No cycles yet. Create one to start collecting preferences.
          </p>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">
              {editing.id ? 'Edit cycle' : 'New cycle'}
            </h2>
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                Academic year
                <select
                  value={editing.academic_year_id ?? ''}
                  onChange={(e) => setEditing({ ...editing, academic_year_id: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5"
                >
                  <option value="">Choose…</option>
                  {(years.data ?? []).map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Name
                <input
                  value={editing.name ?? ''}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Instructions shown to instructors
                <textarea
                  rows={3}
                  value={editing.instructions ?? ''}
                  onChange={(e) => setEditing({ ...editing, instructions: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium text-slate-700">
                  Opens
                  <input
                    type="datetime-local"
                    value={toLocalInput(editing.opens_at ?? null)}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        opens_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                      })
                    }
                    className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Closes
                  <input
                    type="datetime-local"
                    value={toLocalInput(editing.closes_at ?? null)}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        closes_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                      })
                    }
                    className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5"
                  />
                </label>
              </div>
            </div>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => {
                  setEditing(null)
                  setError(null)
                }}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={upsert.isPending}
                style={{ background: 'var(--uw-purple)' }}
                className="rounded-md px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {upsert.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
