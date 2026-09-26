import { useEffect, useState } from 'react'

/**
 * Tracks a media query.
 *
 * `DataTable` uses this rather than rendering a table and a stack of cards and
 * hiding one with `sm:hidden`. The teaching history is over a thousand rows and
 * seven columns; building both shapes of it means fourteen thousand cells in
 * the document to show seven thousand.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => match(query))

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const list = window.matchMedia(query)
    const update = () => setMatches(list.matches)
    update() // The viewport may have changed between the first render and here.
    list.addEventListener('change', update)
    return () => list.removeEventListener('change', update)
  }, [query])

  return matches
}

function match(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(query).matches
}

/**
 * Narrower than Tailwind's `sm`. Where a phone and a laptop want different
 * shapes rather than the same shape at a different size, this is the fork —
 * and it defaults to the phone, because a card list is merely roomy on a wide
 * screen whereas a table is unusable on a narrow one.
 */
export function useIsNarrow(): boolean {
  return !useMediaQuery('(min-width: 640px)')
}
