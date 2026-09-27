import { useCallback, useEffect, useMemo, useReducer, useSyncExternalStore } from 'react'
import { onlineManager, useMutationState } from '@tanstack/react-query'
import {
  bannerFor,
  initialConnection,
  nextConnection,
  RESTORED_MS,
  type Banner,
} from '../lib/online'

/**
 * The live connection state, and how many writes are waiting on it.
 *
 * Subscribes to React Query's `onlineManager` rather than to `window`'s own
 * `online` and `offline` events, even though that is what the manager listens
 * to underneath. The manager is what actually decides whether a mutation runs
 * or pauses, so it is the only source of truth that cannot disagree with what
 * the coordinator sees: a banner driven off `window` directly could say the
 * connection is back while React Query still held every write.
 *
 * `useMutationState` is the count. Paused mutations are the honest measure of
 * what "offline" has cost so far — not mutations in flight, which are a
 * different thing entirely, and not a counter this hook keeps for itself,
 * which would drift the moment React Query resumed one.
 */
export function useConnection(): { banner: Banner | null; waiting: number } {
  const [state, dispatch] = useReducer(nextConnection, initialConnection(onlineManager.isOnline()))

  useEffect(() => {
    /*
     * `subscribe` reports the new value and returns an unsubscribe. It fires
     * only on a change, so a tab that stays online never dispatches — and
     * `nextConnection` ignores a repeat anyway, which is what keeps a browser
     * firing `online` on wake from flashing "Back online" at nobody.
     */
    return onlineManager.subscribe((online) => {
      dispatch(online ? { type: 'came-online' } : { type: 'went-offline' })
    })
  }, [])

  // The reassurance takes itself away. Nothing else moves the app out of
  // `restored`, so without this the green banner would be permanent.
  useEffect(() => {
    if (state !== 'restored') return
    const handle = window.setTimeout(() => dispatch({ type: 'settled' }), RESTORED_MS)
    return () => window.clearTimeout(handle)
  }, [state])

  const paused = useMutationState({
    filters: { predicate: (m) => m.state.isPaused },
    select: (m) => m.mutationId,
  })

  return useMemo(
    () => ({ banner: bannerFor(state, paused.length), waiting: paused.length }),
    [state, paused.length],
  )
}

/**
 * Whether there is a connection, as one boolean.
 *
 * `useConnection` answers a different question — what to *say* — and its state
 * machine deliberately lingers in `restored` for four seconds after the
 * connection is back. Anything deciding whether to make a request wants the
 * raw answer, without that delay and without the banner's vocabulary.
 *
 * Read through `onlineManager` for the reason given above: it is what decides
 * whether React Query runs a request, so a caller that asked `navigator`
 * directly could poll while the query layer held everything.
 *
 * The server snapshot is `true`. Nothing here renders on a server, but the
 * third argument is not optional and guessing "offline" would be the wrong
 * guess for a hydration pass that has no `navigator` to consult.
 */
export function useIsOnline(): boolean {
  const subscribe = useCallback(
    (notify: () => void) => onlineManager.subscribe(() => notify()),
    [],
  )
  return useSyncExternalStore(
    subscribe,
    () => onlineManager.isOnline(),
    () => true,
  )
}
