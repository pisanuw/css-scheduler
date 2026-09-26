import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { AssignmentRow, SectionRow, SubmissionBundle, TimeSlotRow } from '../lib/snapshot'
import type { HistoryRow, SeedPlan } from '../lib/seedPlan'

function rows<T>({ data, error }: { data: T[] | null; error: { message: string } | null }): T[] {
  if (error) throw new Error(error.message)
  return data ?? []
}

export type ScenarioStatus = 'draft' | 'official' | 'archived'

export interface Scenario {
  id: string
  academic_year_id: string
  name: string
  description: string | null
  status: ScenarioStatus
  is_locked: boolean
  created_at: string
  updated_at: string
}

export const useScenarios = () =>
  useQuery({
    queryKey: ['scenarios'],
    queryFn: async () =>
      rows<Scenario>(
        await supabase.from('scenarios').select('*').order('updated_at', { ascending: false }),
      ),
  })

export const useScenario = (id?: string) =>
  useQuery({
    enabled: !!id,
    queryKey: ['scenario', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('scenarios').select('*').eq('id', id!).single()
      if (error) throw new Error(error.message)
      return data as Scenario
    },
  })

export function useSaveScenario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (s: Partial<Scenario> & { academic_year_id: string; name: string }) => {
      const { data, error } = await supabase.from('scenarios').upsert(s).select().single()
      if (error) throw new Error(error.message)
      return data as Scenario
    },
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['scenarios'] })
      qc.invalidateQueries({ queryKey: ['scenario', s.id] })
    },
  })
}

/**
 * Marking a scenario official has to clear the incumbent first: a partial
 * unique index allows only one per year, so a bare update would be rejected
 * whenever another draft already holds the title.
 */
export function useMakeOfficial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (s: Scenario) => {
      const demote = await supabase
        .from('scenarios')
        .update({ status: 'draft' })
        .eq('academic_year_id', s.academic_year_id)
        .eq('status', 'official')
        .neq('id', s.id)
      if (demote.error) throw new Error(demote.error.message)

      const { error } = await supabase.from('scenarios').update({ status: 'official' }).eq('id', s.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scenarios'] })
      qc.invalidateQueries({ queryKey: ['scenario'] })
    },
  })
}

export function useDeleteScenario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('scenarios').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scenarios'] }),
  })
}

export const useTimeSlots = () =>
  useQuery({
    queryKey: ['time_slots'],
    staleTime: Infinity, // The meeting grid changes about once a decade.
    queryFn: async () =>
      rows<TimeSlotRow>(
        await supabase.from('time_slots').select('*').eq('is_active', true).order('sort_order'),
      ),
  })

/**
 * Rooms labelled the way a time schedule writes them, 'UW1 050'. The table's
 * generated `label` column holds only the room number, which is ambiguous
 * across buildings, so the building code is joined on here instead.
 */
export const useRooms = () =>
  useQuery({
    queryKey: ['rooms'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [roomRows, buildingRows] = await Promise.all([
        supabase.from('rooms').select('id, building_id, room_number'),
        supabase.from('buildings').select('id, code'),
      ])
      const roomList = rows<{ id: string; building_id: string; room_number: string }>(roomRows)
      const codeById = new Map(
        rows<{ id: string; code: string }>(buildingRows).map((b) => [b.id, b.code]),
      )
      return roomList
        .map((r) => ({ id: r.id, label: `${codeById.get(r.building_id) ?? '?'} ${r.room_number}` }))
        .sort((a, b) => a.label.localeCompare(b.label))
    },
  })

/** Academic years the imported schedules cover, newest first. */
export const useHistoryYears = () =>
  useQuery({
    queryKey: ['history_years'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const all = rows<{ academic_year: string }>(
        await supabase.from('teaching_history').select('academic_year'),
      )
      return [...new Set(all.map((r) => r.academic_year))].sort().reverse()
    },
  })

/** The full imported schedule for one year, for seeding a scenario from it. */
export const useHistoryForYear = (year?: string) =>
  useQuery({
    enabled: !!year,
    queryKey: ['history_year', year],
    staleTime: 5 * 60 * 1000,
    queryFn: async () =>
      rows<HistoryRow>(
        await supabase
          .from('teaching_history')
          .select(
            'id, course_id, instructor_id, instructor_name_raw, course_code_raw, academic_year, quarter, section_letter, days, start_time, end_time, room_label, modality, enrollment_cap',
          )
          .eq('academic_year', year!),
      ),
  })

/**
 * Writes a plan: sections first, then the assignments, which need the ids the
 * insert hands back. Sections are matched to their plan by the same key the
 * table is unique on, so a section that collided and was not inserted simply
 * gets no assignments rather than the wrong ones.
 */
export function useApplySeedPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ scenarioId, plan }: { scenarioId: string; plan: SeedPlan }) => {
      if (plan.sections.length === 0) return { sections: 0, assignments: 0 }

      const payload = plan.sections.map(({ instructorIds: _ignored, ...s }) => ({
        ...s,
        scenario_id: scenarioId,
        status: 'planned' as const,
      }))
      const { data, error } = await supabase
        .from('sections')
        .insert(payload)
        .select('id, term_id, course_id, section_letter')
      if (error) throw new Error(error.message)

      const idByKey = new Map(
        (data as { id: string; term_id: string; course_id: string; section_letter: string }[]).map(
          (r) => [`${r.term_id}|${r.course_id}|${r.section_letter}`, r.id],
        ),
      )
      const links = plan.sections.flatMap((s) => {
        const id = idByKey.get(`${s.term_id}|${s.course_id}|${s.section_letter}`)
        return id ? s.instructorIds.map((instructor_id) => ({ section_id: id, instructor_id })) : []
      })
      if (links.length > 0) {
        const { error: linkError } = await supabase.from('section_instructors').insert(links)
        if (linkError) throw new Error(linkError.message)
      }
      return { sections: payload.length, assignments: links.length }
    },
    onSuccess: (_r, { scenarioId }) => {
      qc.invalidateQueries({ queryKey: ['board', scenarioId] })
      qc.invalidateQueries({ queryKey: ['scenario_changes', scenarioId] })
    },
  })
}

export interface BoardData {
  sections: SectionRow[]
  assignments: AssignmentRow[]
}

/**
 * Sections and their assignments in two round trips rather than one nested
 * select. The join table is filtered by the ids just fetched, which keeps both
 * result shapes flat and typed — worth more here than saving a request.
 */
export const useBoardData = (scenarioId?: string) =>
  useQuery<BoardData>({
    enabled: !!scenarioId,
    queryKey: ['board', scenarioId],
    queryFn: async () => {
      const sections = rows<SectionRow>(
        await supabase
          .from('sections')
          .select('*')
          .eq('scenario_id', scenarioId!)
          .order('section_letter'),
      )
      if (sections.length === 0) return { sections, assignments: [] }
      const assignments = rows<AssignmentRow>(
        await supabase
          .from('section_instructors')
          .select('*')
          .in('section_id', sections.map((s) => s.id)),
      )
      return { sections, assignments }
    },
  })

/** Every submission in a cycle, flattened into what the snapshot builder wants. */
export const useAllSubmissions = (cycleId?: string) =>
  useQuery<SubmissionBundle[]>({
    enabled: !!cycleId,
    queryKey: ['all_submissions', cycleId],
    queryFn: async () => {
      const subs = rows<{
        id: string
        instructor_id: string
        status: 'not_started' | 'draft' | 'submitted'
        blocked_days: number[]
        modality_prefs: SubmissionBundle['modality_prefs']
        max_new_preps: number | null
      }>(
        await supabase
          .from('preference_submissions')
          .select('id, instructor_id, status, blocked_days, modality_prefs, max_new_preps')
          .eq('cycle_id', cycleId!),
      )
      if (subs.length === 0) return []
      const ids = subs.map((s) => s.id)
      const [prefCourses, prefTerms] = await Promise.all([
        supabase.from('preference_courses').select('submission_id, course_id, tier').in('submission_id', ids),
        supabase
          .from('preference_terms')
          .select('submission_id, term_id, available, desired_course_count')
          .in('submission_id', ids),
      ])
      const courses = rows<{ submission_id: string; course_id: string; tier: SubmissionBundle['courses'][number]['tier'] }>(prefCourses)
      const terms = rows<{
        submission_id: string
        term_id: string
        available: boolean
        desired_course_count: number | null
      }>(prefTerms)

      return subs.map((s) => ({
        instructor_id: s.instructor_id,
        status: s.status,
        blocked_days: s.blocked_days ?? [],
        modality_prefs: s.modality_prefs ?? [],
        max_new_preps: s.max_new_preps,
        courses: courses.filter((c) => c.submission_id === s.id).map(({ course_id, tier }) => ({ course_id, tier })),
        terms: terms
          .filter((t) => t.submission_id === s.id)
          .map(({ term_id, available, desired_course_count }) => ({ term_id, available, desired_course_count })),
      }))
    },
  })

/**
 * Who has taught what, for everyone. The whole table is small (a few hundred
 * rows) and the board needs every instructor's history at once to count new
 * preparations, so paging it per person would cost more than it saves.
 */
export const useTeachingHistoryPairs = () =>
  useQuery({
    queryKey: ['history_pairs'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () =>
      rows<{ instructor_id: string | null; course_id: string | null }>(
        await supabase.from('teaching_history').select('instructor_id, course_id'),
      ),
  })

// ------------------------------------------------------------- section writes

/** Any board write also writes a change-log entry, by trigger. */
function invalidateBoard(qc: QueryClient, scenarioId: string) {
  qc.invalidateQueries({ queryKey: ['board', scenarioId] })
  qc.invalidateQueries({ queryKey: ['scenario_changes', scenarioId] })
}

export type SectionDraft = Omit<SectionRow, 'id'> & { id?: string }

export function useSaveSection(scenarioId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (s: SectionDraft) => {
      const { data, error } = await supabase.from('sections').upsert(s).select().single()
      if (error) throw new Error(error.message)
      return data as SectionRow
    },
    onSuccess: () => invalidateBoard(qc, scenarioId),
  })
}

export function useDeleteSection(scenarioId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sections').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidateBoard(qc, scenarioId),
  })
}

/**
 * Assign and unassign write the join table directly and update the cached
 * board in place first, so the conflict panel reacts on the same tap rather
 * than after a round trip. A failure rolls the cache back.
 */
export function useAssign(scenarioId: string) {
  const qc = useQueryClient()
  const key = ['board', scenarioId]
  return useMutation({
    mutationFn: async ({ sectionId, instructorId }: { sectionId: string; instructorId: string }) => {
      const { error } = await supabase
        .from('section_instructors')
        .insert({ section_id: sectionId, instructor_id: instructorId })
      if (error) throw new Error(error.message)
    },
    onMutate: async ({ sectionId, instructorId }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<BoardData>(key)
      if (previous) {
        qc.setQueryData<BoardData>(key, {
          ...previous,
          assignments: [
            ...previous.assignments,
            { id: `pending-${sectionId}-${instructorId}`, section_id: sectionId, instructor_id: instructorId, is_primary: true },
          ],
        })
      }
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: ['scenario_changes', scenarioId] })
    },
  })
}

/** Accepts several suggestions at once, in one round trip. */
export function useBulkAssign(scenarioId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (pairs: { sectionId: string; instructorId: string }[]) => {
      if (pairs.length === 0) return 0
      const { error } = await supabase
        .from('section_instructors')
        .insert(pairs.map((p) => ({ section_id: p.sectionId, instructor_id: p.instructorId })))
      if (error) throw new Error(error.message)
      return pairs.length
    },
    onSuccess: () => invalidateBoard(qc, scenarioId),
  })
}

export function useUnassign(scenarioId: string) {
  const qc = useQueryClient()
  const key = ['board', scenarioId]
  return useMutation({
    mutationFn: async ({ sectionId, instructorId }: { sectionId: string; instructorId: string }) => {
      const { error } = await supabase
        .from('section_instructors')
        .delete()
        .eq('section_id', sectionId)
        .eq('instructor_id', instructorId)
      if (error) throw new Error(error.message)
    },
    onMutate: async ({ sectionId, instructorId }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<BoardData>(key)
      if (previous) {
        qc.setQueryData<BoardData>(key, {
          ...previous,
          assignments: previous.assignments.filter(
            (a) => !(a.section_id === sectionId && a.instructor_id === instructorId),
          ),
        })
      }
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: ['scenario_changes', scenarioId] })
    },
  })
}

// ---------------------------------------------------------------- change log

export type ChangeAction = 'created' | 'updated' | 'deleted' | 'assigned' | 'unassigned'

export interface ScenarioChange {
  id: number
  scenario_id: string
  section_id: string | null
  action: ChangeAction
  summary: string
  actor_email: string | null
  occurred_at: string
  /**
   * What it takes to reverse this entry — the instructor and section of an
   * assignment, the section row as it stood before an edit. Written by the same
   * trigger that writes the summary. Empty for entries recorded before undo
   * existed, which is how the board knows not to offer one.
   */
  detail: Record<string, unknown>
  undone_at: string | null
  undone_by: string | null
  /** Set on the entry a reversal writes, naming what it reversed. */
  undoes_id: number | null
}

/**
 * Who changed what, newest first. Written by database triggers, so this is
 * read-only by construction — there is no policy that would let anyone insert,
 * edit or remove an entry.
 */
export const useScenarioChanges = (scenarioId?: string, limit = 200) =>
  useQuery({
    enabled: !!scenarioId,
    queryKey: ['scenario_changes', scenarioId, limit],
    queryFn: async () =>
      rows<ScenarioChange>(
        await supabase
          .from('scenario_changes')
          .select('*')
          .eq('scenario_id', scenarioId!)
          .order('occurred_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(limit),
      ),
  })

/**
 * Takes a change back. The reversal happens in the database, not here: the log
 * is append-only, so nothing outside it may mark an entry undone, and the
 * inverse write has to land in the log itself to keep the account complete.
 *
 * One id goes through `undo_change`, which returns what it reversed so the
 * board can name it. Several go through `undo_changes`, which reverses them in
 * one transaction and returns how many it managed.
 */
export function useUndoChanges(scenarioId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: number[]): Promise<{ count: number; summary: string | null }> => {
      if (ids.length === 0) return { count: 0, summary: null }
      if (ids.length === 1) {
        const { data, error } = await supabase.rpc('undo_change', { p_change_id: ids[0] })
        if (error) throw new Error(error.message)
        return { count: 1, summary: (data as string | null) ?? null }
      }
      const { data, error } = await supabase.rpc('undo_changes', { p_ids: ids })
      if (error) throw new Error(error.message)
      return { count: (data as number | null) ?? 0, summary: null }
    },
    onSuccess: () => invalidateBoard(qc, scenarioId),
  })
}
