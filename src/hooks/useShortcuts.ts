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
  latest.current = { state, onAction }

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
