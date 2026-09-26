import { describe, expect, it } from 'vitest'
import { slug } from './download'

describe('slug', () => {
  it('lowercases and hyphenates', () => {
    expect(slug('First pass')).toBe('first-pass')
  })

  it('collapses runs of punctuation and trims the edges', () => {
    expect(slug('  2026-27 — Plan B!! ')).toBe('2026-27-plan-b')
  })

  it('falls back rather than producing an empty filename', () => {
    expect(slug('!!!')).toBe('scenario')
    expect(slug('')).toBe('scenario')
  })

  it('caps the length so no filesystem rejects it', () => {
    expect(slug('x'.repeat(200)).length).toBeLessThanOrEqual(60)
  })
})
