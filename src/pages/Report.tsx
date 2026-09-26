import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useScenarioSnapshot } from '../hooks/useScenarioSnapshot'
import { useScenarios } from '../hooks/scheduling'
import { countBySeverity, detectConflicts } from '../lib/conflicts'
import { meetingLabel } from '../lib/snapshot'
import {
  buildReport,
  reportCsv,
  scheduleCsv,
  TIER_BUCKETS,
  type InstructorReport,
  type TierBucket,
} from '../lib/report'
import { downloadText, slug } from '../lib/download'
import { useToast } from '../components/Toast'

const TIER_LABEL: Record<TierBucket, string> = {
  eager: 'Wanted it',
  willing: 'Willing',
  reluctant: 'Rather not',
  unqualified: 'Cannot teach',
  unrated: 'Did not rate',
}

const TIER_BAR: Record<TierBucket, string> = {
  eager: 'bg-emerald-500',
  willing: 'bg-sky-500',
  reluctant: 'bg-amber-500',
  unqualified: 'bg-red-600',
  unrated: 'bg-slate-300',
}

function pct(v: number | null): string {
  return v === null ? '—' : `${Math.round(v * 100)}%`
}

function Stat({ value, label, tone }: { value: string | number; label: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-white p-4 ring-1 ring-slate-200">
      <div className={`text-2xl font-semibold ${tone ?? ''}`} style={tone ? undefined : { color: 'var(--uw-purple)' }}>
        {value}
      </div>
      <div className="mt-0.5 text-sm text-slate-600">{label}</div>
    </div>
  )
}

/** The tier mix as one bar, which reads faster than five numbers. */
function TierBar({ byTier, total }: { byTier: Record<TierBucket, number>; total: number }) {
  if (total === 0) return <div className="h-2 rounded-full bg-slate-100" />
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label="Preference mix">
      {TIER_BUCKETS.filter((t) => byTier[t] > 0).map((t) => (
        <div
          key={t}
          className={TIER_BAR[t]}
          style={{ width: `${(byTier[t] / total) * 100}%` }}
          title={`${TIER_LABEL[t]}: ${byTier[t]}`}
        />
      ))}
    </div>
  )
}

function InstructorRow({ r }: { r: InstructorReport }) {
  const overPreps = r.maxNewPreps != null && r.newPreps > r.maxNewPreps
  const flags = [
    r.unavailableTerms > 0 && `${r.unavailableTerms} in a quarter they marked off`,
    r.blockedDayHits > 0 && `${r.blockedDayHits} on a day they keep free`,
    r.modalityMismatches > 0 && `${r.modalityMismatches} in a format they did not ask for`,
    overPreps && `${r.newPreps} new preparations, over their limit of ${r.maxNewPreps}`,
  ].filter(Boolean) as string[]

  return (
    <li className="p-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="min-w-0 flex-1 font-medium text-slate-900">{r.name}</span>
        {!r.submitted && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
            no preferences submitted
          </span>
        )}
        <span className="text-sm text-slate-700">
          {r.assigned}
          {r.target != null && <span className="text-slate-500"> / {r.target}</span>}
        </span>
        <span className="w-12 text-right text-sm font-medium text-slate-700">{pct(r.satisfaction)}</span>
      </div>
      <div className="mt-1.5">
        <TierBar byTier={r.byTier} total={r.assigned} />
      </div>
      <p className="mt-1 text-xs text-slate-500">
        <span title="Assigned, against the number they asked for">
          {r.byTerm.map((t) => `${t.label} ${t.actual}${t.desired != null ? `/${t.desired}` : ''}`).join(' · ')}
        </span>
        {r.newPreps > 0 && ` · ${r.newPreps} new prep${r.newPreps === 1 ? '' : 's'}`}
      </p>
      {flags.length > 0 && <p className="mt-1 text-xs text-amber-700">{flags.join(' · ')}</p>}
    </li>
  )
}

export default function Report() {
  const { scenarioId: routeId } = useParams()
  const navigate = useNavigate()
  const scenarios = useScenarios()
  const toast = useToast()
  const [onlyProblems, setOnlyProblems] = useState(false)

  const resolvedId = useMemo(() => {
    if (routeId) return routeId
    const list = scenarios.data ?? []
    return (list.find((s) => s.status === 'official') ?? list.find((s) => s.status !== 'archived'))?.id
  }, [routeId, scenarios.data])

  const { scenario, snapshot, isLoading } = useScenarioSnapshot(resolvedId)
  const report = useMemo(() => buildReport(snapshot), [snapshot])
  const conflicts = useMemo(() => detectConflicts(snapshot), [snapshot])
  const counts = useMemo(() => countBySeverity(conflicts), [conflicts])

  const meetingFor = useMemo(() => {
    const m = new Map(snapshot.sections.map((s) => [s.id, meetingLabel(s.meeting)]))
    return (id: string) => m.get(id) ?? ''
  }, [snapshot.sections])

  const shown = onlyProblems
    ? report.instructors.filter(
        (i) =>
          (i.satisfaction != null && i.satisfaction < 1) ||
          i.unavailableTerms > 0 ||
          i.blockedDayHits > 0 ||
          (i.maxNewPreps != null && i.newPreps > i.maxNewPreps),
      )
    : report.instructors

  if (!resolvedId)
    return (
      <p className="rounded-lg bg-white p-6 text-sm text-slate-600 ring-1 ring-slate-200">
        No scenarios yet. <Link to="/scenarios" className="underline">Create one</Link> and fill in
        the board first.
      </p>
    )
  if (isLoading) return <p className="text-sm text-slate-500">Building the report…</p>
  if (!scenario.data)
    return (
      <p className="rounded-lg bg-white p-6 text-sm text-red-700 ring-1 ring-slate-200">
        That scenario could not be loaded. <Link to="/scenarios" className="underline">Back to scenarios</Link>.
      </p>
    )

  const name = scenario.data.name

  /**
   * A download on a phone is the least visible thing this app does: the file
   * lands somewhere the browser chose and nothing on the page moves. Naming
   * the file is the whole point of the message.
   */
  const exportCsv = (filename: string, build: () => string) => {
    try {
      downloadText(filename, 'text/csv', build())
      toast.ok(`Saved ${filename} to your downloads.`)
    } catch (e) {
      toast.failed(`Could not export ${filename}`, e)
    }
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold text-slate-900">{name} — report</h1>
        <Link
          to={`/board/${resolvedId}`}
          className="flex min-h-11 items-center text-sm text-slate-500 underline print:hidden"
        >
          Open the board
        </Link>
      </div>

      {(scenarios.data ?? []).length > 1 && (
        <label className="mb-4 block text-sm text-slate-600 sm:max-w-sm print:hidden">
          Scenario
          <select
            value={resolvedId}
            onChange={(e) => navigate(`/report/${e.target.value}`)}
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

      {report.totals.sections === 0 ? (
        <div className="rounded-lg bg-white p-6 ring-1 ring-slate-200">
          <p className="text-sm text-slate-600">
            This scenario has no sections yet, so there is nothing to report on.
          </p>
          <Link
            to={`/board/${resolvedId}`}
            style={{ background: 'var(--uw-purple)' }}
            className="mt-3 inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium text-white"
          >
            Go to the board
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat value={pct(report.satisfaction)} label="Preferences met" />
            <Stat value={report.totals.sections} label="Sections" />
            <Stat
              value={report.totals.unstaffed}
              label="Unstaffed"
              tone={report.totals.unstaffed > 0 ? 'text-amber-600' : 'text-emerald-600'}
            />
            <Stat
              value={counts.error}
              label="Errors"
              tone={counts.error > 0 ? 'text-red-600' : 'text-emerald-600'}
            />
          </div>

          <div className="mt-4 rounded-lg bg-white p-4 ring-1 ring-slate-200">
            <h2 className="font-semibold text-slate-900">Where the assignments went</h2>
            <p className="mt-1 text-sm text-slate-600">
              {report.totals.assignments} assignments across {report.totals.instructorsAssigned}{' '}
              instructors, {report.totals.withPreferences} of whom submitted preferences.
            </p>
            <div className="mt-3">
              <TierBar byTier={report.totals.byTier} total={report.totals.assignments} />
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {TIER_BUCKETS.map((t) => (
                <li key={t} className="flex items-center gap-1.5 text-slate-600">
                  <span className={`h-2.5 w-2.5 rounded-sm ${TIER_BAR[t]}`} aria-hidden />
                  {TIER_LABEL[t]} <span className="font-medium text-slate-800">{report.totals.byTier[t]}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-500">
              &ldquo;Preferences met&rdquo; counts only assignments the instructor actually rated.
              Unrated ones are left out rather than counted either way.
            </p>
          </div>

          <div className="mt-4 rounded-lg bg-white p-4 ring-1 ring-slate-200">
            <h2 className="font-semibold text-slate-900">By quarter</h2>
            <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {report.perTerm.map((t) => (
                <li key={t.termId} className="rounded-md bg-slate-50 p-3 text-sm">
                  <span className="font-medium text-slate-800">{t.label}</span>
                  <span className="ml-2 text-slate-600">
                    {t.sections} section{t.sections === 1 ? '' : 's'}
                  </span>
                  {t.unstaffed > 0 && (
                    <span className="ml-2 text-amber-700">{t.unstaffed} unstaffed</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 rounded-lg bg-white ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
              <h2 className="font-semibold text-slate-900">
                By instructor <span className="font-normal text-slate-500">({shown.length})</span>
              </h2>
              <button
                type="button"
                onClick={() => setOnlyProblems((v) => !v)}
                aria-pressed={onlyProblems}
                className={`ml-auto flex min-h-11 items-center rounded-full border px-3 text-xs font-medium print:hidden ${
                  onlyProblems
                    ? 'border-transparent bg-slate-800 text-white'
                    : 'border-slate-300 bg-white text-slate-700'
                }`}
              >
                Only those with something to fix
              </button>
            </div>
            {shown.length === 0 ? (
              <p className="p-6 text-sm text-emerald-800">
                Everyone got what they asked for. Nothing to fix.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {shown.map((r) => (
                  <InstructorRow key={r.instructorId} r={r} />
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 print:hidden">
            <button
              type="button"
              onClick={() =>
                exportCsv(`${slug(name)}-schedule.csv`, () => scheduleCsv(snapshot, meetingFor))
              }
              className="flex min-h-11 items-center rounded-md border border-slate-300 bg-white px-4 text-sm text-slate-700 hover:bg-slate-50"
            >
              Download the schedule (CSV)
            </button>
            <button
              type="button"
              onClick={() => exportCsv(`${slug(name)}-preferences.csv`, () => reportCsv(report))}
              className="flex min-h-11 items-center rounded-md border border-slate-300 bg-white px-4 text-sm text-slate-700 hover:bg-slate-50"
            >
              Download this report (CSV)
            </button>
            <button
              type="button"
              onClick={() => {
                toast.say('Opening your print dialog — the controls are left off the page.')
                window.print()
              }}
              className="flex min-h-11 items-center rounded-md border border-slate-300 bg-white px-4 text-sm text-slate-700 hover:bg-slate-50"
            >
              Print
            </button>
          </div>
        </>
      )}
    </section>
  )
}
