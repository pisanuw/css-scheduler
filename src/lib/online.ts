/**
 * Whether the app can reach the server, and what to say about it.
 *
 * The app already worked offline before this file existed — the service worker
 * caches the shell and every page chunk — and that was the problem. A
 * coordinator on a phone in a building with no signal could open the board,
 * see last night's assignments, tap Assign, watch the pill appear, and put the
 * phone away believing the change was saved. It was not: React Query's default
 * `networkMode: 'online'` *pauses* a mutation started while the browser says
 * it is offline. The optimistic update runs, `mutationFn` never does, the
 * mutation sits in the cache marked `isPaused`, and the spinner spins until
 * the connection returns.
 *
 * That behaviour is the right one — the change is not lost, and React Query
 * resumes it on reconnect — but it is invisible, and an invisible pause is
 * indistinguishable from a save. So this file holds the two rules that make it
 * visible:
 *
 *   - `nextConnection` decides when the app is offline, and when it has just
 *     come back — the second of which is worth a moment of reassurance and
 *     then silence.
 *   - `bannerFor` turns that, plus how many writes are actually waiting, into
 *     the one sentence the banner shows.
 *
 * Both are pure, for the usual reason: the interesting cases here are a
 * sequence of events over time, and a test can produce that sequence in a
 * microsecond where a person with a phone and an aeroplane-mode switch cannot.
 *
 * `isOfflineError` covers the other half of the same problem, the half no
 * `online`/`offline` event ever fires for: a browser that believes it has a
 * connection through a hotel portal or a half-associated access point, where
 * the request is attempted and dies. There the app has an exception rather
 * than a state, and what it must not do is show the coordinator the browser's
 * words for it.
 */
import { plural } from './format'

export type ConnectionState =
  /** Requests are going through, as far as anything here knows. */
  | 'online'
  /** The browser says there is no connection. Writes will be queued. */
  | 'offline'
  /** There is one again, just now — say so briefly, then stop saying it. */
  | 'restored'

export type ConnectionEvent =
  | { type: 'went-offline' }
  | { type: 'came-online' }
  /** The reassurance has been on screen long enough. */
  | { type: 'settled' }

/**
 * How long "Back online" stays. Long enough to be read by somebody who was
 * looking at the phone when it appeared, short enough that it is gone before
 * they look again.
 */
export const RESTORED_MS = 4000

/** Where a tab starts. Loading with no connection is not a change of state. */
export function initialConnection(online: boolean): ConnectionState {
  return online ? 'online' : 'offline'
}

/**
 * The state machine.
 *
 * Two things it deliberately does not do. An `online` event while already
 * online is ignored rather than treated as a recovery: browsers fire it on
 * waking from sleep and on switching access points, and "Back online" on a
 * connection that never went away is noise that teaches people to ignore the
 * banner that matters. And going offline out of `restored` goes straight back
 * to `offline` — a connection flapping should read as a bad connection, not as
 * a series of recoveries.
 */
export function nextConnection(state: ConnectionState, event: ConnectionEvent): ConnectionState {
  switch (event.type) {
    case 'went-offline':
      return 'offline'
    case 'came-online':
      return state === 'offline' ? 'restored' : state
    case 'settled':
      return state === 'restored' ? 'online' : state
  }
}

export interface Banner {
  /** Amber for a state that persists, green for one that is about to end. */
  tone: 'warning' | 'success'
  text: string
}

/**
 * What the banner says, or nothing at all when there is nothing to say.
 *
 * `waiting` is the number of writes React Query is holding. It is the
 * difference between a warning and a reassurance: with nothing waiting the
 * coordinator has lost only the ability to save, which they have not started
 * doing; with three writes queued they have made three changes that look
 * saved, and the honest thing is to say where those changes are.
 */
export function bannerFor(state: ConnectionState, waiting: number): Banner | null {
  const queued = Math.max(0, Math.trunc(waiting))

  if (state === 'offline') {
    return {
      tone: 'warning',
      text: queued
        ? `Offline — ${plural(queued, 'change')} waiting to save. Nothing is lost; they go through when the connection comes back.`
        : 'Offline. You can keep reading, and anything you change is saved when the connection comes back.',
    }
  }

  if (state === 'restored') {
    return {
      tone: 'success',
      text: queued ? `Back online — saving ${plural(queued, 'change')}.` : 'Back online.',
    }
  }

  return null
}

/**
 * The messages a dead connection produces, as each browser words it.
 *
 * Deliberately matched on the message rather than the type. By the time one of
 * these reaches the app it has been through `postgrest-js`, which reports a
 * transport failure as a plain object, and then through this app's own
 * `throw new Error(error.message)` — so the `TypeError` is long gone and the
 * string is all that is left.
 */
const OFFLINE_MESSAGES = [
  'failed to fetch', // Chrome, Edge
  'networkerror when attempting to fetch resource', // Firefox
  'load failed', // Safari
  'network request failed', // React Native, and some polyfills
  'the network connection was lost',
  'err_internet_disconnected',
  'err_name_not_resolved',
  'fetch failed', // undici, which is what a Node-side test sees
]

/**
 * Whether a thrown thing means "the request never arrived" rather than "the
 * server said no".
 *
 * The distinction is worth drawing precisely because the two look the same at
 * the call site and need opposite responses: a rejected write is the
 * coordinator's problem to understand, and a write that never left the phone
 * is not their problem at all. Anything uncertain is treated as a real
 * failure — dressing a genuine server error up as a connection problem would
 * send somebody to check their signal over a broken policy.
 */
export function isOfflineError(e: unknown): boolean {
  const text = messageOf(e).toLowerCase()
  if (!text) return false
  return OFFLINE_MESSAGES.some((m) => text.includes(m))
}

/**
 * The words out of whatever a write threw.
 *
 * `String(e)` is not good enough, and the case it gets wrong is the common
 * one: a Postgrest error is a plain object with `message` and `code`, not an
 * `Error`, so stringifying it yields `[object Object]`. That went straight into
 * the message under the coordinator's thumb — "Could not save the section:
 * [object Object]" — which is worse than saying nothing, because it looks like
 * the scheduler broke rather than the save.
 *
 * An object with no usable message returns the empty string rather than a
 * guess. Both callers treat empty as "no detail to add": `isOfflineError` says
 * no, and `failureText` shows the prefix on its own, which is honest.
 */
export function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  if (e == null) return ''
  if (typeof e === 'object') {
    const message = (e as { message?: unknown }).message
    return typeof message === 'string' ? message : ''
  }
  /*
   * A number or a boolean is an odd thing to throw, and printing it beats
   * hiding it. Named one by one rather than as an `else`, because what is left
   * over also includes a function and a symbol, and neither of those
   * stringifies into anything a coordinator should be shown — a function would
   * print its own source into the toast.
   */
  if (typeof e === 'number' || typeof e === 'boolean' || typeof e === 'bigint') return String(e)
  return ''
}

/**
 * What to say instead of the browser's words, when a request dies in transit.
 *
 * "Could not assign: TypeError: Failed to fetch" tells a coordinator standing
 * in a stairwell nothing they can act on. This tells them the one thing they
 * can: it is the connection, and trying again later will work.
 */
export function offlineFailureText(prefix: string): string {
  return `${prefix}: no connection to the server. Nothing was saved — try again once you are back online.`
}
