import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useScenarioSnapshot } from '../hooks/useScenarioSnapshot'
import { useScenarios } from '../hooks/scheduling'
import { useCourses } from '../hooks/queries'
import { meetingLabel } from '../lib/snapshot'
import { studentClashes, unavoidableStudentClashes } from '../lib/report'
import { useAuth } from '../lib/auth'

/**
 * Can a student take these courses in the same quarter?
 *
 * Two answers, and the distinction is the whole point. A pair of *sections*
 * clashing is common and usually fine, because another section of one of them
 * fits. A pair of *courses* with no workable combination at all is a problem
 * with the schedule, and it is the only one worth acting on.
 */
export default function StudentCheck() {
  const { isCoordinator } = useAuth()
  const scenarios = useScenarios()
  const courses = useCourses('undergraduate')
  const [picked, setPicked] = useState<string[]>([])
  const [scenarioId, setScenarioId] = useState<string>('')

  // Non-coordinators only ever see the official scenario, by policy.
  const resolvedId = useMemo(() => {
    if (scenarioId) return scenarioId
    const list = scenarios.data ?? []
    return (list.find((s) => s.status === 'official') ?? list.find((s) => s.status !== 'archived'))?.id
  }, [scenarioId, scenarios.data])

  const { scenario, snapshot, isLoading } = useScenarioSnapshot(resolvedId)

  const impossible = useMemo(
    () => (picked.length > 1 ? unavoidableStudentClashes(snapshot, picked) : []),
    [snapshot, picked],
  )
  const sectionLevel = useMemo(
    () => (picked.length > 1 ? studentClashes(snapshot, picked) : []),
    [snapshot, picked],
  )

  const offered = useMemo(() => {
    const ids = new Set(snapshot.sections.map((s) => s.courseId))
    return (courses.data ?? []).filter((c) => ids.has(c.id))
  }, [courses.data, snapshot.sections])

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  const byQuarter = useMemo(
    () =>
      snapshot.terms.map((t) => ({
        term: t,
        sections: snapshot.sections
          .filter((s) => s.termId === t.id && picked.includes(s.courseId))
          .sort((a, b) => a.courseCode.localeCompare(b.courseCode, undefined, { numeric: true })),
      })),
    [snapshot, picked],
  )

  if (!resolvedId)
    return (
      <section>
        <h1 className="text-xl font-semibold text-slate-900">Can a student take these together?</h1>
        <p className="mt-3 rounded-lg bg-surface p-6 text-sm text-slate-600 ring-1 ring-slate-200">
          {isCoordinator ? (
            <>
              No scenario to check yet.{' '}
              <Link to="/scenarios" className="underline">
                Create one
              </Link>
              .
            </>
          ) : (
            'No schedule has been published yet.'
          )}
        </p>
      </section>
    )

  return (
    <section>
      <h1 className="text-xl font-semibold text-slate-900">Can a student take these together?</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        Pick the courses a student needs. This checks the published times for combinations that do
        not fit, quarter by quarter.
      </p>

      {isCoordinator && (scenarios.data ?? []).length > 1 && (
        <label className="mt-4 block text-sm text-slate-600 sm:max-w-sm">
          Checking against
          <select
            value={resolvedId}
            onChange={(e) => setScenarioId(e.target.value)}
            className="mt-1 block min-h-11 w-full rounded-md border border-slate-300 px-2"
          >
            {(scenarios.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.status})
              </option>
            ))}
          </select>
        </label>
      )}

      {scenario.data && scenario.data.status !== 'official' && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This is a draft, not the published schedule. The times may still change.
        </p>
      )}

      {isLoading ? (
        <p className="mt-4 text-sm text-slate-500">Loading the schedule…</p>
      ) : offered.length === 0 ? (
        <p className="mt-4 rounded-lg bg-surface p-6 text-sm text-slate-600 ring-1 ring-slate-200">
          That scenario has no sections yet, so there is nothing to check.
        </p>
      ) : (
        <>
          <div className="mt-4 rounded-lg bg-surface p-4 ring-1 ring-slate-200">
            <h2 className="text-sm font-medium text-slate-700">
              Courses <span className="font-normal text-slate-500">({picked.length} picked)</span>
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {offered.map((c) => {
                const on = picked.includes(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggle(c.id)}
                    aria-pressed={on}
                    style={on ? { background: 'var(--uw-purple)' } : undefined}
                    className={`flex min-h-11 items-center rounded-full border px-4 text-sm ${
                      on
                        ? 'border-transparent text-white'
                        : 'border-slate-300 bg-surface text-slate-700 hover:bg-slate-50'
                    }`}
                    title={c.title}
                  >
                    {c.code}
                  </button>
                )
              })}
            </div>
            {picked.length > 0 && (
              <button
                type="button"
                onClick={() => setPicked([])}
                className="mt-2 flex min-h-11 items-center text-sm text-slate-600 underline"
              >
                Clear
              </button>
            )}
          </div>

          {picked.length < 2 ? (
            <p className="mt-4 rounded-lg bg-surface p-6 text-sm text-slate-600 ring-1 ring-slate-200">
              Pick at least two courses to check.
            </p>
          ) : (
            <>
              <div
                className={`mt-4 rounded-lg p-4 ring-1 ${
                  impossible.length === 0
                    ? 'bg-emerald-50 text-emerald-900 ring-emerald-200'
                    : 'bg-red-50 text-red-900 ring-red-200'
                }`}
              >
                {impossible.length === 0 ? (
                  <>
                    <h2 className="font-semibold">Every pair can be combined</h2>
                    <p className="mt-1 text-sm">
                      For each pair of these courses, some pair of their sections fits together.
                      {sectionLevel.length > 0 &&
                        ' Some individual sections do clash, so the student has to pick carefully — the details are below.'}
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="font-semibold">
                      {impossible.length} pair{impossible.length === 1 ? '' : 's'} cannot be
                      combined at all
                    </h2>
                    <ul className="mt-2 space-y-1 text-sm">
                      {impossible.map((c, i) => (
                        <li key={i}>
                          <span className="font-medium">
                            {c.courses[0]} and {c.courses[1]}
                          </span>{' '}
                          in {c.termLabel} — every section of one clashes with every section of the
                          other.
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              {sectionLevel.length > 0 && (
                <div className="mt-4 rounded-lg bg-surface p-4 ring-1 ring-slate-200">
                  <h2 className="font-semibold text-slate-900">
                    Sections that clash{' '}
                    <span className="font-normal text-slate-500">({sectionLevel.length})</span>
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Not a problem on its own — it only matters when no other combination works.
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-slate-700">
                    {sectionLevel.map((c, i) => (
                      <li key={i}>
                        <span className="text-slate-500">{c.termLabel}:</span> {c.a} and {c.b}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 rounded-lg bg-surface ring-1 ring-slate-200">
                <h2 className="border-b border-slate-200 p-3 font-semibold text-slate-900">
                  When these are offered
                </h2>
                <div className="divide-y divide-slate-100">
                  {byQuarter.map(({ term, sections }) => (
                    <div key={term.id} className="p-3">
                      <h3 className="text-sm font-medium text-slate-700">{term.label}</h3>
                      {sections.length === 0 ? (
                        <p className="mt-1 text-xs text-slate-500">None of these are offered.</p>
                      ) : (
                        <ul className="mt-1 space-y-0.5 text-sm text-slate-600">
                          {sections.map((s) => (
                            <li key={s.id}>
                              <span className="font-medium text-slate-800">
                                {s.courseCode} {s.sectionLetter}
                              </span>{' '}
                              {meetingLabel(s.meeting)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
