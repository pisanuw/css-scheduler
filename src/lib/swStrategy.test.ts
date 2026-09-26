import { describe, expect, it } from 'vitest'
import {
  CACHE_PREFIX,
  cacheNameFor,
  isCacheable,
  isHashedAsset,
  planFor,
  SHELL_PATH,
  staleCaches,
} from './swStrategy'

const ORIGIN = 'https://uwb-css-scheduler.netlify.app'
const get = (url: string, extra: { mode?: string; destination?: string } = {}) =>
  planFor({ method: 'GET', url, ...extra }, ORIGIN)

describe('planFor', () => {
  it('never touches anything that leaves this origin', () => {
    // The whole database, including every row RLS decides per caller.
    expect(get('https://abvnaelzfriusckqqrfc.supabase.co/rest/v1/assignments?select=*')).toBe(
      'passthrough',
    )
    expect(get('https://abvnaelzfriusckqqrfc.supabase.co/auth/v1/user')).toBe('passthrough')
    // Not even something that looks exactly like one of our own assets.
    expect(get('https://elsewhere.example/assets/index-A1b2C3d4.js')).toBe('passthrough')
  })

  it('never touches anything that is not a plain GET', () => {
    expect(planFor({ method: 'POST', url: `${ORIGIN}/assets/index-A1b2C3d4.js` }, ORIGIN)).toBe(
      'passthrough',
    )
    expect(planFor({ method: 'HEAD', url: `${ORIGIN}/` }, ORIGIN)).toBe('passthrough')
  })

  it('treats a lowercase method the same way', () => {
    expect(planFor({ method: 'post', url: `${ORIGIN}/x` }, ORIGIN)).toBe('passthrough')
  })

  it('answers a navigation with the shell, however the browser describes it', () => {
    expect(get(`${ORIGIN}/`, { mode: 'navigate' })).toBe('shell')
    expect(get(`${ORIGIN}/board`, { mode: 'navigate' })).toBe('shell')
    expect(get(`${ORIGIN}/report?year=2026`, { destination: 'document' })).toBe('shell')
  })

  it('answers a hashed asset from the cache', () => {
    expect(get(`${ORIGIN}/assets/Board-CClyXLBj.js`)).toBe('asset')
    expect(get(`${ORIGIN}/assets/index-IsYixiBw.css`)).toBe('asset')
  })

  it('leaves the manifest, the icons and the worker itself to the network', () => {
    expect(get(`${ORIGIN}/manifest.webmanifest`)).toBe('passthrough')
    expect(get(`${ORIGIN}/icons/icon-192.png`)).toBe('passthrough')
    expect(get(`${ORIGIN}/sw.js`)).toBe('passthrough')
  })

  it('passes through a url it cannot parse rather than guessing', () => {
    expect(get('not a url at all')).toBe('passthrough')
  })
})

describe('isHashedAsset', () => {
  it('recognises a name that contains its own content hash', () => {
    expect(isHashedAsset('/assets/react-MirHhN1U.js')).toBe(true)
    expect(isHashedAsset('/assets/index-IsYixiBw.css')).toBe(true)
    expect(isHashedAsset('/assets/inter-A1b2C3d4e5.woff2')).toBe(true)
    // Vite hashes what it bundles, images included.
    expect(isHashedAsset('/assets/logo-A1b2C3d4.png')).toBe(true)
  })

  it('refuses a name that could mean something different tomorrow', () => {
    expect(isHashedAsset('/assets/Board.js')).toBe(false) // no hash: could be rebuilt
    expect(isHashedAsset('/assets/Board-abc.js')).toBe(false) // too short to be one
    expect(isHashedAsset('/index.html')).toBe(false)
    expect(isHashedAsset('/sw.js')).toBe(false)
    expect(isHashedAsset('/manifest.webmanifest')).toBe(false)
  })
})

describe('cacheNameFor and staleCaches', () => {
  it('names a cache after the build it belongs to', () => {
    expect(cacheNameFor('79bfc6336f74')).toBe(`${CACHE_PREFIX}79bfc6336f74`)
  })

  it('drops our own older caches and nothing else', () => {
    const current = cacheNameFor('bbbb')
    const names = [cacheNameFor('aaaa'), current, 'workbox-precache', 'some-other-app-v2']
    expect(staleCaches(names, current)).toEqual([cacheNameFor('aaaa')])
  })

  it('has nothing to do on a first install', () => {
    const current = cacheNameFor('aaaa')
    expect(staleCaches([current], current)).toEqual([])
    expect(staleCaches([], current)).toEqual([])
  })
})

describe('isCacheable', () => {
  it('keeps a plain 200', () => {
    expect(isCacheable({ ok: true, status: 200, type: 'basic' })).toBe(true)
  })

  it('refuses anything that is not one', () => {
    expect(isCacheable({ ok: false, status: 404 })).toBe(false)
    expect(isCacheable({ ok: false, status: 500 })).toBe(false)
    // `ok` covers 206 too, which is a fragment of a file and not the file.
    expect(isCacheable({ ok: true, status: 206, type: 'basic' })).toBe(false)
  })

  it('refuses an opaque response, which cannot answer a navigation', () => {
    expect(isCacheable({ ok: true, status: 200, type: 'opaque' })).toBe(false)
    expect(isCacheable({ ok: true, status: 200, type: 'opaqueredirect' })).toBe(false)
  })
})

describe('SHELL_PATH', () => {
  it('is the document, not the route', () => {
    // The worker stores one document and matches every navigation against it;
    // '/' would be a second key for the same bytes and a cache miss for the
    // deep links that are most of how this app is opened.
    expect(SHELL_PATH).toBe('/index.html')
  })
})
