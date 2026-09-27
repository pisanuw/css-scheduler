import type { FullSubmission } from '../hooks/preferences'
import type { Modality, PrefTier, Term, TimeOfDay } from './types'

export interface TermState {
  available: boolean
  desired: number
  leaveReason: string
}

/** Everything on the preferences form that an instructor can edit. */
export interface PrefsFormState {
  terms: Record<string, TermState>
  tiers: Record<string, PrefTier>
  preferredDays: number[]
  blockedDays: number[]
  times: TimeOfDay[]
  modalities: Modality[]
  repeatPrep: boolean | null
  backToBack: boolean | null
  /** A string, not a number: the input is legitimately empty for "no limit". */
  maxNewPreps: string
  note: string
}

/**
 * What an instructor who has never opened the form should see. Frozen because
 * it is handed straight to the quarter card as a fallback, and a shared object
 * that one card could edit would be everybody's default from then on.
 */
export const DEFAULT_TERM: Readonly<TermState> = Object.freeze({
  available: true,
  desired: 2,
  leaveReason: '',
})

/**
 * The form's starting values, read out of the saved submission.
 *
 * This used to be an effect that pushed ten `setState` calls whenever the
 * query's data changed, which meant a refetch put the saved answers back over
 * whatever the instructor had typed since. Saving a draft is enough: it
 * invalidates the submission, the server echoes what it was sent, and the
 * keystrokes between the tap and the answer were gone. Now the form is seeded
 * from this once, and remounted by key only when the submission it was seeded
 * from is genuinely a different one.
 */
export function initialFormState(saved: FullSubmission, terms: Term[]): PrefsFormState {
  const { submission, courses, terms: savedTerms } = saved
  const termState: Record<string, TermState> = {}
  for (const t of terms) {
    const row = savedTerms.find((s) => s.term_id === t.id)
    termState[t.id] = {
      available: row?.available ?? DEFAULT_TERM.available,
      // Null is what the column holds for a quarter somebody is away for, and
      // it must not read as "zero sections wanted" if they mark themselves
      // available again.
      desired: row?.desired_course_count ?? DEFAULT_TERM.desired,
      leaveReason: row?.leave_reason ?? '',
    }
  }
  return {
    terms: termState,
    tiers: Object.fromEntries(courses.map((c) => [c.course_id, c.tier])),
    preferredDays: submission?.preferred_days ?? [],
    blockedDays: submission?.blocked_days ?? [],
    times: submission?.preferred_times ?? [],
    modalities: submission?.modality_prefs ?? [],
    repeatPrep: submission?.prefers_repeat_prep ?? null,
    backToBack: submission?.wants_back_to_back ?? null,
    maxNewPreps: submission?.max_new_preps == null ? '' : String(submission.max_new_preps),
    note: submission?.note_to_coordinator ?? '',
  }
}

/**
 * The identity of the thing the form was seeded from. When this changes the
 * form is a different form and is remounted; when it does not, a refetch is
 * just a refetch and the instructor keeps their typing.
 *
 * The cycle is part of it because a submission id of `new` says nothing about
 * which cycle the blank form belongs to.
 */
export function formKey(cycleId: string, saved: FullSubmission): string {
  return `${cycleId}:${saved.submission?.id ?? 'new'}`
}
