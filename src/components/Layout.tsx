import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth'

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

export default function Layout({ children }: { children: ReactNode }) {
  const { profile, signOut, isCoordinator } = useAuth()
  const [open, setOpen] = useState(false)
  const location = useLocation()

  // Navigating is the drawer's cue to get out of the way.
  useEffect(() => setOpen(false), [location.pathname])

  const links = [
    { to: '/', label: 'Dashboard', end: true, show: true },
    { to: '/board', label: 'Board', show: isCoordinator },
    { to: '/scenarios', label: 'Scenarios', show: isCoordinator },
    { to: '/report', label: 'Report', show: isCoordinator },
    { to: '/compare', label: 'Compare', show: isCoordinator },
    { to: '/preferences', label: 'My preferences', show: true },
    { to: '/cycles', label: 'Cycles', show: isCoordinator },
    { to: '/responses', label: 'Responses', show: isCoordinator },
    { to: '/courses', label: 'Courses', show: true },
    { to: '/instructors', label: 'Instructors', show: true },
    { to: '/history', label: 'History', show: true },
    { to: '/access', label: 'Access', show: isCoordinator },
  ].filter((l) => l.show)

  return (
    <div className="min-h-screen">
      <header style={{ background: 'var(--uw-purple)' }} className="text-white shadow print:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
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

          <nav className="hidden flex-wrap gap-1 md:flex">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={linkClass} end={l.end}>
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
                className="hidden rounded px-1.5 py-0.5 text-xs font-semibold text-slate-900 sm:inline"
              >
                coordinator
              </span>
            )}
            <button
              onClick={signOut}
              className="flex min-h-11 items-center rounded border border-white/30 px-3 text-white/90 hover:bg-white/10"
            >
              Sign out
            </button>
          </div>
        </div>

        {open && (
          <nav className="border-t border-white/15 px-2 pb-3 md:hidden">
            <p className="px-3 pt-2 pb-1 text-xs text-white/60 sm:hidden">
              {profile?.full_name ?? profile?.email}
              {isCoordinator && ' · coordinator'}
            </p>
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={linkClass} end={l.end}>
                {l.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 print:px-0 print:py-0">{children}</main>
    </div>
  )
}
