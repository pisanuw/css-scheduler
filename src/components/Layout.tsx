import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import ThemeToggle from './ThemeToggle'
import type { ThemeState } from '../hooks/useTheme'
import { prefetchRouteQuietly, routesFor, type AppRoute } from '../lib/routes'

/**
 * The nav is a drawer below `md` and a row above it. Seven destinations do not
 * fit across a 375px phone, and letting them scroll sideways was worse than
 * hiding them: the coordinator uses this on a phone, so the narrow layout is
 * the one that has to be right.
 */
const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors ${
    isActive ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'
  }`

export default function Layout({
  children,
  theme,
}: {
  children: ReactNode
  theme: ThemeState
}) {
  const { profile, signOut, isCoordinator } = useAuth()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const drawerRef = useRef<HTMLElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  // Navigating is the drawer's cue to get out of the way.
  useEffect(() => setOpen(false), [location.pathname])

  /*
   * The drawer is a disclosure rather than a modal — the page behind it is
   * still legitimately there — so it is not trapped. But opening it and
   * leaving focus on the button means a keyboard user has to Tab through
   * nothing to reach what they just revealed, and Escape is what everyone
   * tries first to get rid of it.
   */
  useEffect(() => {
    if (!open) return
    drawerRef.current?.querySelector<HTMLElement>('a, button')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      toggleRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const links = routesFor(isCoordinator)

  /*
   * Fetch a page's chunk at the first sign someone means to go there, rather
   * than when they arrive. A pointer settling on a link, a focus ring landing
   * on it, or a finger touching down all happen a beat before the navigation
   * — on a phone, `touchstart` to `click` is the ~100ms it takes to lift a
   * finger, which is most of a chunk fetch off a warm CDN. The prefetch is
   * memoised and its failures are swallowed: a guess that does not pay off
   * must cost nothing, and the navigation itself will surface a real problem
   * through the route boundary.
   */
  const prefetch = (route: AppRoute) => () => prefetchRouteQuietly(route)

  return (
    <div className="min-h-screen">
      {/*
        Thirteen nav links stand between the top of the document and the page
        itself. This is the one control that has to be reachable before them,
        and it stays invisible until it is focused.
      */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:flex focus:min-h-11 focus:items-center focus:rounded-md focus:bg-surface focus:px-4 focus:text-sm focus:font-medium focus:text-slate-900 focus:shadow-lg"
      >
        Skip to the page
      </a>
      <header style={{ background: 'var(--uw-purple)' }} className="text-white shadow print:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2">
          <button
            ref={toggleRef}
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="main-nav-drawer"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="-ml-1 flex h-11 w-11 items-center justify-center rounded-md text-white/90 hover:bg-white/10 md:hidden"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>

          <span className="text-base font-semibold tracking-tight md:mr-4 md:text-lg">
            CSS Scheduler
          </span>

          <nav aria-label="Main" className="hidden flex-wrap gap-1 md:flex">
            {links.map((l) => (
              <NavLink
                key={l.path}
                to={l.path}
                className={linkClass}
                end={l.end}
                onPointerEnter={prefetch(l)}
                onFocus={prefetch(l)}
                onTouchStart={prefetch(l)}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="hidden text-white/80 sm:inline">
              {profile?.full_name ?? profile?.email}
            </span>
            {isCoordinator && (
              <span
                style={{ background: 'var(--uw-gold)' }}
                className="hidden rounded px-1.5 py-0.5 text-xs font-semibold text-slate-950 sm:inline"
              >
                coordinator
              </span>
            )}
            <ThemeToggle {...theme} className="-mr-1" />
            <button
              onClick={signOut}
              className="flex min-h-11 items-center rounded border border-white/30 px-3 text-white/90 hover:bg-white/10"
            >
              Sign out
            </button>
          </div>
        </div>

        {open && (
          <nav
            ref={drawerRef}
            id="main-nav-drawer"
            aria-label="Main"
            className="border-t border-white/15 px-2 pb-3 md:hidden"
          >
            <p className="px-3 pt-2 pb-1 text-xs text-white/60 sm:hidden">
              {profile?.full_name ?? profile?.email}
              {isCoordinator && ' · coordinator'}
            </p>
            {links.map((l) => (
              <NavLink
                key={l.path}
                to={l.path}
                className={linkClass}
                end={l.end}
                onPointerEnter={prefetch(l)}
                onFocus={prefetch(l)}
                onTouchStart={prefetch(l)}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <main id="main" className="mx-auto max-w-7xl px-4 py-6 print:px-0 print:py-0">
        {children}
      </main>
    </div>
  )
}
