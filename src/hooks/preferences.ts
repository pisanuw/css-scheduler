import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type {
  AcademicYear,
  PreferenceCourse,
  PreferenceCycle,
  PreferenceSubmission,
  PreferenceTerm,
  Term,
} from '../lib/types'

function rows<T>({ data, error }: { data: T[] | null; error: { message: string } | null }): T[] {
  if (error) throw new Error(error.message)
  return data ?? []
}

function one<T>({ data, error }: { data: T | null; error: { message: string } | null }): T | null {
  // A missing row is a legitimate state here (nobody has started yet), so
  // PGRST116 "no rows" is not treated as an error.
  if (error && !String(error.message).includes('multiple (or no) rows')) {
    const code = (error as { code?: string }).code
    if (code !== 'PGRST116') throw new Error(error.message)
  }
  return data
}

export const useAcademicYears = () =>
  useQuery({
    queryKey: ['academic_years'],
    queryFn: async () =>
      rows<AcademicYear>(await supabase.from('academic_years').select('*').order('start_year', { ascending: false })),
  })

export const useTerms = (academicYearId?: string) =>
  useQuery({
    enabled: !!academicYearId,
    queryKey: ['terms', academicYearId],
    queryFn: async () =>
      rows<Term>(
        await supabase.from('terms').select('*').eq('academic_year_id', academicYearId!).order('sort_order'),
      ),
  })

export const useCycles = () =>
  useQuery({
    queryKey: ['preference_cycles'],
    queryFn: async () =>
      rows<PreferenceCycle>(await supabase.from('preference_cycles').select('*').order('name')),
  })

/** The cycle instructors should currently be filling in, if any. */
export const useOpenCycle = () =>
  useQuery({
    queryKey: ['preference_cycles', 'open'],
    queryFn: async () => {
      const list = rows<PreferenceCycle>(
        await supabase.from('preference_cycles').select('*').eq('status', 'open').order('name'),
      )
      return list[0] ?? null
    },
  })

export interface FullSubmission {
  submission: PreferenceSubmission | null
  courses: PreferenceCourse[]
  terms: PreferenceTerm[]
}

export const useMySubmission = (cycleId?: string, instructorId?: string | null) =>
  useQuery<FullSubmission>({
    enabled: !!cycleId && !!instructorId,
    queryKey: ['submission', cycleId, instructorId],
    queryFn: async () => {
      const submission = one<PreferenceSubmission>(
        await supabase
          .from('preference_submissions')
          .select('*')
          .eq('cycle_id', cycleId!)
          .eq('instructor_id', instructorId!)
          .maybeSingle(),
      )
      if (!submission) return { submission: null, courses: [], terms: [] }
      const [courses, terms] = await Promise.all([
        supabase.from('preference_courses').select('*').eq('submission_id', submission.id),
        supabase.from('preference_terms').select('*').eq('submission_id', submission.id),
      ])
      return {
        submission,
        courses: rows<PreferenceCourse>(courses),
        terms: rows<PreferenceTerm>(terms),
      }
    },
  })

export interface SavePayload {
  cycleId: string
  instructorId: string
  submissionId: string | null
  status: 'draft' | 'submitted'
  scalars: Pick<
    PreferenceSubmission,
    | 'preferred_days'
    | 'blocked_days'
    | 'preferred_times'
    | 'modality_prefs'
    | 'prefers_repeat_prep'
    | 'wants_back_to_back'
    | 'max_new_preps'
    | 'note_to_coordinator'
  >
  courses: { course_id: string; tier: string }[]
  terms: { term_id: string; available: boolean; desired_course_count: number | null; leave_reason: string | null }[]
}

/**
 * Writes the submission and both child tables. Child rows are replaced rather
 * than diffed: the sets are small, and replacing keeps "I unticked a course"
 * from silently leaving a stale row behind.
 */
export function useSaveSubmission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: SavePayload) => {
      const { data: saved, error } = await supabase
        .from('preference_submissions')
        .upsert(
          {
            ...(p.submissionId ? { id: p.submissionId } : {}),
            cycle_id: p.cycleId,
            instructor_id: p.instructorId,
            status: p.status,
            submitted_at: p.status === 'submitted' ? new Date().toISOString() : null,
            ...p.scalars,
          },
          { onConflict: 'cycle_id,instructor_id' },
        )
        .select()
        .single()
      if (error) throw new Error(error.message)

      const submissionId = (saved as PreferenceSubmission).id

      const delCourses = await supabase.from('preference_courses').delete().eq('submission_id', submissionId)
      if (delCourses.error) throw new Error(delCourses.error.message)
      if (p.courses.length > 0) {
        const ins = await supabase
          .from('preference_courses')
          .insert(p.courses.map((c) => ({ ...c, submission_id: submissionId })))
        if (ins.error) throw new Error(ins.error.message)
      }

      const delTerms = await supabase.from('preference_terms').delete().eq('submission_id', submissionId)
      if (delTerms.error) throw new Error(delTerms.error.message)
      if (p.terms.length > 0) {
        const ins = await supabase
          .from('preference_terms')
          .insert(p.terms.map((t) => ({ ...t, submission_id: submissionId })))
        if (ins.error) throw new Error(ins.error.message)
      }
      return saved as PreferenceSubmission
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['submission', vars.cycleId] })
      qc.invalidateQueries({ queryKey: ['responses', vars.cycleId] })
    },
  })
}

export function useUpsertCycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: Partial<PreferenceCycle> & { academic_year_id: string; name: string }) => {
      const { data, error } = await supabase.from('preference_cycles').upsert(c).select().single()
      if (error) throw new Error(error.message)
      return data as PreferenceCycle
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['preference_cycles'] }),
  })
}

export interface ResponseRow {
  instructor_id: string
  full_name: string
  email: string | null
  category: string
  status: 'not_started' | 'draft' | 'submitted'
  submitted_at: string | null
  course_count: number
}

/** Coordinator view: every active instructor, with their submission state. */
export const useResponses = (cycleId?: string) =>
  useQuery<ResponseRow[]>({
    enabled: !!cycleId,
    queryKey: ['responses', cycleId],
    queryFn: async () => {
      const instructors = rows<{
        id: string
        full_name: string
        email: string | null
        category: string
        is_active: boolean
      }>(await supabase.from('instructors').select('id, full_name, email, category, is_active').order('full_name'))

      const subs = rows<PreferenceSubmission & { preference_courses: { count: number }[] }>(
        await supabase
          .from('preference_submissions')
          .select('*, preference_courses(count)')
          .eq('cycle_id', cycleId!),
      )
      const byInstructor = new Map(subs.map((s) => [s.instructor_id, s]))

      return instructors
        .filter((i) => i.is_active)
        .map((i) => {
          const s = byInstructor.get(i.id)
          return {
            instructor_id: i.id,
            full_name: i.full_name,
            email: i.email,
            category: i.category,
            status: s?.status ?? 'not_started',
            submitted_at: s?.submitted_at ?? null,
            course_count: s?.preference_courses?.[0]?.count ?? 0,
          }
        })
    },
  })

/** Courses this instructor has taught before, for the "new prep" hint. */
export const useTaughtBefore = (instructorId?: string | null) =>
  useQuery({
    enabled: !!instructorId,
    queryKey: ['taught_before', instructorId],
    queryFn: async () => {
      const data = rows<{ course_id: string | null }>(
        await supabase.from('teaching_history').select('course_id').eq('instructor_id', instructorId!),
      )
      return new Set(data.map((d) => d.course_id).filter((x): x is string => !!x))
    },
  })
