import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAcademicYears } from '../hooks/preferences'
import {
  useDeleteScenario,
  useMakeOfficial,
  useSaveScenario,
  useScenarios,
  type Scenario,
  type ScenarioStatus,
} from '../hooks/scheduling'

const STATUS_STYLE: Record<ScenarioStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  official: 'bg-emerald-100 text-emerald-800',
  archived: 'bg-slate-100 text-slate-500',
}

export default function Scenarios() {
  const years = useAcademicYears()
  const scenarios = useScenarios()
  const save = useSaveScenario()
  const makeOfficial = useMakeOfficial()
  const remove = useDeleteScenario()
  const [editing, setEditing] = useState<Partial<Scenario> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const yearName = (id: string) => years.data?.find((y) => y.id === id)?.name ?? '—'

  const startNew = () => {
    const current = years.data?.find((y) => y.is_current) ?? years.data?.[0]
    setEditing({ academic_year_id: current?.id, name: '', description: '', status: 'draft' })
  }

  const submit = () => {
    if (!editing?.academic_year_id || !editing.name?.trim()) {
      setError('Pick an academic year and give the draft a name.')
      return
    }
    setError(null)
    save.mutate(
      {
        ...(editing.id ? { id: editing.id } : {}),
        academic_year_id: editing.academic_year_id,
        name: editing.name.trim(),
        description: editing.description?.trim() || null,
        status: editing.status ?? 'draft',
      },
      { onSuccess: () => setEditing(null), onError: (e) => setError((e as Error).message) },
    )
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Scenarios</h1>
        <button
          onClick={startNew}
          style={{ background: 'var(--uw-purple)' }}
          className="ml-auto flex min-h-11 items-center rounded-md px-4 text-sm font-medium text-white hover:opacity-90"
        >
          New scenario
        </button>
      </div>

      <p className="mb-4 max-w-2xl text-sm text-slate-600">
        A scenario is one named draft of a year&rsquo;s schedule. Work in as many as you like; only
        one per year can be <strong>official</strong>, and only the official one is visible to
        instructors.
      </p>

      <div className="space-y-3">
        {(scenarios.data ?? []).map((s) => (
          <div key={s.id} className="rounded-lg bg-white p-4 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <Link
                to={`/board/${s.id}`}
                className="font-medium text-slate-900 underline decoration-slate-300 hover:decoration-slate-600"
              >
                {s.name}
              </Link>
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[s.status]}`}>
                {s.status}
              </span>
              <span className="text-sm text-slate-500">{yearName(s.academic_year_id)}</span>
            </div>
            {s.description && <p className="mt-1 text-sm text-slate-600">{s.description}</p>}
            <p className="mt-1 text-xs text-slate-400">
              Last changed {new Date(s.updated_at).toLocaleString()}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                to={`/board/${s.id}`}
                style={{ background: 'var(--uw-purple)' }}
                className="flex min-h-11 items-center rounded-md px-4 text-sm font-medium text-white hover:opacity-90"
              >
                Open board
              </Link>
              {s.status !== 'official' && (
                <button
                  onClick={() => makeOfficial.mutate(s)}
                  className="flex min-h-11 items-center rounded-md border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Make official
                </button>
              )}
              {s.status !== 'archived' && (
                <button
                  onClick={() => save.mutate({ ...s, status: 'archived' })}
                  className="flex min-h-11 items-center rounded-md border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Archive
                </button>
              )}
              {s.status === 'archived' && (
                <button
                  onClick={() => save.mutate({ ...s, status: 'draft' })}
                  className="flex min-h-11 items-center rounded-md border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Unarchive
                </button>
              )}
              <button
                onClick={() => setEditing(s)}
                className="flex min-h-11 items-center rounded-md border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50"
              >
                Rename
              </button>
              {confirmDelete === s.id ? (
                <span className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      remove.mutate(s.id)
                      setConfirmDelete(null)
                    }}
                    className="flex min-h-11 items-center rounded-md bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700"
                  >
                    Delete for good
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="flex min-h-11 items-center rounded-md border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Keep it
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmDelete(s.id)}
                  className="flex min-h-11 items-center rounded-md border border-slate-300 px-3 text-sm text-red-700 hover:bg-red-50"
                >
                  Delete
                </button>
              )}
            </div>
            {confirmDelete === s.id && (
              <p className="mt-2 text-sm text-red-700">
                Deleting removes every section and assignment in this scenario. Archiving keeps them.
              </p>
            )}
          </div>
        ))}

        {scenarios.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        {scenarios.data?.length === 0 && (
          <div className="rounded-lg bg-white p-6 ring-1 ring-slate-200">
            <p className="text-sm text-slate-600">
              No scenarios yet. Create one to start laying out a year&rsquo;s sections.
            </p>
            <button
              onClick={startNew}
              style={{ background: 'var(--uw-purple)' }}
              className="mt-3 flex min-h-11 items-center rounded-md px-4 text-sm font-medium text-white hover:opacity-90"
            >
              New scenario
            </button>
          </div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-lg rounded-t-xl bg-white p-5 shadow-xl sm:rounded-xl sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">
              {editing.id ? 'Rename scenario' : 'New scenario'}
            </h2>
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                Academic year
                <select
                  value={editing.academic_year_id ?? ''}
                  onChange={(e) => setEditing({ ...editing, academic_year_id: e.target.value })}
                  disabled={!!editing.id}
                  className="mt-1 block min-h-11 w-full rounded-md border border-slate-300 px-2 disabled:bg-slate-50"
                >
                  <option value="">Choose…</option>
                  {(years.data ?? []).map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                      {y.is_current ? ' (current)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Name
                <input
                  value={editing.name ?? ''}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="First pass"
                  className="mt-1 block min-h-11 w-full rounded-md border border-slate-300 px-2"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                What is this draft for?
                <textarea
                  rows={3}
                  value={editing.description ?? ''}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="Assumes Kim is on sabbatical in Winter."
                  className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-2"
                />
              </label>
            </div>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => {
                  setEditing(null)
                  setError(null)
                }}
                className="flex min-h-11 items-center rounded-md border border-slate-300 px-4 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={save.isPending}
                style={{ background: 'var(--uw-purple)' }}
                className="flex min-h-11 items-center rounded-md px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {save.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
