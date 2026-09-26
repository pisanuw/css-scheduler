#!/usr/bin/env node
/**
 * The drag check: a real mouse and a real finger, against the board's own
 * sensors.
 *
 *   npm run check:drag
 *
 * Everything a drop *means* is pure and unit-tested in `src/lib/dnd.ts`. What
 * cannot be tested that way is whether a gesture becomes a drag at all, and
 * that is the whole feature: a mouse must travel before a press counts, a
 * finger must rest before a hold counts, and — the promise that matters most
 * here — a tap must still tap and a flick must still scroll, because tapping
 * is how the coordinator works on a phone and dragging is only a shortcut.
 *
 * Touch goes through the browser's real input pipeline (CDP
 * `Input.dispatchTouchEvent`) rather than synthetic DOM events, because a
 * synthetic touchmove cannot scroll a page and scrolling is one of the things
 * being asserted.
 *
 * Playwright is resolved from wherever it happens to be, as in
 * `scripts/mobile_check.mjs`; it is not a dependency of this project.
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { loadPlaywright } from './playwright.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = join(ROOT, 'dist-harness')
const SCENE = 'drag-sandbox'


const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png',
}

function serve(dir) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    const file = join(dir, path === '/' ? 'index.html' : path)
    try {
      const body = await readFile(file)
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404).end('not found')
    }
  })
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)))
}

const { chromium } = loadPlaywright('drag check')

if (!existsSync(join(OUT, 'index.html'))) {
  console.error('dist-harness is missing. `npm run build:harness` first.')
  process.exit(1)
}

const server = await serve(OUT)
const base = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch()
const failures = []

const check = (name, ok, detail) => {
  if (ok) console.log(`✓ ${name}`)
  else {
    console.log(`✗ ${name}\n    ${detail}`)
    failures.push(name)
  }
}

/** Every line the sandbox has recorded so far. */
const drops = (page) =>
  page.$$eval('#drag-log li[data-drop]', (els) => els.map((e) => e.dataset.drop))

/**
 * The load panel renders both layouts and hides one, so a selector matches
 * twice at any width — `:visible` picks the one a pointer could actually hit.
 */
const centre = async (page, selector) => {
  const box = await page.locator(`${selector}:visible`).first().boundingBox()
  if (!box) throw new Error(`no box for ${selector}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function mouseDrag(page, fromSel, toSel) {
  const from = await centre(page, fromSel)
  const to = await centre(page, toSel)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  // Several moves: one jump can outrun the sensor's own listeners.
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8)
  }
  await page.mouse.up()
  await page.waitForTimeout(80)
}

// -------------------------------------------------------------- the mouse

{
  // Tall enough that the section list and the load panel are both on screen:
  // a mouse cannot press something below the fold, and a drag that begins
  // outside the viewport leaves the page in a state the next one inherits.
  const context = await browser.newContext({ viewport: { width: 1100, height: 1400 } })
  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
  page.on('pageerror', (e) => consoleErrors.push(String(e)))
  await page.goto(`${base}/index.html?view=${SCENE}`, { waitUntil: 'networkidle' })

  // A name out of the load panel onto an unstaffed section: the common case.
  await mouseDrag(page, '[data-drag-id="instructor:i4"]', '#section-s4')
  let log = await drops(page)
  check(
    'dragging a name from the load panel assigns it',
    log.some((l) => l.startsWith('assign: Assigned Jae Park to CSS 430 A')),
    `log was ${JSON.stringify(log)}`,
  )

  // A chip from one card to another is a move, not a second assignment.
  await mouseDrag(page, '[data-drag-id="assignment:s2:i2"]', '#section-s3')
  log = await drops(page)
  check(
    'dragging a chip to another card moves it',
    log.some((l) => l.startsWith('move: Moved Bo Li from CSS 143 B to CSS 342 A')),
    `log was ${JSON.stringify(log)}`,
  )

  // Dropping on nothing changes nothing, and says nothing.
  const before = (await drops(page)).length
  const chip = await centre(page, '[data-drag-id="assignment:s1:i1"]')
  await page.mouse.move(chip.x, chip.y)
  await page.mouse.down()
  for (let i = 1; i <= 6; i++) await page.mouse.move(chip.x + i * 40, chip.y - i * 4)
  await page.mouse.move(1080, 40)
  await page.mouse.up()
  await page.waitForTimeout(80)
  log = await drops(page)
  check(
    'a drop outside every card does nothing',
    log.length === before + 2 && log[before + 1] === 'none: (nothing)',
    `log was ${JSON.stringify(log.slice(before))}`,
  )

  // The reason the mouse sensor has a distance constraint at all. A shaky
  // click rather than a clean one: a hand moves a pixel or two between press
  // and release, and if that counted as a drag the × would stop working.
  const unassigns = (await drops(page)).filter((l) => l.startsWith('unassign-tapped')).length
  const x = await centre(page, '#section-s1 [data-drag-id="assignment:s1:i1"] button')
  await page.mouse.move(x.x, x.y)
  await page.mouse.down()
  await page.mouse.move(x.x + 2, x.y + 1)
  await page.mouse.move(x.x + 3, x.y - 1)
  await page.mouse.up()
  await page.waitForTimeout(80)
  log = await drops(page)
  check(
    'clicking the × on a chip still unassigns rather than dragging it',
    log.filter((l) => l.startsWith('unassign-tapped')).length === unassigns + 1,
    `log was ${JSON.stringify(log.slice(-3))}`,
  )

  check('the console stays clean', consoleErrors.length === 0, consoleErrors.join('\n    '))
  await context.close()
}

// -------------------------------------------------------------- the finger

{
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
  page.on('pageerror', (e) => consoleErrors.push(String(e)))
  await page.goto(`${base}/index.html?view=${SCENE}`, { waitUntil: 'networkidle' })
  const cdp = await context.newCDPSession(page)

  const touch = (type, x, y) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 12, radiusY: 12, force: 1 }],
    })

  /** A long press, then a drag: what the board asks a finger to do. */
  async function touchDrag(fromSel, toSel, { hold = 400 } = {}) {
    const from = await centre(page, fromSel)
    const to = await centre(page, toSel)
    await touch('touchStart', from.x, from.y)
    await page.waitForTimeout(hold)
    for (let i = 1; i <= 10; i++) {
      await touch('touchMove', from.x + ((to.x - from.x) * i) / 10, from.y + ((to.y - from.y) * i) / 10)
      await page.waitForTimeout(16)
    }
    await touch('touchEnd', to.x, to.y)
    await page.waitForTimeout(120)
  }

  // The section list is above the load panel at 375px, so bring both into view.
  await page.locator('[data-drag-id="instructor:i4"]:visible').scrollIntoViewIfNeeded()
  await page.waitForTimeout(50)
  await touchDrag('[data-drag-id="instructor:i4"]', '#section-s5')
  let log = await drops(page)
  check(
    'a long press on a name, dragged onto a card, assigns it',
    log.some((l) => l.startsWith('assign: Assigned Jae Park to CSS 449 A')),
    `log was ${JSON.stringify(log)}`,
  )

  // The other half of the bargain: a flick must still scroll the page.
  await page.evaluate(() => window.scrollTo(0, 0))
  const before = (await drops(page)).length
  const start = await centre(page, '#section-s2')
  await touch('touchStart', start.x, start.y)
  for (let i = 1; i <= 8; i++) {
    await touch('touchMove', start.x, start.y - i * 25)
    await page.waitForTimeout(12)
  }
  await touch('touchEnd', start.x, start.y - 200)
  await page.waitForTimeout(200)
  const scrolled = await page.evaluate(() => window.scrollY)
  log = await drops(page)
  check(
    'a flick down the list scrolls the page and starts no drag',
    scrolled > 40 && log.length === before,
    `scrollY ${scrolled}, log grew by ${log.length - before}`,
  )

  check('the console stays clean', consoleErrors.length === 0, consoleErrors.join('\n    '))
  await context.close()
}

await browser.close()
server.close()

if (failures.length) {
  console.error(`\n${failures.length} drag check${failures.length === 1 ? '' : 's'} failed.`)
  process.exit(1)
}
console.log('\nDrag works with a mouse and with a finger, and neither steals a tap.')
