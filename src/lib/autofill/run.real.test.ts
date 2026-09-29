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
import { rulesFor } from './rules'
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
        for (const rule of [...f.prefs.rules, ...rulesFor('full-time', r.rules.rows)]) if (rule.strength === 'hard') expect(breaks(rule, s.meeting, s.quarter)).toBe(false)
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
    // "Autumn 2 x 342 (back-to-back if possible), 1 x 343; Winter 2 x 343, 1 x 342".
    expect(plan('F3').filter((x) => !x.startsWith('spr'))).toEqual(['aut 342', 'aut 342', 'aut 343', 'win 342', 'win 343', 'win 343'])
  })

  it('reads the new hires and the back-to-back wish, and keeps T/Th 1:15 free of full-time faculty', () => {
    const r = run()
    expect(r.rules.source).toBe('default')
    expect(r.fullTime.faculty.filter((p) => p.newFaculty).map((p) => p.name)).toEqual(['F9', 'F12', 'F16', 'F21'])
    expect(r.fullTime.faculty.filter((p) => p.backToBack).map((p) => [p.name, p.backToBack])).toEqual([['F3', 'prefer']])
    const f3 = r.result.faculty.find((f) => f.prefs.name === 'F3')!
    const [a, b] = f3.placed.filter((s) => s.quarter === 'autumn' && s.keys.includes('342')).sort((x, y) => x.meeting!.start - y.meeting!.start)
    expect(b!.meeting!.start - a!.meeting!.end).toBe(15)
    expect(b!.meeting!.days).toEqual(a!.meeting!.days)
    // 451A meets T/Th at 1:15; it was F4's first choice, so it is left open and says why.
    const open = r.result.open.find((o) => o.section.quarter === 'winter' && o.section.label === '451A')!
    expect(open.fullTime.find((c) => c.name === 'F4')!.note).toBe('department rule: no 1:15 PM-3:15 PM on T/Th')
  })
})
