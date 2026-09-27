import { describe, expect, it } from 'vitest'
import type { FullSubmission } from '../hooks/preferences'
import type { PreferenceSubmission, Term } from './types'
import { formKey, initialFormState } from './prefsForm'

const terms: Term[] = [
  { id: 'au', academic_year_id: 'ay', quarter: 'autumn', sort_order: 1 },
  { id: 'wi', academic_year_id: 'ay', quarter: 'winter', sort_order: 2 },
  { id: 'sp', academic_year_id: 'ay', quarter: 'spring', sort_order: 3 },
]

const submission = (over: Partial<PreferenceSubmission> = {}): PreferenceSubmission => ({
  id: 'sub1',
  cycle_id: 'cy1',
  instructor_id: 'in1',
  status: 'draft',
  submitted_at: null,
  preferred_days: [1, 3],
  blocked_days: [5],
  preferred_times: ['morning'],
  modality_prefs: ['in_person'],
  prefers_repeat_prep: true,
  wants_back_to_back: false,
  max_new_preps: 1,
  note_to_coordinator: 'Away in March.',
  ...over,
})

const empty: FullSubmission = { submission: null, courses: [], terms: [] }

describe('initialFormState', () => {
  it('gives every quarter a default for an instructor who has never opened the form', () => {
    const state = initialFormState(empty, terms)
    expect(Object.keys(state.terms)).toEqual(['au', 'wi', 'sp'])
    expect(state.terms.wi).toEqual({ available: true, desired: 2, leaveReason: '' })
    expect(state).toMatchObject({
      tiers: {},
      preferredDays: [],
      blockedDays: [],
      times: [],
      modalities: [],
      repeatPrep: null,
      backToBack: null,
      maxNewPreps: '',
      note: '',
    })
  })

  it('reads back everything a saved submission holds', () => {
    const state = initialFormState(
      {
        submission: submission(),
        courses: [
          { id: 'pc1', submission_id: 'sub1', course_id: 'c343', tier: 'eager', note: null },
          { id: 'pc2', submission_id: 'sub1', course_id: 'c301', tier: 'reluctant', note: null },
        ],
        terms: [
          {
            id: 'pt1',
            submission_id: 'sub1',
            term_id: 'wi',
            available: false,
            desired_course_count: null,
            leave_reason: 'Sabbatical',
          },
        ],
      },
      terms,
    )
    expect(state.tiers).toEqual({ c343: 'eager', c301: 'reluctant' })
    expect(state.terms.wi).toEqual({ available: false, desired: 2, leaveReason: 'Sabbatical' })
    // Quarters with no saved row still get the default rather than dropping out.
    expect(state.terms.au).toEqual({ available: true, desired: 2, leaveReason: '' })
    expect(state).toMatchObject({
      preferredDays: [1, 3],
      blockedDays: [5],
      times: ['morning'],
      modalities: ['in_person'],
      repeatPrep: true,
      backToBack: false,
      maxNewPreps: '1',
      note: 'Away in March.',
    })
  })

  /*
   * `desired_course_count` is null for a quarter somebody is away for. Reading
   * that back as zero would mean an instructor who un-ticks "away" is silently
   * asking for no sections, which is the one answer the coordinator cannot
   * tell apart from a considered one.
   */
  it('does not read a null section count as zero', () => {
    const state = initialFormState(
      {
        submission: submission(),
        courses: [],
        terms: [
          {
            id: 'pt1',
            submission_id: 'sub1',
            term_id: 'au',
            available: true,
            desired_course_count: null,
            leave_reason: null,
          },
        ],
      },
      terms,
    )
    expect(state.terms.au?.desired).toBe(2)
  })

  it('keeps a deliberate zero', () => {
    const state = initialFormState(
      {
        submission: submission(),
        courses: [],
        terms: [
          {
            id: 'pt1',
            submission_id: 'sub1',
            term_id: 'au',
            available: true,
            desired_course_count: 0,
            leave_reason: null,
          },
        ],
      },
      terms,
    )
    expect(state.terms.au?.desired).toBe(0)
  })

  it('reads a zero preference limit as "0", not as "no limit"', () => {
    expect(initialFormState({ ...empty, submission: submission({ max_new_preps: 0 }) }, terms)
      .maxNewPreps).toBe('0')
    expect(initialFormState({ ...empty, submission: submission({ max_new_preps: null }) }, terms)
      .maxNewPreps).toBe('')
  })

  it('survives a submission whose array columns came back null', () => {
    const state = initialFormState(
      {
        ...empty,
        submission: submission({
          preferred_days: null as unknown as number[],
          modality_prefs: null as unknown as PreferenceSubmission['modality_prefs'],
        }),
      },
      terms,
    )
    expect(state.preferredDays).toEqual([])
    expect(state.modalities).toEqual([])
  })

  it('has no quarters when the terms have not loaded', () => {
    expect(initialFormState(empty, []).terms).toEqual({})
  })
})

describe('formKey', () => {
  // Two refetches of the same submission must produce the same key, or the
  // form remounts underneath whoever is typing into it.
  it('is stable across refetches of the same submission', () => {
    const a: FullSubmission = { submission: submission(), courses: [], terms: [] }
    const b: FullSubmission = { submission: submission(), courses: [], terms: [] }
    expect(formKey('cy1', a)).toBe(formKey('cy1', b))
  })

  it('changes when the first save turns a blank form into a submission', () => {
    expect(formKey('cy1', empty)).toBe('cy1:new')
    expect(formKey('cy1', { submission: submission(), courses: [], terms: [] })).toBe('cy1:sub1')
  })

  it('separates blank forms in different cycles', () => {
    expect(formKey('cy1', empty)).not.toBe(formKey('cy2', empty))
  })
})
