/**
 * Every destination in the app, once.
 *
 * Two lists used to describe the same thirteen pages — a `<Route>` each in
 * `App.tsx` and a `{ to, label, show }` each in `Layout.tsx` — and nothing
 * held them together. A coordinator-only page reachable by typing its path,
 * or a nav link to a route that no longer exists, was a copy-paste away.
 *
 * It is also what makes code splitting safe to do well. A page arrives in its
 * own chunk now, so something has to decide when to fetch it; that decision
 * needs the loader, and the nav is where the earliest honest signal is (a
 * finger on a link, a focus ring landing on it). Keeping the loader beside the
 * label puts the two in the same place.
 *
 * Deliberately free of React and of any page import: the table is data, so a
 * test can read it in Node without constructing a Supabase client or pulling
 * a single page into the process. `load` is never called here.
 */

/** What `React.lazy` wants back, without importing React to say so. */
export type PageModule = { default: React.ComponentType }

export interface AppRoute {
  /** The nav destination, and the path the page is usually at. */
  path: string
  /**
   * Further paths rendering the same page. The board and the report both take
   * an optional scenario id; the nav points at the bare path and the page
   * reads the parameter when it is there.
   */
  alsoAt?: string[]
  label: string
  /** Hidden from the nav *and* unrouted for anyone who is not a coordinator. */
  coordinatorOnly?: boolean
  /** `NavLink`'s exact matching. Only the index route needs it. */
  end?: boolean
  /**
   * Fetch this chunk as soon as the app starts rather than waiting for a
   * navigation. Exactly one page is worth this — see `LANDING_PATH`.
   */
  preload?: boolean
  load: () => Promise<PageModule>
}

/**
 * Where everyone lands. Its chunk is fetched while the session and profile
 * requests are still in the air, so the split costs no visible delay on the
 * one page that is guaranteed to render.
 */
export const LANDING_PATH = '/'

/**
 * Nav order, which is not route order: the coordinator's working sequence
 * (board, scenarios, report, compare) comes before the things everyone shares.
 */
export const ROUTES: AppRoute[] = [
  { path: '/', label: 'Dashboard', end: true, preload: true, load: () => import('../pages/Dashboard') },
  { path: '/board', alsoAt: ['/board/:scenarioId'], label: 'Board', coordinatorOnly: true, load: () => import('../pages/Board') },
  { path: '/scenarios', label: 'Scenarios', coordinatorOnly: true, load: () => import('../pages/Scenarios') },
  { path: '/report', alsoAt: ['/report/:scenarioId'], label: 'Report', coordinatorOnly: true, load: () => import('../pages/Report') },
  { path: '/compare', label: 'Compare', coordinatorOnly: true, load: () => import('../pages/Compare') },
  { path: '/preferences', label: 'My preferences', load: () => import('../pages/MyPreferences') },
  { path: '/cycles', label: 'Cycles', coordinatorOnly: true, load: () => import('../pages/Cycles') },
  { path: '/responses', label: 'Responses', coordinatorOnly: true, load: () => import('../pages/Responses') },
  { path: '/courses', label: 'Courses', load: () => import('../pages/Courses') },
  { path: '/instructors', label: 'Instructors', load: () => import('../pages/Instructors') },
  { path: '/history', label: 'History', load: () => import('../pages/History') },
  { path: '/student-check', label: 'Student check', load: () => import('../pages/StudentCheck') },
  { path: '/access', label: 'Access', coordinatorOnly: true, load: () => import('../pages/AccessLog') },
]

/** The routes a given reader may reach at all — the nav and the router agree. */
export function routesFor(isCoordinator: boolean): AppRoute[] {
  return ROUTES.filter((r) => !r.coordinatorOnly || isCoordinator)
}

/** Every path a route answers on, primary first. */
export function pathsOf(route: AppRoute): string[] {
  return [route.path, ...(route.alsoAt ?? [])]
}

/**
 * A chunk is worth fetching at most once, and a failed fetch is worth trying
 * again on the next nudge — so a rejected promise is forgotten rather than
 * cached. Without that, one flaky prefetch on a train would poison the route
 * for the rest of the session and `React.lazy` would inherit the rejection.
 */
const inFlight = new Map<string, Promise<PageModule>>()

export function prefetchRoute(route: AppRoute): Promise<PageModule> {
  const existing = inFlight.get(route.path)
  if (existing) return existing
  const p = route.load().catch((err) => {
    inFlight.delete(route.path)
    throw err
  })
  inFlight.set(route.path, p)
  return p
}

/**
 * Swallow the rejection at the call site that does not care. A prefetch is a
 * guess; a guess that fails must not reach the console as an unhandled
 * rejection, and must not be what the coordinator sees.
 */
export function prefetchRouteQuietly(route: AppRoute): void {
  void prefetchRoute(route).catch(() => {})
}

/** Only for tests: the memo above outlives a single case otherwise. */
export function resetPrefetchCache(): void {
  inFlight.clear()
}
