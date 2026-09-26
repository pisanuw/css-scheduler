import { useMemo, useState } from 'react'
import DataTable from '../components/DataTable'
import {
  useAccessLog,
  useAccessSummary,
  useInstructors,
  type AccessLogRow,
  type AccessSummaryRow,
} from '../hooks/queries'

const when = (iso: string) => new Date(iso).toLocaleString()

function relative(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} h ago`
  return `${Math.round(hrs / 24)} d ago`
}

export default function AccessLog() {
  const [tab, setTab] = useState<'people' | 'events'>('people')
  const summary = useAccessSummary()
  const log = useAccessLog()
  const instructors = useInstructors()

  // Everyone on the roster who has an address but has never signed in. This is
  // usually the more actionable half of the question.
  const neverSignedIn = useMemo(() => {
    const seen = new Set((summary.data ?? []).map((s) => s.email.toLowerCase()))
    return (instructors.data ?? []).filter(
      (i) => i.is_active && i.email && !seen.has(i.email.toLowerCase()),
    )
  }, [summary.data, instructors.data])

  const error = summary.error ?? log.error
  if (error) {
    return (
      <p className="rounded-lg bg-white p-6 text-sm text-red-600 ring-1 ring-slate-200">
        {(error as Error).message}
      </p>
    )
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Access log</h1>
        <span className="text-sm text-slate-500">
          {summary.isLoading ? 'loading…' : `${summary.data?.length ?? 0} people have signed in`}
        </span>
      </div>

      <p className="mb-4 text-sm text-slate-600">
        Recorded from the authentication system itself, so it cannot be bypassed by the app.
        Visible to coordinators only.
      </p>

      <div className="mb-4 flex gap-2">
        {(['people', 'events'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`flex min-h-11 items-center rounded-full border px-4 text-sm ${
              tab === t
                ? 'border-slate-800 bg-slate-800 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t === 'people' ? 'By person' : 'Every event'}
          </button>
        ))}
      </div>

      {tab === 'people' ? (
        <>
          <DataTable<AccessSummaryRow>
            rows={summary.data ?? []}
            rowKey={(r) => r.email}
            empty={summary.isLoading ? 'Loading…' : 'Nobody has signed in yet.'}
            columns={[
              {
                key: 'name',
                header: 'Person',
                className: 'font-medium whitespace-nowrap',
                render: (r) => r.full_name ?? r.email,
              },
              { key: 'email', header: 'Email', className: 'text-slate-600 text-xs', render: (r) => r.email },
              {
                key: 'role',
                header: 'Role',
                render: (r) => (
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                      r.role === 'coordinator'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {r.role ?? 'unknown'}
                  </span>
                ),
              },
              {
                key: 'first',
                header: 'First seen',
                className: 'whitespace-nowrap text-slate-600',
                render: (r) => when(r.first_seen),
              },
              {
                key: 'last',
                header: 'Last seen',
                className: 'whitespace-nowrap text-slate-600',
                render: (r) => (
                  <span title={when(r.last_seen)}>{relative(r.last_seen)}</span>
                ),
              },
              { key: 'visits', header: 'Visits', className: 'text-center', render: (r) => r.visits },
            ]}
          />

          {neverSignedIn.length > 0 && (
            <div className="mt-6 rounded-lg bg-white p-5 ring-1 ring-slate-200">
              <h2 className="font-semibold text-slate-900">
                Never signed in ({neverSignedIn.length})
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Active instructors with an address on file who have not yet used the system.
              </p>
              <textarea
                readOnly
                rows={3}
                onFocus={(e) => e.currentTarget.select()}
                value={neverSignedIn.map((i) => i.email).join(', ')}
                className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-700"
              />
            </div>
          )}
        </>
      ) : (
        <DataTable<AccessLogRow>
          rows={log.data ?? []}
          rowKey={(r) => String(r.id)}
          empty={log.isLoading ? 'Loading…' : 'No events recorded.'}
          columns={[
            {
              key: 'when',
              header: 'When',
              className: 'whitespace-nowrap font-medium',
              render: (r) => when(r.occurred_at),
            },
            { key: 'email', header: 'Who', render: (r) => r.email },
            {
              key: 'event',
              header: 'Event',
              render: (r) => (
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                    r.event === 'sign_up'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {r.event === 'sign_up' ? 'first sign-in' : 'sign-in'}
                </span>
              ),
            },
            { key: 'provider', header: 'Via', className: 'text-slate-600', render: (r) => r.provider ?? '—' },
            {
              key: 'account',
              header: 'Account',
              className: 'text-xs text-slate-500',
              render: (r) => (r.user_id ? 'active' : 'deleted'),
            },
          ]}
        />
      )}
    </section>
  )
}
