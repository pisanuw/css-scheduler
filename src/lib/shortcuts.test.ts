import { describe, expect, it } from 'vitest'
import {
  activeShortcuts,
  isTypingTarget,
  keyCap,
  looksApple,
  matchShortcut,
  SHORTCUTS,
  shortcutGroups,
  type BoardShortcutState,
  type Shortcut,
} from './shortcuts'

const OPEN: BoardShortcutState = {
  locked: false,
  sheetOpen: false,
  helpOpen: false,
  undoPending: false,
  unstaffedCount: 3,
  quarterCount: 3,
}

const state = (over: Partial<BoardShortcutState> = {}): BoardShortcutState => ({ ...OPEN, ...over })
const actions = (s: BoardShortcutState) => activeShortcuts(s).map((x) => x.action)

/** What the board would do for this key press, in this state. */
function press(s: BoardShortcutState, key: string, mods: Partial<Record<'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey', boolean>> = {}) {
  return matchShortcut(activeShortcuts(s), { key, ...mods })?.action ?? null
}

describe('the table itself', () => {
  it('gives every shortcut a distinct key', () => {
    const keys = SHORTCUTS.map((s) => `${s.mod ? 'mod+' : ''}${s.key}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('uses lowercase keys, so matching can lowercase what it is given', () => {
    for (const s of SHORTCUTS) expect(s.key).toBe(s.key.toLowerCase())
  })

  it('gives every shortcut a label, since the help sheet is rendered from this', () => {
    for (const s of SHORTCUTS) expect(s.label.trim().length).toBeGreaterThan(0)
  })
})

describe('activeShortcuts', () => {
  it('offers everything on an unlocked board with gaps', () => {
    expect(actions(state())).toEqual([
      'undo',
      'add-section',
      'import',
      'fill-gaps',
      'quarter-1',
      'quarter-2',
      'quarter-3',
      'help',
    ])
  })

  it('offers nothing at all while a sheet is open', () => {
    // A modal owns the keyboard. `n` opening the section editor behind an import
    // the coordinator is reading would be inexplicable.
    expect(actions(state({ sheetOpen: true }))).toEqual([])
  })

  it('leaves only its own key working over the help', () => {
    expect(actions(state({ helpOpen: true }))).toEqual(['help'])
  })

  it('lets a sheet outrank the help, since a sheet can be open under it', () => {
    expect(actions(state({ helpOpen: true, sheetOpen: true }))).toEqual([])
  })

  it('takes away everything that writes on a locked scenario, and nothing else', () => {
    expect(actions(state({ locked: true }))).toEqual([
      'quarter-1',
      'quarter-2',
      'quarter-3',
      'help',
    ])
  })

  it('drops Fill when there is nothing unstaffed', () => {
    expect(actions(state({ unstaffedCount: 0 }))).not.toContain('fill-gaps')
    expect(actions(state({ unstaffedCount: 1 }))).toContain('fill-gaps')
  })

  it('drops an undo that is already running', () => {
    // A second ⌘Z before the first came back would reverse the change behind it.
    expect(actions(state({ undoPending: true }))).not.toContain('undo')
  })

  it('only offers quarters that exist', () => {
    expect(actions(state({ quarterCount: 3 }))).not.toContain('quarter-4')
    expect(actions(state({ quarterCount: 4 }))).toContain('quarter-4')
    expect(actions(state({ quarterCount: 0 }))).toEqual(['undo', 'add-section', 'import', 'fill-gaps', 'help'])
  })

  it('always offers the help, even locked, even with nothing to do', () => {
    expect(actions(state({ locked: true, unstaffedCount: 0, quarterCount: 0 }))).toEqual(['help'])
  })
})

describe('matchShortcut', () => {
  it('matches a plain letter', () => {
    expect(press(state(), 'n')).toBe('add-section')
  })

  it('matches whatever case the keyboard reports', () => {
    expect(press(state(), 'N', { shiftKey: true })).toBe('add-section')
  })

  it('will not fire a plain letter with the modifier held', () => {
    // ⌘N is a new browser window and Ctrl+I is a devtools binding. Neither is
    // ours to take.
    expect(press(state(), 'n', { metaKey: true })).toBeNull()
    expect(press(state(), 'i', { ctrlKey: true })).toBeNull()
  })

  it('matches the modifier shortcut on either modifier', () => {
    expect(press(state(), 'z', { metaKey: true })).toBe('undo')
    expect(press(state(), 'z', { ctrlKey: true })).toBe('undo')
  })

  it('leaves redo alone', () => {
    // Shift+⌘Z is redo almost everywhere. Reaching undo with it would be the
    // opposite of what was asked for.
    expect(press(state(), 'z', { metaKey: true, shiftKey: true })).toBeNull()
  })

  it('will not fire the modifier shortcut without the modifier', () => {
    expect(press(state(), 'z')).toBeNull()
  })

  it('ignores anything with Alt held', () => {
    // On several layouts Alt composes a different character, and that character
    // is what was meant.
    expect(press(state(), 'n', { altKey: true })).toBeNull()
    expect(press(state(), 'z', { metaKey: true, altKey: true })).toBeNull()
  })

  it('takes Shift on the help key, which is how it is typed', () => {
    // `?` is Shift and `/` on most layouts, so "no modifiers" would make the
    // help unreachable.
    expect(press(state(), '?', { shiftKey: true })).toBe('help')
  })

  it('returns nothing for a key nobody claimed', () => {
    expect(press(state(), 'q')).toBeNull()
    expect(press(state(), 'Enter')).toBeNull()
    expect(press(state(), 'ArrowDown')).toBeNull()
  })

  it('does not fire a shortcut the state has taken away', () => {
    expect(press(state({ locked: true }), 'n')).toBeNull()
    expect(press(state({ unstaffedCount: 0 }), 'f')).toBeNull()
    expect(press(state({ sheetOpen: true }), 'z', { metaKey: true })).toBeNull()
  })

  it('leaves multi-character keys alone rather than lowercasing them', () => {
    // 'Escape'.toLowerCase() is 'escape', which would match nothing and, worse,
    // would match a hypothetical future entry by accident.
    expect(matchShortcut([{ action: 'help', key: 'Escape', label: 'x', group: 'Help' } as unknown as Shortcut], { key: 'Escape' })).not.toBeNull()
  })
})

describe('isTypingTarget', () => {
  /** Stands in for an element, answering whichever selectors it is told to. */
  const el = (matches: string[]): { closest: (s: string) => unknown } => ({
    closest: (selector) => (matches.some((m) => selector.includes(m)) ? {} : null),
  })

  it('recognises the fields a keystroke belongs to', () => {
    expect(isTypingTarget(el(['input']))).toBe(true)
    expect(isTypingTarget(el(['textarea']))).toBe(true)
    expect(isTypingTarget(el(['contenteditable']))).toBe(true)
  })

  it('counts a select, because typing in one jumps to an option', () => {
    expect(isTypingTarget(el(['select']))).toBe(true)
  })

  it('leaves the page itself alone', () => {
    expect(isTypingTarget(el([]))).toBe(false)
  })

  it('copes with nothing, and with something that is not an element', () => {
    expect(isTypingTarget(null)).toBe(false)
    expect(isTypingTarget(undefined)).toBe(false)
    expect(isTypingTarget({} as never)).toBe(false)
  })
})

describe('keyCap', () => {
  const find = (key: string) => SHORTCUTS.find((s) => s.key === key)!

  it('prints a letter in upper case', () => {
    expect(keyCap(find('n'), false)).toBe('N')
  })

  it('prints the modifier the way the keyboard in front of you has it', () => {
    expect(keyCap(find('z'), true)).toBe('⌘Z')
    expect(keyCap(find('z'), false)).toBe('Ctrl+Z')
  })

  it('leaves a punctuation key as it is', () => {
    expect(keyCap(find('?'), true)).toBe('?')
  })
})

describe('looksApple', () => {
  it('recognises a Mac', () => {
    expect(looksApple('MacIntel', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(true)
  })

  it('recognises an iPad, which reports MacIntel and does have a ⌘ key', () => {
    expect(looksApple('MacIntel', 'Mozilla/5.0 (Macintosh)')).toBe(true)
    expect(looksApple('iPad', undefined)).toBe(true)
  })

  it('says no to everything else', () => {
    expect(looksApple('Win32', 'Mozilla/5.0 (Windows NT 10.0)')).toBe(false)
    expect(looksApple('Linux x86_64', 'Mozilla/5.0 (X11; Linux x86_64)')).toBe(false)
  })

  it('does not throw when the browser says nothing', () => {
    expect(looksApple(undefined, undefined)).toBe(false)
  })
})

describe('shortcutGroups', () => {
  it('lists every shortcut whatever the state, marking what is available', () => {
    const groups = shortcutGroups(activeShortcuts(state({ locked: true })))
    const flat = groups.flatMap((g) => g.items)
    expect(flat).toHaveLength(SHORTCUTS.length)
    // A locked scenario greys out the writes and keeps the rest.
    const byAction = new Map(flat.map((i) => [i.shortcut.action, i.available]))
    expect(byAction.get('add-section')).toBe(false)
    expect(byAction.get('undo')).toBe(false)
    expect(byAction.get('quarter-1')).toBe(true)
    expect(byAction.get('help')).toBe(true)
  })

  it('keeps the groups in a fixed order', () => {
    expect(shortcutGroups(activeShortcuts(state())).map((g) => g.group)).toEqual([
      'Editing',
      'Moving around',
      'Help',
    ])
  })

  it('shows the whole list even with a sheet open and nothing available', () => {
    const groups = shortcutGroups(activeShortcuts(state({ sheetOpen: true })))
    expect(groups.flatMap((g) => g.items)).toHaveLength(SHORTCUTS.length)
    expect(groups.flatMap((g) => g.items).every((i) => !i.available)).toBe(true)
  })
})
