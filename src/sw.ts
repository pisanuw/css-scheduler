/**
 * The service worker: what makes the scheduler installable, and what makes it
 * still open in a room with no signal.
 *
 * This file is deliberately thin. Every decision it makes lives in
 * `src/lib/swStrategy.ts`, which is pure and tested; what is left here is the
 * wiring that only a browser can run. `vite-plugins/pwa.ts` bundles it to
 * `dist/sw.js` and fills in the two values below.
 *
 * The rules that matter, in one place, because a service worker is the one
 * piece of this app that can keep serving itself after it is wrong:
 *
 *   - One cache per build. A build's shell and its chunks arrive together and
 *     are deleted together, so there is no moment where an old document is
 *     asking for a file this version never had.
 *   - Nothing that leaves this origin is cached, ever. Sessions, preferences
 *     and the board are per-caller by row-level security; a cache keyed on a
 *     URL cannot express that, so it does not get to try.
 *   - A new worker waits. It does not take over the page under the
 *     coordinator's fingers mid-edit: `src/lib/swClient.ts` offers the reload
 *     and this only acts when that offer is accepted.
 */
import {
  cacheNameFor,
  isCacheable,
  planFor,
  SHELL_PATH,
  SKIP_WAITING,
  staleCaches,
} from './lib/swStrategy'

/** Filled in at build time: this build's files, and a name for this build. */
declare const __PRECACHE__: string[]
declare const __REVISION__: string

/*
 * The worker's own globals, declared narrowly.
 *
 * `tsconfig.json` compiles this project against the DOM, as it must for
 * thirteen React pages, and the DOM and WebWorker type libraries cannot both
 * be loaded — they define the same globals with different types. Rather than
 * split the build into two projects for one file, this names the handful of
 * things a service worker actually uses. Narrow, but honest: nothing here is
 * asserted to exist that the specification does not give us.
 */
interface ExtendableEventLike {
  waitUntil(promise: Promise<unknown>): void
}
interface FetchEventLike extends ExtendableEventLike {
  request: Request
  respondWith(response: Response | Promise<Response>): void
}
interface MessageEventLike {
  data: unknown
}
interface WorkerScope {
  addEventListener(type: 'install', listener: (event: ExtendableEventLike) => void): void
  addEventListener(type: 'activate', listener: (event: ExtendableEventLike) => void): void
  addEventListener(type: 'fetch', listener: (event: FetchEventLike) => void): void
  addEventListener(type: 'message', listener: (event: MessageEventLike) => void): void
  skipWaiting(): Promise<void>
  clients: { claim(): Promise<void> }
  location: { origin: string }
}
const sw = self as unknown as WorkerScope

const CACHE = cacheNameFor(__REVISION__)

async function precache(): Promise<void> {
  const cache = await caches.open(CACHE)
  /*
   * One request at a time rather than `cache.addAll`, which rejects the whole
   * install if any single file 404s. A missing chunk should cost that chunk's
   * offline availability, not the entire worker.
   *
   * `cache: 'reload'` because the browser's own HTTP cache may hold the
   * previous deploy's answer for a path, and precaching yesterday's bytes
   * under today's cache name is exactly the mix this design exists to prevent.
   */
  const results = await Promise.allSettled(
    __PRECACHE__.map(async (path) => {
      const response = await fetch(new Request(path, { cache: 'reload' }))
      if (!isCacheable(response)) throw new Error(`${path} answered ${response.status}`)
      await cache.put(path, response)
    }),
  )
  const failed = results.filter((r) => r.status === 'rejected')
  if (failed.length) {
    // Not fatal, but worth saying out loud in the one place a developer looks.
    console.warn(`[sw] ${failed.length} of ${__PRECACHE__.length} files did not precache`)
  }
}

sw.addEventListener('install', (event) => {
  // No `skipWaiting()` here on purpose: see the header. A first install has no
  // worker to displace and activates straight away regardless.
  event.waitUntil(precache())
})

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(staleCaches(names, CACHE).map((name) => caches.delete(name)))
      /*
       * Take over the tab that installed us. Without this, someone's first
       * visit leaves the app uncontrolled until they come back — which is to
       * say the offline promise would be false for the whole of the visit in
       * which they installed it.
       */
      await sw.clients.claim()
    })(),
  )
})

/** A hashed filename cannot change meaning, so a hit needs no revalidation. */
async function fromCache(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (isCacheable(response)) await cache.put(request, response.clone())
  return response
}

/**
 * A navigation. The network decides, because a deploy has to be able to reach
 * someone who has the app open; the cached document is what a dead connection
 * gets instead of the browser's error page.
 */
async function networkThenShell(request: Request): Promise<Response> {
  try {
    return await fetch(request)
  } catch (err) {
    const cache = await caches.open(CACHE)
    const shell = await cache.match(SHELL_PATH)
    if (shell) return shell
    throw err
  }
}

sw.addEventListener('fetch', (event) => {
  const plan = planFor(event.request, sw.location.origin)
  if (plan === 'passthrough') return
  event.respondWith(plan === 'asset' ? fromCache(event.request) : networkThenShell(event.request))
})

sw.addEventListener('message', (event) => {
  if (typeof event.data === 'object' && event.data && (event.data as { type?: string }).type === SKIP_WAITING) {
    void sw.skipWaiting()
  }
})
