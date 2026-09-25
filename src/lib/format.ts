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
