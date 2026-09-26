/**
 * The page's half of the service worker conversation: register it, notice when
 * a new one is ready, and take over only when the coordinator says so.
 *
 * The rule this file exists to enforce is the one every offline app gets wrong
 * in one direction or the other.
 *
 * *Never updating* is the failure that lasts: a worker that serves its own
 * cached shell forever means a bug fix ships to Netlify, the coordinator
 * reloads, and nothing changes — with no way for anyone to tell why.
 *
 * *Updating instantly* is the failure that costs something: `skipWaiting()` on
 * install swaps the worker under a tab that is open, so the next chunk that
 * tab asks for is a filename the new build does not have, in the middle of
 * assigning an instructor.
 *
 * So: a new worker installs, and waits. The app offers a reload. Nothing moves
 * until that offer is taken.
 *
 * Everything is expressed against the smallest shape of the browser API that
 * does the job, so the whole lifecycle can be driven from a test with no
 * browser at all — which matters more here than anywhere else in the app,
 * because a service worker bug cannot be reproduced by reloading.
 */
import { SKIP_WAITING } from './swStrategy'

export interface WorkerLike {
  state: string
  postMessage(message: unknown): void
  addEventListener(type: 'statechange', listener: () => void): void
  removeEventListener(type: 'statechange', listener: () => void): void
}

export interface RegistrationLike {
  installing: WorkerLike | null
  waiting: WorkerLike | null
  addEventListener(type: 'updatefound', listener: () => void): void
  removeEventListener(type: 'updatefound', listener: () => void): void
  update(): Promise<unknown>
}

export interface ContainerLike {
  controller: unknown
  register(path: string): Promise<RegistrationLike>
  addEventListener(type: 'controllerchange', listener: () => void): void
  removeEventListener(type: 'controllerchange', listener: () => void): void
}

/**
 * Whether an installed worker is worth telling anyone about.
 *
 * `hasController` is the whole test. Without a controller this is a first
 * install: the app the coordinator is looking at *is* the new version, and
 * offering to reload into it would be a confusing lie. With one, a different
 * version is already running the page, and reloading genuinely changes
 * something.
 */
export function shouldOfferUpdate(workerState: string, hasController: boolean): boolean {
  return workerState === 'installed' && hasController
}

/** How often a tab that stays open asks whether a new version has shipped. */
export const UPDATE_POLL_MS = 30 * 60 * 1000

export interface RegisterOptions {
  container: ContainerLike
  /** Where the worker is served. Root scope, so it can answer every route. */
  path?: string
  /**
   * Called when a new version is installed and waiting. The argument applies
   * it: the caller decides how to ask, this decides when.
   */
  onUpdateReady: (apply: () => void) => void
  /** Reloading the document. Injected so a test can watch for it. */
  reload: () => void
  onError?: (error: unknown) => void
  /** Injected so a test does not have to wait half an hour. */
  setInterval?: (fn: () => void, ms: number) => unknown
  clearInterval?: (handle: unknown) => void
  pollMs?: number
}

/**
 * Registers the worker and watches for updates. Returns a function that stops
 * watching — every listener it adds, it can take back, because React mounts
 * this twice in development.
 */
export async function registerServiceWorker(options: RegisterOptions): Promise<() => void> {
  const {
    container,
    path = '/sw.js',
    onUpdateReady,
    reload,
    onError,
    pollMs = UPDATE_POLL_MS,
  } = options
  const startInterval = options.setInterval
  const stopInterval = options.clearInterval

  const cleanups: Array<() => void> = []
  let stopped = false
  /*
   * Once. `controllerchange` can fire more than once — a second tab accepting
   * the same update is enough — and reloading twice on the way to the same
   * place is a flicker nobody can explain.
   */
  let reloading = false

  try {
    const registration = await container.register(path)
    /*
     * The specification says this resolves with a registration or rejects.
     * Not everything that implements it agrees: an environment that blocks
     * workers can resolve with nothing at all, and reading `.waiting` off it
     * throws inside the app's own startup. Seen for real — Playwright's
     * `serviceWorkers: 'block'` does exactly this, which the routing check
     * turned up the first time it ran against a build that registers one.
     */
    if (!registration) throw new Error('registering the service worker produced no registration')
    if (stopped) return () => {}

    /** Hand the caller a way to apply this particular waiting worker. */
    const offer = (worker: WorkerLike) => {
      onUpdateReady(() => {
        /*
         * The reload is driven by `controllerchange`, not by this call: the
         * worker has to finish activating before the document asks for
         * anything, or the reload races the swap and lands on the old version
         * again — which looks exactly like an update that does not work.
         */
        const onControllerChange = () => {
          if (reloading) return
          reloading = true
          reload()
        }
        container.addEventListener('controllerchange', onControllerChange)
        cleanups.push(() => container.removeEventListener('controllerchange', onControllerChange))
        worker.postMessage({ type: SKIP_WAITING })
      })
    }

    // Installed while this tab was elsewhere, or offered and declined earlier.
    if (registration.waiting && container.controller) offer(registration.waiting)

    const onUpdateFound = () => {
      const installing = registration.installing
      if (!installing) return
      const onStateChange = () => {
        if (!shouldOfferUpdate(installing.state, Boolean(container.controller))) return
        installing.removeEventListener('statechange', onStateChange)
        offer(installing)
      }
      installing.addEventListener('statechange', onStateChange)
      cleanups.push(() => installing.removeEventListener('statechange', onStateChange))
      // It can already be installed by the time we look.
      onStateChange()
    }
    registration.addEventListener('updatefound', onUpdateFound)
    cleanups.push(() => registration.removeEventListener('updatefound', onUpdateFound))

    /*
     * A tab left open on the board for a week would otherwise never ask. The
     * browser checks on navigation, and this app's navigations are all
     * client-side.
     */
    if (startInterval) {
      const handle = startInterval(() => {
        void registration.update().catch(() => {
          /* Offline, most likely. There is nothing to do and nothing to say. */
        })
      }, pollMs)
      if (stopInterval) cleanups.push(() => stopInterval(handle))
    }
  } catch (error) {
    /*
     * Registration fails on a private window in some browsers, behind a proxy
     * that rewrites the script's content type, and wherever a user has turned
     * workers off. The app works without it — that is the whole point of
     * progressive enhancement — so this is reported, not thrown.
     */
    onError?.(error)
  }

  return () => {
    stopped = true
    for (const undo of cleanups.splice(0)) undo()
  }
}
