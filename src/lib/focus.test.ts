import { describe, expect, it } from 'vitest'
import { FOCUSABLE_SELECTOR, nextTrapIndex } from './focus'

describe('nextTrapIndex', () => {
  it('steps forward', () => {
    expect(nextTrapIndex(3, 0, false)).toBe(1)
    expect(nextTrapIndex(3, 1, false)).toBe(2)
  })

  it('steps backward', () => {
    expect(nextTrapIndex(3, 2, true)).toBe(1)
    expect(nextTrapIndex(3, 1, true)).toBe(0)
  })

  it('wraps at the end rather than letting focus leave the dialog', () => {
    expect(nextTrapIndex(3, 2, false)).toBe(0)
  })

  it('wraps at the start', () => {
    expect(nextTrapIndex(3, 0, true)).toBe(2)
  })

  // After a backdrop click, or when a re-render removes the focused control.
  it('brings focus back to the near end when it has escaped', () => {
    expect(nextTrapIndex(3, -1, false)).toBe(0)
    expect(nextTrapIndex(3, -1, true)).toBe(2)
  })

  it('treats an index past the end as escaped', () => {
    expect(nextTrapIndex(3, 7, false)).toBe(0)
  })

  it('leaves Tab alone when there is nothing focusable', () => {
    expect(nextTrapIndex(0, -1, false)).toBeNull()
    expect(nextTrapIndex(0, 0, true)).toBeNull()
  })

  it('keeps a lone control focused', () => {
    expect(nextTrapIndex(1, 0, false)).toBe(0)
    expect(nextTrapIndex(1, 0, true)).toBe(0)
  })
})

describe('FOCUSABLE_SELECTOR', () => {
  // The dialog container parks focus on itself with tabindex="-1" on open; if
  // that matched, Tab would cycle through the backdrop.
  it('excludes programmatic-only focus targets', () => {
    expect(FOCUSABLE_SELECTOR).toContain('[tabindex]:not([tabindex="-1"])')
    expect(FOCUSABLE_SELECTOR).not.toContain('[tabindex="-1"]:not')
  })

  it('skips disabled controls', () => {
    expect(FOCUSABLE_SELECTOR).toContain('button:not([disabled])')
    expect(FOCUSABLE_SELECTOR).toContain('select:not([disabled])')
  })
})
