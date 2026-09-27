/**
 * Which profile the app should show for the session it currently has.
 *
 * The profile is a round trip to `profiles`, so it cannot be computed during
 * render — but *whose* profile the fetched one belongs to can be recorded
 * alongside it, and that turns "is this profile the right one" from a
 * sequencing problem into a comparison. Everything that used to need an
 * effect to clear or reset the profile is this function instead.
 */
export interface LoadedProfile<P> {
  /** The user the profile below was fetched for. */
  userId: string
  /** Null when the fetch came back empty, or failed: both mean "no profile". */
  profile: P | null
}

export interface ResolvedProfile<P> {
  profile: P | null
  /**
   * True only while there is a session whose profile has not come back yet.
   * Signed out is not loading, and a resolved-but-empty profile is not
   * loading either — a reader with no `profiles` row gets the app without the
   * coordinator pages, which is true and recoverable, where "Loading…" for
   * ever is neither.
   */
  loading: boolean
}

export function resolveProfile<P>(
  userId: string | null | undefined,
  loaded: LoadedProfile<P> | null,
): ResolvedProfile<P> {
  if (!userId) return { profile: null, loading: false }
  /*
   * A profile fetched for somebody else is not shown while the new one loads.
   * That case is real: signing out and into a second account reuses this
   * provider, and the window between the new session arriving and its profile
   * landing is exactly where a stale `role: 'coordinator'` would leak the
   * coordinator's pages to whoever signed in next.
   */
  if (!loaded || loaded.userId !== userId) return { profile: null, loading: true }
  return { profile: loaded.profile, loading: false }
}
