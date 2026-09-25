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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!session) {
      setProfile(null)
      setLoading(false)
      return
    }
    setLoading(true)
    supabase
      .from('profiles')
      .select('id, email, full_name, role, instructor_id')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (cancelled) return
        setProfile((data as Profile) ?? null)
        setLoading(false)
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
