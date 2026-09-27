/**
 * The row shapes the application works with, and the checks that turn a
 * database row into one.
 *
 * `database.types.ts` is generated from the schema, so it says exactly what
 * Postgres can prove and nothing more. Three kinds of column come back wider
 * than the value ever is, and each is handled here rather than with a cast:
 *
 * - **View columns are always nullable.** Postgres records no not-null
 *   constraint for a view, so `instructor_load_targets.instructor_id` is
 *   `string | null` even though it is `instructors.id`. The check below is a
 *   real one: a row that somehow arrived without an id is dropped rather than
 *   rendered as a nameless line in the load table.
 * - **A `check` constraint is not a type.** `access_log.event` is `text` with
 *   `check (event in ('sign_up', 'sign_in'))`, which generates as `string`.
 * - **`jsonb` is `Json`.** `scenario_changes.detail` always holds an object
 *   because a trigger writes it, but the column would accept an array or a
 *   number, and undo reads it.
 *
 * Pure functions, so the reconciliation is tested without a database. The
 * alternative — `data as LoadTarget[]` at each call site — compiles just as
 * happily and is wrong in exactly the cases nobody can reproduce.
 */

import type { Tables } from './database.types'

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

/**
 * `null` for a row the view could not identify, which the caller drops. Every
 * column checked here is non-null in the tables the view selects from, so this
 * returning `null` means the view definition changed under the application.
 */
export function loadTargetFrom(r: Tables<'instructor_load_targets'>): LoadTarget | null {
  const { instructor_id, full_name, category, academic_year_id, academic_year } = r
  if (!instructor_id || !full_name || !category || !academic_year_id || !academic_year) return null
  return {
    instructor_id,
    full_name,
    category,
    academic_year_id,
    academic_year,
    base_annual_courses: r.base_annual_courses,
    // `coalesce(r.released, 0)` in the view, so only a changed view can be null.
    released_courses: r.released_courses ?? 0,
    effective_target: r.effective_target,
  }
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

export function accessSummaryFrom(r: Tables<'access_summary'>): AccessSummaryRow | null {
  // The view groups by a `not null citext` and aggregates with min/max/count
  // over at least one row, so all four are present for any row it returns.
  if (!r.email || !r.first_seen || !r.last_seen || r.visits === null) return null
  return {
    email: r.email,
    full_name: r.full_name,
    role: r.role,
    first_seen: r.first_seen,
    last_seen: r.last_seen,
    visits: r.visits,
  }
}

export interface AccessLogRow {
  id: number
  email: string
  event: 'sign_up' | 'sign_in'
  provider: string | null
  occurred_at: string
  user_id: string | null
}

/**
 * The column's `check` constraint allows the two values the page distinguishes,
 * so anything else would be a schema change; it is read as a sign-in, which is
 * the one that says less about the reader.
 */
export function accessEventFrom(r: Tables<'access_log'>): AccessLogRow {
  return { ...r, event: r.event === 'sign_up' ? 'sign_up' : 'sign_in' }
}

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

/**
 * `courses.code` is `generated always as (subject || ' ' || number::text)` over
 * two not-null columns, so it is never null — but a generated column carries no
 * not-null constraint of its own, and the type reflects that. Recomputing the
 * same expression is better than a fallback that would show a course with no
 * code at all.
 */
export function courseFrom(r: Tables<'courses'>): CourseRow {
  return { ...r, code: r.code ?? `${r.subject} ${r.number}` }
}

/**
 * A change-log entry's `detail`, as the object the undo trigger writes. Anything
 * else — an array, a bare number, JSON `null` — reads as empty, which is how
 * `canUndo` already describes an entry written before undo existed.
 */
export function changeDetail(detail: Tables<'scenario_changes'>['detail']): Record<string, unknown> {
  return typeof detail === 'object' && detail !== null && !Array.isArray(detail) ? detail : {}
}
