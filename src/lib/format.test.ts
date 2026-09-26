import { describe, expect, it } from 'vitest'
import { conflictSummary, formatDays, formatTime, formatTimeRange, titleCase } from './format'

describe('conflictSummary', () => {
  it('says so plainly when there is nothing wrong', () => {
    expect(conflictSummary({ error: 0, warning: 0, info: 0 })).toBe('No conflicts.')
  })

  it('names one category on its own', () => {
    expect(conflictSummary({ error: 2, warning: 0, info: 0 })).toBe('2 errors.')
  })

  it('stays singular for one', () => {
    expect(conflictSummary({ error: 1, warning: 0, info: 0 })).toBe('1 error.')
    expect(conflictSummary({ error: 0, warning: 1, info: 0 })).toBe('1 warning.')
    expect(conflictSummary({ error: 0, warning: 0, info: 1 })).toBe('1 note.')
  })

  it('joins two with "and"', () => {
    expect(conflictSummary({ error: 2, warning: 1, info: 0 })).toBe('2 errors and 1 warning.')
  })

  it('joins three as a list', () => {
    expect(conflictSummary({ error: 2, warning: 1, info: 3 })).toBe(
      '2 errors, 1 warning and 3 notes.',
    )
  })

  // Hearing "0 warnings" after every tap is exactly the noise this replaces.
  it('leaves out the categories that are empty', () => {
    expect(conflictSummary({ error: 0, warning: 4, info: 0 })).toBe('4 warnings.')
    expect(conflictSummary({ error: 3, warning: 0, info: 2 })).toBe('3 errors and 2 notes.')
  })

  it('keeps errors first, whatever the counts', () => {
    const s = conflictSummary({ error: 1, warning: 9, info: 9 })
    expect(s.indexOf('error')).toBeLessThan(s.indexOf('warning'))
  })
})

describe('formatDays', () => {
  it('runs the letters together the way a time schedule does', () => {
    expect(formatDays([1, 3])).toBe('MW')
    expect(formatDays([2, 4])).toBe('TTh')
  })

  it('shows a dash for nothing', () => {
    expect(formatDays([])).toBe('—')
    expect(formatDays(null)).toBe('—')
    expect(formatDays(undefined)).toBe('—')
  })
})

describe('formatTime', () => {
  it('reads as a clock, not a timestamp', () => {
    expect(formatTime('13:15:00')).toBe('1:15 PM')
    expect(formatTime('09:30:00')).toBe('9:30 AM')
  })

  it('gets the two ends of the day right', () => {
    expect(formatTime('00:05:00')).toBe('12:05 AM')
    expect(formatTime('12:00:00')).toBe('12:00 PM')
  })

  it('is empty for nothing', () => {
    expect(formatTime(null)).toBe('')
  })
})

describe('formatTimeRange', () => {
  it('joins the two ends', () => {
    expect(formatTimeRange('10:00:00', '11:50:00')).toBe('10:00 AM–11:50 AM')
  })

  it('says what an arranged section is, rather than showing a blank', () => {
    expect(formatTimeRange(null, '11:50:00')).toBe('to be arranged')
    expect(formatTimeRange('10:00:00', null)).toBe('to be arranged')
  })
})

describe('titleCase', () => {
  it('lifts the first letter only', () => {
    expect(titleCase('autumn')).toBe('Autumn')
    expect(titleCase('in person')).toBe('In person')
  })

  it('copes with an empty string', () => {
    expect(titleCase('')).toBe('')
  })
})
