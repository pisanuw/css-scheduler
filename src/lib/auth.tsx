import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { resolveProfile, type LoadedProfile } from './authState'

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
  /*
   * The profile *and whose it is*, together, because the second question is
   * what every bug here has turned on. `loading` used to be its own flag, and
   * between the render that received the session and the effect that set the
   * flag back to true there was one commit with a session, no profile, and
   * `loading` false — long enough for the router to decide the reader was not
   * a coordinator and send them home. A coordinator opening a bookmarked
   * `/board/:scenarioId` landed on the dashboard, and the deeper the link the
   * more it mattered.
   *
   * Recording the owner alongside the profile removes the window rather than
   * narrowing it, and removes the effect that used to clear the profile on
   * sign-out: nothing has to be reset, because a profile that does not belong
   * to the current session is not shown. See `resolveProfile`.
   */
  const [loaded, setLoaded] = useState<LoadedProfile<Profile> | null>(null)
  const { profile, loading } = resolveProfile(session?.user.id, loaded)

  useEffect(() => {
    /*
     * A rejection here is treated as "nobody is signed in", which is what the
     * null session already means everywhere below. It needs saying explicitly
     * all the same: without the rejection handler this was an unhandled
     * promise, and the only reason it was survivable is that `session` starts
     * null and the reader lands on the sign-in page.
     */
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => setSession(null))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    // Signed out needs no work at all now: `resolveProfile` answers it.
    if (!session) return
    let cancelled = false
    const userId = session.user.id
    supabase
      .from('profiles')
      .select('id, email, full_name, role, instructor_id')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (cancelled) return
        /*
         * Recorded even when nothing came back. A signed-in reader with no
         * profile row gets the app with no coordinator pages, which is both
         * true and recoverable; leaving them on "Loading…" for ever is
         * neither.
         */
        setLoaded({ userId, profile: data ?? null })
      },
      /*
       * Same reasoning as the resolved-but-empty case above, and this is the
       * one that actually bites: on a phone that has just lost signal the
       * select rejects rather than returning nothing. Without a rejection
       * handler the reader keeps a session, never gets a profile, and
       * `loading` stays true for ever — the exact "Loading… for ever" the
       * comment above refuses to ship. They get the app with no coordinator
       * pages instead, and the next auth change retries.
       *
       * It has to be `then`'s second argument rather than a chained `.catch`:
       * a Postgrest builder is a bare `PromiseLike` and has no `catch`. That
       * is also why the linter could not see this one, and why it was worth
       * reading the file rather than only the findings.
       */
      () => {
        if (cancelled) return
        setLoaded({ userId, profile: null })
      },
    )
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
