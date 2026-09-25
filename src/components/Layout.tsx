import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'
  }`

export default function Layout({ children }: { children: ReactNode }) {
  const { profile, signOut, isCoordinator } = useAuth()

  return (
    <div className="min-h-screen">
      <header style={{ background: 'var(--uw-purple)' }} className="text-white shadow">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3">
          <span className="mr-4 text-lg font-semibold tracking-tight">CSS Scheduler</span>
          <nav className="flex gap-1">
            <NavLink to="/" className={linkClass} end>
              Dashboard
            </NavLink>
            <NavLink to="/preferences" className={linkClass}>
              My preferences
            </NavLink>
            {isCoordinator && (
              <NavLink to="/cycles" className={linkClass}>
                Cycles
              </NavLink>
            )}
            {isCoordinator && (
              <NavLink to="/responses" className={linkClass}>
                Responses
              </NavLink>
            )}
            <NavLink to="/courses" className={linkClass}>
              Courses
            </NavLink>
            <NavLink to="/instructors" className={linkClass}>
              Instructors
            </NavLink>
            <NavLink to="/history" className={linkClass}>
              History
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-white/80">
              {profile?.full_name ?? profile?.email}
              {isCoordinator && (
                <span
                  style={{ background: 'var(--uw-gold)' }}
                  className="ml-2 rounded px-1.5 py-0.5 text-xs font-semibold text-slate-900"
                >
                  coordinator
                </span>
              )}
            </span>
            <button
              onClick={signOut}
              className="rounded border border-white/30 px-2 py-1 text-white/90 hover:bg-white/10"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  )
}
