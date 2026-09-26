/**
 * What the service worker does with a request, as rules rather than plumbing.
 *
 * A service worker sits in front of every request the app makes, including the
 * ones that carry a coordinator's session and an instructor's preferences. The
 * cost of getting it wrong is not a slow page — it is answering a request with
 * somebody else's cached data, or serving an app that can never update itself.
 * Both failures are invisible in development and permanent in the field, so
 * the decisions live here, pure, and are tested without a browser.
 *
 * `src/sw.ts` is the worker; it only obeys these.
 */

/**
 * Every cache this app owns starts with this, so `staleCaches` can recognise
 * its own and leave anything else on the origin alone.
 */
export const CACHE_PREFIX = 'css-scheduler-'

/** The document every client route is served by, and the offline fallback. */
export const SHELL_PATH = '/index.html'

/**
 * The one message the page sends the worker: "the coordinator said yes, stop
 * waiting". Named here rather than in either end of the conversation, because
 * a constant one side spells differently is a silent no-op.
 */
export const SKIP_WAITING = 'css-scheduler:skip-waiting'

/**
 * One cache per build, named by the build's revision.
 *
 * The alternative — one long-lived cache, updated in place — has to reason
 * about a cache holding an `index.html` from today and a chunk from last
 * Tuesday. Naming the cache after the build makes that impossible: a version's
 * shell and a version's assets arrive together and are dropped together.
 */
export function cacheNameFor(revision: string): string {
  return `${CACHE_PREFIX}${revision}`
}

/**
 * The caches to delete when a new worker takes over: ours, but not the
 * current one. Other caches on the origin are somebody else's business.
 */
export function staleCaches(names: readonly string[], current: string): string[] {
  return names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== current)
}

/**
 * `asset` — answer from the cache, and keep what the network gives us.
 * `shell`  — try the network, fall back to the cached document.
 * `passthrough` — do not touch it at all.
 */
export type Plan = 'asset' | 'shell' | 'passthrough'

/** The parts of a `Request` any of this depends on. */
export interface RequestFacts {
  method: string
  url: string
  /** `'navigate'` for a document the browser is going to. */
  mode?: string
  destination?: string
}

/**
 * A built asset, named by the hash of its own contents: `/assets/Board-a1B2c3D4.js`.
 *
 * Content-addressed names are what make `asset` safe to answer from the cache
 * without asking the network first. A file whose name contains its hash cannot
 * change meaning — a new build is a new name — so a hit is never stale.
 */
export function isHashedAsset(pathname: string): boolean {
  return /^\/assets\/[A-Za-z0-9._-]+-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|png|jpe?g|svg|webp|avif)$/.test(
    pathname,
  )
}

export function planFor(facts: RequestFacts, origin: string): Plan {
  /*
   * Anything that is not a plain GET is a change somebody is making. Supabase
   * writes, the auth token exchange, and every future POST go straight to the
   * network: a cache has no business holding an answer to a mutation.
   */
  if (facts.method.toUpperCase() !== 'GET') return 'passthrough'

  let url: URL
  try {
    url = new URL(facts.url)
  } catch {
    return 'passthrough'
  }

  /*
   * Cross-origin is the important one. Every request to
   * `abvnaelzfriusckqqrfc.supabase.co` — sessions, preferences, the board —
   * leaves here untouched and uncached. There is no version of "a bit of
   * caching" for that data that is worth the chance of showing one person
   * another person's rows, and RLS decides what a request returns per caller,
   * which a cache key of "the URL" cannot express.
   */
  if (url.origin !== origin) return 'passthrough'

  if (facts.mode === 'navigate' || facts.destination === 'document') return 'shell'

  if (isHashedAsset(url.pathname)) return 'asset'

  /*
   * Everything else same-origin: the manifest, the icons, `sw.js` itself.
   * Small, rarely fetched, and none of them needed for the app to work with
   * no signal — so the network keeps them and the cache stays predictable.
   */
  return 'passthrough'
}

/**
 * Whether a response is worth keeping. `response.ok` alone would cache an
 * opaque cross-origin response (status 0) and a redirect, which then cannot be
 * used to satisfy a navigation.
 */
export function isCacheable(response: { ok: boolean; status: number; type?: string }): boolean {
  if (!response.ok || response.status !== 200) return false
  return response.type !== 'opaque' && response.type !== 'opaqueredirect'
}
