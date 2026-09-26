#!/usr/bin/env node
/**
 * The deployed site, as a phone finds it.
 *
 *   npm run check:deployed
 *   npm run check:deployed -- https://some-deploy-preview.netlify.app
 *
 * Everything else in this repository checks bytes that a build produced. This
 * checks what a server decided to say about them, which is the half no local
 * check can see: a deploy that publishes a perfect `manifest.webmanifest` as
 * `application/octet-stream`, or an `sw.js` with a year of cache on it, is a
 * build that passed every test and an app that cannot be installed or cannot
 * ever update itself. Both were real: the manifest's content type was wrong on
 * the first deploy that had one, and nothing but this would have noticed.
 *
 * It needs no credentials and changes nothing. It is the standing verification
 * that a deploy actually shipped, in a form that can be run rather than
 * remembered.
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const SITE = (process.argv[2] ?? 'https://uwb-css-scheduler.netlify.app').replace(/\/$/, '')
const DIST = join(ROOT, 'dist')

const problems = []
const fail = (what) => problems.push(what)

async function get(path) {
  const response = await fetch(`${SITE}${path}`)
  return {
    status: response.status,
    type: (response.headers.get('content-type') ?? '').toLowerCase(),
    cache: (response.headers.get('cache-control') ?? '').toLowerCase(),
    bytes: Buffer.from(await response.arrayBuffer()),
  }
}

/** A PNG's real dimensions, read from its own IHDR rather than its filename. */
function pngSize(bytes) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (signature.some((b, i) => bytes[i] !== b)) return null
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

// ── The document ─────────────────────────────────────────────────────────────
const index = await get('/')
if (index.status !== 200) fail(`the site answered ${index.status}`)
const html = index.bytes.toString('utf8')
for (const [what, pattern] of [
  ['the manifest', /<link[^>]+rel="manifest"/],
  ['an apple-touch-icon', /<link[^>]+rel="apple-touch-icon"/],
  ['a theme-color', /<meta[^>]+name="theme-color"/],
  ['the pre-paint theme script', /css-scheduler:theme/],
]) {
  if (!pattern.test(html)) fail(`the served page does not carry ${what}`)
}
const entry = /\/assets\/index-[A-Za-z0-9_-]+\.js/.exec(html)?.[0]
if (!entry) fail('the served page links no entry chunk')

// A deep link is most of how this app is opened; the SPA fallback has to hold.
const deep = await get('/board')
if (deep.status !== 200) fail(`/board answered ${deep.status}`)
else if (deep.bytes.toString('utf8') !== html) fail('/board served something other than the app')

// ── The service worker ───────────────────────────────────────────────────────
const sw = await get('/sw.js')
if (sw.status !== 200) fail(`/sw.js answered ${sw.status}: the app is not installable`)
if (!/javascript/.test(sw.type)) fail(`/sw.js is served as ${sw.type || 'nothing'}`)
/*
 * The one header whose cost is unbounded. A cached service worker cannot be
 * replaced by the thing that replaces everything else, so the app it controls
 * is frozen for as long as the copy lives — on a phone nobody can clear.
 */
if (!/max-age=0|no-cache|no-store/.test(sw.cache))
  fail(`/sw.js is cacheable: ${sw.cache || 'no cache-control at all'}`)
/*
 * Everything the worker promises to precache has to be there.
 *
 * Comparing the served worker with a local `dist/sw.js` would not do it: the
 * precache list is built from the bundle's hashed filenames, and a local build
 * without the deploy's `VITE_SUPABASE_*` values produces different hashes and
 * so a different list. This asks the question that actually matters, of the
 * server, with no build at all — a worker whose list is one file out fails to
 * install, and the app it was meant to make offline-capable silently is not.
 */
const precache = JSON.parse(/\[(?:"[^"]*",?)+\]/.exec(sw.bytes.toString('utf8'))?.[0] ?? '[]')
if (precache.length === 0) fail('the served sw.js precaches nothing')
if (!precache.includes('/index.html')) fail('the served sw.js does not precache the shell')
const missing = []
for (const path of precache) {
  const asset = await get(path)
  if (asset.status !== 200) missing.push(`${path} → ${asset.status}`)
}
if (missing.length) fail(`the worker precaches files that are not there: ${missing.join(', ')}`)
else console.log(`  ${precache.length} precached files, all present`)

// ── The manifest, and every icon it promises ─────────────────────────────────
const manifestResponse = await get('/manifest.webmanifest')
if (manifestResponse.status !== 200) fail(`/manifest.webmanifest answered ${manifestResponse.status}`)
if (!/application\/manifest\+json|application\/json/.test(manifestResponse.type))
  fail(`the manifest is served as ${manifestResponse.type || 'nothing'}, not application/manifest+json`)

let manifest = null
try {
  manifest = JSON.parse(manifestResponse.bytes.toString('utf8'))
} catch (err) {
  fail(`the served manifest is not JSON: ${err}`)
}
if (manifest) {
  if (manifest.display !== 'standalone') fail(`the served manifest's display is ${manifest.display}`)
  for (const icon of manifest.icons ?? []) {
    const served = await get(icon.src)
    if (served.status !== 200) {
      fail(`${icon.src} answered ${served.status}`)
      continue
    }
    if (icon.type && !served.type.startsWith(icon.type))
      fail(`${icon.src} is served as ${served.type}, not ${icon.type}`)
    if (icon.type !== 'image/png') continue
    const size = pngSize(served.bytes)
    if (!size) fail(`${icon.src} is not a PNG`)
    else if (`${size.width}x${size.height}` !== icon.sizes)
      fail(`${icon.src} says ${icon.sizes} and is ${size.width}x${size.height}`)
  }
}

// ── The hashed assets ────────────────────────────────────────────────────────
if (entry) {
  const chunk = await get(entry)
  if (chunk.status !== 200) fail(`${entry} answered ${chunk.status}`)
  if (!/immutable|max-age=[1-9]/.test(chunk.cache))
    fail(`${entry} is not cacheable: ${chunk.cache || 'no cache-control at all'}`)
  if (existsSync(join(DIST, entry.replace(/^\//, '')))) {
    const local = await readFile(join(DIST, entry.replace(/^\//, '')))
    if (!local.equals(chunk.bytes))
      console.log(
        `  (the entry chunk differs from dist/ — expected unless the local build used the\n` +
          `   same VITE_SUPABASE_* values Netlify did; see docs/PROGRESS.md)`,
      )
  }
}

if (problems.length) {
  console.error(`${SITE}\n\n${problems.length} problem${problems.length === 1 ? '' : 's'}:`)
  for (const p of problems) console.error(`  ✗ ${p}`)
  process.exit(1)
}
console.log(`${SITE} — installable, the worker is replaceable, every icon is what it claims.`)
