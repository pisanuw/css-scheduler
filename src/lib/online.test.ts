import { describe, expect, it } from 'vitest'
import { MutationObserver, QueryClient, onlineManager } from '@tanstack/react-query'
import {
  bannerFor,
  initialConnection,
  isOfflineError,
  messageOf,
  nextConnection,
  offlineFailureText,
  RESTORED_MS,
  type ConnectionEvent,
  type ConnectionState,
} from './online'

/** Replays a sequence of events from a starting state. */
function run(from: ConnectionState, ...events: ConnectionEvent['type'][]): ConnectionState {
  return events.reduce<ConnectionState>((s, type) => nextConnection(s, { type }), from)
}

describe('initialConnection', () => {
  it('starts wherever the browser already is', () => {
    expect(initialConnection(true)).toBe('online')
    expect(initialConnection(false)).toBe('offline')
  })

  it('never starts in the restored state', () => {
    // Opening the app is not a recovery. "Back online." on first paint would be
    // the app congratulating itself for working.
    expect(initialConnection(true)).not.toBe('restored')
    expect(initialConnection(false)).not.toBe('restored')
  })
})

describe('nextConnection', () => {
  it('goes offline the moment the browser says so', () => {
    expect(run('online', 'went-offline')).toBe('offline')
  })

  it('comes back through the restored state rather than straight to online', () => {
    expect(run('online', 'went-offline', 'came-online')).toBe('restored')
  })

  it('settles out of restored', () => {
    expect(run('online', 'went-offline', 'came-online', 'settled')).toBe('online')
  })

  it('ignores an online event that follows no outage', () => {
    // Browsers fire `online` on waking from sleep and on changing access
    // point. Treating that as a recovery would flash a green banner at somebody
    // whose connection never went away.
    expect(run('online', 'came-online')).toBe('online')
  })

  it('ignores settling when nothing is settling', () => {
    expect(run('online', 'settled')).toBe('online')
    expect(run('offline', 'settled')).toBe('offline')
  })

  it('reads a flapping connection as offline, not as repeated recoveries', () => {
    expect(run('online', 'went-offline', 'came-online', 'went-offline')).toBe('offline')
    expect(run('online', 'went-offline', 'came-online', 'went-offline', 'came-online')).toBe(
      'restored',
    )
  })

  it('is idempotent on a repeated offline event', () => {
    expect(run('online', 'went-offline', 'went-offline')).toBe('offline')
  })
})

describe('bannerFor', () => {
  it('says nothing at all when the connection is fine', () => {
    expect(bannerFor('online', 0)).toBeNull()
    // Even holding writes: if they are paused while online something else is
    // wrong, and this banner would be guessing at what.
    expect(bannerFor('online', 3)).toBeNull()
  })

  it('warns, and promises nothing it cannot keep, with nothing queued', () => {
    const b = bannerFor('offline', 0)!
    expect(b.tone).toBe('warning')
    expect(b.text).toMatch(/^Offline\./)
    expect(b.text).toContain('when the connection comes back')
  })

  it('counts what is waiting, and says it is not lost', () => {
    const b = bannerFor('offline', 2)!
    expect(b.tone).toBe('warning')
    expect(b.text).toContain('2 changes waiting to save')
    expect(b.text).toContain('Nothing is lost')
  })

  it('singularises one change', () => {
    expect(bannerFor('offline', 1)!.text).toContain('1 change waiting')
    expect(bannerFor('restored', 1)!.text).toBe('Back online — saving 1 change.')
  })

  it('is brief and green on the way back', () => {
    expect(bannerFor('restored', 0)).toEqual({ tone: 'success', text: 'Back online.' })
    expect(bannerFor('restored', 3)!.text).toBe('Back online — saving 3 changes.')
  })

  it('treats a nonsense count as none', () => {
    // The count comes from a cache query, so it is never negative in practice —
    // but a banner that reads "-1 changes waiting" would be the kind of thing a
    // coordinator screenshots, and the guard is one call.
    expect(bannerFor('offline', -1)!.text).not.toContain('-1')
    expect(bannerFor('offline', 1.7)!.text).toContain('1 change')
  })

  it('leaves the reassurance on screen long enough to read', () => {
    expect(RESTORED_MS).toBeGreaterThanOrEqual(3000)
  })
})

describe('isOfflineError', () => {
  it('recognises what each browser says when a request never arrives', () => {
    for (const message of [
      'Failed to fetch',
      'TypeError: Failed to fetch',
      'NetworkError when attempting to fetch resource.',
      'Load failed',
      'Network request failed',
      'The network connection was lost.',
      'net::ERR_INTERNET_DISCONNECTED',
      'fetch failed',
    ]) {
      expect(isOfflineError(new Error(message)), message).toBe(true)
    }
  })

  it('sees a dead connection reported as a plain object, not an Error', () => {
    // Shares `messageOf` with `failureText`, so this follows from that rather
    // than being a second implementation that could disagree with it.
    expect(isOfflineError({ message: 'Failed to fetch' })).toBe(true)
    expect(isOfflineError({ code: 'PGRST301' })).toBe(false)
  })

  it('survives the trip through postgrest and back out as a plain string', () => {
    // What the app actually throws: `new Error(error.message)`, where
    // `error.message` is whatever postgrest-js put in it.
    expect(isOfflineError('TypeError: Failed to fetch')).toBe(true)
  })

  it('leaves a real answer from the server alone', () => {
    for (const message of [
      'new row violates row-level security policy for table "sections"',
      'duplicate key value violates unique constraint',
      'JWT expired',
      'Could not find the function public.log_access',
      '',
    ]) {
      expect(isOfflineError(new Error(message)), message).toBe(false)
    }
    expect(isOfflineError(null)).toBe(false)
    expect(isOfflineError(undefined)).toBe(false)
  })
})

describe('messageOf', () => {
  it('takes the message off an Error', () => {
    expect(messageOf(new Error('row level security'))).toBe('row level security')
  })

  it('reads the message off a postgrest error, which is not an Error at all', () => {
    // The case that mattered enough to write this function: a Postgrest
    // failure arrives as a plain object, and `String()` on one of those is
    // `[object Object]` — which the coordinator used to read in the toast.
    const postgrest = { message: 'duplicate key value violates unique constraint', code: '23505' }
    expect(messageOf(postgrest)).toBe('duplicate key value violates unique constraint')
  })

  it('says nothing rather than [object Object] when an object has no message', () => {
    expect(messageOf({ code: '23505' })).toBe('')
    expect(messageOf({})).toBe('')
    expect(messageOf({ message: 42 })).toBe('')
    expect(messageOf([])).toBe('')
  })

  it('passes a string straight through and treats nothing as nothing', () => {
    expect(messageOf('timed out')).toBe('timed out')
    expect(messageOf(null)).toBe('')
    expect(messageOf(undefined)).toBe('')
    expect(messageOf('')).toBe('')
  })

  it('prints a primitive rather than hiding it', () => {
    expect(messageOf(404)).toBe('404')
    expect(messageOf(false)).toBe('false')
    expect(messageOf(9007199254740993n)).toBe('9007199254740993')
  })

  it('says nothing for a thrown function or symbol', () => {
    // Neither stringifies into anything worth showing: a function would print
    // its own source into the toast.
    expect(messageOf(() => 'nope')).toBe('')
    expect(messageOf(Symbol('nope'))).toBe('')
  })
})

describe('offlineFailureText', () => {
  it('says it is the connection, and that nothing was written', () => {
    const text = offlineFailureText('Could not assign')
    expect(text).toContain('Could not assign')
    expect(text).toContain('no connection')
    expect(text).toContain('Nothing was saved')
  })
})

/*
 * The fact the whole banner rests on, pinned here rather than remembered.
 *
 * React Query's default `networkMode: 'online'` does not fail a mutation
 * started while the browser is offline — it pauses it. `onMutate` runs, so the
 * optimistic update lands and the board looks saved; `mutationFn` does not, so
 * nothing reaches Supabase. If a future version of React Query changed this to
 * reject instead, the banner's "they go through when the connection comes back"
 * would become a lie, and this test is what would say so.
 */
describe('React Query while the browser is offline', () => {
  it('pauses a mutation with its optimistic update applied, and runs nothing', async () => {
    const wasOnline = onlineManager.isOnline()
    try {
      onlineManager.setOnline(false)
      const client = new QueryClient()
      let ran = 0
      let optimistic = 0
      const observer = new MutationObserver(client, {
        mutationFn: async () => {
          ran += 1
          return 'saved'
        },
        onMutate: () => {
          optimistic += 1
        },
      })
      void observer.mutate().catch(() => {})
      await Promise.resolve()

      const result = observer.getCurrentResult()
      expect(result.isPaused).toBe(true)
      expect(result.isPending).toBe(true)
      expect(optimistic).toBe(1)
      expect(ran).toBe(0)

      // And it is findable: this predicate is the banner's count.
      const paused = client.getMutationCache().findAll({ predicate: (m) => m.state.isPaused })
      expect(paused).toHaveLength(1)
    } finally {
      onlineManager.setOnline(wasOnline)
    }
  })
})
