/**
 * Which theme the app is in, and how that survives a reload.
 *
 * Three states, not two. "Dark" and "light" are choices the coordinator has
 * made and the app must not overrule; "system" is the absence of a choice,
 * and it has to keep tracking the phone as the phone changes its mind at
 * sunset. Collapsing that to a boolean loses the difference between "she
 * wants light" and "her phone is light at the moment", which is exactly the
 * difference that matters at 6pm.
 *
 * The DOM work is three lines at the bottom; everything above it is arithmetic
 * with no window in sight, so it is tested directly like the rest of `lib`.
 */

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

/** Namespaced, because a browser profile has one localStorage for every app. */
export const THEME_KEY = 'css-scheduler:theme'

export const PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark']

export function isPreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

/** What the page should actually look like, given the choice and the phone. */
export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light'
  return preference
}

/**
 * The next state of a single cycling button. System first, so that one more
 * press always gets back to "whatever the phone says" rather than stranding
 * someone in a theme they now have to remember to undo.
 */
export function nextPreference(preference: ThemePreference): ThemePreference {
  return preference === 'system' ? 'light' : preference === 'light' ? 'dark' : 'system'
}

/**
 * What the button says. Both halves matter: a control that only names its
 * current state leaves a screen reader user pressing it to find out what it
 * does, and one that only names its effect never says where it started.
 */
export function themeLabel(preference: ThemePreference, resolved: ResolvedTheme): string {
  const now =
    preference === 'system' ? `following your device (${resolved})` : preference
  return `Theme: ${now}. Switch to ${nextPreference(preference)}.`
}

/**
 * Reads the stored choice. Storage throws rather than returning null in a
 * locked-down browser — Safari's private mode is the usual one — and a colour
 * scheme is never worth a blank page, so anything unexpected means "system".
 */
export function readPreference(storage?: Pick<Storage, 'getItem'> | null): ThemePreference {
  try {
    const raw = storage?.getItem(THEME_KEY)
    return isPreference(raw) ? raw : 'system'
  } catch {
    return 'system'
  }
}

/**
 * Stores the choice, or forgets it when it goes back to "system" — an absent
 * key is what "no choice" means, and is what the inline script in index.html
 * reads before React exists.
 */
export function writePreference(
  preference: ThemePreference,
  storage?: Pick<Storage, 'setItem' | 'removeItem'> | null,
): void {
  try {
    if (preference === 'system') storage?.removeItem(THEME_KEY)
    else storage?.setItem(THEME_KEY, preference)
  } catch {
    /* A theme that cannot be remembered still has to work this session. */
  }
}

/**
 * Puts the resolved theme where the stylesheet can see it. One attribute on
 * <html>: `src/index.css` hangs the whole dark palette off it, and the inline
 * script sets the same attribute before the first paint so the page never
 * flashes white on the way to being dark.
 */
export function applyTheme(root: HTMLElement | null | undefined, resolved: ResolvedTheme): void {
  if (root) root.dataset.theme = resolved
}
