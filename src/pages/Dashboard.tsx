import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useCourses, useInstructors, useTeachingHistory } from '../hooks/queries'
import { useMySubmission, useOpenCycle, useResponses } from '../hooks/preferences'

function Stat({ label, value, to }: { label: string; value: string | number; to: string }) {
  return (
    <Link to={to} className="rounded-lg bg-surface p-5 ring-1 ring-slate-200 transition-shadow hover:shadow-md">
      <div className="text-3xl font-semibold" style={{ color: 'var(--uw-purple-ink)' }}>
        {value}
      </div>
      <div className="mt-1 text-sm text-slate-600">{label}</div>
    </Link>
  )
}

export default function Dashboard() {
  const { profile, isCoordinator } = useAuth()
  const courses = useCourses('undergraduate')
  const instructors = useInstructors()
  const history = useTeachingHistory()
  const cycle = useOpenCycle()
  const mySub = useMySubmission(cycle.data?.id, profile?.instructor_id)
  const responses = useResponses(isCoordinator ? cycle.data?.id : undefined)

  const activeInstructors = (instructors.data ?? []).filter((i) => i.is_active).length
  const myStatus = mySub.data?.submission?.status ?? 'not_started'
  const submittedCount = (responses.data ?? []).filter((r) => r.status === 'submitted').length

  return (
    <section>
      <h1 className="text-xl font-semibold text-slate-900">
        Welcome, {profile?.full_name ?? profile?.email}
      </h1>

      {cycle.data ? (
        <div className="mt-4 rounded-lg bg-surface p-5 ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-semibold text-slate-900">{cycle.data.name}</h2>
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
              open
            </span>
            {cycle.data.closes_at && (
              <span className="text-sm text-slate-500">
                closes {new Date(cycle.data.closes_at).toLocaleDateString()}
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            {profile?.instructor_id && (
              <p className="text-sm text-slate-600">
                Your submission:{' '}
                <strong>
                  {myStatus === 'submitted'
                    ? 'submitted'
                    : myStatus === 'draft'
                      ? 'saved as a draft'
                      : 'not started'}
                </strong>
              </p>
            )}
            {isCoordinator && responses.data && (
              <p className="text-sm text-slate-600">
                {submittedCount} of {responses.data.length} instructors have submitted
              </p>
            )}
            <Link
              to="/preferences"
              style={{ background: 'var(--uw-purple)' }}
              className="ml-auto rounded-md px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              {myStatus === 'not_started' ? 'Fill in preferences' : 'Review preferences'}
            </Link>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-600">
          {isCoordinator
            ? 'No preference cycle is open. Open one under Cycles to start collecting.'
            : 'No preference cycle is open right now.'}
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Undergraduate courses" value={courses.data?.length ?? '…'} to="/courses" />
        <Stat
          label="Active instructors"
          value={instructors.isLoading ? '…' : activeInstructors}
          to="/instructors"
        />
        <Stat label="Sections on record" value={history.data?.length ?? '…'} to="/history" />
      </div>

      {isCoordinator && (
        <div className="mt-8 rounded-lg bg-surface p-5 ring-1 ring-slate-200">
          <h2 className="font-semibold text-slate-900">Assignment board</h2>
          <p className="mt-2 text-sm text-slate-600">
            Lay out a year&rsquo;s sections in a scenario and assign instructors to them, with
            conflicts flagged as you work.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to="/board"
              style={{ background: 'var(--uw-purple)' }}
              className="flex min-h-11 items-center rounded-md px-4 text-sm font-medium text-white hover:opacity-90"
            >
              Open the board
            </Link>
            <Link
              to="/scenarios"
              className="flex min-h-11 items-center rounded-md border border-slate-300 px-4 text-sm text-slate-700 hover:bg-slate-50"
            >
              Scenarios
            </Link>
          </div>
        </div>
      )}
    </section>
  )
}
