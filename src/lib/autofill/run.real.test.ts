/**
 * The AY 2026-27 workbooks themselves, when they are on this machine.
 *
 * They are not in the repository and must not be: the survey answers are
 * about people's leave, health and families, anonymised or not. Point
 * `AUTOFILL_REAL_DIR` at a folder holding the year-at-a-glance workbook and
 * the two survey exports (named as the coordinator downloads them) and this
 * runs; without it, it is skipped.
 *
 *   AUTOFILL_REAL_DIR=~/Downloads/ay26-27 npx vitest run src/lib/autofill/run.real.test.ts
 *
 * What it pins is what the first run against them was checked for by hand,
 * person by person: every rule held, one load short and why, and the three
 * responses that asked for something specific getting exactly that.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runAutofill } from './run'
import { meetingsClash } from './glance'
import { breaks } from './text'

const dir = process.env.AUTOFILL_REAL_DIR
const find = (re: RegExp) => {
  const name = dir ? readdirSync(dir).find((f) => re.test(f)) : undefined
  return name ? { name, bytes: new Uint8Array(readFileSync(join(dir!, name))) } : null
}

describe.skipIf(!dir)('the AY 2026-27 workbooks', () => {
  const run = () =>
    runAutofill({
      schedule: find(/at a glance/i)!,
      fullTime: find(/full-time/i),
      partTime: find(/part-time/i),
      placePartTime: false,
      now: new Date('2026-09-28T12:00:00Z'),
    })

  it('reads every section and every response', () => {
    const r = run()
    expect(r.tallies.map((t) => t.toStaff)).toEqual([86, 101, 87])
    expect(r.fullTime.faculty).toHaveLength(26)
    expect(r.partTime?.faculty).toHaveLength(35)
  })

  it('places every full-time load but one, and breaks no rule doing it', () => {
    const r = run()
    expect(r.fullTimeLoad).toEqual({ placed: 143, owed: 144 })
    for (const f of r.result.faculty.filter((x) => x.prefs.kind === 'full-time')) {
      expect(f.load).toBeLessThanOrEqual(f.prefs.target! + 1e-9)
      for (let i = 0; i < f.placed.length; i++) {
        const s = f.placed[i]!
        for (const rule of f.prefs.rules) if (rule.strength === 'hard') expect(breaks(rule, s.meeting, s.quarter)).toBe(false)
        for (const t of f.placed.slice(i + 1)) {
          // A skills lab that meets with its own lecture (123A with SKL123A) is one class, not a clash.
          const together = (s.lab || t.lab) && s.keys.some((k) => t.keys.some((x) => x.replace(/^SKL/, '') === k.replace(/^SKL/, '')))
          if (t.quarter === s.quarter && !together) expect(meetingsClash(s.meeting, t.meeting)).toBe(false)
        }
      }
    }
    const short = r.result.faculty.filter((f) => f.prefs.kind === 'full-time' && f.gap > 0)
    expect(short.map((f) => f.prefs.name)).toEqual(['F17'])
  })

  it('gives the three most specific requests exactly what they asked for', () => {
    const r = run()
    const plan = (name: string) =>
      r.result.faculty
        .find((f) => f.prefs.name === name)!
        .placed.map((s) => `${s.quarter.slice(0, 3)} ${s.keys[0]}`)
        .sort()
    // The load note "3: 502, 584, 343".
    expect(plan('F1').map((x) => x.split(' ')[1]).sort()).toEqual(['343', '502', '584'])
    // "497 (Autumn, Winter and Spring), 421 (Winter), 360 (Autumn, Spring), 506 (Autumn), 507 (Winter), 101 or 142 (Spring)".
    expect(plan('F2')).toEqual(['aut 360', 'aut 497', 'aut 506', 'spr 142', 'spr 360', 'spr 497', 'win 421', 'win 497', 'win 507'].sort())
    // Their requested timetable, with 143 standing in for 458, which is not offered.
    expect(plan('F22')).toEqual(['aut 112', 'aut 142', 'aut SKL123', 'spr 112', 'spr 142', 'spr SKL123', 'win 112', 'win 123', 'win 143', 'win SKL123'].sort())
  })
})
