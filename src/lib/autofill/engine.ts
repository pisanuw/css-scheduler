/**
 * Filling the year from preferences.
 *
 * The request was specific: put the full-time faculty into the schedule
 * according to what they asked for and the load they owe, and leave the rest
 * for part-time instructors. So the objective is, in this order:
 *
 * 1. **Load.** Every full-time member gets as close to their load as the
 *    schedule allows, and a shortfall is shared rather than dumped on one
 *    person — two people one course short beats one person two short.
 * 2. **What they asked for.** Their first choice over their fifth, the
 *    quarter and time they named, the coordinator's own pinned courses first
 *    of all; fewer preparations where the rest is equal.
 * 3. **Nothing they ruled out.** A hard constraint ("cannot teach 8-10pm",
 *    "no graduate classes", a quarter off) is never broken; a soft one ("I
 *    prefer not to teach before 1:15") costs something and is named when it
 *    is paid.
 *
 * Department rules ("no T/Th 1:15 PM for full-time faculty") are hard
 * constraints like the rest. Within the preferences, a section of each G&O or
 * chair request ranks just under a pinned course, a new faculty member's
 * wishes count half as much again as a colleague's, and back-to-back classes
 * are sought or avoided for whoever said which — none of which ever costs
 * anyone load.
 *
 * It starts greedily — whoever stands to lose most by waiting chooses first —
 * then improves by moves a person would make with the sheet open: trade a
 * section for a free one they like better, pass a section to someone short of
 * load and take a free one instead, or swap two. Every placement carries the
 * reasons it was made and every open section says who could have taken it and
 * why they did not. Nothing is written until the coordinator downloads it.
 */

import type { GlanceSection } from './glance'
import { meetingsClash } from './glance'
import type { CourseWish, FacultyKind, FacultyPrefs, YearQuarter } from './prefs'
import { QUARTER_SHORT, YEAR_QUARTERS, breaks, clockLabel, daysLabel, describeRule, type TimeRule } from './text'

export interface EngineOptions {
  /** After the full-time pass, offer what is left to part-time instructors within their caps. */
  placePartTime: boolean
  /** Department rules, by who they bind: "no 1:15 PM-3:15 PM on T/Th" for full-time faculty. */
  rules?: Partial<Record<FacultyKind, TimeRule[]>>
}

/** Why a person fits a section, per unit of load. */
interface Fit {
  score: number
  reasons: string[]
  caveats: string[]
  wish: CourseWish | null
}

export interface Placement {
  section: GlanceSection
  faculty: string
  kind: FacultyKind
  reasons: string[]
  caveats: string[]
  /** Colleagues of the same kind who also asked for it and could have taught it: "F8 (#1)". */
  alsoWanted: string[]
}

export interface FacultyResult {
  prefs: FacultyPrefs
  /** Sections they teach: already in the sheet, and proposed now. */
  fixed: GlanceSection[]
  placed: GlanceSection[]
  load: number
  byQuarter: Record<YearQuarter, number>
  /** Load still owed, for full-time; room left under their caps, for part-time. */
  gap: number
  /** Share of placed load that came from their first three choices (or pinned courses). */
  topShare: number | null
  /** Courses they asked for that the schedule does not offer this year. */
  notOffered: string[]
  /** Why the gap is there, when there is one. */
  shortBecause: string[]
  /** G&O or chair requests they did not get, each with why. */
  requestsMissed: string[]
}

export interface Candidate {
  name: string
  kind: FacultyKind
  note: string
}

export interface OpenSection {
  section: GlanceSection
  /** Full-time faculty who asked for it, and why each did not get it. */
  fullTime: Candidate[]
  /** Part-time instructors who asked for it and could teach it then. */
  partTime: Candidate[]
}

export interface EngineResult {
  placements: Placement[]
  faculty: FacultyResult[]
  open: OpenSection[]
}

const W_LOAD = 1000
const DEFICIT = 150
const PREP = 6
const SPLIT_DAYS = 25
const HEAVY_QUARTER = 20
/** Each extra section of one course in one quarter, beyond what was asked for, is worth this much less than the last. */
const REPEAT = 25
/** The same, when they named the quarters for a course but not how many: "497 (Autumn, Winter and Spring)" means one each. */
const REPEAT_NAMED = 60
const RESERVED = 45
/** Holding each course the coordinator pinned at least once: "3: 502, 584, 343" means one of each, not 343 twice. */
const PINNED_ONCE = 150
/**
 * A G&O or chair request means one section of the course, not as many as fit: holding the first is
 * worth what a pinned course is, and any more are worth what they would be anyway — for a course
 * they did not list, what an also-OK course is.
 */
const REQUESTED_ONCE = 150
const REQUESTED = 45
/** Each pair of classes back to back on a day, for someone who asked for that — or asked not to. */
const BACK_TO_BACK = 30
/** Back to back is at most this far apart: the campus blocks are 15 minutes apart. */
const BACK_TO_BACK_GAP = 30
/** How much more a new faculty member's wishes count than a colleague's. Load is weighed the same for everyone. */
const NEW_FACULTY = 1.5
const EPS = 1e-6

function keyOf(s: GlanceSection): string {
  return s.keys[0] ?? s.label
}

function isSkillsLab(s: GlanceSection): boolean {
  return s.keys.some((k) => k.startsWith('SKL'))
}

/** The first hard rule — the department's, or their own — that a section breaks for this person. */
function hardRuleBroken(p: FacultyPrefs, s: GlanceSection, department: TimeRule[]): string | null {
  const q = s.quarter as YearQuarter
  for (const rule of department) if (rule.strength === 'hard' && breaks(rule, s.meeting, q)) return `department rule: ${describeRule(rule)}`
  for (const rule of p.rules) if (rule.strength === 'hard' && breaks(rule, s.meeting, q)) return `said: ${describeRule(rule)}`
  return null
}

/**
 * How well a section suits a person, or why it cannot be theirs at all.
 * `department` is the department's rules for their kind of appointment.
 */
export function fitFor(p: FacultyPrefs, s: GlanceSection, department: TimeRule[] = []): Fit | string {
  const q = s.quarter as YearQuarter
  if ((p.quarterMax[q] ?? 0) <= 0) return `not teaching in ${QUARTER_SHORT[q]}`
  if (p.noGraduate && s.graduate) return 'asked for no graduate courses'

  let best: Fit | null = null
  let avoided = false
  for (const key of s.keys) {
    const pinned = p.pinned.indexOf(key)
    const requested = p.requests.includes(key)
    const d = p.desired.findIndex((w) => w.key === key)
    const o = p.ok.findIndex((w) => w.key === key)
    const wish = d >= 0 ? p.desired[d]! : o >= 0 ? p.ok[o]! : null
    let score: number
    const reasons: string[] = []
    const caveats: string[] = []
    if (pinned >= 0) {
      score = 130
      reasons.push('named in the coordinator’s load note')
    } else if (d >= 0) {
      score = Math.max(55, 100 - 7 * d)
      reasons.push(p.kind === 'full-time' ? `#${d + 1} of their most-wanted` : `#${d + 1} of the courses they listed`)
    } else if (o >= 0) {
      score = 45
      reasons.push('on their also-OK list')
    } else if (requested) {
      score = REQUESTED
    } else {
      if (p.avoid.includes(key)) avoided = true
      continue
    }
    if (requested) reasons.unshift('a G&O or chair request')
    if (p.avoid.includes(key)) {
      // A request is the coordinator's call, so it stands; the conflict is shown.
      if (!requested && wish?.quarters.length && !wish.quarters.includes(q)) {
        avoided = true
        continue
      }
      if (requested || !wish?.quarters.length) caveats.push('also on their prefer-not list')
    }
    if (wish?.quarters.length) {
      if (wish.quarters.includes(q)) {
        score += 15
        reasons.push(`asked for it in ${QUARTER_SHORT[q]}`)
      } else {
        score -= 30
        caveats.push(`they named ${wish.quarters.map((x) => QUARTER_SHORT[x]).join('/')} for it`)
      }
    }
    if (wish?.counts[q]) score += 10
    if (wish?.times.length && s.meeting) {
      if (wish.times.includes(s.meeting.start)) {
        score += 12
        reasons.push(`at ${clockLabel(s.meeting.start)}, as asked`)
      } else {
        score -= 4
        caveats.push(`asked for ${wish.times.map(clockLabel).join(' or ')}`)
      }
    }
    if (wish?.days && s.meeting) {
      if (s.meeting.days.every((x) => wish.days!.includes(x))) score += 4
      else {
        score -= 4
        caveats.push(`asked for ${daysLabel(wish.days)}`)
      }
    }
    if (wish?.letter && wish.quarters.includes(q) && s.letter === wish.letter) score += 6
    const fit: Fit = { score, reasons, caveats, wish }
    if (!best || fit.score > best.score) best = fit
  }
  if (!best) return avoided ? 'on their prefer-not list' : 'not a course they listed'

  const broken = hardRuleBroken(p, s, department)
  if (broken) return broken
  for (const [rule, whose] of [...department.map((r) => [r, 'department rule:'] as const), ...p.rules.map((r) => [r, 'they said'] as const)]) {
    if (!breaks(rule, s.meeting, q)) continue
    best.score -= rule.strength === 'strong' ? 60 : 15
    best.caveats.push(`${whose} ${describeRule(rule)}`)
  }
  if (s.reserved) {
    best.score -= RESERVED
    best.caveats.push('reserved section: may not run')
  }
  if (s.placeholder) {
    best.score -= 5
    best.caveats.push('special-topics placeholder')
  }
  if (s.proposed === p.name) best.score += 8
  return best
}

/**
 * What is placed as one piece: a section, or a lecture with its own lab
 * ("427A" and "427 Lab"), which one person teaches together. Skills labs
 * (CSSSKL 142) are their own assignments and are not bundled.
 */
interface Unit {
  id: string
  head: GlanceSection
  sections: GlanceSection[]
  load: number
  quarter: YearQuarter
}

function units(open: GlanceSection[]): Unit[] {
  const out = new Map<string, Unit>()
  const lectureOf = (lab: GlanceSection): Unit | null => {
    const bare = lab.keys.map((k) => k.replace(/^SKL/, ''))
    const lectures = [...out.values()].filter((u) => u.quarter === lab.quarter && !u.head.lab && u.head.keys.some((k) => bare.includes(k)))
    if (!isSkillsLab(lab)) return lectures.length === 1 ? lectures[0]! : null
    // "123A 1:15 M/W" with "SKL123A 1:15 W": one class meeting together, not a clash.
    const together = lectures.filter((u) => meetingsClash(u.head.meeting, lab.meeting))
    return together.length === 1 ? together[0]! : null
  }
  const labs = open.filter((s) => s.lab)
  for (const s of open) {
    if (labs.includes(s)) continue
    out.set(s.id, { id: s.id, head: s, sections: [s], load: s.load, quarter: s.quarter as YearQuarter })
  }
  for (const lab of labs) {
    const lecture = lectureOf(lab)
    if (lecture) {
      lecture.sections.push(lab)
      lecture.load += lab.load
    } else out.set(lab.id, { id: lab.id, head: lab, sections: [lab], load: lab.load, quarter: lab.quarter as YearQuarter })
  }
  return [...out.values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
}

/**
 * How well a unit suits a person: its head decides the fit, and every part of
 * it has to be allowed — a lecture at 11 whose lab falls in the T/Th 1:15
 * block is not a full-time faculty member's to teach.
 */
function fitForUnit(p: FacultyPrefs, u: Unit, department: TimeRule[]): Fit | string {
  const fit = fitFor(p, u.head, department)
  if (typeof fit === 'string') return fit
  for (const s of u.sections) {
    const broken = s === u.head ? null : hardRuleBroken(p, s, department)
    if (broken) return `${s.label}: ${broken}`
  }
  return fit
}

interface Person {
  prefs: FacultyPrefs
  fits: Map<string, Fit>
  /** Units this person could hold at all, best first. */
  options: Unit[]
  /** Sections already theirs in the sheet: counted, never moved. */
  fixed: GlanceSection[]
  held: Unit[]
  /** The load they should end at: a full-time load, or a part-time ask. */
  goal: number
  /** How much their wishes count against a colleague's: more for someone new. */
  weight: number
  /** The department's rules for their kind of appointment. */
  department: TimeRule[]
}

function sectionsOf(person: Person, held: Unit[] = person.held): GlanceSection[] {
  return [...person.fixed, ...held.flatMap((u) => u.sections)]
}

function loadOf(list: GlanceSection[]): number {
  return list.reduce((a, s) => a + s.load, 0)
}

function quarterLoad(list: GlanceSection[], q: YearQuarter): number {
  return list.reduce((a, s) => a + (s.quarter === q ? s.load : 0), 0)
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/** Can this person also take `u`, given `held`? Null when yes, otherwise why not. */
function blocker(person: Person, held: Unit[], u: Unit): string | null {
  const p = person.prefs
  const q = u.quarter
  const all = sectionsOf(person, held)
  if (loadOf(all) + u.load > person.goal + EPS) {
    return p.kind === 'full-time' ? `already at their load (${fmt(loadOf(all))} of ${fmt(person.goal)})` : `already at what they asked for (${fmt(loadOf(all))})`
  }
  if (quarterLoad(all, q) + u.load > p.quarterMax[q] + EPS) return `${QUARTER_SHORT[q]} is full for them (${fmt(quarterLoad(all, q))} of ${fmt(p.quarterMax[q])})`
  if (p.sixMonthMax !== null) {
    for (const pair of [['autumn', 'winter'], ['winter', 'spring']] as YearQuarter[][]) {
      if (!pair.includes(q)) continue
      const both = pair.reduce((a, x) => a + quarterLoad(all, x), 0)
      if (both + u.load > p.sixMonthMax + EPS) return `over their two-quarter cap of ${fmt(p.sixMonthMax)}`
    }
  }
  if (p.yearMax !== null && loadOf(all) + u.load > p.yearMax + EPS) return `over their year cap of ${fmt(p.yearMax)}`
  for (const s of u.sections) {
    const clash = all.find((t) => t.quarter === s.quarter && t.id !== s.id && meetingsClash(t.meeting, s.meeting))
    if (clash) return `teaching ${clash.label} then`
  }
  return null
}

/**
 * Pairs of classes back to back on a day: in one quarter, sharing a day, the
 * second starting within half an hour of the first ending.
 */
function backToBackPairs(list: GlanceSection[]): [GlanceSection, GlanceSection][] {
  const timed = list.filter((s) => s.meeting)
  const pairs: [GlanceSection, GlanceSection][] = []
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i]!
      const b = timed[j]!
      if (a.quarter !== b.quarter || !a.meeting!.days.some((d) => b.meeting!.days.includes(d))) continue
      const gap = Math.max(b.meeting!.start - a.meeting!.end, a.meeting!.start - b.meeting!.end)
      if (gap >= 0 && gap <= BACK_TO_BACK_GAP) pairs.push([a, b])
    }
  }
  return pairs
}

/**
 * The value of a person holding `held`. Load dominates, and is weighed the
 * same for everyone; preferences order what is left, and count for more for
 * someone new.
 */
function value(person: Person, held: Unit[]): number {
  const p = person.prefs
  const all = sectionsOf(person, held)
  const load = loadOf(all)
  const deficit = Math.max(0, person.goal - load)
  const forLoad = W_LOAD * load - DEFICIT * deficit * deficit

  let v = 0
  for (const u of held) v += u.load * (person.fits.get(u.id)?.score ?? 0)
  const heads = [...person.fixed, ...held.map((u) => u.head)]
  v -= PREP * Math.max(0, new Set(heads.map(keyOf)).size - 1)
  for (const key of p.pinned) if (heads.some((h) => h.keys.includes(key))) v += PINNED_ONCE
  for (const key of p.requests) if (heads.some((h) => h.keys.includes(key))) v += REQUESTED_ONCE
  if (p.backToBack) v += (p.backToBack === 'prefer' ? BACK_TO_BACK : -BACK_TO_BACK) * backToBackPairs(all).length

  const available = YEAR_QUARTERS.filter((q) => p.quarterMax[q as YearQuarter] > 0).length || 1
  const even = Math.ceil(person.goal / available - EPS)
  const wishes = [...p.desired, ...p.ok]
  for (const q of YEAR_QUARTERS as YearQuarter[]) {
    const inQ = all.filter((s) => s.quarter === q)
    v -= HEAVY_QUARTER * Math.max(0, quarterLoad(inQ, q) - even)
    if (p.sameDays) {
      const patterns = new Set(inQ.filter((s) => s.meeting && s.meeting.days.length === 2).map((s) => s.meeting!.days.join('')))
      if (patterns.size > 1) v -= SPLIT_DAYS * (patterns.size - 1)
    }
    // A second section of one course in a quarter is worth less than the first, unless they asked for two.
    const perCourse = new Map<string, number>()
    for (const h of heads) if (h.quarter === q) perCourse.set(keyOf(h), (perCourse.get(keyOf(h)) ?? 0) + 1)
    for (const [key, n] of perCourse) {
      const wish = wishes.find((w) => w.key === key)
      const asked = wish?.counts[q] ?? 1
      const extra = Math.max(0, n - asked)
      const step = wish && wish.quarters.length > 0 && wish.counts[q] === undefined ? REPEAT_NAMED : REPEAT
      v -= (step * extra * (extra + 1)) / 2
    }
  }
  return forLoad + person.weight * v
}

interface State {
  people: Person[]
  holder: Map<string, Person>
}

function take(state: State, person: Person, u: Unit): void {
  person.held.push(u)
  state.holder.set(u.id, person)
}

function drop(state: State, person: Person, u: Unit): void {
  person.held = person.held.filter((t) => t.id !== u.id)
  state.holder.delete(u.id)
}

function without(held: Unit[], u: Unit): Unit[] {
  return held.filter((t) => t.id !== u.id)
}

/** The regret-ordered greedy start: whoever would lose most by waiting chooses first. */
function construct(state: State, allowReserved: boolean): void {
  for (;;) {
    let best: { person: Person; u: Unit; priority: number } | null = null
    for (const person of state.people) {
      if (loadOf(sectionsOf(person)) >= person.goal - EPS) continue
      const base = value(person, person.held)
      const gains: { u: Unit; gain: number }[] = []
      for (const u of person.options) {
        if (state.holder.has(u.id) || (u.head.reserved && !allowReserved)) continue
        if (blocker(person, person.held, u)) continue
        gains.push({ u, gain: value(person, [...person.held, u]) - base })
      }
      if (gains.length === 0) continue
      gains.sort((a, b) => b.gain - a.gain || a.u.id.localeCompare(b.u.id))
      const regret = gains[0]!.gain - (gains[1]?.gain ?? gains[0]!.gain - 300)
      const priority = gains[0]!.gain + 0.5 * regret
      if (!best || priority > best.priority + EPS) best = { person, u: gains[0]!.u, priority }
    }
    if (!best) return
    take(state, best.person, best.u)
  }
}

/**
 * Re-choose one person's whole set from what they hold and what is free,
 * everyone else held still. Single trades cannot get from "112, 142, 143 in
 * Autumn" to "112, 142 and the SKL123 lab they asked for, with 143 moved to
 * Winter" — that is two sections out and three in. A bounded branch and
 * bound can, because a person has tens of options, not hundreds.
 */
function repack(state: State, person: Person, allowReserved: boolean, nodeLimit = 40000): boolean {
  const pool = [
    ...person.held,
    ...person.options.filter((u) => !state.holder.has(u.id) && (allowReserved || !u.head.reserved)),
  ].sort((a, b) => (person.fits.get(b.id)?.score ?? 0) - (person.fits.get(a.id)?.score ?? 0) || a.id.localeCompare(b.id))
  const base = value(person, person.held)
  let best: { set: Unit[]; v: number } = { set: person.held, v: base }
  const chosen: Unit[] = []
  const start = loadOf(person.fixed)
  const p = person.prefs
  const smallest = Math.max(0.25, Math.min(...pool.map((u) => u.load)))
  let nodes = 0
  const dfs = (i: number, load: number): void => {
    if (++nodes > nodeLimit) return
    const now = value(person, chosen)
    if (now > best.v + EPS) best = { set: [...chosen], v: now }
    if (i >= pool.length || load >= person.goal - EPS) return
    // Nothing below can beat the best: fill the room with the best score left, and no penalty —
    // plus every request still missing, and a back-to-back pair on each side of every class that could be added.
    const room = person.goal - load
    const top = person.fits.get(pool[i]!.id)?.score ?? 0
    const have = new Set([...person.fixed, ...chosen.map((u) => u.head)].flatMap((h) => h.keys))
    const bonus =
      REQUESTED_ONCE * p.requests.filter((k) => !have.has(k)).length +
      (p.backToBack === 'prefer' ? 4 * BACK_TO_BACK * Math.ceil(room / smallest - EPS) : 0)
    if (now + DEFICIT * room * room + room * W_LOAD + person.weight * (room * top + bonus) <= best.v + EPS) return
    const u = pool[i]!
    if (!blocker(person, chosen, u)) {
      chosen.push(u)
      dfs(i + 1, load + u.load)
      chosen.pop()
    }
    dfs(i + 1, load)
  }
  dfs(0, start)
  if (best.v <= base + EPS) return false
  for (const u of [...person.held]) drop(state, person, u)
  for (const u of best.set) take(state, person, u)
  return true
}

/**
 * Moves a person would make with the sheet open, repeated until none helps.
 * Every move accepted raises the total, so this stops.
 */
function improve(state: State, allowReserved: boolean): void {
  const free = (person: Person) => person.options.filter((u) => !state.holder.has(u.id) && (allowReserved || !u.head.reserved))
  for (let round = 0; round < 80; round++) {
    let changed = false

    for (const person of state.people) {
      // Take anything free that helps.
      for (;;) {
        const base = value(person, person.held)
        let pick: { u: Unit; gain: number } | null = null
        for (const u of free(person)) {
          if (blocker(person, person.held, u)) continue
          const gain = value(person, [...person.held, u]) - base
          if (gain > EPS && (!pick || gain > pick.gain)) pick = { u, gain }
        }
        if (!pick) break
        take(state, person, pick.u)
        changed = true
      }

      // Trade one held unit for one free one, or for two smaller ones ("143" for "SKL123A" and "123A").
      const base = value(person, person.held)
      let pick: { out: Unit; in: Unit[]; gain: number } | null = null
      const options = free(person)
      for (const out of person.held) {
        const rest = without(person.held, out)
        for (let i = 0; i < options.length; i++) {
          const a = options[i]!
          if (blocker(person, rest, a)) continue
          const one = value(person, [...rest, a]) - base
          if (one > EPS && (!pick || one > pick.gain)) pick = { out, in: [a], gain: one }
          if (a.load >= out.load - EPS) continue
          for (let j = i + 1; j < options.length; j++) {
            const b = options[j]!
            if (a.load + b.load > out.load + EPS || blocker(person, [...rest, a], b)) continue
            const two = value(person, [...rest, a, b]) - base
            if (two > EPS && (!pick || two > pick.gain)) pick = { out, in: [a, b], gain: two }
          }
        }
      }
      if (pick) {
        drop(state, person, pick.out)
        for (const u of pick.in) take(state, person, u)
        changed = true
      }
    }

    for (const person of state.people) if (repack(state, person, allowReserved)) changed = true

    // Take a unit a colleague holds — giving up one of your own if need be —
    // while the colleague takes a free one (possibly the one you gave up).
    for (const person of state.people) {
      const base = value(person, person.held)
      let pick: { s: Unit; from: Person; out: Unit | null; instead: Unit | null; gain: number } | null = null
      for (const s of person.options) {
        const from = state.holder.get(s.id)
        if (!from || from === person) continue
        const fromRest = without(from.held, s)
        const fromBase = value(from, from.held)
        const outs: (Unit | null)[] = [null, ...person.held]
        for (const out of outs) {
          const mine = out ? without(person.held, out) : person.held
          if (blocker(person, mine, s)) continue
          const gainMine = value(person, [...mine, s]) - base
          let theirs = value(from, fromRest) - fromBase
          let instead: Unit | null = null
          const alternatives = [...from.options.filter((u) => !state.holder.has(u.id) && (allowReserved || !u.head.reserved)), ...(out && from.fits.has(out.id) ? [out] : [])]
          for (const u of alternatives) {
            if (u.id === s.id || blocker(from, fromRest, u)) continue
            const alt = value(from, [...fromRest, u]) - fromBase
            if (alt > theirs) {
              theirs = alt
              instead = u
            }
          }
          const gain = gainMine + theirs
          if (gain > EPS && (!pick || gain > pick.gain)) pick = { s, from, out, instead, gain }
        }
      }
      if (pick) {
        drop(state, pick.from, pick.s)
        if (pick.out) drop(state, person, pick.out)
        take(state, person, pick.s)
        if (pick.instead) take(state, pick.from, pick.instead)
        changed = true
      }
    }

    // Swap one unit each.
    for (let i = 0; i < state.people.length; i++) {
      for (let j = i + 1; j < state.people.length; j++) {
        const a = state.people[i]!
        const b = state.people[j]!
        const baseA = value(a, a.held)
        const baseB = value(b, b.held)
        let pick: { x: Unit; y: Unit; gain: number } | null = null
        for (const x of a.held) {
          if (!b.fits.has(x.id)) continue
          for (const y of b.held) {
            if (!a.fits.has(y.id)) continue
            const restA = without(a.held, x)
            const restB = without(b.held, y)
            if (blocker(a, restA, y) || blocker(b, restB, x)) continue
            const gain = value(a, [...restA, y]) - baseA + value(b, [...restB, x]) - baseB
            if (gain > EPS && (!pick || gain > pick.gain)) pick = { x, y, gain }
          }
        }
        if (pick) {
          drop(state, a, pick.x)
          drop(state, b, pick.y)
          take(state, a, pick.y)
          take(state, b, pick.x)
          changed = true
        }
      }
    }
    if (!changed) return
  }
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

function people(list: FacultyPrefs[], sections: GlanceSection[], pieces: Unit[], department: TimeRule[]): Person[] {
  return list.map((prefs) => {
    const fits = new Map<string, Fit>()
    for (const u of pieces) {
      const f = fitForUnit(prefs, u, department)
      if (typeof f !== 'string') fits.set(u.id, f)
    }
    const options = pieces.filter((u) => fits.has(u.id)).sort((a, b) => fits.get(b.id)!.score - fits.get(a.id)!.score || a.id.localeCompare(b.id))
    const fixed = sections.filter((s) => s.fixed && sameName(s.fixed, prefs.name))
    const asked = YEAR_QUARTERS.reduce((a, q) => a + prefs.quarterMax[q as YearQuarter], 0)
    const goal = prefs.kind === 'full-time' ? (prefs.target ?? 0) : Math.min(asked, prefs.yearMax ?? Infinity)
    return { prefs, fits, options, fixed, held: [], goal, weight: prefs.newFaculty ? NEW_FACULTY : 1, department }
  })
}

function solve(state: State): void {
  // Start from last run's proposals, so running again on an unchanged workbook changes nothing
  // and a small edit makes small changes, rather than a fresh search wandering somewhere new.
  for (const person of state.people) {
    for (const u of person.options) {
      if (u.head.proposed && sameName(u.head.proposed, person.prefs.name) && !state.holder.has(u.id) && !blocker(person, person.held, u)) {
        take(state, person, u)
      }
    }
  }
  construct(state, false)
  improve(state, false)
  construct(state, true)
  improve(state, true)
}

/** Fill the schedule. Pure: the same inputs give the same answer. */
export function autofill(
  sections: GlanceSection[],
  fullTime: FacultyPrefs[],
  partTime: FacultyPrefs[],
  options: EngineOptions,
): EngineResult {
  const byName = (a: FacultyPrefs, b: FacultyPrefs) => a.name.localeCompare(b.name, undefined, { numeric: true })
  const open = sections.filter((s) => !s.fixed && !s.external)
  const pieces = units(open)

  const ftPeople = people([...fullTime].sort(byName), sections, pieces, options.rules?.['full-time'] ?? [])
  const state: State = { people: ftPeople, holder: new Map() }
  solve(state)

  const left = pieces.filter((u) => !state.holder.has(u.id))
  const ptPeople = people([...partTime].sort(byName), sections, left, options.rules?.['part-time'] ?? [])
  if (options.placePartTime && ptPeople.length) {
    const ptState: State = { people: ptPeople, holder: new Map() }
    solve(ptState)
    for (const [id, p] of ptState.holder) state.holder.set(id, p)
  }

  const placements: Placement[] = []
  const rankOf = (other: Person, u: Unit): string => {
    const reason = other.fits.get(u.id)?.reasons[0] ?? ''
    const m = /#(\d+)/.exec(reason)
    return m ? `#${m[1]}` : /coordinator/.test(reason) ? 'pinned' : /G&O/.test(reason) ? 'G&O/chair' : 'also OK'
  }
  for (const person of [...ftPeople, ...ptPeople]) {
    const peers = person.prefs.kind === 'full-time' ? ftPeople : ptPeople
    const pairs = person.prefs.backToBack ? backToBackPairs(sectionsOf(person)) : []
    for (const u of person.held) {
      const fit = person.fits.get(u.id)!
      const alsoWanted = peers.filter((o) => o !== person && o.fits.has(u.id)).map((o) => `${o.prefs.name} (${rankOf(o, u)})`)
      for (const s of u.sections) {
        const reasons = [...(s === u.head ? [] : [`goes with ${u.head.label}`]), ...fit.reasons]
        const caveats = [...fit.caveats]
        const next = pairs.filter((pair) => pair.includes(s)).map(([a, b]) => (a === s ? b : a).label)
        if (next.length && person.prefs.backToBack === 'prefer') reasons.push(`back to back with ${next.join(', ')}, as they asked`)
        if (next.length && person.prefs.backToBack === 'avoid') caveats.push(`back to back with ${next.join(', ')}, which they asked not to be`)
        if (person.prefs.newFaculty && alsoWanted.length) reasons.push('new faculty, so their wishes count for more')
        placements.push({ section: s, faculty: person.prefs.name, kind: person.prefs.kind, reasons, caveats, alsoWanted })
      }
    }
  }
  placements.sort((a, b) => a.section.id.localeCompare(b.section.id, undefined, { numeric: true }))

  const offered = new Set(sections.flatMap((s) => s.keys))
  const faculty: FacultyResult[] = [...ftPeople, ...ptPeople].map((person) => {
    const p = person.prefs
    const all = sectionsOf(person)
    const load = loadOf(all)
    const byQuarter = { autumn: quarterLoad(all, 'autumn'), winter: quarterLoad(all, 'winter'), spring: quarterLoad(all, 'spring') }
    const top = new Set([...p.pinned, ...p.requests, ...p.desired.slice(0, 3).map((w) => w.key)])
    const placed = person.held.flatMap((u) => u.sections)
    const placedLoad = loadOf(placed)
    const topShare = placedLoad > 0 ? loadOf(placed.filter((s) => s.keys.some((k) => top.has(k)))) / placedLoad : null
    const listed = [...p.pinned, ...p.desired.map((w) => w.key), ...p.ok.map((w) => w.key)]
    const notOffered = [...new Set(listed.filter((k) => !offered.has(k)))]
    const gap = Math.max(0, person.goal - load)
    const shortBecause: string[] = []
    const holderNames = (list: Unit[]) => [...new Set(list.map((u) => state.holder.get(u.id)!.prefs.name))].join(', ')
    const requestsMissed: string[] = []
    for (const key of p.requests) {
      if (all.some((s) => s.keys.includes(key))) continue
      const its = pieces.filter((u) => u.head.keys.includes(key))
      if (!offered.has(key)) requestsMissed.push(`${key}: not offered this year`)
      else if (its.length === 0) requestsMissed.push(`${key}: every section already has a name in the sheet`)
      else {
        const ruledOut = its.filter((u) => !person.fits.has(u.id))
        const taken = its.filter((u) => person.fits.has(u.id) && state.holder.has(u.id))
        const stillFree = its.length - ruledOut.length - taken.length
        const why = [
          ...(ruledOut.length ? [`${ruledOut.length} ruled out (${[...new Set(ruledOut.map((u) => fitForUnit(p, u, person.department)).filter((f) => typeof f === 'string'))].join('; ')})`] : []),
          ...(taken.length ? [`${taken.length} went to ${holderNames(taken)}`] : []),
          ...(stillFree > 0 ? [`${stillFree} still open but would clash, overfill a quarter or go over their load`] : []),
        ]
        requestsMissed.push(`${key}: ${why.join('; ')}`)
      }
    }
    if (p.kind === 'full-time' && gap > EPS) {
      const wanted = [...listed, ...p.requests]
      const theirs = pieces.filter((u) => u.head.keys.some((k) => wanted.includes(k)))
      const mine = theirs.filter((u) => state.holder.get(u.id) === person)
      const ruledOut = theirs.filter((u) => !person.fits.has(u.id))
      const holders = [...new Set(theirs.map((u) => state.holder.get(u.id)).filter((h): h is Person => !!h && h !== person).map((h) => h.prefs.name))]
      const taken = theirs.filter((u) => {
        const h = state.holder.get(u.id)
        return h && h !== person
      })
      const stillFree = theirs.filter((u) => !state.holder.has(u.id) && person.fits.has(u.id))
      const n = (k: number, what: string) => `${k} ${what}${k === 1 ? '' : 's'}`
      shortBecause.push(
        mine.length === theirs.length
          ? `the courses they listed have ${n(theirs.length, 'section')} this year, and all are theirs`
          : `the courses they listed have ${n(theirs.length, 'section')} this year; ${mine.length} are theirs`,
      )
      const byDepartment = ruledOut.filter((u) => {
        const why = fitForUnit(p, u, person.department)
        return typeof why === 'string' && why.includes('department rule')
      }).length
      if (ruledOut.length > byDepartment) shortBecause.push(`${ruledOut.length - byDepartment} ruled out by what they said (a time, a quarter off, or a course they would rather not)`)
      if (byDepartment) shortBecause.push(`${byDepartment} ruled out by the department rules`)
      if (taken.length) shortBecause.push(`${taken.length} went to ${holders.join(', ')}`)
      if (stillFree.length) shortBecause.push(`${stillFree.length} still open but would clash or overfill a quarter`)
      if (notOffered.length) shortBecause.push(`not offered this year: ${notOffered.join(', ')}`)
    }
    return {
      prefs: p,
      fixed: person.fixed,
      placed: [...placed].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
      load,
      byQuarter,
      gap,
      topShare,
      notOffered,
      shortBecause,
      requestsMissed,
    }
  })

  const openSections: OpenSection[] = pieces
    .filter((u) => !state.holder.has(u.id))
    .flatMap((u) =>
      u.sections.map((s) => {
        const explain = (person: Person): Candidate | null => {
          const p = person.prefs
          const listed = s.keys.some((k) => p.pinned.includes(k) || p.requests.includes(k) || p.desired.some((w) => w.key === k) || p.ok.some((w) => w.key === k))
          if (!listed) return null
          const f = fitForUnit(p, u, person.department)
          if (typeof f === 'string') return { name: p.name, kind: p.kind, note: f }
          const why = blocker(person, person.held, u)
          return { name: p.name, kind: p.kind, note: why ?? 'could take it' }
        }
        const fullTimeCands = ftPeople.map(explain).filter((c): c is Candidate => c !== null)
        const partTimeCands = ptPeople
          .map(explain)
          .filter((c): c is Candidate => c !== null)
          .sort((a, b) => Number(a.note !== 'could take it') - Number(b.note !== 'could take it'))
        return { section: s, fullTime: fullTimeCands, partTime: partTimeCands }
      }),
    )
    .sort((a, b) => a.section.id.localeCompare(b.section.id, undefined, { numeric: true }))

  return { placements, faculty, open: openSections }
}
