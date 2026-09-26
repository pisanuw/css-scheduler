import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  LANDING_PATH,
  pathsOf,
  prefetchRoute,
  prefetchRouteQuietly,
  resetPrefetchCache,
  ROUTES,
  routesFor,
  type AppRoute,
} from './routes'

describe('the route table', () => {
  it('answers on each path exactly once', () => {
    const all = ROUTES.flatMap(pathsOf)
    expect(new Set(all).size).toBe(all.length)
  })

  it('labels each destination distinctly', () => {
    const labels = ROUTES.map((r) => r.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('writes every path absolutely', () => {
    for (const p of ROUTES.flatMap(pathsOf)) expect(p.startsWith('/')).toBe(true)
  })

  it('puts the primary path first, which is where the nav points', () => {
    for (const r of ROUTES) expect(pathsOf(r)[0]).toBe(r.path)
  })

  it('preloads the landing page and nothing else', () => {
    const preloaded = ROUTES.filter((r) => r.preload)
    expect(preloaded.map((r) => r.path)).toEqual([LANDING_PATH])
  })

  it('has a route for the path everything falls back to', () => {
    expect(ROUTES.some((r) => r.path === LANDING_PATH)).toBe(true)
  })

  /*
   * The landing page is the one every reader reaches, so it must not be
   * behind the coordinator check — that would bounce an instructor between
   * the fallback and a route they cannot have.
   */
  it('lets everyone reach the landing page', () => {
    const landing = ROUTES.find((r) => r.path === LANDING_PATH)!
    expect(landing.coordinatorOnly).toBeFalsy()
  })
})

describe('routesFor', () => {
  it('gives a coordinator everything', () => {
    expect(routesFor(true)).toEqual(ROUTES)
  })

  it('withholds every coordinator-only page from everyone else', () => {
    const paths = routesFor(false).map((r) => r.path)
    for (const r of ROUTES) {
      expect(paths.includes(r.path)).toBe(!r.coordinatorOnly)
    }
  })

  it('keeps nav order, so the menu does not reshuffle by role', () => {
    const forAll = routesFor(false).map((r) => r.path)
    const filtered = routesFor(true)
      .filter((r) => !r.coordinatorOnly)
      .map((r) => r.path)
    expect(forAll).toEqual(filtered)
  })

  // The board and the report are the two pages that carry real scheduling
  // data, and both are the coordinator's alone.
  it('guards the pages that show a whole department at once', () => {
    const guarded = ROUTES.filter((r) => r.coordinatorOnly).map((r) => r.path)
    expect(guarded).toEqual(
      expect.arrayContaining(['/board', '/report', '/compare', '/scenarios', '/responses', '/access']),
    )
  })
})

/**
 * The check that actually catches the mistake this table exists to prevent:
 * a page added under `src/pages` and never wired up. It reads the loader's
 * source rather than calling it, so no page is imported and no Supabase
 * client is constructed.
 */
describe('coverage of src/pages', () => {
  // Vite rewrites `import('../pages/Board')` to an absolute specifier before
  // this ever runs, so match the page name rather than the path as written.
  const pageOf = (r: AppRoute) => /pages\/([A-Za-z]+)(?:\.tsx)?['"]/.exec(r.load.toString())?.[1]

  it('can read a page name out of every loader', () => {
    for (const r of ROUTES) expect(pageOf(r), `no page name in ${r.path}'s loader`).toBeTruthy()
  })

  it('routes every page on disk', () => {
    const onDisk = readdirSync(join(import.meta.dirname, '..', 'pages'))
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => f.replace(/\.tsx$/, ''))
      .filter((n) => n !== 'Login') // The signed-out shell, not a destination.
      .sort()
    expect(ROUTES.map((r) => pageOf(r)!).sort()).toEqual(onDisk)
  })
})

describe('prefetchRoute', () => {
  beforeEach(resetPrefetchCache)

  const route = (load: AppRoute['load']): AppRoute => ({ path: '/x', label: 'X', load })

  it('fetches a chunk once however many times it is nudged', async () => {
    let calls = 0
    const r = route(async () => {
      calls++
      return { default: (() => null) as never }
    })
    await Promise.all([prefetchRoute(r), prefetchRoute(r), prefetchRoute(r)])
    expect(calls).toBe(1)
  })

  /*
   * The one that matters on a phone: a prefetch that fails in a tunnel must
   * not be the answer forever. If the rejection stuck, `React.lazy` would
   * later read the same poisoned promise and the page would be permanently
   * unreachable without a reload.
   */
  it('forgets a failure so the next attempt is a real one', async () => {
    let calls = 0
    const r = route(async () => {
      calls++
      if (calls === 1) throw new Error('Failed to fetch dynamically imported module')
      return { default: (() => null) as never }
    })
    await expect(prefetchRoute(r)).rejects.toThrow()
    await expect(prefetchRoute(r)).resolves.toBeTruthy()
    expect(calls).toBe(2)
  })

  it('remembers a success', async () => {
    let calls = 0
    const r = route(async () => {
      calls++
      return { default: (() => null) as never }
    })
    await prefetchRoute(r)
    await prefetchRoute(r)
    expect(calls).toBe(1)
  })

  it('keeps each route separate', async () => {
    const seen: string[] = []
    const mk = (path: string): AppRoute => ({
      path,
      label: path,
      load: async () => {
        seen.push(path)
        return { default: (() => null) as never }
      },
    })
    await Promise.all([prefetchRoute(mk('/a')), prefetchRoute(mk('/b'))])
    expect(seen.sort()).toEqual(['/a', '/b'])
  })

  it('swallows a failure when the caller only guessed', async () => {
    const r = route(async () => {
      throw new Error('nope')
    })
    expect(() => prefetchRouteQuietly(r)).not.toThrow()
    // Let the rejection settle; an unhandled one would fail the run.
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
})
