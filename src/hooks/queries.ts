import { useQuery } from '@tanstack/react-query'
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
  annual_target_courses: number | null
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
