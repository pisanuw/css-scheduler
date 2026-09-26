#!/usr/bin/env node
/**
 * The mobile check: every component this app renders over the page, on a
 * 375px screen, asserting the things the coordinator would actually notice.
 *
 *   npm run check:mobile            all scenes
 *   npm run check:mobile -- chips   one scene
 *   SHOTS=1 npm run check:mobile    also write PNGs to dist-harness/shots
 *
 * What it checks, per scene:
 *   - the page does not scroll sideways, and nothing sticks out past the
 *     viewport
 *   - every control a finger has to hit is at least 44px in the direction
 *     that matters
 *   - every piece of text clears WCAG AA against what is actually behind it
 *   - the console stays clean
 *   - Escape closes a dialog, and Tab does not escape one
 *   - on paper: everything marked `print:hidden` really goes, and everything
 *     marked `data-print-only` really arrives
 *
 * Playwright is not a dependency of this project — it is a large install for
 * something the unit tests do not need — so this resolves it from wherever it
 * happens to be and says what to do if it is nowhere.
 */
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = join(ROOT, 'dist-harness')
const MIN_TOUCH = 44
const VIEWPORT = { width: 375, height: 812 }

function loadPlaywright() {
  const require = createRequire(import.meta.url)
  for (const spec of ['playwright', 'playwright-core', '@playwright/test']) {
    try {
      return require(spec)
    } catch {
      /* keep looking */
    }
  }
  // A global install is how the cloud sandbox has it.
  try {
    const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
    return createRequire(join(root, 'x.js'))('playwright')
  } catch {
    /* fall through */
  }
  console.error(
    'Playwright is not installed. `npm i -D playwright && npx playwright install chromium`,\n' +
      'or run this where a global playwright is available. Skipping the mobile check.',
  )
  process.exit(2)
}

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

/**
 * Runs in the page. An element fails if the side a finger aims at is under
 * 44px: both sides for a square icon button, height alone for a wide one,
 * since a full-width button is easy to hit however narrow it looks.
 */
function auditInPage(min) {
  /*
   * Tailwind 4 writes colours as oklch(). Rather than reimplement that
   * conversion — and get it subtly wrong — paint each colour into a 1x1
   * canvas and read back the pixel the browser itself produced.
   */
  const swatch = document.createElement('canvas')
  swatch.width = swatch.height = 1
  const ctx = swatch.getContext('2d', { willReadFrequently: true })
  const rgb = (css) => {
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = '#000'
    ctx.fillStyle = css
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return [r, g, b]
  }
  const luminance = ([r, g, b]) => {
    const f = (c) => {
      c /= 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  /** The first ancestor that actually paints something, the page being white. */
  const backdropOf = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor
      if (c && c !== 'transparent' && !/,\s*0\s*\)$/.test(c)) return rgb(c)
    }
    return [255, 255, 255]
  }
  const contrast = (a, b) => {
    const [l1, l2] = [luminance(a), luminance(b)]
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
  }

  const SELECTOR = 'button, a[href], input, select, textarea, summary, [role="button"]'
  const tooSmall = []
  const overflowing = []
  const vw = window.innerWidth

  for (const el of document.querySelectorAll(SELECTOR)) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue // not rendered
    const style = getComputedStyle(el)
    if (style.visibility === 'hidden' || style.display === 'none') continue
    // A checkbox inside a tall label row is hit by tapping the label.
    const label = el.closest('label')
    const effective =
      label && (el.type === 'checkbox' || el.type === 'radio')
        ? label.getBoundingClientRect()
        : r
    if (effective.height < min - 0.5) {
      tooSmall.push({
        what: el.tagName.toLowerCase() + (el.type ? `[${el.type}]` : ''),
        text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 44),
        height: Math.round(effective.height * 10) / 10,
      })
    }
  }

  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    // 1px of slack: sub-pixel layout rounds against you.
    if (r.width > vw + 1 || r.right > vw + 1) {
      overflowing.push({
        what: el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0],
        width: Math.round(r.width),
        right: Math.round(r.right),
      })
    }
  }

  // Contrast, once per distinct colour-on-colour-at-size combination: the same
  // finding repeated forty times is noise, not forty findings.
  const lowContrast = []
  const seen = new Set()
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length > 0) continue
    const text = (el.textContent ?? '').trim()
    if (!text) continue
    const style = getComputedStyle(el)
    if (style.visibility === 'hidden' || style.display === 'none') continue
    if (el.closest('.sr-only, [aria-hidden="true"]')) continue
    const fg = rgb(style.color)
    const bg = backdropOf(el)
    const size = parseFloat(style.fontSize)
    const bold = Number(style.fontWeight) >= 700
    // WCAG's "large text": 24px, or 18.66px when bold.
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5
    const key = `${fg}|${bg}|${need}`
    if (seen.has(key)) continue
    seen.add(key)
    const ratio = Math.round(contrast(fg, bg) * 100) / 100
    if (ratio < need) {
      lowContrast.push({ text: text.slice(0, 34), fg: `rgb(${fg})`, bg: `rgb(${bg})`, size, ratio, need })
    }
  }

  return {
    tooSmall,
    lowContrast,
    overflowing: overflowing.slice(0, 6),
    pageScrollsSideways: document.documentElement.scrollWidth > vw + 1,
    scrollWidth: document.documentElement.scrollWidth,
  }
}

const { chromium } = loadPlaywright()

if (!existsSync(join(OUT, 'index.html'))) {
  console.error('dist-harness is missing. `npm run build:harness` first.')
  process.exit(1)
}

const shots = process.env.SHOTS === '1'
const server = await serve(OUT)
const base = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch()
const failures = []

// The harness publishes its own scene list, so this script never drifts out of
// step with it.
const probe = await browser.newPage()
await probe.goto(`${base}/index.html`, { waitUntil: 'networkidle' })
const sceneNames = await probe.evaluate(() => window.__SCENES__)
await probe.close()

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const unknown = only.filter((a) => !sceneNames.includes(a))
if (unknown.length) {
  console.error(`No such scene: ${unknown.join(', ')}. Have: ${sceneNames.join(', ')}`)
  await browser.close()
  server.close()
  process.exit(1)
}
const scenes = only.length ? only : sceneNames

if (shots) await mkdir(join(OUT, 'shots'), { recursive: true })

for (const scene of scenes) {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 })
  const noise = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') noise.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => noise.push(`pageerror: ${e.message}`))

  await page.goto(`${base}/index.html?view=${encodeURIComponent(scene)}`, {
    waitUntil: 'networkidle',
  })
  // Scenes that start from a tap seed themselves.
  const seed = page.locator('[data-seed]')
  if (await seed.count()) {
    await seed.first().click()
    await page.waitForTimeout(120)
  }

  const report = await page.evaluate(auditInPage, MIN_TOUCH)
  const problems = []
  if (report.pageScrollsSideways)
    problems.push(`page scrolls sideways (${report.scrollWidth}px wide in a ${VIEWPORT.width}px viewport)`)
  for (const o of report.overflowing) problems.push(`overflows: ${o.what} is ${o.width}px, right edge ${o.right}`)
  for (const t of report.tooSmall) problems.push(`${t.height}px tall: <${t.what}> ${t.text || '(no label)'}`)
  for (const c of report.lowContrast)
    problems.push(
      `contrast ${c.ratio}:1 (needs ${c.need}) at ${c.size}px — ${c.fg} on ${c.bg} — "${c.text}"`,
    )
  for (const n of noise) problems.push(`console ${n}`)

  /*
   * What paper gets. Nothing else here can see it: a `print:hidden` control
   * and a print-only date stamp both look exactly right on screen whether or
   * not the variant works, so a broken one ships silently and turns up on a
   * printout in a meeting.
   */
  const stampsOnScreen = await page.evaluate(() =>
    [...document.querySelectorAll('[data-print-only]')].filter(
      (el) => getComputedStyle(el).display !== 'none',
    ).length,
  )
  if (stampsOnScreen) problems.push(`${stampsOnScreen} print-only element(s) visible on screen`)

  await page.emulateMedia({ media: 'print' })
  const onPaper = await page.evaluate(() => {
    const shown = (el) => {
      const s = getComputedStyle(el)
      return s.display !== 'none' && s.visibility !== 'hidden'
    }
    return {
      stillShowing: [...document.querySelectorAll('[class*="print:hidden"]')]
        .filter(shown)
        .map((el) => el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0])
        .slice(0, 4),
      missingStamps: [...document.querySelectorAll('[data-print-only]')].filter(
        (el) => !shown(el),
      ).length,
    }
  })
  await page.emulateMedia({ media: 'screen' })
  for (const w of onPaper.stillShowing) problems.push(`marked print:hidden but prints: ${w}`)
  if (onPaper.missingStamps)
    problems.push(`${onPaper.missingStamps} print-only element(s) missing from the printed page`)

  // Before the keyboard assertions, which end by closing the dialog.
  if (shots) {
    await page.screenshot({ path: join(OUT, 'shots', `${scene}.png`), fullPage: true })
  }

  // A dialog has to be closable and has to keep Tab inside it. Checking only
  // after the last press is no check at all: Tab out of an untrapped dialog and
  // enough presses bring you back round to it by luck.
  if (await page.locator('[role="dialog"]').count()) {
    const inside = () =>
      page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))
    if (!(await inside())) problems.push('focus did not move into the dialog on open')
    for (let i = 1; i <= 16 && !problems.some((p) => p.startsWith('Tab')); i++) {
      await page.keyboard.press('Tab')
      if (!(await inside())) problems.push(`Tab escaped the dialog after ${i} press${i === 1 ? '' : 'es'}`)
    }
    for (let i = 1; i <= 16 && !problems.some((p) => p.startsWith('Shift+Tab')); i++) {
      await page.keyboard.press('Shift+Tab')
      if (!(await inside())) problems.push(`Shift+Tab escaped the dialog after ${i} press${i === 1 ? '' : 'es'}`)
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(80)
    if (await page.locator('[role="dialog"]').count())
      problems.push('Escape did not close the dialog')
  }

  if (problems.length) {
    failures.push({ scene, problems })
    console.log(`✗ ${scene}`)
    for (const p of problems) console.log(`    ${p}`)
  } else {
    console.log(`✓ ${scene}`)
  }
  await page.close()
}

await browser.close()
server.close()

if (shots) {
  await writeFile(join(OUT, 'shots', 'scenes.txt'), scenes.join('\n') + '\n')
  console.log(`\nScreenshots in ${join(OUT, 'shots')}`)
}

if (failures.length) {
  console.error(`\n${failures.length} of ${scenes.length} scenes have problems at ${VIEWPORT.width}px.`)
  process.exit(1)
}
console.log(`\nAll ${scenes.length} scenes clean at ${VIEWPORT.width}px.`)
