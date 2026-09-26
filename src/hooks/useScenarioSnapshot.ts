import { useMemo } from 'react'
import { buildSnapshot } from '../lib/snapshot'
import { useCourses, useInstructors, useLoadTargets } from './queries'
import { useCycles, useTerms } from './preferences'
import {
  useAllSubmissions,
  useBoardData,
  useRooms,
  useScenario,
  useTeachingHistoryPairs,
  useTimeSlots,
} from './scheduling'

/**
 * Everything one scenario needs, assembled into the conflict engine's input.
 *
 * The board, the report and the comparison all want the same snapshot, and
 * building it in three places would mean three chances to narrow it wrongly.
 * React Query caches every underlying request, so a second caller on the same
 * page costs nothing.
 */
export function useScenarioSnapshot(scenarioId?: string) {
  const scenario = useScenario(scenarioId)
  const yearId = scenario.data?.academic_year_id

  const terms = useTerms(yearId)
  const courses = useCourses('undergraduate')
  const instructors = useInstructors()
  const loadTargets = useLoadTargets(yearId)
  const timeSlots = useTimeSlots()
  const rooms = useRooms()
  const board = useBoardData(scenarioId)
  const history = useTeachingHistoryPairs()
  const cycles = useCycles()

  // Preferences come from the cycle that collected them for this same year.
  const cycleId = useMemo(
    () => (cycles.data ?? []).find((c) => c.academic_year_id === yearId)?.id,
    [cycles.data, yearId],
  )
  const submissions = useAllSubmissions(cycleId)

  /**
   * Always the whole year, never one quarter: annual targets and new-prep
   * counts are year-wide, so narrowing it would make the findings wrong.
   */
  const snapshot = useMemo(() => {
    const assigned = new Set((board.data?.assignments ?? []).map((a) => a.instructor_id))
    return buildSnapshot({
      terms: terms.data ?? [],
      sections: board.data?.sections ?? [],
      assignments: board.data?.assignments ?? [],
      courses: courses.data ?? [],
      timeSlots: timeSlots.data ?? [],
      rooms: rooms.data ?? [],
      // Inactive people stay listed while they still hold an assignment, so a
      // stale row reads as something to fix rather than vanishing.
      instructors: (instructors.data ?? []).filter((i) => i.is_active || assigned.has(i.id)),
      loadTargets: loadTargets.data ?? [],
      submissions: submissions.data ?? [],
      history: history.data ?? [],
    })
  }, [
    terms.data,
    board.data,
    courses.data,
    timeSlots.data,
    rooms.data,
    instructors.data,
    loadTargets.data,
    submissions.data,
    history.data,
  ])

  return {
    scenario,
    snapshot,
    board,
    terms,
    courses,
    /**
     * The roster as rows, not as the engine's narrowed `Instructor`. The import
     * sheet matches names against `full_name` and honours `is_active`, neither
     * of which survives into the snapshot.
     */
    instructors,
    timeSlots,
    rooms,
    cycleId,
    /** True until the scenario itself is known; the rest fills in behind it. */
    isLoading: scenario.isLoading || board.isLoading,
  }
}
