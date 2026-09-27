import { describe, expect, it } from 'vitest'
import { resolveProfile } from './authState'

interface P {
  id: string
  role: 'coordinator' | 'instructor'
}

const coordinator: P = { id: 'u1', role: 'coordinator' }
const instructor: P = { id: 'u2', role: 'instructor' }

describe('resolveProfile', () => {
  it('is signed out, not loading, with no session', () => {
    expect(resolveProfile(null, null)).toEqual({ profile: null, loading: false })
  })

  // The state left behind by the last session stays in the provider — nothing
  // clears it — so signing out has to be answered by the comparison rather
  // than by a reset.
  it('shows nothing after a sign-out, however stale the state', () => {
    expect(resolveProfile(null, { userId: 'u1', profile: coordinator })).toEqual({
      profile: null,
      loading: false,
    })
  })

  it('is loading while the first profile is in flight', () => {
    expect(resolveProfile('u1', null)).toEqual({ profile: null, loading: true })
  })

  it('shows the profile once it belongs to this session', () => {
    expect(resolveProfile('u1', { userId: 'u1', profile: coordinator })).toEqual({
      profile: coordinator,
      loading: false,
    })
  })

  /*
   * The one that matters. Signing out and into a second account reuses the
   * provider, so for one render the session is the new user's and the profile
   * is still the old one's. Showing it would hand the coordinator's pages to
   * whoever signed in next.
   */
  it('refuses a profile fetched for somebody else, and waits', () => {
    expect(resolveProfile('u2', { userId: 'u1', profile: coordinator })).toEqual({
      profile: null,
      loading: true,
    })
  })

  it('shows the new profile once it arrives', () => {
    expect(resolveProfile('u2', { userId: 'u2', profile: instructor })).toEqual({
      profile: instructor,
      loading: false,
    })
  })

  // A signed-in reader with no `profiles` row is resolved, not loading.
  it('treats a resolved-but-empty profile as an answer', () => {
    expect(resolveProfile('u3', { userId: 'u3', profile: null })).toEqual({
      profile: null,
      loading: false,
    })
  })

  it('treats undefined like a missing session', () => {
    expect(resolveProfile(undefined, null)).toEqual({ profile: null, loading: false })
  })
})
