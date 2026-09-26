import { lazy, Suspense, useEffect, useMemo } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import RouteFallback from './components/RouteFallback'
import RouteErrorBoundary from './components/RouteErrorBoundary'
import { LANDING_PATH, pathsOf, prefetchRouteQuietly, ROUTES, routesFor } from './lib/routes'
import { useTheme } from './hooks/useTheme'

/**
 * Every page is its own chunk. `Login` is not: it is what an unauthenticated
 * visitor sees, and making the first paint wait on a second request to show a
 * single button would be a poor trade.
 *
 * `lazy` is called once per route at module scope — doing it inside the
 * component would hand React a new type on every render and remount the page.
 */
const LAZY = new Map(ROUTES.map((r) => [r.path, lazy(r.load)]))

export default function App() {
  const { session, loading, isCoordinator } = useAuth()
  const location = useLocation()
  /*
   * Above every early return below, because the sign-in page and the loading
   * state are themed too — and because a phone that changes theme at sunset
   * must be followed wherever the coordinator happens to be.
   */
  const theme = useTheme()

  /*
   * Start the dashboard's chunk on the way down while the profile request is
   * still in flight. That is a round trip to Supabase; the chunk is a few
   * kilobytes from the same CDN as the page already loaded. Overlapping them
   * is why splitting the bundle costs nothing visible on the one page everyone
   * is guaranteed to see.
   *
   * Gated on the session because signing in leaves the page — Google, then
   * back — so a chunk fetched for a visitor who has not signed in yet is spent
   * on a document that is about to be thrown away.
   */
  useEffect(() => {
    if (!session) return
    const landing = ROUTES.find((r) => r.preload)
    if (landing) prefetchRouteQuietly(landing)
  }, [session])

  const routes = useMemo(() => routesFor(isCoordinator), [isCoordinator])

  if (loading && session) return <div className="p-8 text-slate-500">Loading…</div>
  if (!session) return <Login />

  return (
    <Layout theme={theme}>
      {/*
        The boundary is keyed on the path so that recovering is a matter of
        going somewhere else: a page that threw stays broken until its key
        changes, and every other page still works.
      */}
      <RouteErrorBoundary resetKey={location.pathname}>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            {routes.flatMap((route) => {
              const Page = LAZY.get(route.path)!
              return pathsOf(route).map((path) => (
                <Route key={path} path={path} element={<Page />} />
              ))
            })}
            {/*
              Anything else — including a coordinator-only path reached by
              someone who is not one — goes home rather than showing a blank.
            */}
            <Route path="*" element={<Navigate to={LANDING_PATH} replace />} />
          </Routes>
        </Suspense>
      </RouteErrorBoundary>
    </Layout>
  )
}
