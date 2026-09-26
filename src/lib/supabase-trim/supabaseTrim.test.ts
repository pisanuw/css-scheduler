import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { RealtimeClient } from './realtime'
import { StorageApiError, StorageClient } from './storage'
import { FunctionRegion, FunctionsClient, FunctionsHttpError } from './functions'

/**
 * These stand in for three packages that are aliased out of the bundle. What
 * makes them worth testing is the pair of opposite obligations they carry: they
 * must be *silent* where `SupabaseClient` uses them whether anyone asked or not
 * — its constructor builds two of them, and every sign-in calls `setAuth` — and
 * *loud* everywhere else, because a stub that quietly did nothing would turn
 * "this build has no realtime" into a subscription that never fires.
 */
describe('the clients this build leaves out', () => {
  it('constructs in silence, because SupabaseClient does it unasked', () => {
    expect(() => new RealtimeClient('wss://example.invalid/realtime/v1', {})).not.toThrow()
    expect(() => new StorageClient('https://example.invalid/storage/v1', {})).not.toThrow()
    expect(() => new FunctionsClient('https://example.invalid/functions/v1', {})).not.toThrow()
  })

  it('accepts the auth token on every sign-in, sign-out and refresh', () => {
    const realtime = new RealtimeClient()
    // `SupabaseClient` calls these from its auth state change handler. Throwing
    // here would break signing in, which has nothing to do with realtime.
    expect(() => realtime.setAuth('a-token')).not.toThrow()
    expect(() => realtime.setAuth()).not.toThrow()
    expect(() => realtime.setAuth(null)).not.toThrow()
    expect(() => new FunctionsClient().setAuth('a-token')).not.toThrow()
  })

  it('says what happened, and what to edit, the moment anything uses one', () => {
    const realtime = new RealtimeClient()
    for (const use of [
      () => realtime.channel('assignments'),
      () => realtime.getChannels(),
      () => realtime.removeAllChannels(),
      () => new StorageClient().from('exports'),
      () => new FunctionsClient().invoke('nightly-report'),
    ]) {
      expect(use).toThrow(/vite-plugins\/supabaseTrim\.ts/)
      expect(use).toThrow(/ships no Supabase/)
    }
  })

  it('keeps the error types supabase-js re-exports', () => {
    // A missing re-export is a build failure, not a runtime one, so these have
    // to exist even though nothing in this app throws or catches them.
    expect(new StorageApiError('gone', 404)).toBeInstanceOf(Error)
    expect(new StorageApiError('gone', 404).status).toBe(404)
    expect(new FunctionsHttpError()).toBeInstanceOf(Error)
    expect(FunctionRegion).toBeTruthy()
  })
})

/**
 * The stubs are only safe while they cover everything `SupabaseClient`
 * actually calls on the clients they replace. That is a fact about a
 * dependency, not about this code, so it is read out of the dependency rather
 * than remembered: an upgrade that adds `this.realtime.setAuthWithRetry()`
 * would otherwise ship a `TypeError` on sign-in, with nothing in this
 * repository pointing at the cause.
 */
describe('the stubs still cover what supabase-js calls on them', () => {
  const CANDIDATES = [
    'node_modules/@supabase/supabase-js/dist/index.mjs',
    'node_modules/@supabase/supabase-js/dist/module/SupabaseClient.js',
  ]

  const source = (() => {
    for (const path of CANDIDATES) {
      if (existsSync(path)) return readFileSync(path, 'utf8')
    }
    return null
  })()

  it('finds the installed supabase-js to read', () => {
    // Not skipped when missing: a check that quietly does not run is the same
    // as no check, and `npm install` is the whole fix.
    expect(source, `none of ${CANDIDATES.join(', ')} exists — run npm install`).not.toBeNull()
  })

  const membersUsedOn = (property: string) => {
    const used = new Set<string>()
    for (const match of source!.matchAll(new RegExp(`this\\.${property}\\.(\\w+)`, 'g'))) {
      used.add(match[1]!)
    }
    return [...used].sort()
  }

  it('implements every member used on the realtime client', () => {
    const stub = new RealtimeClient() as unknown as Record<string, unknown>
    for (const member of membersUsedOn('realtime')) {
      expect(typeof stub[member], `RealtimeClient.${member} is called by supabase-js`).toBe(
        'function',
      )
    }
  })

  it('implements every member used on the storage client', () => {
    const stub = new StorageClient() as unknown as Record<string, unknown>
    for (const member of membersUsedOn('storage')) {
      expect(typeof stub[member], `StorageClient.${member} is called by supabase-js`).toBe(
        'function',
      )
    }
  })
})
