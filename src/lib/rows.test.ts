import { describe, expect, it } from 'vitest'
import {
  accessEventFrom,
  accessSummaryFrom,
  changeDetail,
  courseFrom,
  loadTargetFrom,
} from './rows'
import type { Tables } from './database.types'

const loadTarget = (over: Partial<Tables<'instructor_load_targets'>> = {}) => ({
  instructor_id: 'i1',
  full_name: 'A. Instructor',
  category: 'full_time' as const,
  academic_year_id: 'y1',
  academic_year: '2026-27',
  base_annual_courses: 6,
  released_courses: 1,
  effective_target: 5,
  ...over,
})

describe('loadTargetFrom', () => {
  it('keeps a complete row as it stands', () => {
    expect(loadTargetFrom(loadTarget())).toEqual({
      instructor_id: 'i1',
      full_name: 'A. Instructor',
      category: 'full_time',
      academic_year_id: 'y1',
      academic_year: '2026-27',
      base_annual_courses: 6,
      released_courses: 1,
      effective_target: 5,
    })
  })

  // Both are genuinely nullable in the view: an instructor with no baseline has
  // no target to compute.
  it('carries a missing baseline and target through', () => {
    const t = loadTargetFrom(loadTarget({ base_annual_courses: null, effective_target: null }))
    expect(t).toMatchObject({ base_annual_courses: null, effective_target: null })
  })

  it('reads a null release count as none released', () => {
    expect(loadTargetFrom(loadTarget({ released_courses: null }))?.released_courses).toBe(0)
  })

  it('drops a row it cannot identify rather than rendering a nameless line', () => {
    expect(loadTargetFrom(loadTarget({ instructor_id: null }))).toBeNull()
    expect(loadTargetFrom(loadTarget({ full_name: null }))).toBeNull()
    expect(loadTargetFrom(loadTarget({ category: null }))).toBeNull()
    expect(loadTargetFrom(loadTarget({ academic_year_id: null }))).toBeNull()
    expect(loadTargetFrom(loadTarget({ academic_year: null }))).toBeNull()
  })
})

describe('accessSummaryFrom', () => {
  const row = (over: Partial<Tables<'access_summary'>> = {}) => ({
    email: 'someone@uw.edu',
    full_name: 'A. Instructor',
    role: 'coordinator' as const,
    first_seen: '2026-09-01T00:00:00Z',
    last_seen: '2026-09-26T00:00:00Z',
    visits: 4,
    ...over,
  })

  it('keeps a complete row', () => {
    expect(accessSummaryFrom(row())).toMatchObject({ email: 'someone@uw.edu', visits: 4 })
  })

  // Someone who signed in but has no profile or instructor record: the left
  // joins are why these two are nullable, and the row still belongs in the list.
  it('keeps a row with no profile behind it', () => {
    expect(accessSummaryFrom(row({ full_name: null, role: null }))).toMatchObject({
      email: 'someone@uw.edu',
      full_name: null,
      role: null,
    })
  })

  it('drops a row with nothing to identify or date it by', () => {
    expect(accessSummaryFrom(row({ email: null }))).toBeNull()
    expect(accessSummaryFrom(row({ first_seen: null }))).toBeNull()
    expect(accessSummaryFrom(row({ last_seen: null }))).toBeNull()
    expect(accessSummaryFrom(row({ visits: null }))).toBeNull()
  })

  it('keeps a visit count of zero, which is not the same as missing', () => {
    expect(accessSummaryFrom(row({ visits: 0 }))?.visits).toBe(0)
  })
})

describe('accessEventFrom', () => {
  const row = (event: string) => ({
    id: 1,
    email: 'someone@uw.edu',
    event,
    provider: 'google',
    occurred_at: '2026-09-26T00:00:00Z',
    user_id: null,
  })

  it('narrows the two values the column allows', () => {
    expect(accessEventFrom(row('sign_up')).event).toBe('sign_up')
    expect(accessEventFrom(row('sign_in')).event).toBe('sign_in')
  })

  // Only reachable by changing the check constraint, and then a sign-in is the
  // reading that claims less about the reader than a first sign-in would.
  it('reads anything else as a sign-in', () => {
    expect(accessEventFrom(row('something_new')).event).toBe('sign_in')
  })

  it('leaves the rest of the row alone', () => {
    expect(accessEventFrom(row('sign_in'))).toMatchObject({ id: 1, provider: 'google' })
  })
})

describe('courseFrom', () => {
  const row = (over: Partial<Tables<'courses'>> = {}) => ({
    id: 'c1',
    subject: 'CSS',
    number: 342,
    code: 'CSS 342',
    title: 'Data Structures',
    credits_min: 5,
    credits_max: 5,
    level: 'undergraduate' as const,
    prereq_text: null,
    is_active: true,
    notes: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...over,
  })

  it('keeps the generated code', () => {
    expect(courseFrom(row()).code).toBe('CSS 342')
  })

  // The column is `generated always as (subject || ' ' || number::text)`, so
  // recomputing it is the same answer rather than a placeholder.
  it('recomputes the code the one way the schema defines it', () => {
    expect(courseFrom(row({ code: null })).code).toBe('CSS 342')
    expect(courseFrom(row({ code: null, subject: 'CSSE', number: 102 })).code).toBe('CSSE 102')
  })
})

describe('changeDetail', () => {
  it('passes an object through', () => {
    expect(changeDetail({ section: { id: 's1' } })).toEqual({ section: { id: 's1' } })
  })

  // What an entry written before the undo migration holds, and what `canUndo`
  // reads as "no undo offered".
  it('reads an empty object as empty', () => {
    expect(changeDetail({})).toEqual({})
  })

  it('reads anything that is not an object as empty', () => {
    expect(changeDetail(null)).toEqual({})
    expect(changeDetail([1, 2])).toEqual({})
    expect(changeDetail(7)).toEqual({})
    expect(changeDetail('section')).toEqual({})
    expect(changeDetail(false)).toEqual({})
  })
})
