#!/usr/bin/env node
/**
 * The keyboard check: real key presses, against the board's own shortcut table.
 *
 *   npm run check:keys
 *
 * What a key press *means* is pure and unit-tested in `src/lib/shortcuts.ts` —
 * 37 cases covering every modifier combination and every state that takes a
 * shortcut away. None of that reaches the wiring, and the wiring is where a
 * shortcut feature goes wrong:
 *
 *   - the listener has to be on the window, and has to survive a re-render
 *     without being torn down and rebuilt;
 *   - a keystroke aimed at a field must be left entirely alone, because the
 *     import sheet's textarea takes a paste of a whole quarter's schedule;
 *   - `preventDefault` must happen only once a shortcut has matched, or the
 *     browser's own bindings — ⌘R among them — stop working;
 *   - and a modal has to take the keyboard away, or `n` opens the section editor
 *     behind the sheet somebody is reading.
 *
 * Playwright is resolved from wherever it happens to be, as in the other checks;
 * it is not a dependency of this project.
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { loadPlaywright } from './playwright.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = join(ROOT, 'dist-harness')
const SCENE = 'shortcut-sandbox'

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

const { chromium } = loadPlaywright('keyboard check')
if (!existsSync(OUT)) {
  console.error(`${OUT} is missing. Run \`npm run check:keys\`, which builds it first.`)
  process.exit(2)
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

/** Every action the sandbox has recorded so far. */
const fired = (page) => page.$$eval('#key-log li[data-key]', (els) => els.map((e) => e.dataset.key))

{
  // A laptop, not a phone: this is the one feature a phone has no use for.
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
  await page.goto(`${base}/?view=${SCENE}`, { waitUntil: 'networkidle' })

  // ---------------------------------------------------------- the basics
  await page.keyboard.press('n')
  await page.keyboard.press('i')
  check(
    'a plain letter runs its action',
    JSON.stringify(await fired(page)) === JSON.stringify(['add-section', 'import']),
    JSON.stringify(await fired(page)),
  )

  await page.keyboard.press('?')
  check('the help key works, Shift and all', (await fired(page)).at(-1) === 'help', JSON.stringify(await fired(page)))

  await page.keyboard.press('ControlOrMeta+z')
  check('the modifier shortcut runs on this platform', (await fired(page)).at(-1) === 'undo', JSON.stringify(await fired(page)))

  {
    const before = (await fired(page)).length
    await page.keyboard.press('ControlOrMeta+Shift+z')
    check(
      'redo is left alone',
      (await fired(page)).length === before,
      `the log grew by ${(await fired(page)).length - before}`,
    )
  }

  {
    const before = (await fired(page)).length
    await page.keyboard.press('q')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    check(
      'a key nobody claimed does nothing',
      (await fired(page)).length === before,
      `the log grew by ${(await fired(page)).length - before}`,
    )
  }

  // ------------------------------------------------- not while typing
  {
    const before = (await fired(page)).length
    await page.locator('#field').click()
    await page.keyboard.type('nif1234')
    const value = await page.locator('#field').inputValue()
    check(
      'a field keeps every character, and fires nothing',
      value === 'nif1234' && (await fired(page)).length === before,
      `field read ${JSON.stringify(value)}, log grew by ${(await fired(page)).length - before}`,
    )
  }

  {
    const before = (await fired(page)).length
    await page.locator('#area').click()
    await page.locator('#area').fill('')
    await page.keyboard.type('n1i')
    const value = await page.locator('#area').inputValue()
    check(
      'a textarea does too — this is where a quarter gets pasted',
      value === 'n1i' && (await fired(page)).length === before,
      `textarea read ${JSON.stringify(value)}, log grew by ${(await fired(page)).length - before}`,
    )
  }

  // -------------------------------------------- a modal owns the keyboard
  {
    await page.locator('#toggle-sheet').click()
    const open = await page.locator('#sheet-state').getAttribute('data-open')
    const before = (await fired(page)).length
    // Focus off the button, so the presses land on the document.
    await page.locator('#sheet-state').click()
    for (const key of ['n', 'i', 'f', '1', '?']) await page.keyboard.press(key)
    await page.keyboard.press('ControlOrMeta+z')
    check(
      'nothing fires while a sheet is open',
      open === 'yes' && (await fired(page)).length === before,
      `sheet ${open}, log grew by ${(await fired(page)).length - before}`,
    )

    await page.locator('#toggle-sheet').click()
    await page.locator('#sheet-state').click()
    await page.keyboard.press('f')
    check(
      'and they come back when it closes',
      (await fired(page)).at(-1) === 'fill-gaps',
      JSON.stringify(await fired(page)),
    )
  }

  // ------------------------------------ the browser's own keys still work
  {
    /*
     * `preventDefault` on every key press would break these. Tab is the one that
     * can be observed from here without leaving the page: if the shortcut
     * listener were swallowing it, focus would not move.
     */
    await page.locator('#field').focus()
    await page.keyboard.press('Tab')
    const moved = await page.evaluate(() => document.activeElement?.id ?? '')
    check('Tab still moves focus, so unmatched keys keep their default', moved === 'area', `focus is on ${JSON.stringify(moved)}`)
  }

  /*
   * And a matched shortcut must be prevented, or `1` typed on a page with a
   * findable digit starts the browser's own quick-find. Observed through
   * `defaultPrevented`, which is what the browser itself consults.
   */
  {
    /*
     * Focus off the textarea first. The Tab assertion above left it there, and a
     * key press inside a field is correctly suppressed — which would make this
     * assertion pass for the wrong reason, as it did until the step that moved
     * focus was removed and this one broke.
     */
    await page.locator('#sheet-state').click()

    const seen = await page.evaluate(() => {
      window.__seen = []
      window.__spy = (e) => window.__seen.push([e.key, e.defaultPrevented])
      // Last in the queue, so the app's own handler has already run.
      window.addEventListener('keydown', window.__spy)
      return true
    })
    await page.keyboard.press('n')
    await page.keyboard.press('q')
    const log = await page.evaluate(() => {
      window.removeEventListener('keydown', window.__spy)
      return window.__seen
    })
    const matched = log.find(([k]) => k === 'n')
    const unmatched = log.find(([k]) => k === 'q')
    check(
      'a matched key is prevented and an unmatched one is not',
      seen && matched?.[1] === true && unmatched?.[1] === false,
      JSON.stringify(log),
    )
  }

  check('the console stays clean', consoleErrors.length === 0, consoleErrors.join('\n    '))
  await context.close()
}

await browser.close()
server.close()

if (failures.length) {
  console.error(`\n${failures.length} keyboard check${failures.length === 1 ? '' : 's'} failed.`)
  process.exit(1)
}
console.log('\nShortcuts fire where they should, and nowhere near a field or a sheet.')
