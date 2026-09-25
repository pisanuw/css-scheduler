import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface CourseRow {
  id: string
  code: string
  number: number
  title: string
  credits_min: number
  credits_max: number
  level: 'undergraduate' | 'graduate'
  prereq_text: string | null
  is_active: boolean
}

export interface InstructorRow {
  id: string
  full_name: string
  email: string | null
  rank: string | null
  category: string
  is_active: boolean
  base_annual_courses: number | null
  max_courses_per_quarter: number | null
}

export interface HistoryRow {
  id: string
  instructor_name_raw: string
  course_code_raw: string
  academic_year: string
  quarter: string
  section_letter: string | null
  days: number[] | null
  start_time: string | null
  end_time: string | null
  room_label: string | null
  enrollment: number | null
  enrollment_cap: number | null
}

/** Surfaces the Postgres error rather than silently returning an empty list. */
function unwrap<T>({ data, error }: { data: T[] | null; error: { message: string } | null }): T[] {
  if (error) throw new Error(error.message)
  return data ?? []
}

export const useCourses = (level?: 'undergraduate' | 'graduate') =>
  useQuery({
    queryKey: ['courses', level ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('courses').select('*').order('number')
      if (level) q = q.eq('level', level)
      return unwrap<CourseRow>(await q)
    },
  })

export const useInstructors = () =>
  useQuery({
    queryKey: ['instructors'],
    queryFn: async () =>
      unwrap<InstructorRow>(
        await supabase.from('instructors').select('*').order('full_name'),
      ),
  })

export const useTeachingHistory = () =>
  useQuery({
    queryKey: ['teaching_history'],
    queryFn: async () =>
      unwrap<HistoryRow>(
        await supabase
          .from('teaching_history')
          .select('*')
          .order('academic_year')
          .order('quarter')
          .order('course_code_raw'),
      ),
  })

/** Baseline minus releases, per instructor per academic year. */
export interface LoadTarget {
  instructor_id: string
  full_name: string
  category: string
  academic_year_id: string
  academic_year: string
  base_annual_courses: number | null
  released_courses: number
  effective_target: number | null
}

export const useLoadTargets = (academicYearId?: string) =>
  useQuery({
    enabled: !!academicYearId,
    queryKey: ['load_targets', academicYearId],
    queryFn: async () =>
      unwrap<LoadTarget>(
        await supabase
          .from('instructor_load_targets')
          .select('*')
          .eq('academic_year_id', academicYearId!)
          .order('full_name'),
      ),
  })

export interface TeachingRelease {
  id: string
  instructor_id: string
  academic_year_id: string | null
  courses: number
  reason: string
  created_at: string
}

export const useReleases = (instructorId?: string) =>
  useQuery({
    enabled: !!instructorId,
    queryKey: ['teaching_releases', instructorId],
    queryFn: async () =>
      unwrap<TeachingRelease>(
        await supabase
          .from('teaching_releases')
          .select('*')
          .eq('instructor_id', instructorId!)
          .order('created_at'),
      ),
  })

function invalidateLoad(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['load_targets'] })
  qc.invalidateQueries({ queryKey: ['teaching_releases'] })
}

export function useAddRelease() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (r: {
      instructor_id: string
      academic_year_id: string | null
      courses: number
      reason: string
    }) => {
      const { data, error } = await supabase.from('teaching_releases').insert(r).select().single()
      if (error) throw new Error(error.message)
      return data as TeachingRelease
    },
    onSuccess: () => invalidateLoad(qc),
  })
}

export function useDeleteRelease() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('teaching_releases').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidateLoad(qc),
  })
}

/** Admin only: sign-in history. RLS restricts both of these to coordinators. */
export interface AccessSummaryRow {
  email: string
  full_name: string | null
  role: string | null
  first_seen: string
  last_seen: string
  visits: number
}

export interface AccessLogRow {
  id: number
  email: string
  event: 'sign_up' | 'sign_in'
  provider: string | null
  occurred_at: string
  user_id: string | null
}

export const useAccessSummary = () =>
  useQuery({
    queryKey: ['access_summary'],
    queryFn: async () =>
      unwrap<AccessSummaryRow>(
        await supabase.from('access_summary').select('*').order('last_seen', { ascending: false }),
      ),
  })

export const useAccessLog = (limit = 200) =>
  useQuery({
    queryKey: ['access_log', limit],
    queryFn: async () =>
      unwrap<AccessLogRow>(
        await supabase
          .from('access_log')
          .select('*')
          .order('occurred_at', { ascending: false })
          .limit(limit),
      ),
  })
