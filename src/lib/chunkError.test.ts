import { describe, expect, it } from 'vitest'
import { boundaryMessage, isChunkLoadError, shouldAutoReload } from './chunkError'

/*
 * The real wording, per engine. Getting one of these wrong means a stale
 * deploy shows a coordinator an error instead of quietly reloading, which is
 * exactly the failure the auto-reload exists to prevent — so they are written
 * out rather than paraphrased.
 */
const REAL_MESSAGES = [
  'Failed to fetch dynamically imported module: https://uwb-css-scheduler.netlify.app/assets/Board-DkQ2.js',
  'error loading dynamically imported module: https://uwb-css-scheduler.netlify.app/assets/Report-a1.js',
  "Importing a module script failed.",
  'Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html".',
]

describe('isChunkLoadError', () => {
  it.each(REAL_MESSAGES)('recognises %s', (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true)
  })

  it('recognises the name webpack-era tooling still sets', () => {
    const err = Object.assign(new Error('whatever'), { name: 'ChunkLoadError' })
    expect(isChunkLoadError(err)).toBe(true)
  })

  it('does not care about case', () => {
    expect(isChunkLoadError(new Error('FAILED TO FETCH DYNAMICALLY IMPORTED MODULE'))).toBe(true)
  })

  it('reads a thrown string', () => {
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(true)
  })

  /*
   * The important negative. A genuine bug inside a page — a null dereference
   * while rendering the board — must not be mistaken for a chunk failure, or
   * the app reloads itself and hides it.
   */
  it('leaves a real render bug alone', () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of null (reading 'sections')"))).toBe(false)
  })

  it('is not fooled by a plain network failure', () => {
    // `fetch` rejecting is not a module fetch; a reload will not help.
    expect(isChunkLoadError(new TypeError('Failed to fetch'))).toBe(false)
  })

  it.each([null, undefined, 0, '', {}])('survives %o', (value) => {
    expect(isChunkLoadError(value)).toBe(false)
  })
})

describe('shouldAutoReload', () => {
  const chunkErr = new TypeError('Failed to fetch dynamically imported module: /assets/Board-DkQ2.js')

  it('reloads once for a stale deploy', () => {
    expect(shouldAutoReload(chunkErr, false)).toBe(true)
  })

  /*
   * The loop guard. On a phone with no signal the chunk fails, we reload, the
   * document comes back, the chunk fails again — without this the app spins
   * forever and the coordinator never gets a button to tap.
   */
  it('refuses a second time, because then it is not the deploy', () => {
    expect(shouldAutoReload(chunkErr, true)).toBe(false)
  })

  it('never reloads on a render bug, first time or not', () => {
    const bug = new Error('boom')
    expect(shouldAutoReload(bug, false)).toBe(false)
    expect(shouldAutoReload(bug, true)).toBe(false)
  })
})

describe('boundaryMessage', () => {
  it('blames the update when the chunk is what failed', () => {
    const { title, detail } = boundaryMessage(new Error('Failed to fetch dynamically imported module'))
    expect(title).toMatch(/could not be loaded/i)
    expect(detail).toMatch(/updated|connection/i)
  })

  it('says something different, and true, about a render bug', () => {
    const { title, detail } = boundaryMessage(new Error('boom'))
    expect(title).toMatch(/went wrong/i)
    expect(detail).toMatch(/rest of the app/i)
  })

  it('always offers a way forward', () => {
    for (const err of [new Error('boom'), new Error('Failed to fetch dynamically imported module')]) {
      expect(boundaryMessage(err).detail).toMatch(/reload/i)
    }
  })
})
