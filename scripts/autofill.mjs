#!/usr/bin/env node
/**
 * The Excel auto-fill, from a terminal: the same code the /autofill page runs,
 * for a batch of what-ifs, for a machine with no browser, or for reading the
 * code with a debugger attached.
 *
 *   npm run autofill -- --schedule "26-27 at a glance.xlsx" \
 *                       --ft "FT responses.xlsx" [--pt "PT responses.xlsx"] \
 *                       [--place-part-time] [--out "filled.xlsx"]
 *
 * `--ft` may be left out when the schedule is a workbook this tool wrote
 * earlier: its "FT preferences" sheet, with any corrections, is used instead.
 * The output lands next to the schedule as "<name> (auto-filled).xlsx" unless
 * `--out` says otherwise. Nothing is sent anywhere.
 *
 * The library is TypeScript, and Node does not resolve extensionless imports
 * between TypeScript files, so it is bundled with esbuild (already a dev
 * dependency) into memory and imported from there. No build step, no output
 * directory.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const USAGE = `Usage: npm run autofill -- --schedule <at-a-glance.xlsx> [--ft <full-time responses.xlsx>] [--pt <part-time responses.xlsx>] [--place-part-time] [--out <file.xlsx>]`

function args(argv) {
  const out = { placePartTime: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => {
      const v = argv[++i]
      if (!v) throw new Error(`${a} needs a file name.\n${USAGE}`)
      return v
    }
    if (a === '--schedule') out.schedule = next()
    else if (a === '--ft') out.ft = next()
    else if (a === '--pt') out.pt = next()
    else if (a === '--out') out.out = next()
    else if (a === '--place-part-time') out.placePartTime = true
    else if (a === '--help' || a === '-h') {
      console.log(USAGE)
      process.exit(0)
    } else throw new Error(`Unknown option ${a}.\n${USAGE}`)
  }
  if (!out.schedule) throw new Error(`--schedule is required.\n${USAGE}`)
  return out
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

async function load() {
  const result = await build({
    entryPoints: [join(root, 'src/lib/autofill/run.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    logLevel: 'error',
  })
  const code = result.outputFiles[0].text
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}

function file(path) {
  return path ? { name: basename(path), bytes: new Uint8Array(readFileSync(resolve(path))) } : null
}

const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

try {
  const opts = args(process.argv.slice(2))
  const { runAutofill } = await load()
  const started = Date.now()
  const run = runAutofill({
    schedule: file(opts.schedule),
    fullTime: file(opts.ft),
    partTime: file(opts.pt),
    placePartTime: opts.placePartTime,
    now: new Date(),
  })
  const out = resolve(opts.out ?? join(dirname(resolve(opts.schedule)), run.outputName))
  writeFileSync(out, run.output)

  console.log(`${run.schedule.yearLabel}: ${fmt(run.fullTimeLoad.placed)} of ${fmt(run.fullTimeLoad.owed)} full-time load placed (${Date.now() - started} ms).`)
  for (const t of run.tallies) {
    console.log(`  ${t.label.padEnd(12)} ${String(t.toStaff).padStart(3)} to staff: ${t.fullTime} full-time${opts.placePartTime ? `, ${t.partTime} part-time` : ''}, ${t.open} open`)
  }
  const short = run.result.faculty.filter((f) => f.prefs.kind === 'full-time' && f.gap > 1e-6)
  for (const f of short) console.log(`  short: ${f.prefs.name} ${fmt(f.load)} of ${fmt(f.prefs.target ?? 0)} — ${f.shortBecause.join('; ')}`)
  for (const w of run.warnings) console.log(`  check: ${w}`)
  console.log(`Wrote ${out}`)
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
}
