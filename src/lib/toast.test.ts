import { describe, expect, it } from 'vitest'
import {
  clearToasts,
  dismissToast,
  EMPTY_TOASTS,
  failureText,
  liveRegionOf,
  MAX_TOASTS,
  pushToast,
  TTL,
  type ToastState,
} from './toast'

/** Applies a series of messages, newest last. */
function seq(...msgs: [string, ('info' | 'success' | 'error')?][]): ToastState {
  return msgs.reduce((s, [text, tone]) => pushToast(s, text, tone), EMPTY_TOASTS)
}

describe('pushToast', () => {
  it('adds a message with the tone it was given', () => {
    const s = pushToast(EMPTY_TOASTS, 'Saved.', 'success')
    expect(s.items).toHaveLength(1)
    expect(s.items[0]).toMatchObject({ text: 'Saved.', tone: 'success' })
  })

  it('defaults to the neutral tone', () => {
    expect(pushToast(EMPTY_TOASTS, 'Copying…').items[0]!.tone).toBe('info')
  })

  it('keeps newest last', () => {
    const s = seq(['one'], ['two'], ['three'])
    expect(s.items.map((t) => t.text)).toEqual(['one', 'two', 'three'])
  })

  it('gives every message a distinct id', () => {
    const s = seq(['one'], ['two'], ['three'])
    expect(new Set(s.items.map((t) => t.id)).size).toBe(3)
  })

  it('ignores an empty or whitespace-only message', () => {
    expect(pushToast(EMPTY_TOASTS, '').items).toHaveLength(0)
    expect(pushToast(EMPTY_TOASTS, '   ').items).toHaveLength(0)
  })

  it('trims the message it stores', () => {
    expect(pushToast(EMPTY_TOASTS, '  Saved.\n').items[0]!.text).toBe('Saved.')
  })

  it('caps the queue, dropping the oldest', () => {
    const s = seq(['one'], ['two'], ['three'], ['four'])
    expect(s.items).toHaveLength(MAX_TOASTS)
    expect(s.items.map((t) => t.text)).toEqual(['two', 'three', 'four'])
  })

  // Tapping a failing Save three times is one problem, not three.
  it('refreshes rather than stacks when the same message repeats', () => {
    const s = seq(['Could not save.', 'error'], ['Could not save.', 'error'])
    expect(s.items).toHaveLength(1)
  })

  it('gives the refreshed message a new id, so its timer restarts', () => {
    const once = pushToast(EMPTY_TOASTS, 'Could not save.', 'error')
    const twice = pushToast(once, 'Could not save.', 'error')
    expect(twice.items[0]!.id).not.toBe(once.items[0]!.id)
  })

  it('treats the same text in a different tone as news', () => {
    const s = seq(['Saved.', 'error'], ['Saved.', 'success'])
    expect(s.items).toHaveLength(2)
  })

  it('only collapses against the newest message, not one further back', () => {
    const s = seq(['one'], ['two'], ['one'])
    expect(s.items.map((t) => t.text)).toEqual(['one', 'two', 'one'])
  })

  it('leaves errors to be dismissed and lets the rest expire', () => {
    expect(TTL.error).toBeNull()
    expect(TTL.success).toBeGreaterThan(0)
    expect(TTL.info).toBeGreaterThan(0)
    expect(pushToast(EMPTY_TOASTS, 'Nope.', 'error').items[0]!.ttl).toBeNull()
  })
})

describe('dismissToast', () => {
  it('removes just that message', () => {
    const s = seq(['one'], ['two'])
    const after = dismissToast(s, s.items[0]!.id)
    expect(after.items.map((t) => t.text)).toEqual(['two'])
  })

  it('returns the same state for an id that is already gone', () => {
    const s = seq(['one'])
    expect(dismissToast(s, 999)).toBe(s)
  })

  it('never reuses an id after a dismissal', () => {
    const s = seq(['one'])
    const after = pushToast(dismissToast(s, s.items[0]!.id), 'two')
    expect(after.items[0]!.id).not.toBe(s.items[0]!.id)
  })
})

describe('clearToasts', () => {
  it('empties the queue', () => {
    expect(clearToasts(seq(['one'], ['two'])).items).toHaveLength(0)
  })

  it('returns the same state when there is nothing to clear', () => {
    expect(clearToasts(EMPTY_TOASTS)).toBe(EMPTY_TOASTS)
  })
})

describe('liveRegionOf', () => {
  it('interrupts for an error and waits its turn otherwise', () => {
    expect(liveRegionOf('error')).toBe('assertive')
    expect(liveRegionOf('success')).toBe('polite')
    expect(liveRegionOf('info')).toBe('polite')
  })
})

describe('failureText', () => {
  it('puts the cause after what was being attempted', () => {
    expect(failureText('Could not archive', new Error('row level security'))).toBe(
      'Could not archive: row level security',
    )
  })

  it('falls back to the prefix alone when there is no cause to give', () => {
    expect(failureText('Could not archive', new Error(''))).toBe('Could not archive')
    expect(failureText('Could not archive', null)).toBe('Could not archive')
    expect(failureText('Could not archive', undefined)).toBe('Could not archive')
  })

  it('copes with something that is not an Error', () => {
    expect(failureText('Could not archive', 'timed out')).toBe('Could not archive: timed out')
  })
})
