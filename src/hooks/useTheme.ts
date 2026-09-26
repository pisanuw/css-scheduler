import { useCallback, useEffect, useState } from 'react'
import { useMediaQuery } from './useMediaQuery'
import {
  applyTheme,
  nextPreference,
  readPreference,
  resolveTheme,
  writePreference,
  type ResolvedTheme,
  type ThemePreference,
} from '../lib/theme'

export interface ThemeState {
  /** What has been chosen, which may be "follow the device". */
  preference: ThemePreference
  /** What that comes to, once the device has had its say. */
  resolved: ResolvedTheme
  /** Move to the next of the three. */
  cycle: () => void
}

/**
 * Owned by `App`, not by the button, and deliberately so.
 *
 * The sign-in page has no header and therefore no theme button, and the
 * loading state has neither. If the state lived in the button, a phone that
 * switched itself to dark at sunset while the sign-in page was open would stay
 * white until someone signed in — and the inline script in `index.html` only
 * runs once, at load. One owner above every branch of the app means the theme
 * follows the device wherever you are in it.
 */
export function useTheme(): ThemeState {
  const systemPrefersDark = useMediaQuery('(prefers-color-scheme: dark)')
  const [preference, setPreference] = useState<ThemePreference>(() =>
    readPreference(typeof window === 'undefined' ? null : window.localStorage),
  )
  const resolved = resolveTheme(preference, systemPrefersDark)

  useEffect(() => {
    applyTheme(document.documentElement, resolved)
  }, [resolved])

  const cycle = useCallback(() => {
    setPreference((current) => {
      const next = nextPreference(current)
      writePreference(next, typeof window === 'undefined' ? null : window.localStorage)
      return next
    })
  }, [])

  return { preference, resolved, cycle }
}
