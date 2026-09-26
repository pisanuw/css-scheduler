/**
 * The queue behind the app's transient messages.
 *
 * Kept here, as plain data, for the same reason the conflict engine is: the
 * interesting decisions — what stacks, what replaces, what disappears on its
 * own — are rules, and rules are worth testing without a browser.
 */

export type ToastTone = 'info' | 'success' | 'error'

/**
 * One thing to do about a message.
 *
 * Deliberately one, and deliberately optional. A message with two buttons is a
 * dialog in the wrong place, and a strip at the bottom of a 375px screen has
 * room for a label, a verb and a dismiss.
 */
export interface ToastAction {
  label: string
  run: () => void
}

export interface Toast {
  id: number
  text: string
  tone: ToastTone
  /** Milliseconds until it clears itself, or null to stay until dismissed. */
  ttl: number | null
  action?: ToastAction
}

export interface ToastState {
  items: Toast[]
  /** Monotonic, so a refreshed message gets a new id and React remounts it. */
  nextId: number
}

export const EMPTY_TOASTS: ToastState = { items: [], nextId: 1 }

/**
 * Three at once. More than that on a 375px screen covers the thing the
 * message is about.
 */
export const MAX_TOASTS = 3

/**
 * An error stays until it is dismissed. A failure that vanishes before the
 * coordinator looks up from the phone is worse than no message at all;
 * a confirmation that lingers is only clutter.
 */
export const TTL: Record<ToastTone, number | null> = {
  info: 5000,
  success: 4000,
  error: null,
}

/**
 * Screen readers take the politeness from the region, not the message, so
 * there are two regions and this says which one a tone belongs in.
 */
export function liveRegionOf(tone: ToastTone): 'polite' | 'assertive' {
  return tone === 'error' ? 'assertive' : 'polite'
}

/**
 * Adds a message.
 *
 * Saying the same thing twice in a row refreshes the message already showing
 * rather than stacking a copy underneath it: tapping a failing Save three
 * times is one problem, not three. The text and tone must both match — "Saved."
 * arriving after "Could not save." is news.
 *
 * A message carrying an action never times out, whatever its tone. "A new
 * version is ready" with a Reload button that disappears after five seconds is
 * worse than not offering one: the coordinator looks up from the phone, sees
 * nothing, and the app quietly stays on the old version.
 */
export function pushToast(
  state: ToastState,
  text: string,
  tone: ToastTone = 'info',
  action?: ToastAction,
): ToastState {
  const trimmed = text.trim()
  if (!trimmed) return state

  const fresh: Toast = {
    id: state.nextId,
    text: trimmed,
    tone,
    ttl: action ? null : TTL[tone],
    ...(action ? { action } : {}),
  }
  const last = state.items[state.items.length - 1]

  if (last && last.text === trimmed && last.tone === tone) {
    return { items: [...state.items.slice(0, -1), fresh], nextId: state.nextId + 1 }
  }

  const items = [...state.items, fresh]
  return { items: items.slice(Math.max(0, items.length - MAX_TOASTS)), nextId: state.nextId + 1 }
}

export function dismissToast(state: ToastState, id: number): ToastState {
  const items = state.items.filter((t) => t.id !== id)
  return items.length === state.items.length ? state : { ...state, items }
}

export function clearToasts(state: ToastState): ToastState {
  return state.items.length === 0 ? state : { ...state, items: [] }
}

/** The message shown when a mutation fails, from whatever the layer below threw. */
export function failureText(prefix: string, e: unknown): string {
  const detail = e instanceof Error ? e.message : String(e ?? '')
  return detail ? `${prefix}: ${detail}` : prefix
}
