export type Quarter = 'autumn' | 'winter' | 'spring' | 'summer'
export type Modality = 'in_person' | 'hybrid' | 'online_sync' | 'online_async'
export type PrefTier = 'eager' | 'willing' | 'reluctant' | 'unqualified'
export type TimeOfDay = 'morning' | 'midday' | 'afternoon' | 'evening'
export type CycleStatus = 'draft' | 'open' | 'closed' | 'archived'
export type SubmissionStatus = 'not_started' | 'draft' | 'submitted'

export interface Term {
  id: string
  academic_year_id: string
  quarter: Quarter
  sort_order: number
}

export interface AcademicYear {
  id: string
  name: string
  start_year: number
  is_current: boolean
}

export interface PreferenceCycle {
  id: string
  academic_year_id: string
  name: string
  status: CycleStatus
  opens_at: string | null
  closes_at: string | null
  instructions: string | null
}

export interface PreferenceSubmission {
  id: string
  cycle_id: string
  instructor_id: string
  status: SubmissionStatus
  submitted_at: string | null
  preferred_days: number[]
  blocked_days: number[]
  preferred_times: TimeOfDay[]
  modality_prefs: Modality[]
  prefers_repeat_prep: boolean | null
  wants_back_to_back: boolean | null
  max_new_preps: number | null
  note_to_coordinator: string | null
}

export interface PreferenceCourse {
  id: string
  submission_id: string
  course_id: string
  tier: PrefTier
  note: string | null
}

export interface PreferenceTerm {
  id: string
  submission_id: string
  term_id: string
  available: boolean
  desired_course_count: number | null
  leave_reason: string | null
}

export const TIER_LABEL: Record<PrefTier, string> = {
  eager: 'Want to teach',
  willing: 'Willing',
  reluctant: 'Rather not',
  unqualified: 'Cannot teach',
}

export const TIER_ORDER: PrefTier[] = ['eager', 'willing', 'reluctant', 'unqualified']

export const TIER_STYLE: Record<PrefTier, string> = {
  eager: 'bg-emerald-600 text-white border-emerald-600',
  willing: 'bg-sky-600 text-white border-sky-600',
  reluctant: 'bg-amber-500 text-white border-amber-500',
  unqualified: 'bg-slate-500 text-white border-slate-500',
}

export const MODALITY_LABEL: Record<Modality, string> = {
  in_person: 'In person',
  hybrid: 'Hybrid',
  online_sync: 'Online (live)',
  online_async: 'Online (self-paced)',
}

export const TIME_OF_DAY_LABEL: Record<TimeOfDay, string> = {
  morning: 'Morning (before 11)',
  midday: 'Midday (11–3)',
  afternoon: 'Afternoon (3–5:30)',
  evening: 'Evening (5:45 and later)',
}

export const QUARTER_LABEL: Record<Quarter, string> = {
  autumn: 'Autumn',
  winter: 'Winter',
  spring: 'Spring',
  summer: 'Summer',
}

export const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
]
