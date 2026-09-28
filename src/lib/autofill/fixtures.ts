/**
 * Small workbooks in the shapes the auto-fill reads, for the tests only.
 *
 * They copy the layout of the real files — the year-at-a-glance sheet with a
 * block of columns per quarter, and the two Google Form exports — without
 * any of their content. The real responses are about people's leave, health
 * and families, and they stay on the coordinator's disk; the phrasings the
 * parsers have to survive are reproduced here in isolation.
 */

import { buildXlsx, type CellValue } from './xlsx'

/** An Excel time, as the schedule stores it: 1:15 with no meridiem is 75 minutes into a day. */
export function t(h: number, m = 0): number {
  return (h * 60 + m) / 1440
}

type Row = CellValue[]

/**
 * A year at a glance. Columns follow the real sheet: A blank, then Summer in
 * B–J, Autumn in K–S, Winter in T–AB, Spring in AC–AK — each block ✓, load,
 * course, time, day, cap, instructor, TS notes, internal notes.
 */
export function glanceRows(extra: { autumn?: Row[]; winter?: Row[]; spring?: Row[] } = {}): Row[] {
  const block = (r: Row): Row => [...r, ...Array<CellValue>(Math.max(0, 9 - r.length)).fill(null)].slice(0, 9)
  const line = (summer: Row, autumn: Row, winter: Row, spring: Row): Row => [null, ...block(summer), ...block(autumn), ...block(winter), ...block(spring)]
  const header = ['🗸', 'load', 'course', 'time', 'day', 'cap', 'instructor', 'TS notes', 'Internal notes']
  const s = (course: string | number, load: number | null, time: CellValue, day: string, notes = '', instructor: string | null = null, ts = ''): Row => [
    'x',
    load,
    course,
    time,
    day,
    48,
    instructor,
    ts,
    notes,
  ]
  const autumn: Row[] = [
    s('142A', 1, t(1, 15), 'M/W'),
    s('142B', 1, t(11), 'T/Th', 'reserved, assign if needed'),
    s('SKL142A', 0.5, '8:45-11:15', 'F'),
    s('342A', 1, t(11), 'M/W'),
    s('342B', 1, t(1, 15), 'M/W'),
    s('343A', 1, t(8), 'T/Th'),
    s('427A', 1, t(1, 15), 'M/W'),
    s('427 Lab', 0.5, '9:30-1:00', 'F'),
    s('501A', 1, 'N/A', 'N/A', '', null, '4 cr. Asynchronous online course.'),
    s('506A', 0.5, '7:00-9:00', 'W'),
    s('474A', 1, t(11), 'M/W', 'Business manages instructor', 'Non-CSS'),
    s(497, null, '**', '**'),
    ...(extra.autumn ?? []),
  ]
  const winter: Row[] = [
    s('123A', 0.5, t(1, 15), 'M/W'),
    s('SKL123A', 0.5, t(1, 15), 'W'),
    s('343A', 1, t(11), 'T/Th'),
    s('343B', 1, t(5, 45), 'T/Th'),
    s('490C/582A', 1, t(3, 30), 'M/W'),
    s('590A', 1, t(5, 45), 'T/Th', 'Topic TBD'),
    s('BCORE 115/116', 1, 'TBD', 'TBD'),
    ...(extra.winter ?? []),
  ]
  const spring: Row[] = [
    s('342A', 1, t(1, 15), 'M/W'),
    s('343A', 1, t(11), 'T/Th'),
    s('497E', 1, t(3, 30), 'M/W'),
    s('490A', null, t(1, 15), 'M/W', 'reserved in case needed'),
    ...(extra.spring ?? []),
  ]
  const summer: Row[] = [s('142A', 1, '11:15-1:45', 'M/W', '', 'Someone, Already')]
  const rows: Row[] = [
    [1, 'Version:', null, 'CURRENT'],
    line(['Summer 2026'], ['Autumn 2026'], ['Winter 2027'], ['Spring 2027']),
    line(header, header, header, header),
    [null, 'prerequisite'],
  ]
  const n = Math.max(autumn.length, winter.length, spring.length)
  for (let i = 0; i < n; i++) rows.push(line(summer[i] ?? [], autumn[i] ?? [], winter[i] ?? [], spring[i] ?? []))
  // What sits under the sections in the real sheet: a stray note in a course column, and the summary block.
  rows.push(line([], [], [null, null, "ask EE whether needs to add 132 in win'27"], []))
  rows.push(line([], [null, '# M/W or T/Th:'], [], []))
  return rows
}

export function glanceWorkbook(extra?: Parameters<typeof glanceRows>[0]): Uint8Array {
  return buildXlsx([
    { name: 'qtr-day-tm-inst', rows: glanceRows(extra) },
    { name: 'LinksToResources', rows: [['By Faculty Public View Version']] },
  ])
}

export const FT_HEADER = [
  'Timestamp',
  'Email Address',
  'Please enter your first and last name',
  '# of courses',
  '"Most desired" courses:  Please list the courses you most desire to teach in AY 2026-2027 (up to eight different courses), with your most desired class listed first',
  '"Other" courses:  Please list any courses not previously listed that you would be okay with teaching in AY 2026-2027',
  '"Prefer not to teach" courses:  Please list any courses you have taught recently that you really prefer not to teach in AY 2026-2027.',
  "Do you think you'll be eligible for a course release based on STEM ISS policy?",
  'If this request of a course release based on completed microcredits is honored, which of your "most desired" courses would you like to remove from your AY 2026-2027 schedule?',
  'Do you expect to take a service release(s)?',
  'Please describe the number of service release(s), which term(s), and/or courses to which you wish to apply the releases.',
  'Do you expect to buy-out a course or courses (during the regular academic year, that is, Aut, Win, or Spr terms) via funded research?',
  'Please describe the number of research buy-out releases, which term(s) and courses to which you wish to apply the releases, and source of funding.',
  'Do you expect to take a release(s) for sabbatical/other leave?',
  'Please describe the quarter(s) in which you expect to be on sabbatical/other leave (Aut, Win, Spr).',
  'Please list/describe existing courses you have not taught before that you would like to teach for future years (beyond next academic year).',
  'Please list/describe new courses you would like to create and teach in future years (beyond next academic year).',
  'Please add any additional comments concerning teaching and scheduling not covered by earlier questions.',
]

export interface FtAnswer {
  name: string
  load: CellValue
  desired: string
  ok?: string
  avoid?: string
  iss?: string
  issDrop?: string
  service?: string
  serviceDetail?: string
  buyout?: string
  buyoutDetail?: string
  leave?: string
  leaveDetail?: string
  comments?: string
  stamp?: number
}

export function ftWorkbook(answers: FtAnswer[]): Uint8Array {
  const rows: Row[] = [FT_HEADER]
  answers.forEach((a, i) =>
    rows.push([
      a.stamp ?? 46000 + i,
      a.name,
      a.name,
      a.load,
      a.desired,
      a.ok ?? null,
      a.avoid ?? null,
      a.iss ?? 'No',
      a.issDrop ?? null,
      a.service ?? 'No',
      a.serviceDetail ?? null,
      a.buyout ?? 'No',
      a.buyoutDetail ?? null,
      a.leave ?? 'No',
      a.leaveDetail ?? null,
      null,
      null,
      a.comments ?? null,
    ]),
  )
  return buildXlsx([{ name: 'Form Responses 1', rows }])
}

export const PT_HEADER = [
  'Timestamp',
  'Email Address',
  'Please enter your first and last name',
  'Optionally, please provide a non-UW email address and phone number.',
  'Please list how many courses you would like to teach each term in AY 2026-2027',
  'Please list your preferences for teaching time/day for each term in AY 2026-2027',
  'Please list the courses you are interested in teaching (please indicate your order of preference if more than one course)',
  'Please include a brief description of any other constraints you have that we should consider.',
  'Please list existing courses in CSS course catalog you have not taught before that you would like to teach in the future.',
  'Please add any additional comments concerning teaching and scheduling not covered by earlier questions.',
]

export interface PtAnswer {
  name: string
  counts: CellValue
  times: string
  courses: string
  constraints?: string
  comments?: string
}

export function ptWorkbook(answers: PtAnswer[]): Uint8Array {
  const rows: Row[] = [PT_HEADER]
  answers.forEach((a, i) => rows.push([46000 + i, a.name, a.name, null, a.counts, a.times, a.courses, a.constraints ?? null, null, a.comments ?? null]))
  return buildXlsx([{ name: 'Form Responses 1', rows }])
}
