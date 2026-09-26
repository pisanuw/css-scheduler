#!/usr/bin/env node
/**
 * The PWA check: the real build, in a real browser, installed and then cut off
 * from the network.
 *
 *   npm run check:pwa
 *
 * A service worker is the one piece of this app that keeps running after it is
 * wrong. It can answer requests from a cache the coordinator cannot clear, and
 * it can decide never to update itself — and both failures look exactly like a
 * working app from a developer's machine, where the network is always there
 * and every reload is a fresh install. The unit tests cover the decisions;
 * this covers the thing the decisions are for.
 *
 * What it asserts:
 *
 *   - the manifest is one a phone will actually install: required fields,
 *     a 192 and a 512 PNG that really are those sizes, and a maskable icon
 *     that is a separate file from the one drawn to fill its square;
 *   - the worker registers, activates, and takes over the page it installed on;
 *   - what it cached is this origin's own shell and nothing else — in
 *     particular, not one byte of anybody's Supabase data;
 *   - with the network gone, a reload still renders the app, and so does a
 *     deep link the coordinator has never opened;
 *   - with the network gone, a request to Supabase *fails* rather than being
 *     answered from a cache;
 *   - a new version on the server is noticed, offered rather than forced, and
 *     applied — with the previous build's cache deleted — when the offer is
 *     taken.
 *
 * The last one is the reason this script exists. An app that installs and goes
 * offline but cannot update itself is worse than one that was never
 * installable: every future fix is invisible to the person using it.
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { loadPlaywright } from './playwright.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const DIST = join(ROOT, process.env.PWA_CHECK_DIST ?? 'dist')
const VIEWPORT = { width: 375, height: 812 } // The coordinator's phone, as ever.
const SUPABASE = 'https://abvnaelzfriusckqqrfc.supabase.co'
/** A cache with our prefix that no build ever made: activation must remove it. */
const STALE_CACHE = 'css-scheduler-pwacheck-stale'

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

/**
 * Netlify's SPA fallback, plus two levers.
 *
 * `overrides` lets the test serve a different `sw.js` mid-run, which is what a
 * deploy looks like from inside an open tab.
 *
 * `network.up = false` drops every connection, which is how this script takes
 * the network away — and it has to be done here rather than with Playwright's
 * `context.setOffline`, which does not apply to a service worker's own
 * fetches. That cost an hour and nearly shipped a hollow check: with the shell
 * deliberately removed from the precache list, the offline assertions still
 * passed, because the "offline" worker was quietly fetching the page from the
 * server the whole time.
 */
async function serve(dir, overrides, network) {
  const server = createServer(async (req, res) => {
    if (!network.up) return req.socket.destroy()
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    const override = overrides.get(path)
    if (override !== undefined) {
      res.writeHead(200, {
        'content-type': MIME[extname(path)] ?? 'application/octet-stream',
        'cache-control': 'no-cache',
      })
      return res.end(override)
    }
    let file = join(dir, path)
    if (!existsSync(file) || path === '/') file = join(dir, 'index.html')
    try {
      const body = await readFile(file)
      res.writeHead(200, {
        'content-type': MIME[extname(file)] ?? 'application/octet-stream',
        /*
         * The document is never kept by the browser's own HTTP cache.
         *
         * Without this the offline assertions below pass for the wrong reason:
         * Chromium will happily answer a disconnected reload from its own
         * cache, so a worker that precached nothing at all still looks like it
         * works. Measured, not assumed — dropping the shell from the precache
         * list left the offline reload passing until this header was added.
         * Netlify sends `max-age=0, must-revalidate` for HTML, which is the
         * same intent; this is the strict form, so the check cannot be fooled.
         */
        ...(extname(file) === '.html' ? { 'cache-control': 'no-store' } : {}),
      })
      res.end(body)
    } catch {
      res.writeHead(404).end('not found')
    }
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return { server, base: `http://127.0.0.1:${server.address().port}` }
}

/** A PNG's real dimensions, read from its own IHDR rather than its filename. */
function pngSize(bytes) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (signature.some((b, i) => bytes[i] !== b)) return null
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

const { chromium } = loadPlaywright('PWA check')
if (!existsSync(DIST)) {
  console.error(`${DIST} is missing. Run \`npm run check:pwa\`, which builds it first.`)
  process.exit(2)
}

const overrides = new Map()
const network = { up: true }
const { server, base } = await serve(DIST, overrides, network)
const browser = await chromium.launch()
const problems = []
const fail = (what) => problems.push(what)

// ── 1. A manifest a phone will install ───────────────────────────────────────
{
  const manifest = JSON.parse(await readFile(join(DIST, 'manifest.webmanifest'), 'utf8'))
  const html = await readFile(join(DIST, 'index.html'), 'utf8')

  for (const field of ['name', 'short_name', 'start_url', 'scope', 'theme_color', 'background_color'])
    if (!manifest[field]) fail(`manifest has no ${field}`)
  if (manifest.display !== 'standalone')
    fail(`manifest display is "${manifest.display}", so it opens in a browser tab`)
  if (!/<link[^>]+rel="manifest"/.test(html)) fail('index.html does not link the manifest')
  if (!/<link[^>]+rel="apple-touch-icon"/.test(html))
    fail('index.html has no apple-touch-icon, so an iPhone installs a screenshot')
  if (!/<meta[^>]+name="theme-color"/.test(html)) fail('index.html has no theme-color')

  const icons = manifest.icons ?? []
  const pngs = icons.filter((i) => i.type === 'image/png')
  for (const size of [192, 512]) {
    if (!pngs.some((i) => i.sizes === `${size}x${size}`))
      fail(`manifest has no ${size}px PNG, which Chrome requires to offer an install`)
  }
  const maskable = icons.filter((i) => (i.purpose ?? '').split(' ').includes('maskable'))
  if (maskable.length === 0) fail('manifest has no maskable icon: Android will crop the corners off')
  for (const icon of maskable) {
    if ((icon.purpose ?? '').split(' ').includes('any'))
      fail(`${icon.src} is declared both any and maskable, so one of the two is wrong`)
  }

  for (const icon of icons) {
    const file = join(DIST, icon.src.replace(/^\//, ''))
    if (!existsSync(file)) {
      fail(`${icon.src} is in the manifest but not in the build`)
      continue
    }
    if (icon.type !== 'image/png') continue
    const size = pngSize(await readFile(file))
    if (!size) fail(`${icon.src} is not a PNG`)
    else if (`${size.width}x${size.height}` !== icon.sizes)
      fail(`${icon.src} says ${icon.sizes} and is ${size.width}x${size.height}`)
  }
  const apple = join(DIST, 'icons', 'apple-touch-icon.png')
  if (!existsSync(apple)) fail('the apple-touch-icon is not in the build')
  console.log(`✓ manifest — ${icons.length} icons, ${maskable.length} maskable, all the right sizes`)
}

// ── 2. It installs, activates, and takes over the page ───────────────────────
const context = await browser.newContext({ viewport: VIEWPORT })
const page = await context.newPage()
const noise = []
/*
 * This script disconnects the network on purpose, and a browser says so on the
 * console every time something cannot be fetched. That is the check working,
 * not the app misbehaving — and it is the only message excused here.
 */
const EXPECTED = /ERR_INTERNET_DISCONNECTED|Failed to fetch/
page.on('console', (m) => {
  if ((m.type() === 'error' || m.type() === 'warning') && !EXPECTED.test(m.text()))
    noise.push(`${m.type()}: ${m.text()}`)
})
page.on('pageerror', (e) => noise.push(`pageerror: ${e.message}`))

await page.goto(`${base}/`, { waitUntil: 'load' })
await page.evaluate(() => navigator.serviceWorker.ready)
try {
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 5000 })
  console.log('✓ registered — the worker activated and claimed the page that installed it')
} catch {
  fail('the worker never took control of the page it installed on (no clients.claim?)')
}

// ── 3. What it kept, and what it did not ─────────────────────────────────────
{
  const cached = await page.evaluate(async () => {
    const names = await caches.keys()
    const entries = []
    for (const name of names) {
      const keys = await (await caches.open(name)).keys()
      entries.push(...keys.map((r) => r.url))
    }
    return { names, entries }
  })
  if (cached.names.length !== 1)
    fail(`expected one cache, found ${cached.names.length}: ${cached.names.join(', ')}`)
  if (!cached.names.every((n) => /^css-scheduler-[0-9a-f]{12}$/.test(n)))
    fail(`a cache is not named after a build: ${cached.names.join(', ')}`)
  if (!cached.entries.some((u) => u.endsWith('/index.html')))
    fail('the shell is not cached, so there is nothing to show when the network goes')
  const foreign = cached.entries.filter((u) => !u.startsWith(base))
  if (foreign.length) fail(`cached something from another origin: ${foreign.slice(0, 3).join(', ')}`)
  /*
   * The project's own host, not the string "supabase": the app's vendor chunk
   * is called `supabase-<hash>.js` and is exactly the kind of file that
   * *should* be cached. The first version of this assertion failed on it.
   */
  if (cached.entries.some((u) => u.includes('.supabase.co')))
    fail("cached a Supabase response, which is somebody's data behind row-level security")
  console.log(`✓ cache — one build, ${cached.entries.length} files, all from this origin`)
}

// ── 4. With the network gone ─────────────────────────────────────────────────
{
  const before = problems.length
  network.up = false
  await context.setOffline(true)

  /**
   * A navigation with the plug pulled. A failure here is the check's answer,
   * not an exception: "the browser could not open the app at all" is the exact
   * thing being tested for, and it deserves a line in the list rather than a
   * stack trace.
   */
  const offlineBody = async (what, navigate) => {
    try {
      await navigate()
      return await page.locator('body').innerText()
    } catch (err) {
      fail(`${what} with no network: ${String(err).split('\n')[0]}`)
      return ''
    }
  }

  const text = await offlineBody('reloading', () => page.reload({ waitUntil: 'load' }))
  if (text && !/sign in/i.test(text)) fail(`an offline reload rendered "${text.trim().slice(0, 80)}"`)

  // A deep link, which is most of how this app is opened from a phone.
  const deep = await offlineBody('a deep link to /board', () =>
    page.goto(`${base}/board`, { waitUntil: 'load' }),
  )
  if (deep && !/sign in/i.test(deep)) fail(`an offline deep link rendered "${deep.trim().slice(0, 80)}"`)

  // And the database is not quietly answered from a cache.
  let supabase = 'unasked'
  try {
    supabase = await page.evaluate(async (url) => {
      try {
        await fetch(`${url}/rest/v1/assignments?select=*`)
        return 'answered'
      } catch {
        return 'failed'
      }
    }, SUPABASE)
  } catch (err) {
    // The page is not in a state to be asked — which only happens when a
    // navigation above already failed and said so.
    if (!problems.length) fail(`could not ask the offline page about Supabase: ${err}`)
  }
  if (supabase === 'answered') fail('an offline request to Supabase was answered from somewhere')
  if (problems.length === before)
    console.log('✓ offline — the app still renders, the database still does not')
  await context.setOffline(false)
  network.up = true
}

// ── 5. A new version is noticed, offered, and applied when taken ─────────────
{
  // A deploy, as an open tab experiences it: the same URL, different bytes.
  const sw = await readFile(join(DIST, 'sw.js'), 'utf8')
  overrides.set('/sw.js', `${sw}\n// a new deploy\n`)

  await page.goto(`${base}/`, { waitUntil: 'load' })
  await page.evaluate((name) => caches.open(name), STALE_CACHE)
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    await registration.update()
  })

  const reload = page.getByRole('button', { name: 'Reload' })
  try {
    await reload.waitFor({ state: 'visible', timeout: 10000 })
  } catch {
    fail('a new version installed and the app never offered to reload into it')
  }

  if (await reload.isVisible()) {
    const message = await page.locator('[role="status"]').innerText()
    if (!/new version/i.test(message)) fail(`the offer reads "${message.trim().slice(0, 60)}"`)

    // Nothing may move until the offer is taken: a worker that swaps itself in
    // under an open board is how a tab ends up asking for a chunk that the
    // build it is now talking to has never heard of.
    const waitingBefore = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready
      return Boolean(registration.waiting)
    })
    if (!waitingBefore) fail('the new worker did not wait for the offer to be accepted')

    await page.evaluate(() => {
      window.__beforeReload = true
    })
    await reload.click()
    try {
      await page.waitForFunction(() => window.__beforeReload === undefined, null, { timeout: 10000 })
      console.log('✓ update — offered, waited, and applied on the tap')
    } catch {
      fail('taking the offer did not reload the page')
    }

    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 5000 })
    const names = await page.evaluate(() => caches.keys())
    if (names.includes(STALE_CACHE))
      fail(`${STALE_CACHE} survived the new worker's activation: old builds are never cleaned up`)
    else console.log('✓ cleanup — the caches of builds that are gone went with them')
  }
  overrides.delete('/sw.js')
}

for (const n of noise) fail(`console ${n}`)

await context.close()
await browser.close()
server.close()

if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}:`)
  for (const p of problems) console.error(`  ✗ ${p}`)
  process.exit(1)
}
console.log('\nInstallable, offline-capable, and able to replace itself.')
