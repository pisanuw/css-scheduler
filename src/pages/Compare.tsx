import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useScenarioSnapshot } from '../hooks/useScenarioSnapshot'
import { useScenarios } from '../hooks/scheduling'
import { countBySeverity, detectConflicts } from '../lib/conflicts'
import {
  compareScenarios,
  comparisonCsv,
  TIER_BUCKETS,
  type ScenarioComparison,
  type TierBucket,
} from '../lib/report'
import { slug } from '../lib/download'
import ExportBar from '../components/ExportBar'
import PrintStamp from '../components/PrintStamp'

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

/**
 * Marks the better of two numbers. Only ever a hint: "fewer errors" is
 * genuinely better, but the coordinator decides what a draft is for.
 */
function Metric({
  label,
  value,
  better,
  hint,
}: {
  label: string
  value: string | number
  better: boolean | null
  hint?: string
}) {
  return (
    <div className="flex items-baseline gap-2 py-1.5">
      <span className="flex-1 text-sm text-slate-600">{label}</span>
      <span
        className={`text-sm font-semibold ${
          better === true ? 'text-emerald-700' : better === false ? 'text-slate-500' : 'text-slate-800'
        }`}
        title={hint}
      >
        {value}
        {better === true && <span aria-label=" (better)"> ✓</span>}
      </span>
    </div>
  )
}

/** Exported so the mobile check can put one on a 375px screen. */
export function Side({ c, other }: { c: ScenarioComparison; other: ScenarioComparison }) {
  const total = Object.values(c.byTier).reduce((a, b) => a + b, 0)
  const cmp = (mine: number | null, theirs: number | null, lowerIsBetter: boolean) => {
    if (mine === null || theirs === null || mine === theirs) return null
    return lowerIsBetter ? mine < theirs : mine > theirs
  }

  return (
    <section className="rounded-lg bg-white p-4 ring-1 ring-slate-200">
      <h2 className="font-semibold text-slate-900">{c.label}</h2>
      <div className="mt-2 divide-y divide-slate-100">
        <Metric
          label="Preferences met"
          value={pct(c.satisfaction)}
          better={cmp(c.satisfaction, other.satisfaction, false)}
          hint="Of assignments the instructor actually rated"
        />
        <Metric label="Sections" value={c.sections} better={null} />
        <Metric
          label="Unstaffed"
          value={c.unstaffed}
          better={cmp(c.unstaffed, other.unstaffed, true)}
        />
        <Metric label="Errors" value={c.errors} better={cmp(c.errors, other.errors, true)} />
        <Metric label="Warnings" value={c.warnings} better={cmp(c.warnings, other.warnings, true)} />
      </div>

      {total > 0 && (
        <>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-100">
            {TIER_BUCKETS.filter((t) => c.byTier[t] > 0).map((t) => (
              <div
                key={t}
                className={TIER_BAR[t]}
                style={{ width: `${(c.byTier[t] / total) * 100}%` }}
                title={`${TIER_LABEL[t]}: ${c.byTier[t]}`}
              />
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
            {TIER_BUCKETS.filter((t) => c.byTier[t] > 0).map((t) => (
              <li key={t} className="flex items-center gap-1">
                <span className={`h-2 w-2 rounded-sm ${TIER_BAR[t]}`} aria-hidden />
                {TIER_LABEL[t]} {c.byTier[t]}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-3">
        <h3 className="text-sm font-medium text-slate-700">
          Teaching only here <span className="font-normal text-slate-500">({c.onlyHere.length})</span>
        </h3>
        {c.onlyHere.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">The same people teach in both.</p>
        ) : (
          <p className="mt-1 text-xs text-slate-600">{c.onlyHere.join(', ')}</p>
        )}
      </div>
    </section>
  )
}

export default function Compare() {
  const scenarios = useScenarios()
  const [leftId, setLeftId] = useState<string>('')
  const [rightId, setRightId] = useState<string>('')

  // Default to the two most recently touched drafts.
  useEffect(() => {
    const list = (scenarios.data ?? []).filter((s) => s.status !== 'archived')
    if (!leftId && list[0]) setLeftId(list[0].id)
    if (!rightId && list[1]) setRightId(list[1].id)
  }, [scenarios.data, leftId, rightId])

  const left = useScenarioSnapshot(leftId || undefined)
  const right = useScenarioSnapshot(rightId || undefined)

  const sides = useMemo(() => {
    if (!left.scenario.data || !right.scenario.data) return null
    const lc = detectConflicts(left.snapshot)
    const rc = detectConflicts(right.snapshot)
    const lCount = countBySeverity(lc)
    const rCount = countBySeverity(rc)
    return compareScenarios(
      {
        label: left.scenario.data.name,
        snapshot: left.snapshot,
        errors: lCount.error,
        warnings: lCount.warning,
      },
      {
        label: right.scenario.data.name,
        snapshot: right.snapshot,
        errors: rCount.error,
        warnings: rCount.warning,
      },
    )
  }, [left.scenario.data, left.snapshot, right.scenario.data, right.snapshot])

  const options = (scenarios.data ?? []).filter((s) => s.status !== 'archived')

  if (options.length < 2)
    return (
      <section>
        <h1 className="text-xl font-semibold text-slate-900">Compare scenarios</h1>
        <p className="mt-3 rounded-lg bg-white p-6 text-sm text-slate-600 ring-1 ring-slate-200">
          Comparing needs two drafts of the same year.{' '}
          <Link to="/scenarios" className="underline">
            Create another
          </Link>{' '}
          and fill it in differently — then this page shows which one serves people better.
        </p>
      </section>
    )

  const differentYears =
    left.scenario.data &&
    right.scenario.data &&
    left.scenario.data.academic_year_id !== right.scenario.data.academic_year_id

  return (
    <section>
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Compare scenarios</h1>

      {sides && leftId !== rightId && (
        <PrintStamp subject={`${sides[0].label} against ${sides[1].label}`} />
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 print:hidden sm:grid-cols-2">
        {[
          { value: leftId, set: setLeftId, label: 'First' },
          { value: rightId, set: setRightId, label: 'Second' },
        ].map((s) => (
          <label key={s.label} className="block text-sm text-slate-600">
            {s.label}
            <select
              value={s.value}
              onChange={(e) => s.set(e.target.value)}
              className="mt-1 block min-h-11 w-full rounded-md border border-slate-300 px-2"
            >
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.status})
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {differentYears && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          These are drafts of different academic years, so the totals are not really comparable.
        </p>
      )}

      {leftId === rightId ? (
        <p className="rounded-lg bg-white p-6 text-sm text-slate-600 ring-1 ring-slate-200">
          Pick two different scenarios.
        </p>
      ) : !sides ? (
        <p className="text-sm text-slate-500">Loading both scenarios…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Side c={sides[0]} other={sides[1]} />
            <Side c={sides[1]} other={sides[0]} />
          </div>

          <ExportBar
            className="mt-4"
            csvs={[
              {
                label: 'Download this comparison (CSV)',
                filename: `${slug(sides[0].label)}-vs-${slug(sides[1].label)}.csv`,
                build: () => comparisonCsv(sides),
              },
            ]}
          />
        </>
      )}
    </section>
  )
}
