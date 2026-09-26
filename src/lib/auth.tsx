import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type UserRole = 'coordinator' | 'instructor' | 'viewer'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  instructor_id: string | null
}

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  isCoordinator: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  /*
   * Whose profile the state above holds, which is not the same question as
   * "is a request in flight". `loading` used to be its own flag, and between
   * the render that received the session and the effect that set the flag
   * back to true there was one commit with a session, no profile, and
   * `loading` false — long enough for the router to decide the reader was not
   * a coordinator and send them home. A coordinator opening a bookmarked
   * `/board/:scenarioId` landed on the dashboard, and the deeper the link the
   * more it mattered. Deriving the answer from the data removes the window
   * rather than narrowing it.
   */
  const [profileFor, setProfileFor] = useState<string | null>(null)
  const loading = session ? profileFor !== session.user.id : false

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!session) {
      setProfile(null)
      setProfileFor(null)
      return
    }
    const userId = session.user.id
    supabase
      .from('profiles')
      .select('id, email, full_name, role, instructor_id')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (cancelled) return
        setProfile((data as Profile) ?? null)
        /*
         * Marked resolved even when nothing came back. A signed-in reader
         * with no profile row gets the app with no coordinator pages, which
         * is both true and recoverable; leaving them on "Loading…" for ever
         * is neither.
         */
        setProfileFor(userId)
      })
    return () => {
      cancelled = true
    }
  }, [session])

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      loading,
      isCoordinator: profile?.role === 'coordinator',
      signIn: async () => {
        await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin,
            // Nudges Google to the UW account picker; the real restriction is
            // enforced server-side by the allowed_email_domains table.
            queryParams: { hd: 'uw.edu', prompt: 'select_account' },
          },
        })
      },
      signOut: async () => {
        await supabase.auth.signOut()
      },
    }),
    [session, profile, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
