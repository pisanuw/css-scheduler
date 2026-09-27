import { useEffect, useMemo, useRef } from 'react'
import {
  activeShortcuts,
  isTypingTarget,
  looksApple,
  matchShortcut,
  type BoardShortcutState,
  type ShortcutAction,
} from '../lib/shortcuts'

/**
 * Binds the board's shortcuts to the window.
 *
 * The state and the callback are held in refs so the listener is attached once,
 * on mount, and never again. The version of this that lived in `Board.tsx`
 * listed fourteen values in its dependency array and so tore down and rebuilt a
 * `keydown` listener on every assignment, every conflict recount and every
 * keystroke in the import sheet. It worked, and it was a listener being
 * replaced dozens of times a minute to answer one key.
 *
 * What the ref buys is the guarantee that the state read at key-press time is
 * the state as it is at key-press time — not the state as it was when the
 * listener was attached, which is the classic way a shortcut ends up acting on a
 * scenario the coordinator has already navigated away from.
 */
export function useShortcuts(state: BoardShortcutState, onAction: (action: ShortcutAction) => void): void {
  const latest = useRef({ state, onAction })

  /*
   * In an effect, not in the render body — which is what this was, and what the
   * comment above it called deliberate.
   *
   * It is not safe. `latest.current = …` during render mutates the ref even on a
   * render React then throws away: a concurrent re-render it abandons, or
   * StrictMode's second pass. The listener would then be reading state from a
   * render that never committed. `react-hooks/refs` is off in `eslint.config.js`
   * because of ten false positives in `LoadPanel`, and this eleventh finding was
   * the real one.
   *
   * No dependency array, so it runs after every commit. The window between a
   * commit and this effect is not one a key press can land in — effects flush
   * before the browser processes the next input event — and
   * `npm run check:keys` presses real keys to confirm it.
   */
  useEffect(() => {
    latest.current = { state, onAction }
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // A shortcut that steals a keystroke from a field is not a shortcut.
      if (isTypingTarget(event.target as unknown as { closest(s: string): unknown } | null)) return

      const { state: now, onAction: run } = latest.current
      const shortcut = matchShortcut(activeShortcuts(now), event)
      if (!shortcut) return

      /*
       * Only once a shortcut has actually matched. Calling this on every key
       * press would swallow the browser's own bindings — including ⌘R, which is
       * how anybody gets out of a page that has gone wrong.
       */
      event.preventDefault()
      run(shortcut.action)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

/**
 * Whether to print ⌘ or Ctrl. Read once: a keyboard does not change under
 * somebody mid-session, and reading `navigator` during render is the kind of
 * thing that differs between a server render and a client one.
 */
export function useIsApple(): boolean {
  return useMemo(() => {
    if (typeof navigator === 'undefined') return false
    return looksApple(
      // Deprecated, and still the more reliable of the two.
      (navigator as Navigator & { platform?: string }).platform,
      navigator.userAgent,
    )
  }, [])
}
