#!/usr/bin/env node
/**
 * The app's icons, drawn once and committed.
 *
 *   npm run icons
 *
 * An installed app is an icon on a home screen, and a manifest that promises
 * one it cannot produce is not installable at all — Chrome requires a 192px
 * and a 512px PNG, and iOS ignores the manifest entirely in favour of
 * `apple-touch-icon`. So the sizes here are not decoration.
 *
 * The drawing is one SVG, in UW's own purple and gold, rasterised by the
 * Chromium the checks already use rather than by an image library this project
 * would otherwise not need. The outputs are committed: a build must not depend
 * on a browser being installed, and an icon that is regenerated on every build
 * would change the bytes of a deploy for no reason.
 *
 * `maskable` is a separate file rather than a purpose added to the same one.
 * Android crops a maskable icon to whatever shape the launcher uses — a circle,
 * a squircle, a teardrop — so its content has to sit inside the middle 80%,
 * and an icon drawn to fill its square loses its corners. Declaring one file
 * as both is the common mistake: it is either cropped or floating, depending
 * on which purpose the platform picks.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { loadPlaywright } from './playwright.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = join(ROOT, 'public', 'icons')

const PURPLE = '#4b2e83' // UW purple, the same value as --uw-purple in src/index.css
const LIGHT = '#6b4ba8' // The header band and the empty days: purple, one step up.
const GOLD = '#b7a57a' // UW gold, on the one day that has somebody teaching it.

/**
 * The mark: a calendar with a single assigned day.
 *
 * `inset` is how far the drawing is pulled in from the edges. 0 fills the
 * square, which is right for a favicon and for iOS; 0.14 keeps everything
 * inside the circle Android may crop to.
 */
function icon(inset) {
  const scale = 1 - inset * 2
  const cells = []
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const assigned = row === 1 && col === 1
      cells.push(
        `<rect x="${116 + col * 104}" y="${220 + row * 60}" width="72" height="40" rx="10" ` +
          `fill="${assigned ? GOLD : LIGHT}"/>`,
      )
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="${PURPLE}"/>
  <g transform="translate(${256 * (1 - scale)} ${256 * (1 - scale)}) scale(${scale})">
    <rect x="156" y="86" width="36" height="64" rx="18" fill="#ffffff"/>
    <rect x="320" y="86" width="36" height="64" rx="18" fill="#ffffff"/>
    <rect x="88" y="118" width="336" height="306" rx="36" fill="#ffffff"/>
    <path d="M88 154a36 36 0 0 1 36-36h264a36 36 0 0 1 36 36v34H88z" fill="${LIGHT}"/>
    ${cells.join('\n    ')}
  </g>
</svg>`
}

const FILES = [
  { name: 'icon-192.png', size: 192, inset: 0 },
  { name: 'icon-512.png', size: 512, inset: 0 },
  { name: 'icon-maskable-512.png', size: 512, inset: 0.14 },
  // iOS rounds the corners itself and does not read the manifest.
  { name: 'apple-touch-icon.png', size: 180, inset: 0 },
]

const { chromium } = loadPlaywright('icon generation')
await mkdir(OUT, { recursive: true })
await writeFile(join(OUT, 'icon.svg'), `${icon(0)}\n`)

const browser = await chromium.launch()
for (const { name, size, inset } of FILES) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await page.setContent(
    `<!doctype html><style>html,body{margin:0;padding:0}svg{display:block;width:${size}px;height:${size}px}</style>${icon(inset)}`,
  )
  const png = await page.screenshot({ type: 'png' })
  await writeFile(join(OUT, name), png)
  await page.close()
  console.log(`✓ ${name.padEnd(26)} ${size}×${size}`)
}
await browser.close()
console.log(`\nWritten to public/icons. Commit them: the build does not draw its own icons.`)
