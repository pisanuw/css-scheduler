import { useEffect } from 'react'
import { useToast } from '../components/Toast'
import { registerServiceWorker } from '../lib/swClient'
import type { ContainerLike } from '../lib/swClient'

/**
 * Registers the service worker, and turns a waiting update into the app's one
 * kind of message with something to tap.
 *
 * Only in a production build: `sw.js` is emitted by the build, so in `npm run
 * dev` there is nothing at that path, and registering a 404 would teach every
 * developer to ignore a console error.
 *
 * The failure to avoid here is a stale worker nobody can get rid of, so the
 * offer is explicit and permanent rather than a silent swap. `swClient` holds
 * the lifecycle rules and is tested without a browser; this is the wiring.
 */
export function useServiceWorker(): void {
  const toast = useToast()

  useEffect(() => {
    if (!import.meta.env.PROD) return
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    let stop: (() => void) | undefined
    let cancelled = false

    void registerServiceWorker({
      container: navigator.serviceWorker as unknown as ContainerLike,
      onUpdateReady: (apply) => {
        toast.offer('A new version of the scheduler is ready.', 'Reload', apply)
      },
      reload: () => window.location.reload(),
      onError: (error) => {
        /*
         * Not shown to the coordinator. Every page of this app works without a
         * service worker — it is what makes it installable and what makes it
         * survive a dead connection, neither of which is worth a red message
         * about a feature nobody asked for.
         */
        console.warn('[sw] registration failed', error)
      },
      setInterval: (fn, ms) => window.setInterval(fn, ms),
      clearInterval: (handle) => window.clearInterval(handle as number),
    }).then((cleanup) => {
      if (cancelled) cleanup()
      else stop = cleanup
    })

    return () => {
      cancelled = true
      stop?.()
    }
  }, [toast])
}
