import type { AutofillRun } from '../../lib/autofill/run'
import type { FacultyResult } from '../../lib/autofill/engine'
import type { GlanceSection } from '../../lib/autofill/glance'
import { RULES_SHEET, describeRuleRow } from '../../lib/autofill/rules'
import { QUARTER_SHORT } from '../../lib/autofill/text'

/**
 * What one auto-fill produced, laid out to be read on a phone before the
 * workbook is opened on a laptop: the totals, the download, who is short and
 * why, and what is left for part-time instructors.
 *
 * The workbook holds all of this and more — every reason, every candidate —
 * so this is the summary that tells the coordinator whether the run is worth
 * downloading, not a second copy of the report.
 */

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg bg-surface p-4 ring-1 ring-slate-200">
      <div className="text-2xl font-semibold" style={{ color: 'var(--uw-purple-ink)' }}>
        {value}
      </div>
      <div className="mt-0.5 text-sm text-slate-600">{label}</div>
    </div>
  )
}

function sectionLine(s: GlanceSection): string {
  return `${QUARTER_SHORT[s.quarter]} ${s.label} · ${s.when}`
}

function FacultyCard({ f }: { f: FacultyResult }) {
  const short = f.prefs.kind === 'full-time' && f.gap > 1e-6
  const sections = [...f.fixed, ...f.placed]
  return (
    <li className="p-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className={`min-w-0 flex-1 font-medium text-slate-900 ${f.prefs.kind === 'part-time' ? 'italic' : ''}`}>{f.prefs.name}</span>
        <span className="text-sm text-slate-700">
          {fmt(f.load)}
          {f.prefs.kind === 'full-time' && <span className="text-slate-600"> / {fmt(f.prefs.target ?? 0)}</span>}
        </span>
        {f.prefs.newFaculty && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">new</span>}
        {short && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">short {fmt(f.gap)}</span>}
      </div>
      <p className="mt-1 text-xs text-slate-600">
        Aut {fmt(f.byQuarter.autumn)} · Win {fmt(f.byQuarter.winter)} · Spr {fmt(f.byQuarter.spring)}
        {f.topShare !== null && ` · ${Math.round(f.topShare * 100)}% from their top three`}
      </p>
      {sections.length > 0 && <p className="mt-1 text-xs text-slate-700">{sections.map(sectionLine).join('; ')}</p>}
      {short && <p className="mt-1 text-xs text-amber-800">{f.shortBecause.join('; ')}.</p>}
      {f.requestsMissed.length > 0 && <p className="mt-1 text-xs text-amber-800">G&amp;O / chair request not placed — {f.requestsMissed.join('; ')}.</p>}
      {f.prefs.flags.length > 0 && (
        <details className="mt-1">
          <summary className="flex min-h-11 cursor-pointer items-center text-xs font-medium text-slate-700">
            {f.prefs.flags.length} note{f.prefs.flags.length === 1 ? '' : 's'} to check
          </summary>
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-700">
            {f.prefs.flags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        </details>
      )}
    </li>
  )
}

export default function AutofillResults({
  run,
  onDownload,
}: {
  run: Pick<AutofillRun, 'schedule' | 'result' | 'rules' | 'tallies' | 'fullTimeLoad' | 'warnings' | 'outputName'>
  onDownload: () => void
}) {
  const fullTime = run.result.faculty.filter((f) => f.prefs.kind === 'full-time')
  const partTime = run.result.faculty.filter((f) => f.prefs.kind === 'part-time' && f.placed.length > 0)
  const short = fullTime.filter((f) => f.gap > 1e-6)
  const proposed = run.result.placements.length
  // Most short first, then by name: the people to talk to lead the list.
  const ordered = [...fullTime].sort((a, b) => b.gap - a.gap || a.prefs.name.localeCompare(b.prefs.name, undefined, { numeric: true }))

  return (
    <section aria-labelledby="autofill-result" className="mt-6">
      <h2 id="autofill-result" className="text-lg font-semibold text-slate-900">
        {run.schedule.yearLabel}, filled
      </h2>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat value={`${fmt(run.fullTimeLoad.placed)} of ${fmt(run.fullTimeLoad.owed)}`} label="full-time load placed" />
        <Stat value={String(proposed)} label="sections proposed" />
        <Stat value={String(run.result.open.length)} label="sections left open" />
      </div>

      <div className="mt-4 rounded-lg bg-surface p-4 ring-1 ring-slate-200">
        <button
          type="button"
          onClick={onDownload}
          style={{ background: 'var(--uw-purple)' }}
          className="flex min-h-11 w-full items-center justify-center rounded-md px-4 text-sm font-medium text-white hover:opacity-90 sm:w-auto"
        >
          Download the filled workbook
        </button>
        <p className="mt-2 text-sm text-slate-600">
          <span className="break-all">{run.outputName}</span> — your workbook with every proposed name shaded purple, plus sheets that
          explain each one, list what is left open and hold the preferences as read, for you to correct.
        </p>
      </div>

      <ul className="mt-4 space-y-1 text-sm text-slate-700">
        {run.tallies.map((t) => (
          <li key={t.quarter}>
            <span className="font-medium text-slate-900">{t.label}:</span> {t.toStaff} to staff — {t.fullTime} full-time
            {t.partTime > 0 && `, ${t.partTime} part-time`}, {t.open} open.
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-slate-600">
        Department rules{run.rules.source === 'default' ? ' (the defaults)' : ''}:{' '}
        {run.rules.rows.length ? run.rules.rows.map(describeRuleRow).join('; ') : 'none'}. Change them on the “{RULES_SHEET}” sheet of the
        workbook, then fill it again.
      </p>

      {run.warnings.length > 0 && (
        <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          {run.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}

      <h3 className="mt-6 font-semibold text-slate-900">
        Full-time faculty{' '}
        <span className="text-sm font-normal text-slate-600">
          {short.length === 0 ? '— everyone is at their load' : `— ${short.length} short of their load`}
        </span>
      </h3>
      <ul className="mt-2 divide-y divide-slate-200 rounded-lg bg-surface ring-1 ring-slate-200">
        {ordered.map((f) => (
          <FacultyCard key={f.prefs.name} f={f} />
        ))}
      </ul>

      {partTime.length > 0 && (
        <>
          <h3 className="mt-6 font-semibold text-slate-900">Part-time instructors placed</h3>
          <ul className="mt-2 divide-y divide-slate-200 rounded-lg bg-surface ring-1 ring-slate-200">
            {partTime.map((f) => (
              <FacultyCard key={f.prefs.name} f={f} />
            ))}
          </ul>
        </>
      )}

      {run.result.open.length > 0 && (
        <details className="mt-6 rounded-lg bg-surface ring-1 ring-slate-200">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 font-semibold text-slate-900">
            {run.result.open.length} sections left open
          </summary>
          <ul className="divide-y divide-slate-200 border-t border-slate-200">
            {run.result.open.map((o) => {
              const free = o.partTime.filter((c) => c.note === 'could take it').map((c) => c.name)
              return (
                <li key={o.section.id} className="p-3 text-sm">
                  <span className="font-medium text-slate-900">{sectionLine(o.section)}</span>
                  {o.section.reserved && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">reserved</span>}
                  <p className="mt-0.5 text-xs text-slate-600">
                    {free.length ? `Part-time free then: ${free.join(', ')}` : 'No part-time instructor asked for it at this time.'}
                  </p>
                </li>
              )
            })}
          </ul>
        </details>
      )}
    </section>
  )
}
