import { useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import { useCourses, type CourseRow } from '../hooks/queries'
import {
  useMySubmission,
  useOpenCycle,
  useSaveSubmission,
  useTaughtBefore,
  useTerms,
  type FullSubmission,
} from '../hooks/preferences'
import { ChipGroup, Section, TriState } from '../components/Chips'
import { useToast, useToastInset } from '../components/Toast'
import { DEFAULT_TERM, formKey, initialFormState } from '../lib/prefsForm'
import {
  MODALITY_LABEL,
  QUARTER_LABEL,
  TIER_LABEL,
  TIER_ORDER,
  TIER_STYLE,
  TIME_OF_DAY_LABEL,
  WEEKDAYS,
  type Modality,
  type PreferenceCycle,
  type Term,
  type TimeOfDay,
} from '../lib/types'

/**
 * Loads what the form needs and decides whether there is a form to show at
 * all. The form itself is a separate component so that its ten pieces of state
 * can be seeded from the saved submission at mount instead of being pushed in
 * by an effect — see `initialFormState`.
 */
export default function MyPreferences() {
  const { profile } = useAuth()
  const cycleQ = useOpenCycle()
  const cycle = cycleQ.data
  const termsQ = useTerms(cycle?.academic_year_id)
  const coursesQ = useCourses('undergraduate')
  const subQ = useMySubmission(cycle?.id, profile?.instructor_id)
  const taughtQ = useTaughtBefore(profile?.instructor_id)
  // The Save/Submit bar is pinned to the bottom of this page; keep the toast
  // stack above it rather than over the buttons.
  useToastInset(76)

  if (cycleQ.isLoading) return <p className="text-slate-500">Loading…</p>

  if (!cycle) {
    return (
      <div className="rounded-lg bg-surface p-6 ring-1 ring-slate-200">
        <h1 className="text-lg font-semibold text-slate-900">No open preference cycle</h1>
        <p className="mt-2 text-sm text-slate-600">
          There is nothing to fill in right now. You will be able to submit preferences once the
          coordinator opens the next cycle.
        </p>
      </div>
    )
  }

  if (!profile?.instructor_id) {
    return (
      <div className="rounded-lg bg-surface p-6 ring-1 ring-slate-200">
        <h1 className="text-lg font-semibold text-slate-900">Account not linked</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your sign-in ({profile?.email}) is not linked to an instructor record, so there is nowhere
          to store your preferences. Ask the coordinator to add your address to the instructor list.
        </p>
      </div>
    )
  }

  // Both are needed to seed the form, and seeding happens once, so the form
  // does not open until they are here.
  if (!subQ.data || !termsQ.data) return <p className="text-slate-500">Loading…</p>

  return (
    <PreferenceForm
      /*
       * The form is remounted only when it is seeded from a genuinely
       * different submission — a new cycle, or the first save turning a blank
       * form into a real one. Every other refetch — the one that follows a
       * saved draft, or the one `refetchOnReconnect` fires when a phone finds
       * signal again — leaves whatever the instructor has typed alone, which
       * is what the old hydrating effect could not promise.
       */
      key={formKey(cycle.id, subQ.data)}
      cycle={cycle}
      instructorId={profile.instructor_id}
      saved={subQ.data}
      terms={termsQ.data}
      courses={coursesQ.data ?? []}
      taught={taughtQ.data ?? EMPTY_SET}
    />
  )
}

/** Stable identity, so it cannot make `visibleCourses` recompute for nothing. */
const EMPTY_SET: ReadonlySet<string> = new Set<string>()

function PreferenceForm({
  cycle,
  instructorId,
  saved,
  terms: termList,
  courses,
  taught,
}: {
  cycle: PreferenceCycle
  instructorId: string
  saved: FullSubmission
  terms: Term[]
  courses: CourseRow[]
  taught: ReadonlySet<string>
}) {
  const save = useSaveSubmission()
  const toast = useToast()
  // Computed once, at mount. The key above is what makes "once" the right
  // number of times.
  const [initial] = useState(() => initialFormState(saved, termList))

  const [terms, setTerms] = useState(initial.terms)
  const [tiers, setTiers] = useState(initial.tiers)
  const [preferredDays, setPreferredDays] = useState(initial.preferredDays)
  const [blockedDays, setBlockedDays] = useState(initial.blockedDays)
  const [times, setTimes] = useState(initial.times)
  const [modalities, setModalities] = useState(initial.modalities)
  const [repeatPrep, setRepeatPrep] = useState(initial.repeatPrep)
  const [backToBack, setBackToBack] = useState(initial.backToBack)
  const [maxNewPreps, setMaxNewPreps] = useState(initial.maxNewPreps)
  const [note, setNote] = useState(initial.note)
  const [courseFilter, setCourseFilter] = useState('')
  const [onlyChosen, setOnlyChosen] = useState(false)

  const locked = saved.submission?.status === 'submitted'

  const visibleCourses = useMemo(() => {
    return courses.filter((c) => {
      if (onlyChosen && !tiers[c.id]) return false
      if (!courseFilter) return true
      return `${c.code} ${c.title}`.toLowerCase().includes(courseFilter.toLowerCase())
    })
  }, [courses, courseFilter, onlyChosen, tiers])

  const chosenCount = Object.keys(tiers).length
  const totalRequested = Object.values(terms).reduce((a, t) => a + (t.available ? t.desired : 0), 0)

  const submit = (status: 'draft' | 'submitted') => {
    save.mutate(
      {
        cycleId: cycle.id,
        instructorId,
        submissionId: saved.submission?.id ?? null,
        status,
        scalars: {
          preferred_days: preferredDays,
          blocked_days: blockedDays,
          preferred_times: times,
          modality_prefs: modalities,
          prefers_repeat_prep: repeatPrep,
          wants_back_to_back: backToBack,
          max_new_preps: maxNewPreps === '' ? null : Number(maxNewPreps),
          note_to_coordinator: note || null,
        },
        courses: Object.entries(tiers).map(([course_id, tier]) => ({ course_id, tier })),
        terms: Object.entries(terms).map(([term_id, t]) => ({
          term_id,
          available: t.available,
          desired_course_count: t.available ? t.desired : 0,
          leave_reason: t.available ? null : t.leaveReason || null,
        })),
      },
      {
        onSuccess: () =>
          status === 'submitted'
            ? toast.ok('Submitted. Thank you.')
            : toast.ok('Draft saved.'),
        onError: (e) => toast.failed('Could not save', e),
      },
    )
  }

  return (
    <div className="space-y-5 pb-24">
      <header className="rounded-lg bg-surface p-5 ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">Teaching preferences</h1>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-sm text-slate-700">{cycle.name}</span>
          {locked && (
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-sm font-medium text-emerald-800">
              submitted
            </span>
          )}
        </div>
        {cycle.instructions && <p className="mt-2 text-sm text-slate-600">{cycle.instructions}</p>}
        {cycle.closes_at && (
          <p className="mt-2 text-sm text-slate-500">
            Closes {new Date(cycle.closes_at).toLocaleString()}
          </p>
        )}
        {locked && (
          <p className="mt-2 text-sm text-slate-600">
            You have submitted. You can still revise and resubmit while the cycle is open.
          </p>
        )}
      </header>

      <Section
        title="Quarters"
        hint="Say which quarters you are available and how many sections you want in each."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {termList.map((t) => {
            const st = terms[t.id] ?? DEFAULT_TERM
            return (
              <div key={t.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-800">{QUARTER_LABEL[t.quarter]}</span>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={st.available}
                      onChange={(e) =>
                        setTerms({ ...terms, [t.id]: { ...st, available: e.target.checked } })
                      }
                    />
                    Available
                  </label>
                </div>
                {st.available ? (
                  <label className="mt-3 block text-sm text-slate-600">
                    Sections wanted
                    <input
                      type="number"
                      min={0}
                      max={6}
                      value={st.desired}
                      onChange={(e) =>
                        setTerms({ ...terms, [t.id]: { ...st, desired: Number(e.target.value) } })
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1"
                    />
                  </label>
                ) : (
                  <label className="mt-3 block text-sm text-slate-600">
                    Reason (optional)
                    <input
                      value={st.leaveReason}
                      onChange={(e) =>
                        setTerms({ ...terms, [t.id]: { ...st, leaveReason: e.target.value } })
                      }
                      placeholder="Sabbatical, course release…"
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1"
                    />
                  </label>
                )}
              </div>
            )
          })}
        </div>
        <p className="mt-3 text-sm text-slate-500">Total requested: {totalRequested} sections.</p>
      </Section>

      <Section
        title="Courses"
        hint="Rate any course you have an opinion about. Anything you leave blank is treated as no preference."
      >
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <input
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            placeholder="Filter courses…"
            className="w-64 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={onlyChosen} onChange={(e) => setOnlyChosen(e.target.checked)} />
            Only ones I have rated ({chosenCount})
          </label>
        </div>
        <div className="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
          {visibleCourses.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <span className="font-medium text-slate-800">{c.code}</span>
                <span className="ml-2 text-sm text-slate-600">{c.title}</span>
                {taught.has(c.id) && (
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                    taught before
                  </span>
                )}
              </div>
              <div className="flex gap-1">
                {TIER_ORDER.map((tier) => {
                  const active = tiers[c.id] === tier
                  return (
                    <button
                      key={tier}
                      type="button"
                      disabled={locked}
                      onClick={() => {
                        const next = { ...tiers }
                        if (active) delete next[c.id]
                        else next[c.id] = tier
                        setTiers(next)
                      }}
                      className={`rounded border px-2 py-0.5 text-xs transition-colors disabled:opacity-50 ${
                        active ? TIER_STYLE[tier] : 'border-slate-300 bg-surface text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {TIER_LABEL[tier]}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {visibleCourses.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-slate-500">No courses match.</p>
          )}
        </div>
      </Section>

      <Section title="Days, times and format">
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Days that suit you</p>
            <ChipGroup options={WEEKDAYS.map((d) => ({ value: d.value, label: d.label }))}
              selected={preferredDays} onChange={setPreferredDays} disabled={locked} />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Days to keep free</p>
            <ChipGroup tone="rose" options={WEEKDAYS.map((d) => ({ value: d.value, label: d.label }))}
              selected={blockedDays} onChange={setBlockedDays} disabled={locked} />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Times of day</p>
            <ChipGroup
              options={(Object.keys(TIME_OF_DAY_LABEL) as TimeOfDay[]).map((t) => ({
                value: t,
                label: TIME_OF_DAY_LABEL[t],
              }))}
              selected={times} onChange={setTimes} disabled={locked} />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Formats you are happy with</p>
            <ChipGroup
              options={(Object.keys(MODALITY_LABEL) as Modality[]).map((m) => ({
                value: m,
                label: MODALITY_LABEL[m],
              }))}
              selected={modalities} onChange={setModalities} disabled={locked} />
          </div>
        </div>
      </Section>

      <Section title="Anything else">
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">
              Would you rather repeat courses you have taught before?
            </p>
            <TriState value={repeatPrep} onChange={setRepeatPrep} disabled={locked} />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">
              Do you want your sections back to back on the same day?
            </p>
            <TriState value={backToBack} onChange={setBackToBack} disabled={locked} />
          </div>
          <label className="block text-sm font-medium text-slate-700">
            Most new preparations you want in the year
            <input
              type="number" min={0} max={6} value={maxNewPreps} disabled={locked}
              onChange={(e) => setMaxNewPreps(e.target.value)}
              placeholder="no limit"
              className="mt-1 block w-40 rounded-md border border-slate-300 px-2 py-1 disabled:opacity-50"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Note to the coordinator
            <textarea
              value={note} disabled={locked} rows={4}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything the form does not capture."
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 disabled:opacity-50"
            />
          </label>
        </div>
      </Section>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => submit('draft')}
              disabled={save.isPending}
              className="flex min-h-11 items-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {save.isPending ? 'Saving…' : 'Save draft'}
            </button>
            <button
              onClick={() => submit('submitted')}
              disabled={save.isPending}
              style={{ background: 'var(--uw-purple)' }}
              className="flex min-h-11 items-center rounded-md px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Submit
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
