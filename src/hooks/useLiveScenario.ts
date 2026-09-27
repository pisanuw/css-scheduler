import { useEffect, useRef } from 'react'
import { useIsMutating, useQueryClient } from '@tanstack/react-query'
import { syncFeed, watchInterval } from '../lib/liveSync'
import { useScenarioFeed } from './scheduling'
import { useIsOnline } from './useConnection'
import { useAuth } from '../lib/auth'
import { useToast } from '../components/Toast'

/**
 * Keeps one scenario's board honest while somebody else is editing it.
 *
 * The problem, and why this shape rather than another, is argued in
 * `src/lib/liveSync.ts` and in `docs/DESIGN.md` under *Two coordinators at
 * once*. All this does is hold the watermark and act on what the pure decision
 * says: refetch the board when the change feed has moved past it, and name the
 * person who moved it.
 *
 * `useIsMutating` counts writes without needing mutation keys. On the board
 * every mutation is a board write, so the count is the right gate as it stands;
 * a paused write counts too, which is correct — a board holding three queued
 * assignments should not be pulling server rows in over the top of them.
 */
export function useLiveScenario(scenarioId: string | undefined): void {
  const qc = useQueryClient()
  const toast = useToast()
  const { profile } = useAuth()
  const online = useIsOnline()
  const writing = useIsMutating() > 0

  const feed = useScenarioFeed(scenarioId, watchInterval({ online, writing }))

  /**
   * Null means "not looked yet", which is what makes the first look silent.
   * A ref rather than state on purpose: nothing renders from it, and making it
   * state would put a second render after every tick that found nothing.
   */
  const seen = useRef<number | null>(null)

  // Switching scenarios starts again. Without this, the new board would adopt
  // the old one's watermark and — because the sequence is shared across every
  // scenario — could sit silently behind its own history.
  useEffect(() => {
    seen.current = null
  }, [scenarioId])

  useEffect(() => {
    if (!scenarioId || !feed.data) return
    const outcome = syncFeed(seen.current, feed.data, profile?.email)
    if (!outcome) return

    seen.current = outcome.seen
    if (outcome.refetch) {
      void qc.invalidateQueries({ queryKey: ['board', scenarioId] })
      void qc.invalidateQueries({ queryKey: ['scenario_changes', scenarioId] })
    }
    // `say`, not `ok`: nothing the coordinator did has succeeded. It is news.
    if (outcome.notice) toast.say(outcome.notice)
  }, [feed.data, scenarioId, profile?.email, qc, toast])
}
