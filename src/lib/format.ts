const DAY_LETTERS = ['', 'M', 'T', 'W', 'Th', 'F', 'S', 'Su']

export function formatDays(days: number[] | null | undefined): string {
  if (!days || days.length === 0) return '—'
  return days.map((d) => DAY_LETTERS[d] ?? '?').join('')
}

/** '13:15:00' -> '1:15 PM' */
export function formatTime(t: string | null | undefined): string {
  if (!t) return ''
  const [hStr, m] = t.split(':')
  const h = Number(hStr)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m} ${suffix}`
}

export function formatTimeRange(start?: string | null, end?: string | null): string {
  if (!start || !end) return 'to be arranged'
  return `${formatTime(start)}–${formatTime(end)}`
}

export const QUARTER_ORDER = ['autumn', 'winter', 'spring', 'summer'] as const

export function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * The conflict tally as a sentence, for the board's live region.
 *
 * The pills above the list already say "2 errors · 0 warnings · 1 note", which
 * is the right shape to scan and the wrong shape to hear: a screen reader
 * reading three buttons' labels after every assignment tells you the numbers
 * without telling you whether anything is wrong. This says the one thing that
 * matters, and stays quiet about the categories that are empty.
 */
export function conflictSummary(counts: { error: number; warning: number; info: number }): string {
  const parts = (
    [
      [counts.error, 'error'],
      [counts.warning, 'warning'],
      [counts.info, 'note'],
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, word]) => `${n} ${word}${n === 1 ? '' : 's'}`)

  if (parts.length === 0) return 'No conflicts.'
  if (parts.length === 1) return `${parts[0]}.`
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}.`
}

/**
 * The date on a printed page, in the long form nobody misreads.
 *
 * A schedule that comes out of a printer gets carried into a meeting and
 * compared with another copy of itself; without a date on it, nobody can tell
 * which one is current. `9/26/26` is ambiguous the moment it crosses an
 * ocean, so the month is spelled out.
 */
export function printedOn(date: Date): string {
  return `Printed ${date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })}`
}
