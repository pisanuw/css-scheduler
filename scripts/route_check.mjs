#!/usr/bin/env node
/**
 * The routing check: the real, built bundle in a real browser, with Supabase
 * replaced by canned answers.
 *
 *   npm run check:routes
 *
 * Splitting the bundle moved page loading from "already in memory" to "a
 * request that can fail", and nothing else here would have noticed. The unit
 * tests read the route table without importing a page; the mobile harness
 * renders components with no router at all; `scripts/e2e_test.py` needs a
 * token from a keychain that a cloud sandbox does not have. So this fills the
 * gap between them, with no credentials: it asserts that
 *
 *   - a signed-out visitor downloads the sign-in page and not the board,
 *   - each destination in the nav renders after its chunk arrives,
 *   - moving between pages loads exactly one new chunk and no more,
 *   - hovering a nav link fetches its chunk before the click,
 *   - an instructor is never served a coordinator page, by nav or by URL,
 *   - the theme is right in the real index.html before React exists, and the
 *     choice survives a reload,
 *   - no page paints a daylight surface in the dark,
 *   - the console stays clean throughout.
 *
 * The session is a fabricated JWT written straight into the storage key
 * supabase-js reads, with an expiry far enough out that the client never
 * tries to refresh it. Nothing here touches the live project: every request
 * to it is intercepted before it leaves the page.
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { loadPlaywright } from './playwright.mjs'

const ROOT = resolve(import.meta.dirname, '..')
/**
 * Which build to drive. `npm run check:routes` points this at its own output
 * so the check never depends on — or disturbs — whatever is in `dist/`.
 */
const DIST = join(ROOT, process.env.ROUTE_CHECK_DIST ?? 'dist')
const VIEWPORT = { width: 375, height: 812 } // The coordinator's phone, as ever.
const PROJECT_REF = 'abvnaelzfriusckqqrfc'


const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

/** A static server with the SPA fallback Netlify gives us, so deep links work. */
async function serve(dir) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    let file = join(dir, path)
    if (!existsSync(file) || path === '/') file = join(dir, 'index.html')
    try {
      const body = await readFile(file)
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404).end('not found')
    }
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return { server, base: `http://127.0.0.1:${server.address().port}` }
}

/** A JWT that is never verified by anything — supabase-js only reads the claims. */
function fakeJwt(sub, email) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, email, exp, role: 'authenticated' })}.not-a-signature`
}

const USERS = {
  coordinator: {
    id: '00000000-0000-4000-8000-00000000c001',
    email: 'routecheck-coordinator@example.invalid',
    full_name: 'Route Check Coordinator',
    role: 'coordinator',
    instructor_id: null,
  },
  instructor: {
    id: '00000000-0000-4000-8000-00000000i001',
    email: 'routecheck-instructor@example.invalid',
    full_name: 'Route Check Instructor',
    role: 'instructor',
    instructor_id: null,
  },
}

/**
 * Every call to the project answers from here. `profiles` is the only shape
 * the app insists on; everything else is a page's own query, and an empty
 * result is a legitimate answer to all of them — an empty board is a state
 * the coordinator can genuinely be in, so rendering one is a fair test.
 */
async function stubSupabase(page, user) {
  await page.route('**/*.supabase.co/**', async (route) => {
    const url = route.request().url()
    const json = (body) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/0' },
        body: JSON.stringify(body),
      })
    if (url.includes('/auth/v1/user')) return json({ id: user.id, email: user.email })
    // `.single()` sends Accept: application/vnd.pgrst.object+json, so the
    // profile comes back as an object. An array here leaves the app
    // permanently signed in as nobody, which is a confusing way to fail.
    if (url.includes('/rest/v1/profiles')) return json(user)
    if (url.includes('/rest/v1/rpc/')) return json(null)
    return json([])
  })
}

async function signIn(page, base, user) {
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    ([ref, session]) => localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session)),
    [
      PROJECT_REF,
      {
        access_token: fakeJwt(user.id, user.email),
        refresh_token: 'route-check-refresh',
        token_type: 'bearer',
        expires_in: 86400,
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        user: { id: user.id, email: user.email, aud: 'authenticated', role: 'authenticated' },
      },
    ],
  )
}

const { chromium } = loadPlaywright('routing check')
if (!existsSync(DIST)) {
  console.error(`${DIST} is missing. Run \`npm run check:routes\`, which builds it first.`)
  process.exit(2)
}

const { server, base } = await serve(DIST)
const browser = await chromium.launch()
const problems = []
const fail = (what) => problems.push(what)

/** Scripts the page pulled in, by their chunk name, ignoring the hash. */
const chunkNames = (urls) =>
  urls
    .filter((u) => u.endsWith('.js'))
    .map((u) => /\/assets\/(.+?)-[A-Za-z0-9_-]+\.js$/.exec(u)?.[1])
    .filter(Boolean)

/*
 * Service workers are blocked throughout this check, in every context it
 * makes.
 *
 * This script's subject is what the *network* is asked for: which chunk a tap
 * fetches, what a signed-out visitor downloads, what an instructor never
 * receives. A service worker precaches the shell and then answers from a cache,
 * which would turn every one of those assertions into a measurement of the
 * cache instead. `scripts/pwa_check.mjs` owns the worker and asserts the
 * opposite things about it.
 */
const NO_WORKER = { viewport: VIEWPORT, serviceWorkers: 'block' }

async function newPage(user) {
  const page = await browser.newPage(NO_WORKER)
  const requested = []
  const noise = []
  page.on('request', (r) => requested.push(r.url()))
  /*
   * The two messages this check causes itself, by blocking the worker above:
   * Playwright announcing the block, and the app saying it could not register.
   * Everything else on the console is a finding.
   */
  const SELF_INFLICTED = /registration blocked by Playwright|\[sw\] registration failed/
  page.on('console', (m) => {
    if ((m.type() === 'error' || m.type() === 'warning') && !SELF_INFLICTED.test(m.text()))
      noise.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => noise.push(`pageerror: ${e.message}`))
  if (user) await stubSupabase(page, user)
  return { page, requested, noise }
}

// ── 1. Signed out: the sign-in page, and none of the app behind it ───────────
{
  const { page, requested, noise } = await newPage(null)
  await page.goto(`${base}/`, { waitUntil: 'networkidle' })
  const text = await page.locator('body').innerText()
  if (!/sign in/i.test(text)) fail(`signed out: no sign-in prompt, page read "${text.slice(0, 80)}"`)

  const loaded = chunkNames(requested)
  const leaked = loaded.filter((n) => ['Board', 'Report', 'Compare', 'Scenarios', 'AccessLog'].includes(n))
  if (leaked.length) fail(`signed out: downloaded ${leaked.join(', ')} to show a sign-in button`)
  /*
   * Vite inlines `import.meta.env.VITE_*` at build time, so a bundle built
   * without them throws before it renders anything and every later assertion
   * times out waiting for an element that will never exist. Say so here
   * instead: it cost a run once to work out from a 30-second timeout.
   */
  if (noise.some((n) => /Missing VITE_SUPABASE/.test(n))) {
    console.error(
      'This build has no VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY baked in, so the app\n' +
        'throws on boot. Run `npm run check:routes`, which builds with placeholders — every\n' +
        'request to the project is intercepted, so their values do not matter.',
    )
    await browser.close()
    server.close()
    process.exit(2)
  }
  for (const n of noise) fail(`signed out: console ${n}`)
  console.log(`✓ signed out — sign-in page on ${loaded.length} chunks: ${loaded.join(', ')}`)
  await page.close()
}

// ── 2. Coordinator: every nav destination renders ────────────────────────────
const DESTINATIONS = [
  ['Dashboard', '/'],
  ['Board', '/board'],
  ['Scenarios', '/scenarios'],
  ['Report', '/report'],
  ['Compare', '/compare'],
  ['My preferences', '/preferences'],
  ['Cycles', '/cycles'],
  ['Responses', '/responses'],
  ['Courses', '/courses'],
  ['Instructors', '/instructors'],
  ['History', '/history'],
  ['Student check', '/student-check'],
  ['Access', '/access'],
]
{
  const { page, requested, noise } = await newPage(USERS.coordinator)
  await signIn(page, base, USERS.coordinator)
  await page.goto(`${base}/`, { waitUntil: 'networkidle' })

  for (const [label, path] of DESTINATIONS) {
    const before = requested.length
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(150)
    /*
     * The assertion that earns this script its keep: a deep link must still be
     * where it was typed. Checking only that *something* rendered passes
     * happily while the router quietly sends a coordinator home, which is
     * exactly the bug this found.
     */
    const landed = new URL(page.url()).pathname
    if (landed !== path) fail(`${path}: redirected to ${landed}`)
    const body = await page.locator('#main').innerText()
    if (!body.trim()) fail(`${path}: rendered nothing`)
    if (/could not be loaded|went wrong/i.test(body)) fail(`${path}: showed the error boundary`)
    if (/Loading the page/i.test(body)) fail(`${path}: still on the skeleton after the network settled`)
    const fresh = chunkNames(requested.slice(before))
    console.log(`✓ ${label.padEnd(15)} ${path.padEnd(16)} ${fresh.join(', ') || '(cached)'}`)
  }
  for (const n of noise) fail(`coordinator: console ${n}`)
  await page.close()
}

// ── 3. One navigation fetches one page's chunk, not the whole app ────────────
{
  const { page, requested } = await newPage(USERS.coordinator)
  await signIn(page, base, USERS.coordinator)
  await page.goto(`${base}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(200)

  const before = requested.length
  // On a phone the nav is a drawer, so this is the real two-tap journey.
  await page.getByRole('button', { name: 'Open menu' }).click()
  await page.getByRole('link', { name: 'Board', exact: true }).first().click()
  await page.waitForTimeout(600)
  const fresh = chunkNames(requested.slice(before))
  if (!fresh.includes('Board')) fail(`clicking Board fetched ${fresh.join(', ') || 'nothing'}`)
  // The board pulls in its own shared helpers; the rest of the app must stay put.
  const unrelated = fresh.filter((n) => ['Report', 'Compare', 'StudentCheck', 'AccessLog', 'Cycles'].includes(n))
  if (unrelated.length) fail(`clicking Board also fetched ${unrelated.join(', ')}`)
  const body = await page.locator('#main').innerText()
  if (/could not be loaded|went wrong/i.test(body)) fail('clicking Board showed the error boundary')
  console.log(`✓ one tap, one page — Board arrived with ${fresh.join(', ')}`)
  await page.close()
}

// ── 4. Hovering a link fetches its chunk before the click ────────────────────
{
  const { page, requested } = await newPage(USERS.coordinator)
  await signIn(page, base, USERS.coordinator)
  await page.setViewportSize({ width: 1280, height: 900 }) // The nav row, where a pointer lives.
  await page.goto(`${base}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(200)

  const before = requested.length
  await page.getByRole('link', { name: 'Report', exact: true }).first().hover()
  await page.waitForTimeout(500)
  const prefetched = chunkNames(requested.slice(before))
  if (!prefetched.includes('Report')) {
    fail(`hovering Report prefetched ${prefetched.join(', ') || 'nothing'}`)
  } else {
    console.log(`✓ hover prefetch — Report arrived before the click (${prefetched.join(', ')})`)
  }
  await page.close()
}

// ── 5. An instructor cannot reach a coordinator page ─────────────────────────
{
  const { page, requested, noise } = await newPage(USERS.instructor)
  await signIn(page, base, USERS.instructor)
  await page.goto(`${base}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(200)

  const navLabels = await page.locator('nav[aria-label="Main"] a').allInnerTexts()
  const forbidden = ['Board', 'Scenarios', 'Report', 'Compare', 'Cycles', 'Responses', 'Access']
  const shown = forbidden.filter((l) => navLabels.includes(l))
  if (shown.length) fail(`instructor nav offers ${shown.join(', ')}`)

  for (const path of ['/board', '/report', '/access', '/compare']) {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(200)
    const where = new URL(page.url()).pathname
    if (where !== '/') fail(`instructor typing ${path} landed on ${where}, not the dashboard`)
  }
  const loaded = chunkNames(requested)
  const leaked = loaded.filter((n) => ['Board', 'Report', 'Compare', 'Scenarios', 'AccessLog'].includes(n))
  if (leaked.length) fail(`instructor downloaded ${leaked.join(', ')}`)
  for (const n of noise) fail(`instructor: console ${n}`)
  console.log(`✓ instructor — ${navLabels.length} destinations, no coordinator page reachable or downloaded`)
  await page.close()
}

// ── 6. The theme, in the real index.html, before React ───────────────────────
/*
 * The dark palette hangs off `data-theme` on <html>. React sets it, but a
 * chunk and a render too late: the inline script in `index.html` is what
 * spares someone a white flash on the way to a dark page, and nothing else in
 * this repository loads that file. The mobile harness sets the attribute
 * itself, so it would pass happily with the script deleted.
 *
 * The app's own JavaScript is blocked for the first half of this, which is the
 * only honest way to ask what the first paint looked like: module scripts are
 * deferred, so `DOMContentLoaded` already waits for React, and reading the
 * attribute there passes whether or not the inline script exists.
 */
{
  const dark = await browser.newContext({ ...NO_WORKER, colorScheme: 'dark' })
  const light = await browser.newContext({ ...NO_WORKER, colorScheme: 'light' })

  /** The theme with React prevented from ever running. */
  const beforeReact = async (context, before) => {
    const page = await context.newPage()
    if (before) {
      await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
      await page.evaluate(before)
    }
    await page.route('**/assets/*.js', (route) => route.abort())
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
    const theme = await page.evaluate(() => document.documentElement.dataset.theme)
    await page.close()
    return theme
  }

  /** And with it running, which is what the coordinator actually gets. */
  const settled = async (context) => {
    const page = await context.newPage()
    await page.goto(`${base}/`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(250)
    const out = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      background: getComputedStyle(document.body).backgroundColor,
    }))
    await page.close()
    return out
  }

  const firstPaintDark = await beforeReact(dark)
  if (firstPaintDark !== 'dark')
    fail(`a dark device painted data-theme="${firstPaintDark}" with the app's JS blocked`)
  const firstPaintLight = await beforeReact(light)
  if (firstPaintLight !== 'light')
    fail(`a light device painted data-theme="${firstPaintLight}" with the app's JS blocked`)

  const onDarkDevice = await settled(dark)
  if (onDarkDevice.theme !== 'dark') fail(`a dark device ended up in ${onDarkDevice.theme}`)
  const onLightDevice = await settled(light)
  if (onLightDevice.theme !== 'light') fail(`a light device ended up in ${onLightDevice.theme}`)

  // The palette itself, not just the attribute: an attribute nothing keys off
  // is not dark mode.
  if (onDarkDevice.background === onLightDevice.background)
    fail(`both themes painted the page ${onDarkDevice.background}`)

  // A choice outranks the device, and outranks it from the first paint too.
  const chosenLight = await beforeReact(dark, () =>
    localStorage.setItem('css-scheduler:theme', 'light'),
  )
  if (chosenLight !== 'light') fail(`"light" chosen on a dark device came back as ${chosenLight}`)

  // And the button writes a choice that the next visit reads. A context of its
  // own: `dark` has a stored choice from the assertion above, and inheriting it
  // makes the button start in the second state rather than the first.
  {
    const fresh = await browser.newContext({ ...NO_WORKER, colorScheme: 'dark' })
    const page = await fresh.newPage()
    await stubSupabase(page, USERS.coordinator)
    await signIn(page, base, USERS.coordinator)
    await page.goto(`${base}/`, { waitUntil: 'networkidle' })
    const toggle = page.getByRole('button', { name: /^Theme:/ })
    const label = await toggle.getAttribute('aria-label')
    if (!/following your device \(dark\)/.test(label ?? ''))
      fail(`the theme button on a dark device reads "${label}"`)
    await toggle.click() // system → light
    await page.waitForTimeout(100)
    const afterOne = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      stored: localStorage.getItem('css-scheduler:theme'),
    }))
    if (afterOne.theme !== 'light' || afterOne.stored !== 'light')
      fail(`one press gave theme=${afterOne.theme} stored=${afterOne.stored}`)
    await toggle.click() // light → dark
    await toggle.click() // dark → back to following the device
    await page.waitForTimeout(100)
    const afterThree = await page.evaluate(() => localStorage.getItem('css-scheduler:theme'))
    if (afterThree !== null) fail(`three presses left ${afterThree} stored instead of nothing`)
    await page.close()
    await fresh.close()
  }

  await dark.close()
  await light.close()
  if (!problems.some((p) => /theme|device/.test(p)))
    console.log('✓ theme — right before React on both devices, a choice outranks them, and it persists')
}

// ── 7. No daylight left in the dark, on every real page ──────────────────────
/*
 * The dark palette works by re-pointing `--color-…`, so anything that names a
 * colour outright — an inline `#fff`, a `bg-white` written after this landed —
 * stays daylight-bright in a dark room and nothing else notices. The mobile
 * harness measures contrast on components; this sweeps the real pages for the
 * three light surfaces the stock palette uses, which is what such a mistake
 * paints.
 */
{
  const context = await browser.newContext({ ...NO_WORKER, colorScheme: 'dark' })
  const page = await context.newPage()
  await stubSupabase(page, USERS.coordinator)
  await signIn(page, base, USERS.coordinator)

  const DAYLIGHT = ['rgb(255, 255, 255)', 'rgb(248, 250, 252)', 'rgb(248, 248, 250)']
  for (const [label, path] of DESTINATIONS) {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(250) // `transition-colors` has to land first.
    const lit = await page.evaluate((daylight) => {
      const found = []
      for (const el of document.querySelectorAll('body *')) {
        const style = getComputedStyle(el)
        if (style.visibility === 'hidden' || style.display === 'none') continue
        if (!daylight.includes(style.backgroundColor)) continue
        const r = el.getBoundingClientRect()
        if (r.width < 2 || r.height < 2) continue
        found.push(
          `${el.tagName.toLowerCase()}.${String(el.className || '').split(' ').slice(0, 3).join('.')}` +
            ` is ${style.backgroundColor}`,
        )
      }
      return found.slice(0, 3)
    }, DAYLIGHT)
    for (const what of lit) fail(`${path} in the dark: ${what}`)
  }
  const theme = await page.evaluate(() => document.documentElement.dataset.theme)
  if (theme !== 'dark') fail(`the dark sweep ran in ${theme}`)
  await page.close()
  await context.close()
  if (!problems.some((p) => /in the dark/.test(p)))
    console.log(`✓ dark sweep — ${DESTINATIONS.length} pages, no daylight surface left in any of them`)
}

await browser.close()
server.close()

if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}:`)
  for (const p of problems) console.error(`  ✗ ${p}`)
  process.exit(1)
}
console.log('\nRouting clean: chunks split, pages render, nothing leaks across roles.')
