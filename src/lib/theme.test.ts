import { describe, expect, it } from 'vitest'
import {
  applyTheme,
  isPreference,
  nextPreference,
  PREFERENCES,
  readPreference,
  resolveTheme,
  themeLabel,
  THEME_KEY,
  writePreference,
  type ThemePreference,
} from './theme'

/** A localStorage that behaves, and one that does not. */
function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    has: (k: string) => map.has(k),
  }
}
const hostileStorage = {
  getItem() {
    throw new DOMException('denied')
  },
  setItem() {
    throw new DOMException('denied')
  },
  removeItem() {
    throw new DOMException('denied')
  },
}

describe('resolveTheme', () => {
  it('follows the device only when nothing has been chosen', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('does not let the device overrule a choice', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

describe('nextPreference', () => {
  it('cycles through all three and comes back', () => {
    const seen: ThemePreference[] = []
    let p: ThemePreference = 'system'
    for (let i = 0; i < 3; i++) {
      p = nextPreference(p)
      seen.push(p)
    }
    expect(seen).toEqual(['light', 'dark', 'system'])
    expect(new Set(seen)).toEqual(new Set(PREFERENCES))
  })
})

describe('themeLabel', () => {
  it('says where it is and where a press would take it', () => {
    expect(themeLabel('system', 'dark')).toBe('Theme: following your device (dark). Switch to light.')
    expect(themeLabel('light', 'light')).toBe('Theme: light. Switch to dark.')
    expect(themeLabel('dark', 'dark')).toBe('Theme: dark. Switch to system.')
  })
})

describe('readPreference', () => {
  it('reads a stored choice', () => {
    expect(readPreference(fakeStorage({ [THEME_KEY]: 'dark' }))).toBe('dark')
  })

  it('treats nothing stored, rubbish stored, and no storage at all as system', () => {
    expect(readPreference(fakeStorage())).toBe('system')
    expect(readPreference(fakeStorage({ [THEME_KEY]: 'neon' }))).toBe('system')
    expect(readPreference(null)).toBe('system')
  })

  it('survives a browser that refuses to answer', () => {
    expect(readPreference(hostileStorage)).toBe('system')
  })
})

describe('writePreference', () => {
  it('stores a choice and forgets its way back to system', () => {
    const s = fakeStorage()
    writePreference('dark', s)
    expect(s.getItem(THEME_KEY)).toBe('dark')
    writePreference('system', s)
    expect(s.has(THEME_KEY)).toBe(false)
  })

  it('does not throw where storage is denied', () => {
    expect(() => writePreference('dark', hostileStorage)).not.toThrow()
    expect(() => writePreference('system', null)).not.toThrow()
  })
})

describe('applyTheme', () => {
  it('writes the attribute the stylesheet keys off, and tolerates no root', () => {
    const root = { dataset: {} } as unknown as HTMLElement
    applyTheme(root, 'dark')
    expect(root.dataset.theme).toBe('dark')
    applyTheme(root, 'light')
    expect(root.dataset.theme).toBe('light')
    expect(() => applyTheme(null, 'dark')).not.toThrow()
  })
})

describe('isPreference', () => {
  it('accepts exactly the three', () => {
    expect(PREFERENCES.every(isPreference)).toBe(true)
    for (const bad of ['', 'Dark', null, undefined, 0, {}]) expect(isPreference(bad)).toBe(false)
  })
})
