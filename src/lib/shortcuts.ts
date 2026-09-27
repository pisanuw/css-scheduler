/**
 * The board's keyboard shortcuts, as data.
 *
 * ⌘Z was the only one, and it was a `useEffect` in `Board.tsx` with a
 * fourteen-entry dependency array, a hand-written modifier test, and no way for
 * anybody to find out it existed. Two problems, and only one of them is about
 * keyboards: an accelerator nobody is told about is work done for the person who
 * already knew.
 *
 * So the list lives here, and the help sheet is rendered from this same list
 * rather than from a hand-kept copy of it. A shortcut cannot be added without
 * appearing in the help, and the help cannot claim a key that does nothing.
 *
 * `activeShortcuts` is the interesting part, and it is why this is a pure
 * function over a small state object rather than a static table: which keys
 * should work depends on what is on screen. A locked scenario has no Add
 * section. A quarter with nothing unstaffed has no Fill. And while a sheet is
 * open, *none* of them should fire — the coordinator is in a modal, and `n`
 * quietly opening the section editor behind an import they were reading would be
 * inexplicable.
 */

/** What a shortcut asks the board to do. Matched in `Board.tsx`. */
export type ShortcutAction =
  | 'help'
  | 'undo'
  | 'add-section'
  | 'import'
  | 'fill-gaps'
  | 'quarter-1'
  | 'quarter-2'
  | 'quarter-3'
  | 'quarter-4'

export interface Shortcut {
  action: ShortcutAction
  /** `KeyboardEvent.key`, lowercased. */
  key: string
  /** Needs ⌘ on an Apple keyboard, Ctrl everywhere else. */
  mod?: boolean
  /** The line in the help sheet. */
  label: string
  /** Which group it appears under there. */
  group: 'Editing' | 'Moving around' | 'Help'
}

/**
 * Every shortcut the board has, in the order the help sheet lists them.
 *
 * Single letters rather than chords. A chord (`g` then `b`) buys a bigger
 * namespace than nine actions need, and costs a mode: a coordinator who presses
 * `g` and then goes to answer the door comes back to a board that is waiting for
 * the second key and will not respond to the first thing they try.
 */
export const SHORTCUTS: readonly Shortcut[] = [
  { action: 'undo', key: 'z', mod: true, label: 'Undo my last change', group: 'Editing' },
  { action: 'add-section', key: 'n', label: 'Add a section', group: 'Editing' },
  { action: 'import', key: 'i', label: 'Import a quarter from a time schedule', group: 'Editing' },
  { action: 'fill-gaps', key: 'f', label: 'Suggest instructors for the unstaffed sections', group: 'Editing' },
  { action: 'quarter-1', key: '1', label: 'Go to the first quarter', group: 'Moving around' },
  { action: 'quarter-2', key: '2', label: 'Go to the second quarter', group: 'Moving around' },
  { action: 'quarter-3', key: '3', label: 'Go to the third quarter', group: 'Moving around' },
  { action: 'quarter-4', key: '4', label: 'Go to the fourth quarter', group: 'Moving around' },
  { action: 'help', key: '?', label: 'Show this list', group: 'Help' },
]

export interface BoardShortcutState {
  /** A locked scenario can be read and not changed. */
  locked: boolean
  /** The editor, assign, suggest or import sheet is open. */
  sheetOpen: boolean
  /** The help sheet is open. It is the one sheet its own key still works over. */
  helpOpen: boolean
  /** An undo already in flight. A second ⌘Z would reverse something else. */
  undoPending: boolean
  /** Sections in the scenario with nobody on them. */
  unstaffedCount: number
  /** How many quarters this year has, so `4` does nothing in a three-term year. */
  quarterCount: number
}

/**
 * Which shortcuts do something right now.
 *
 * The help sheet renders every shortcut and greys out the ones missing from
 * this list, which is the point of computing it rather than testing the
 * conditions at the point of dispatch: a key that is listed and does nothing,
 * with no indication of why, is worse than one that is not listed.
 */
export function activeShortcuts(state: BoardShortcutState): Shortcut[] {
  /*
   * A modal owns the keyboard. Escape closes it — `Dialog` does that for every
   * sheet in the app — and nothing else here should reach past it.
   */
  if (state.sheetOpen) return []

  // Over the help, its own key is what closes it again.
  if (state.helpOpen) return SHORTCUTS.filter((s) => s.action === 'help')

  return SHORTCUTS.filter((s) => {
    switch (s.action) {
      case 'help':
        return true
      case 'undo':
        return !state.locked && !state.undoPending
      case 'add-section':
      case 'import':
        return !state.locked
      case 'fill-gaps':
        return !state.locked && state.unstaffedCount > 0
      case 'quarter-1':
        return state.quarterCount >= 1
      case 'quarter-2':
        return state.quarterCount >= 2
      case 'quarter-3':
        return state.quarterCount >= 3
      case 'quarter-4':
        return state.quarterCount >= 4
    }
  })
}

/** The parts of a keyboard event that decide a match. */
export interface KeyPress {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}

/**
 * The shortcut a key press means, or null.
 *
 * Two rules worth stating because neither is obvious:
 *
 * *Shift is allowed on an unmodified shortcut, and Alt is not.* `?` is Shift and
 * `/` on most layouts, so a rule of "no modifiers" would make the help key
 * unpressable. Alt is excluded because on several layouts it composes a
 * different character entirely, and the coordinator meant that character.
 *
 * *Shift is forbidden on a `mod` shortcut.* ⇧⌘Z is redo, near-universally. It
 * must not reach undo, which is what it would do if `mod` only tested for ⌘.
 */
export function matchShortcut(available: readonly Shortcut[], press: KeyPress): Shortcut | null {
  const key = press.key.length === 1 ? press.key.toLowerCase() : press.key
  const mod = Boolean(press.metaKey || press.ctrlKey)

  for (const shortcut of available) {
    if (shortcut.key !== key) continue
    if (press.altKey) continue
    if (shortcut.mod) {
      if (!mod || press.shiftKey) continue
    } else if (mod) {
      continue
    }
    return shortcut
  }
  return null
}

/** The smallest bit of an element this module needs. */
export interface ClosestLike {
  closest(selector: string): unknown
}

/**
 * Whether the key press belongs to something being typed into.
 *
 * A shortcut that steals a keystroke from a field is not a shortcut, it is a
 * bug — and the field it would steal from most often here is the import sheet's
 * textarea, which takes a paste of a whole quarter's schedule. `select` is in
 * the list because typing a letter in one jumps to the matching option, which
 * is how the scenario picker is used with a keyboard.
 */
export function isTypingTarget(target: ClosestLike | null | undefined): boolean {
  if (!target || typeof target.closest !== 'function') return false
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

/**
 * The key as it should be printed.
 *
 * Apple keyboards say ⌘ and everyone reads it; a Mac user shown `Ctrl+Z` will
 * try Ctrl and find nothing, because the browser reports ⌘ as `metaKey` there
 * and this app treats either as the modifier.
 */
export function keyCap(shortcut: Shortcut, isApple: boolean): string {
  const name = shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key
  if (!shortcut.mod) return name
  return isApple ? `⌘${name}` : `Ctrl+${name}`
}

/** Whether to print ⌘ or Ctrl, from whatever the browser will say about itself. */
export function looksApple(platform: string | undefined, userAgent: string | undefined): boolean {
  /*
   * `navigator.platform` is deprecated and still the most reliable of the two,
   * so it is preferred and the user agent is the fallback. iPadOS reports
   * "MacIntel", which is correct for this purpose: an iPad with a keyboard has
   * a ⌘ key.
   */
  const haystack = `${platform ?? ''} ${userAgent ?? ''}`
  return /mac|iphone|ipad|ipod/i.test(haystack)
}

/** The shortcuts grouped for the help sheet, empty groups dropped. */
export function shortcutGroups(
  active: readonly Shortcut[],
): { group: Shortcut['group']; items: { shortcut: Shortcut; available: boolean }[] }[] {
  const order: Shortcut['group'][] = ['Editing', 'Moving around', 'Help']
  const actives = new Set(active.map((s) => s.action))
  return order
    .map((group) => ({
      group,
      items: SHORTCUTS.filter((s) => s.group === group).map((shortcut) => ({
        shortcut,
        available: actives.has(shortcut.action),
      })),
    }))
    .filter((g) => g.items.length > 0)
}
